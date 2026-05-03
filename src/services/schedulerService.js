const { PrismaClient } = require('@prisma/client');
const { parseNfce }       = require('./nfceService');
const { computeCashback } = require('./transactionService');
const notificationService = require('./notificationService');
const audit               = require('./auditService');

const prisma = new PrismaClient();

const MAX_RETRIES = 10;

async function retryPendingValidations() {
  console.log('[revalidacao] Iniciando reprocessamento de validações pendentes...');

  let pendentes;
  try {
    pendentes = await prisma.transaction.findMany({
      where: {
        status:     'PENDING_VALIDATION',
        source:     'NFCE_QR_PENDING',
        retryCount: { lt: MAX_RETRIES },
        qrCodeUrl:  { not: null },
      },
      include: {
        customer:      { select: { id: true, cpf: true, pushToken: true } },
        establishment: { select: { id: true, cnpj: true } },
      },
    });
  } catch (err) {
    console.error('[revalidacao] Erro ao buscar transações pendentes:', err.message);
    return;
  }

  console.log(`[revalidacao] ${pendentes.length} transação(ões) aguardando revalidação.`);

  for (const tx of pendentes) {
    const tentativa = tx.retryCount + 1;
    console.log(`[revalidacao] Transação ${tx.id} — tentativa ${tentativa}/${MAX_RETRIES}...`);

    try {
      const nfce = await parseNfce(tx.qrCodeUrl);

      // Validar CNPJ com estabelecimento
      const estCnpj = tx.establishment.cnpj.replace(/\D/g, '');
      if (nfce.cnpj && nfce.cnpj !== estCnpj) {
        console.log(`[revalidacao] Transação ${tx.id}: CNPJ da nota (${nfce.cnpj}) não confere com o estabelecimento — encaminhando para revisão manual.`);
        await prisma.transaction.update({
          where: { id: tx.id },
          data:  { status: 'MANUAL_REVIEW', retryCount: tentativa },
        });
        continue;
      }

      // Verificar duplicata por chave de acesso
      if (nfce.chaveAcesso) {
        const dup = await prisma.transaction.findFirst({
          where: { nfceKey: nfce.chaveAcesso, NOT: { id: tx.id } },
        });
        if (dup) {
          console.log(`[revalidacao] Transação ${tx.id}: chave de acesso já utilizada em outra transação — revisão manual.`);
          await prisma.transaction.update({
            where: { id: tx.id },
            data:  { status: 'MANUAL_REVIEW', retryCount: tentativa },
          });
          continue;
        }
      }

      if (!nfce.valorTotal || nfce.valorTotal <= 0) {
        throw Object.assign(new Error('Valor total da nota inválido.'), { isSefazDown: false });
      }

      // Calcular cashback
      const { cashbackValue, effectivePercent } = await computeCashback(
        nfce.valorTotal,
        nfce.tipoCombustivel,
        nfce.litros,
        tx.establishmentId,
      );

      // Atualizar transação e creditar saldo atomicamente
      await prisma.$transaction([
        prisma.transaction.update({
          where: { id: tx.id },
          data: {
            amount:          nfce.valorTotal,
            cashbackPercent: effectivePercent,
            cashbackValue,
            fuelType:        nfce.tipoCombustivel ?? null,
            liters:          nfce.litros != null ? parseFloat(nfce.litros.toFixed(3)) : null,
            nfceKey:         nfce.chaveAcesso ?? null,
            status:          'CONFIRMED',
            validatedAt:     new Date(),
            retryCount:      tentativa,
          },
        }),
        prisma.customer.update({
          where: { id: tx.customerId },
          data:  { balance: { increment: cashbackValue } },
        }),
      ]);

      const valorFormatado = cashbackValue.toFixed(2).replace('.', ',');
      console.log(`[revalidacao] Transação ${tx.id} confirmada! Cashback: R$ ${valorFormatado}`);

      // Notificação push ao cliente
      if (tx.customer.pushToken) {
        await notificationService.sendPush({
          to:    tx.customer.pushToken,
          title: 'Abastecimento validado!',
          body:  `✅ Seu abastecimento foi validado! Cashback de R$ ${valorFormatado} creditado.`,
          data:  { type: 'NFCE_VALIDATED', transactionId: tx.id },
        });
      }

      await audit.log({
        action:   'NFCE_RETRY_SUCCESS',
        entity:   'Transaction',
        entityId: tx.id,
        metadata: { tentativa, cashbackValue, valorNota: nfce.valorTotal },
      });

    } catch (err) {
      const isSefazDown = err.statusCode === 502 || err.statusCode === 504;
      const novoStatus  = (!isSefazDown || tentativa >= MAX_RETRIES)
        ? 'MANUAL_REVIEW'
        : 'PENDING_VALIDATION';

      if (novoStatus === 'MANUAL_REVIEW') {
        if (tentativa >= MAX_RETRIES) {
          console.log(`[revalidacao] Transação ${tx.id}: limite de ${MAX_RETRIES} tentativas atingido — encaminhada para revisão manual.`);
        } else {
          console.log(`[revalidacao] Transação ${tx.id}: erro não recuperável (${err.message}) — encaminhada para revisão manual.`);
        }
      } else {
        console.log(`[revalidacao] Transação ${tx.id}: SEFAZ ainda indisponível (tentativa ${tentativa}/${MAX_RETRIES}). Aguardando próxima execução.`);
      }

      await prisma.transaction.update({
        where: { id: tx.id },
        data:  { status: novoStatus, retryCount: tentativa },
      });

      await audit.log({
        action:   'NFCE_RETRY_FAILED',
        entity:   'Transaction',
        entityId: tx.id,
        metadata: { tentativa, erro: err.message, novoStatus },
      });
    }
  }

  console.log('[revalidacao] Reprocessamento de validações pendentes concluído.');
}

module.exports = { retryPendingValidations };
