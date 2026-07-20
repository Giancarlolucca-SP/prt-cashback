const { PrismaClient } = require('@prisma/client');
const { parseNfce }       = require('./nfceService');
const { computeCashback } = require('./transactionService');
const notificationService = require('./notificationService');
const audit               = require('./auditService');

const prisma = new PrismaClient();

const MAX_RETRIES = 10;
const BATCH_LIMIT = 50; // bound a single run's duration/memory during a long SEFAZ outage

// node-cron does not prevent overlapping runs — if a batch takes longer than
// the 30-minute schedule (SEFAZ slow/down with many pending transactions),
// the next invocation would otherwise start while this one is still mid-loop
// and could fetch + credit the same PENDING_VALIDATION transaction twice.
let retryInFlight = false;

async function retryPendingValidations() {
  if (retryInFlight) {
    console.log('[revalidacao] Execução anterior ainda em andamento — pulando este ciclo.');
    return;
  }
  retryInFlight = true;
  try {
    await runRetryPendingValidations();
  } finally {
    retryInFlight = false;
  }
}

async function runRetryPendingValidations() {
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
      orderBy: { createdAt: 'asc' }, // oldest-waiting first
      take:    BATCH_LIMIT,
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
          body:  `Seu abastecimento foi validado! Cashback de R$ ${valorFormatado} creditado.`,
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
      // The findFirst duplicate-nfceKey check earlier is a TOCTOU race
      // between overlapping/concurrent runs — it's the DB's own @unique
      // constraint on Transaction.nfceKey that actually prevents a double
      // credit here, not that check. Recognize it specifically instead of
      // letting it fall into the generic "erro não recuperável" bucket, so
      // the real cause (duplicate invoice, not a SEFAZ/parsing failure)
      // is visible in the logs.
      const isDuplicateNfceKey = err.code === 'P2002' && (
        Array.isArray(err.meta?.target)
          ? err.meta.target.includes('nfceKey')
          : String(err.meta?.target || '').includes('nfceKey')
      );
      const isSefazDown = err.statusCode === 502 || err.statusCode === 504;
      const novoStatus  = (isDuplicateNfceKey || !isSefazDown || tentativa >= MAX_RETRIES)
        ? 'MANUAL_REVIEW'
        : 'PENDING_VALIDATION';

      if (isDuplicateNfceKey) {
        console.log(`[revalidacao] Transação ${tx.id}: chave de acesso já usada por outra transação — revisão manual.`);
      } else if (novoStatus === 'MANUAL_REVIEW') {
        if (tentativa >= MAX_RETRIES) {
          console.log(`[revalidacao] Transação ${tx.id}: limite de ${MAX_RETRIES} tentativas atingido — encaminhada para revisão manual.`);
        } else {
          console.log(`[revalidacao] Transação ${tx.id}: erro não recuperável (${err.message}) — encaminhada para revisão manual.`);
        }
      } else {
        console.log(`[revalidacao] Transação ${tx.id}: SEFAZ ainda indisponível (tentativa ${tentativa}/${MAX_RETRIES}). Aguardando próxima execução.`);
      }

      // Guarded on its own: if recording the failure status itself hits a
      // transient DB error, it must not escape and abort the rest of this
      // batch — every remaining pending transaction would otherwise sit
      // untouched until the next 30-minute tick with no indication why.
      try {
        await prisma.transaction.update({
          where: { id: tx.id },
          data:  { status: novoStatus, retryCount: tentativa },
        });
      } catch (updateErr) {
        console.error(`[revalidacao] Transação ${tx.id}: falha ao registrar status de erro:`, updateErr.message);
      }

      await audit.log({
        action:   'NFCE_RETRY_FAILED',
        entity:   'Transaction',
        entityId: tx.id,
        metadata: { tentativa, erro: err.message, novoStatus, duplicateNfceKey: isDuplicateNfceKey },
      });
    }
  }

  console.log('[revalidacao] Reprocessamento de validações pendentes concluído.');
}

module.exports = { retryPendingValidations };
