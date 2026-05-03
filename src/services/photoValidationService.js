const fs             = require('fs');
const path           = require('path');
const os             = require('os');
const sharp          = require('sharp');
const { createClient } = require('@supabase/supabase-js');
const { PrismaClient } = require('@prisma/client');
const { createError }  = require('../middlewares/errorMiddleware');
const { generateReceiptCode } = require('../utils/receiptCode');
const { computeCashback }     = require('./transactionService');
const { formatBRL }           = require('../utils/currencyFormatter');
const audit                   = require('./auditService');

const prisma = new PrismaClient();

const PHOTO_BUCKET = process.env.SUPABASE_STORAGE_BUCKET || 'selfies';

// ── Supabase (lazy, optional) ─────────────────────────────────────────────────

let _supabase = null;
function getSupabase() {
  if (_supabase) return _supabase;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) return null;
  _supabase = createClient(url, key, { auth: { persistSession: false } });
  return _supabase;
}

// ── Pré-processamento da imagem ────────────────────────────────────────────────

async function preprocessImage(buffer) {
  try {
    // Converte para escala de cinza, aumenta contraste e resolve para ≥2400px
    // de largura — melhora significativamente a acurácia do OCR em fotos de cupom.
    return await sharp(buffer)
      .grayscale()
      .normalise()
      .sharpen()
      .resize({ width: 2400, withoutEnlargement: false })
      .jpeg({ quality: 95 })
      .toBuffer();
  } catch (err) {
    console.warn('[foto-ocr] Pré-processamento falhou, usando imagem original:', err.message);
    return buffer;
  }
}

// ── tesseract.js OCR ──────────────────────────────────────────────────────────

// Returns { text, confidence } or null on total failure.
async function runOcr(buffer) {
  let createWorker;
  try {
    ({ createWorker } = require('tesseract.js'));
  } catch {
    console.warn('[foto-ocr] tesseract.js não instalado — pulando OCR.');
    return null;
  }

  try {
    console.log('[foto-ocr] Pré-processando imagem...');
    const processedBuffer = await preprocessImage(buffer);

    console.log('[foto-ocr] Iniciando OCR (português)...');
    const worker = await createWorker('por', 1, {
      cachePath: path.join(os.tmpdir(), 'tesseract-cache'),
      logger: (m) => {
        if (m.status === 'recognizing text') {
          const pct = Math.round((m.progress ?? 0) * 100);
          process.stdout.write(`\r[foto-ocr] OCR: ${pct}%`);
        }
      },
    });

    const { data: { text, confidence } } = await worker.recognize(processedBuffer);
    await worker.terminate();

    process.stdout.write('\n');
    console.log(`[foto-ocr] Confiança do OCR: ${confidence?.toFixed(1) ?? '?'}%`);
    console.log('[foto-ocr] Texto bruto extraído:\n', text.slice(0, 600));

    return { text: text || '', confidence: confidence ?? 0 };
  } catch (err) {
    console.error('[foto-ocr] Erro no tesseract.js:', err.message);
    return null;
  }
}

// ── Normalização do texto OCR ─────────────────────────────────────────────────

function normalizeOcrText(text) {
  return text
    // "19:00" → "19,00"  (dois-pontos confundido com vírgula decimal)
    .replace(/(\d+):(\d{2})\b/g, '$1,$2')
    // "198/08" → "198,08"  (barra confundida com separador decimal)
    // Cuidado: não tocar em sequências longas que podem ser a chave de acesso
    .replace(/(\d{1,5})\/(\d{2})\b(?!\d{10})/g, '$1,$2')
    // "ROS", "R0S", "Rs", "R$" → "R$ "
    .replace(/[Rr][Oo0Ss][Ss$]\s*/g, 'R$ ')
    .replace(/[Rr][Ss$]\s+(?=\d)/g, 'R$ ')
    .replace(/[Rr]\$\s*/g, 'R$ ')
    // Pipe confundido com 1
    .replace(/\|/g, '1')
    // Quebras de linha excessivas
    .replace(/\n{3,}/g, '\n\n');
}

// ── Extração da chave de acesso NF-e ─────────────────────────────────────────

// Dígitos OCR que '/' pode representar: 1, 3, 7 são as confusões mais comuns.
const SLASH_CANDIDATES = ['1', '3', '7', '4', '0'];

// Gera todas as strings de comprimento `len` combinando os caracteres de `candidates`.
function buildInsertions(candidates, len) {
  if (len <= 0) return [''];
  const result = [];
  for (const c of candidates) {
    for (const rest of buildInsertions(candidates, len - 1)) result.push(c + rest);
  }
  return result;
}

function extractAccessKey(text) {
  // Captura regiões com muitos dígitos, espaços e possíveis artefatos OCR (/ e -)
  const regions = text.match(/\d[\d\s/\-]{35,65}\d/g) ?? [];

  for (const region of regions) {
    // Limpar espaços e traços; manter '/' para tratar a seguir
    const noSpaces = region.replace(/[\s\-]/g, '');

    if (!noSpaces.includes('/')) {
      if (noSpaces.length === 44) {
        const key = noSpaces;
        if (SEFAZ_URLS[key.substring(0, 2)]) {
          console.log('[foto-ocr] Chave de acesso (exata):', key);
          return key;
        }
      }
      continue;
    }

    // Há uma ou mais barras — tentar substituições
    const slashCount = (noSpaces.match(/\//g) ?? []).length;
    for (const digit of SLASH_CANDIDATES) {
      const attempt = noSpaces.replace(/\//g, digit);
      if (attempt.length === 44 && SEFAZ_URLS[attempt.substring(0, 2)]) {
        console.log(`[foto-ocr] Chave de acesso (barra→'${digit}'):`, attempt);
        return attempt;
      }
    }

    // Barra representa N dígitos faltantes — N calculado para completar 44 dígitos (até 3).
    // Ex.: "76/4" onde o OCR omitiu dígitos → tenta todas as combinações de candidatos.
    if (slashCount === 1) {
      const slashIdx = noSpaces.indexOf('/');
      const before   = noSpaces.slice(0, slashIdx);
      const after    = noSpaces.slice(slashIdx + 1);
      const needed   = 44 - before.length - after.length; // quantos dígitos faltam

      if (needed >= 1 && needed <= 3) {
        for (const fill of buildInsertions(SLASH_CANDIDATES, needed)) {
          const attempt = before + fill + after;
          if (attempt.length === 44 && SEFAZ_URLS[attempt.substring(0, 2)]) {
            console.log(`[foto-ocr] Chave de acesso (inserção '${fill}' @pos ${slashIdx}):`, attempt);
            return attempt;
          }
        }
      }
    }
  }

  console.log('[foto-ocr] Chave de acesso NF-e não encontrada no texto.');
  return null;
}

// ── Tentativa de consulta SEFAZ com chave de acesso ───────────────────────────

// URLs de consulta por cUF (primeiros 2 dígitos da chave).
const SEFAZ_URLS = {
  '11': 'https://www.sefin.ro.gov.br/nfce/qrcode',
  '12': 'https://www.sefaznet.ac.gov.br/nfce/qrcode',
  '13': 'https://www.sefaz.am.gov.br/nfce/qrcode',
  '14': 'https://www.sefaz.rr.gov.br/nfce/qrcode',
  '15': 'https://www.sefa.pa.gov.br/nfce/qrcode',
  '16': 'https://www.sef.ap.gov.br/nfce/qrcode',
  '17': 'https://www.sefaz.to.gov.br/nfce/qrcode',
  '21': 'https://www.sefaz.ma.gov.br/nfce/qrcode',
  '22': 'https://www.sefaz.pi.gov.br/nfce/qrcode',
  '23': 'http://nfce.sefaz.ce.gov.br/pages/showNFCe.html',
  '24': 'https://www.set.rn.gov.br/nfce/qrcode',
  '25': 'https://www.sefaz.pb.gov.br/nfce/qrcode',
  '26': 'https://nfce.sefaz.pe.gov.br/nfce/qrcode',
  '27': 'https://www.sefaz.al.gov.br/nfce/qrcode',
  '28': 'https://www.sefaz.se.gov.br/nfce/qrcode',
  '29': 'http://nfe.sefaz.ba.gov.br/servicos/nfce/qrcode',
  '31': 'https://nfce.fazenda.mg.gov.br/portalnfce/sistema/qrcode.xhtml',
  '32': 'https://www.sefaz.es.gov.br/nfce/qrcode',
  '33': 'https://www.nfce.fazenda.rj.gov.br/consulta',
  '35': 'https://www.nfce.fazenda.sp.gov.br/qrcode',
  '41': 'https://www.sefaz.pr.gov.br/nfce/qrcode',
  '42': 'https://www.sef.sc.gov.br/nfce/qrcode',
  '43': 'https://www.sefaz.rs.gov.br/NFCE/NFCE-COM-CODIGO-SEGURANCA.aspx',
  '50': 'https://www.dfe.ms.gov.br/nfce/qrcode',
  '51': 'https://www.sefaz.mt.gov.br/nfce/qrcode',
  '52': 'https://www.sefaz.go.gov.br/nfce/qrcode',
  '53': 'https://www.sefaz.df.gov.br/nfce/qrcode',
};

async function tentarSefazComChave(chaveAcesso, customerId, establishmentId) {
  const cUF   = chaveAcesso.substring(0, 2);
  const base  = SEFAZ_URLS[cUF];

  if (!base) {
    console.log(`[foto-ocr] cUF ${cUF} sem URL SEFAZ mapeada — pulando consulta.`);
    return null;
  }

  const url = `${base}?p=${chaveAcesso}|2|1|1|0`;
  console.log(`[foto-ocr] Consultando SEFAZ para cUF ${cUF}: ${url}`);

  try {
    const { validateNfce } = require('./nfceService');
    return await validateNfce(url, customerId, establishmentId);
  } catch (err) {
    console.log(`[foto-ocr] SEFAZ retornou erro: ${err.message}`);
    return null;
  }
}

// ── Extratores de texto ───────────────────────────────────────────────────────

const FUEL_PATTERNS = [
  { re: /gasolina\s+aditivada/i, type: 'gasolina_aditivada' },
  { re: /gasolina/i,             type: 'gasolina'           },
  { re: /etanol|[áa]lcool/i,     type: 'etanol'             },
  { re: /diesel\s+s-?10/i,       type: 'diesel_s10'         },
  { re: /diesel/i,               type: 'diesel'             },
  { re: /gnv|g[aá]s\s+natural/i, type: 'gnv'                },
];

function extractFuelType(text) {
  for (const { re, type } of FUEL_PATTERNS) {
    if (re.test(text)) return type;
  }
  return null;
}

function extractDate(text) {
  const m = text.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  return null;
}

function extractLiters(text) {
  // "ER 20,440 L", "FL 20,440 L", "20,440 L", "20.440 lt", "Volume: 20,440"
  // Prefixos comuns em OCR de cupom: FL (fluido), ER, VR, etc.
  const m = text.match(/(?:[A-Za-z]{1,3}\s+)?(\d{1,3}[,.]\d{3})\s*[Ll]t?\b/)
    || text.match(/[Vv]olume[^:\n\d]{0,10}([\d,]+)\s*[Ll]/)
    || text.match(/(\d{1,3}[,.]\d{1,2})\s*[Ll]t?\b/);
  if (m) return parseFloat((m[1] ?? m[2]).replace(',', '.'));
  return null;
}

function extractPricePerLiter(text) {
  // Preço por litro tem 3 casas decimais no Brasil: "4,890" = R$4,890/L
  // Aparece após o volume na mesma linha: "20,440 L 4,890 99,95"
  const m = text.match(/\d+[,.]\d+\s*[Ll]t?\b\s+([\d]+[,.]\d{3})\b/i);
  if (m) return parseFloat(m[1].replace(',', '.'));
  return null;
}

function extractTotal(text) {
  // 1. Palavra "total" próxima de R$
  const nearTotal = text.match(/total[^R\n]{0,25}R\$\s*([\d.]+,\d{2})/i)
    || text.match(/R\$\s*([\d.]+,\d{2})[^\n]{0,20}total/i)
    || text.match(/[Vv]alor\s+[Tt]otal[^\d]{0,5}([\d.]+,\d{2})/i);
  if (nearTotal) return parseFloat(nearTotal[1].replace(/\./g, '').replace(',', '.'));

  // 2. Linha com litros — após o volume e o preço/litro (3 decimais), pega o total (2 decimais)
  // Ex.: "ER 20,440 L 4,890 99,95"  →  99,95
  // O "(?:\d+[,.]\d{3}\s+)?" pula o preço por litro para não confundir com o total.
  const litersLine = text.match(
    /\d+[,.]\d+\s*[Ll]t?\b\s+(?:\d+[,.]\d{3}\s+)?(\d+[,.]\d{2})\b/i,
  );
  if (litersLine) {
    const v = parseFloat(litersLine[1].replace(',', '.'));
    if (v > 0) return v;
  }

  // 2b. Varredura por linha: último valor com 2 casas decimais em linha que contenha litros.
  // Cobre "ER 20,440 L 4,890 99,95" quando o padrão acima não encaixar por variação de espaço.
  for (const line of text.split('\n')) {
    if (!/\d+[,.]\d+\s*[Ll]t?\b/i.test(line)) continue;
    const vals = [...line.matchAll(/(\d+[,.]\d{2})(?!\d)/g)]
      .map((m) => parseFloat(m[1].replace(',', '.')))
      .filter((v) => v > 0);
    if (vals.length) return Math.max(...vals);
  }

  // 3. Todos os valores R$ — pega o maior (normalmente é o total)
  const allVals = [...text.matchAll(/R\$\s*([\d.]+,\d{2})/g)]
    .map((m) => parseFloat(m[1].replace(/\./g, '').replace(',', '.')))
    .filter((v) => v > 0);
  if (allVals.length) return Math.max(...allVals);

  // 4. Valor sem símbolo — ex.: "99,95" isolado numa linha
  const standalone = [...text.matchAll(/^\s*([\d]{2,5}[,.]\d{2})\s*$/gm)]
    .map((m) => parseFloat(m[1].replace(',', '.')))
    .filter((v) => v > 0);
  if (standalone.length) return Math.max(...standalone);

  return null;
}

function extractCnpj(text) {
  const m = text.match(/(\d{2}[\s.]?\d{3}[\s.]?\d{3}[\s/]?\d{4}[\s-]?\d{2})/);
  if (m) {
    const digits = m[1].replace(/\D/g, '');
    if (digits.length === 14) return digits;
  }
  return null;
}

function parseOcrText(rawText) {
  if (!rawText) return null;

  const text = normalizeOcrText(rawText);
  console.log('[foto-ocr] Texto normalizado (primeiros 500 chars):\n', text.slice(0, 500));

  const litros          = extractLiters(text);
  const pricePerLiter   = extractPricePerLiter(text);
  let   total           = extractTotal(text);

  // Fallback: litros × preço/litro quando o total não foi detectado diretamente
  if (!total && litros && pricePerLiter) {
    total = Math.round(litros * pricePerLiter * 100) / 100;
    console.log(`[foto-ocr] Total calculado: ${litros} L × R$${pricePerLiter}/L = R$${total}`);
  }

  console.log('[foto-ocr] Extração → total:', total, '| litros:', litros, '| preço/L:', pricePerLiter);

  if (!total || total <= 0) return null;

  const result = {
    data:            extractDate(text),
    tipoCombustivel: extractFuelType(text),
    litros,
    total,
    cnpj:            extractCnpj(text),
    chaveAcesso:     extractAccessKey(text),
  };

  console.log('[foto-ocr] Dados extraídos:', result);
  return result;
}

// ── Upload para Supabase Storage ──────────────────────────────────────────────

async function uploadPhoto(buffer, customerId, establishmentId) {
  const supabase = getSupabase();
  if (!supabase) {
    console.warn('[foto-ocr] Supabase não configurado — foto não armazenada.');
    return null;
  }

  const filePath = `receipt-photos/${establishmentId}/${customerId}/${Date.now()}.jpg`;

  const { error } = await supabase.storage
    .from(PHOTO_BUCKET)
    .upload(filePath, buffer, { contentType: 'image/jpeg', upsert: false });

  if (error) {
    console.error('[foto-ocr] Erro ao enviar foto para Supabase:', error.message);
    return null;
  }

  const { data: urlData } = supabase.storage.from(PHOTO_BUCKET).getPublicUrl(filePath);
  return urlData?.publicUrl ?? null;
}

// ── confirmarTransacao — cria transação CONFIRMED e credita saldo ──────────────

async function confirmarTransacao({ customer, operator, establishmentId, extracted, receiptCode, via }) {
  let cashbackValue, effectivePercent;
  try {
    ({ cashbackValue, effectivePercent } = await computeCashback(
      extracted.total,
      extracted.tipoCombustivel,
      extracted.litros,
      establishmentId,
    ));
  } catch (err) {
    console.warn('[foto-ocr] computeCashback falhou — encaminhando para revisão manual:', err.message);
    return null; // sinaliza para ir para pendente
  }

  const [transaction] = await prisma.$transaction([
    prisma.transaction.create({
      data: {
        customerId:      customer.id,
        operatorId:      operator.id,
        establishmentId,
        amount:          extracted.total,
        cashbackPercent: effectivePercent,
        cashbackValue,
        receiptCode,
        fuelType:        extracted.tipoCombustivel ?? null,
        liters:          extracted.litros          ?? null,
        nfceKey:         extracted.chaveAcesso     ?? null,
        source:          'PHOTO_VALIDATION',
        status:          'CONFIRMED',
        validatedAt:     new Date(),
        metadata:        { ...extracted, via },
      },
    }),
    prisma.customer.update({
      where: { id: customer.id },
      data:  { balance: { increment: cashbackValue } },
    }),
  ]);

  console.log('[DUPLIC] Transação criada com nfceKey:', transaction.nfceKey ?? 'null');

  const updated = await prisma.customer.findUnique({ where: { id: customer.id } });

  await audit.log({
    action:     'PHOTO_CASHBACK_EARNED',
    entity:     'Transaction',
    entityId:   transaction.id,
    operatorId: operator.id,
    metadata:   { extracted, cashbackValue, customerId: customer.id, via },
  });

  return {
    sucesso:  true,
    mensagem: via === 'sefaz'
      ? 'Cashback gerado com sucesso via QR Code da NF-e!'
      : 'Cashback gerado com sucesso via foto do cupom!',
    dadosExtraidos: extracted,
    transacao: {
      id:             transaction.id,
      codigoCupom:    receiptCode,
      cashbackGerado: formatBRL(cashbackValue),
      percentual:     `${effectivePercent.toFixed(2)}%`,
      novoSaldo:      formatBRL(updated.balance),
      novoSaldoNum:   parseFloat(updated.balance),
    },
  };
}

// ── validatePhoto ─────────────────────────────────────────────────────────────

async function validatePhoto({ base64Photo, customerId, establishmentId }) {
  if (!base64Photo) throw createError('Foto é obrigatória.', 400);

  const buffer = Buffer.from(base64Photo, 'base64');

  const [establishment, customer] = await Promise.all([
    prisma.establishment.findUnique({ where: { id: establishmentId } }),
    prisma.customer.findUnique({ where: { id: customerId } }),
  ]);
  if (!establishment) throw createError('Estabelecimento não encontrado.', 404);
  if (!customer)      throw createError('Cliente não encontrado.', 404);

  const operator = await prisma.operator.findFirst({
    where:   { establishmentId },
    orderBy: { role: 'asc' },
  });
  if (!operator) throw createError('Posto sem operadores cadastrados.', 500);

  console.log(`[foto-ocr] Iniciando validação por foto — cliente ${customerId}`);

  const receiptCode = generateReceiptCode('PHT');

  // ── Passo 1: OCR ────────────────────────────────────────────────────────────
  const ocrResult  = await runOcr(buffer);
  const rawText    = ocrResult?.text ?? '';
  const confidence = ocrResult?.confidence ?? 0;

  console.log(`[foto-ocr] Confiança OCR: ${confidence.toFixed(1)}% ${confidence < 30 ? '(baixa — tentando extração mesmo assim)' : ''}`);

  // ── Passo 2: Extrair chave de acesso e tentar SEFAZ ─────────────────────────
  const normalizedText = normalizeOcrText(rawText);
  const chaveAcesso    = extractAccessKey(normalizedText);

  if (chaveAcesso) {
    console.log('[foto-ocr] Chave de acesso NF-e detectada — tentando SEFAZ...');
    try {
      const sefazResult = await tentarSefazComChave(chaveAcesso, customerId, establishmentId);
      if (sefazResult && !sefazResult.pendente) {
        console.log('[foto-ocr] SEFAZ confirmou a NF-e — cashback gerado via SEFAZ.');
        // validateNfce já criou e creditou a transação; retornar o resultado direto.
        return sefazResult;
      }
    } catch (err) {
      console.log('[foto-ocr] SEFAZ falhou, prosseguindo com extração OCR:', err.message);
    }
  }

  // ── Passo 3: Extração por OCR ───────────────────────────────────────────────
  const extracted = parseOcrText(rawText);

  if (extracted) {
    console.log(`[foto-ocr] Valor R$ ${extracted.total} extraído do cupom.`);

    // ── Passo 3b: Verificação de duplicidade ──────────────────────────────────
    // Usa `chaveAcesso` do passo 2 (texto normalizado) — não `extracted.chaveAcesso`
    // que vem do texto bruto — para garantir consistência com o que foi tentado no SEFAZ.
    console.log('[DUPLIC] Verificando chave:', chaveAcesso ?? 'null');
    console.log('[DUPLIC] Verificando valor+data:', { amount: extracted.total, establishmentId, customerId });

    const existingByKey = chaveAcesso
      ? await prisma.transaction.findFirst({ where: { nfceKey: chaveAcesso } })
      : null;
    console.log('[DUPLIC] Por chave:', existingByKey?.id ?? 'não encontrado');

    if (existingByKey) throw createError('Este cupom já foi utilizado.', 409);

    const cutoff = new Date();
    cutoff.setHours(cutoff.getHours() - 48);

    const existingByValue = await prisma.transaction.findFirst({
      where: {
        establishmentId,
        customerId,
        amount:    { gte: extracted.total - 0.01, lte: extracted.total + 0.01 },
        createdAt: { gte: cutoff },
      },
    });
    console.log('[DUPLIC] Por valor:', existingByValue?.id ?? 'não encontrado',
      existingByValue?.amount ?? '', existingByValue?.createdAt ?? '');

    if (existingByValue) {
      console.log('[DUPLIC] DUPLICATA DETECTADA — bloqueando');
      throw createError('Este cupom já foi utilizado.', 409);
    }

    if (extracted.litros) {
      const existingByLiters = await prisma.transaction.findFirst({
        where: {
          establishmentId,
          customerId,
          liters:    { gte: extracted.litros - 0.1, lte: extracted.litros + 0.1 },
          createdAt: { gte: cutoff },
        },
      });
      if (existingByLiters) {
        console.log('[DUPLIC] DUPLICATA POR LITROS DETECTADA — bloqueando', existingByLiters.id);
        throw createError('Este cupom já foi utilizado.', 409);
      }
    }

    // Propagar a chave já normalizada para que `confirmarTransacao` salve o mesmo valor.
    if (chaveAcesso && !extracted.chaveAcesso) extracted.chaveAcesso = chaveAcesso;

    console.log(`[foto-ocr] Criando transação confirmada — R$ ${extracted.total}`);
    const confirmado = await confirmarTransacao({
      customer, operator, establishmentId, extracted, receiptCode, via: 'ocr',
    });
    if (confirmado) return confirmado;
    // computeCashback falhou → ir para revisão manual
  }

  // ── Passo 4: Sem dados suficientes → revisão manual ─────────────────────────
  console.log('[foto-ocr] Dados insuficientes no OCR — salvando para revisão manual.');
  console.log(`[foto-ocr] Confiança: ${confidence.toFixed(1)}% | Texto: ${rawText.slice(0, 200)}`);
  return await criarTransacaoPendente({ buffer, customer, operator, establishmentId, receiptCode, extracted: extracted ?? null });
}

async function criarTransacaoPendente({ buffer, customer, operator, establishmentId, receiptCode, extracted }) {
  const photoUrl = await uploadPhoto(buffer, customer.id, establishmentId);

  const transaction = await prisma.transaction.create({
    data: {
      customerId:      customer.id,
      operatorId:      operator.id,
      establishmentId,
      amount:          0,
      cashbackPercent: 0,
      cashbackValue:   0,
      receiptCode,
      source:          'PHOTO_VALIDATION',
      status:          'PENDING_VALIDATION',
      photoUrl,
      metadata:        extracted ?? null,
    },
  });

  await audit.log({
    action:     'PHOTO_PENDING_REVIEW',
    entity:     'Transaction',
    entityId:   transaction.id,
    operatorId: operator.id,
    metadata:   { photoUrl, customerId: customer.id, extracted },
  });

  return {
    sucesso:  false,
    pendente: true,
    mensagem: 'Não foi possível extrair os dados automaticamente. Sua foto foi enviada para análise manual e o cashback será creditado após aprovação.',
    codigoCupom: receiptCode,
    transacao: {
      id:          transaction.id,
      codigoCupom: receiptCode,
    },
  };
}

// ── approvePhotoValidation ────────────────────────────────────────────────────

async function approvePhotoValidation({ transactionId, amount, fuelType, liters, operatorId }) {
  const tx = await prisma.transaction.findUnique({
    where:   { id: transactionId },
    include: { customer: true },
  });

  if (!tx) throw createError('Transação não encontrada.', 404);
  if (tx.source !== 'PHOTO_VALIDATION') throw createError('Transação não é uma validação por foto.', 400);
  if (tx.status !== 'PENDING_VALIDATION') throw createError('Transação não está pendente de validação.', 400);

  const parsedAmount = parseFloat(amount);
  if (isNaN(parsedAmount) || parsedAmount <= 0) throw createError('Valor inválido.', 400);

  const { cashbackValue, effectivePercent } = await computeCashback(
    parsedAmount, fuelType || null, liters || null, tx.establishmentId,
  );

  await prisma.$transaction([
    prisma.transaction.update({
      where: { id: transactionId },
      data: {
        amount:          parsedAmount,
        cashbackPercent: effectivePercent,
        cashbackValue,
        fuelType:        fuelType || null,
        liters:          liters   || null,
        status:          'CONFIRMED',
        validatedAt:     new Date(),
      },
    }),
    prisma.customer.update({
      where: { id: tx.customerId },
      data:  { balance: { increment: cashbackValue } },
    }),
  ]);

  await audit.log({
    action:     'PHOTO_APPROVED',
    entity:     'Transaction',
    entityId:   transactionId,
    operatorId,
    metadata:   { amount: parsedAmount, cashbackValue, fuelType },
  });

  return {
    mensagem:      'Foto aprovada e cashback creditado com sucesso.',
    cashbackGerado: formatBRL(cashbackValue),
  };
}

// ── rejectPhotoValidation ─────────────────────────────────────────────────────

async function rejectPhotoValidation({ transactionId, motivo, operatorId }) {
  const tx = await prisma.transaction.findUnique({ where: { id: transactionId } });

  if (!tx) throw createError('Transação não encontrada.', 404);
  if (tx.source !== 'PHOTO_VALIDATION') throw createError('Transação não é uma validação por foto.', 400);
  if (tx.status !== 'PENDING_VALIDATION') throw createError('Transação não está pendente de validação.', 400);

  await prisma.transaction.update({
    where: { id: transactionId },
    data:  { status: 'CANCELLED', metadata: { ...(tx.metadata ?? {}), motivoRejeicao: motivo } },
  });

  await audit.log({
    action:     'PHOTO_REJECTED',
    entity:     'Transaction',
    entityId:   transactionId,
    operatorId,
    metadata:   { motivo },
  });

  return { mensagem: 'Foto rejeitada com sucesso.' };
}

// ── listPhotoValidations ──────────────────────────────────────────────────────

async function listPhotoValidations(establishmentId) {
  const records = await prisma.transaction.findMany({
    where: {
      source:  'PHOTO_VALIDATION',
      status:  'PENDING_VALIDATION',
      ...(establishmentId ? { establishmentId } : {}),
    },
    include: {
      customer: { select: { id: true, name: true, cpf: true } },
    },
    orderBy: { createdAt: 'asc' },
  });

  return records.map((r) => ({
    id:          r.id,
    codigoCupom: r.receiptCode,
    photoUrl:    r.photoUrl,
    dadosExtraidos: r.metadata,
    cliente: {
      id:   r.customer.id,
      nome: r.customer.name,
      cpf:  r.customer.cpf,
    },
    criadaEm: r.createdAt,
  }));
}

module.exports = {
  validatePhoto,
  approvePhotoValidation,
  rejectPhotoValidation,
  listPhotoValidations,
};
