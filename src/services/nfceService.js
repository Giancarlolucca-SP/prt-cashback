const axios  = require('axios');
const xml2js = require('xml2js');
const { PrismaClient } = require('@prisma/client');
const { createError }  = require('../middlewares/errorMiddleware');
const { generateReceiptCode } = require('../utils/receiptCode');
const { formatBRL }    = require('../utils/currencyFormatter');
const { formatDateBR } = require('../utils/dateFormatter');
const fraudService     = require('./fraudService');
const audit            = require('./auditService');
const { computeCashback } = require('./transactionService');

const prisma = new PrismaClient();

// ── SEFAZ status codes ────────────────────────────────────────────────────────

const SEFAZ_STATUS = {
  '100': null, // Autorizado — sem erro
  '101': 'Nota fiscal cancelada pela SEFAZ.',
  '102': 'Inutilização de número homologada.',
  '110': 'Uso da nota fiscal negado pela SEFAZ.',
  '204': 'Nota fiscal duplicada na SEFAZ.',
  '205': 'Nota fiscal não autorizada.',
  '217': 'NF-e não consta na base de dados da SEFAZ.',
  '301': 'Nota fiscal com irregularidade fiscal do emitente.',
  '302': 'Nota fiscal com irregularidade fiscal do destinatário.',
  '999': 'Erro interno na SEFAZ. Tente novamente em alguns minutos.',
};

function sefazErro(cStat) {
  if (!cStat) return null;
  const code = String(cStat).trim();
  if (code === '100') return null;
  return SEFAZ_STATUS[code] ?? `Nota fiscal recusada pela SEFAZ (código ${code}).`;
}

// ── Fuel type detection ───────────────────────────────────────────────────────

const FUEL_RULES = [
  { words: ['diesel s10', 'diesel s-10', 's-10', 's10'],    type: 'diesel_s10'        },
  { words: ['diesel'],                                       type: 'diesel'            },
  { words: ['gasolina aditivada', 'gasolina ad'],            type: 'gasolina_aditivada'},
  { words: ['gasolina'],                                     type: 'gasolina'          },
  { words: ['etanol', 'alcool', 'álcool', 'etoh'],          type: 'etanol'            },
  { words: ['gnv', 'gas natural', 'gás natural'],           type: 'gnv'               },
];

function normalize(s) {
  return String(s).toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function detectFuelType(productName) {
  const n = normalize(productName);
  for (const { words, type } of FUEL_RULES) {
    if (words.some((w) => n.includes(normalize(w)))) return type;
  }
  return null;
}

// ── XML helpers ───────────────────────────────────────────────────────────────

// Unwrap xml2js arrays/objects: always return a scalar or undefined
function val(obj, ...keys) {
  let cur = obj;
  for (const k of keys) {
    if (cur == null) return undefined;
    cur = Array.isArray(cur[k]) ? cur[k][0] : cur[k];
  }
  if (cur != null && typeof cur === 'object' && '_' in cur) return cur._;
  return cur;
}

async function parseXml(text) {
  return xml2js.parseStringPromise(text, {
    explicitArray: true,
    mergeAttrs:    true,
    explicitCharkey: false,
  });
}

// ── Extract access key from QR code URL ───────────────────────────────────────

function extractKeyFromUrl(url) {
  try {
    const u = new URL(url);

    // ?chNFe=44digits (common format)
    const chNFe = u.searchParams.get('chNFe');
    if (chNFe && /^\d{44}$/.test(chNFe)) return chNFe;

    // pipe-separated ?p=chNFe|cIdToken|... (SP, MG, RJ and others)
    const p = u.searchParams.get('p') || '';
    for (const part of p.split('|')) {
      if (/^\d{44}$/.test(part)) return part;
    }
  } catch {}

  // Fallback: first 44-digit sequence anywhere in the URL string
  const m = url.match(/\b(\d{44})\b/);
  return m ? m[1] : null;
}

// ── Extract params from QR Code URL (SP SEFAZ embeds data in URL) ─────────────

function extractParamsFromUrl(qrCodeUrl) {
  const result = { chNFe: null, vNF: null, dEmi: null, cDest: null, cnpjFromKey: null };
  try {
    const u = new URL(qrCodeUrl);

    result.chNFe = extractKeyFromUrl(qrCodeUrl);
    result.vNF   = u.searchParams.get('vNF')   || u.searchParams.get('vNFe');
    result.dEmi  = u.searchParams.get('dEmi')  || u.searchParams.get('dhEmi');
    result.cDest = u.searchParams.get('cDest') || u.searchParams.get('CPFDest');

    // NF-e key structure: cUF(2) AAMM(4) CNPJ(14) mod(2) serie(3) nNF(9) tpEmis(1) cNF(8) cDV(1)
    if (result.chNFe && result.chNFe.length === 44) {
      result.cnpjFromKey = result.chNFe.substring(6, 20);
      const aamm = result.chNFe.substring(2, 6); // AAMM
      if (!result.dEmi && /^\d{4}$/.test(aamm)) {
        result.dEmi = `20${aamm.substring(0, 2)}-${aamm.substring(2, 4)}-01T12:00:00`;
      }
    }
  } catch {}
  return result;
}

// ── BRL string → number ───────────────────────────────────────────────────────

function parseBRL(s) {
  return parseFloat(String(s).replace(/\./g, '').replace(',', '.')) || 0;
}

// ── Extract NFCe data from SP SEFAZ HTML consultation page ────────────────────
// SP SEFAZ QR codes link to a page that renders receipt HTML instead of XML.
// We use best-effort regex extraction; cnpjFromKey is the authoritative identifier.

function parseHtmlNfceData(html, urlParams) {
  const data = {
    cnpj:  urlParams.cnpjFromKey || null,
    xNome: null,
    vNF:   null,
    dEmi:  urlParams.dEmi || null,
    items: [],
  };

  // Strip tags once — reused for vNF and liters extraction
  const plainText = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

  // Total value — SP SEFAZ puts label and value in separate table cells, so we must
  // work on both the raw HTML and the tag-stripped plain text to cover all cases.
  const allVals = [...html.matchAll(/R\$\s*([\d.]+,\d{2})/g)]
    .map(m => parseBRL(m[1]))
    .filter(v => v > 0);
  console.log('[NFCE] Todos os valores R$ encontrados no HTML:', allVals);

  // P1: plain-text — "total" keyword then optional R$ then value (handles cross-cell)
  const p1 = plainText.match(
    /(?:valor\s+total|total\s+da\s+nota|total\s+a\s+pagar|vlr\.?\s*total)\s*:?\s*(?:R\$\s*)?([\d.]+,\d{2})/i,
  );
  // P2: HTML — "total" keyword in same text node as R$ (original pattern, still useful)
  const p2 = html.match(
    /(?:valor\s+total|total\s+da\s+nota|total\s+a\s+pagar)[^<\n]{0,30}R\$\s*([\d.]+,\d{2})/i,
  );
  // P3: CSS class containing "total" or "vnf" with a decimal value
  const p3 = html.match(
    /class="[^"]*(?:total|vnf|vTotal)[^"]*"[^>]*>\s*(?:R\$\s*)?([\d.]+,\d{2})/i,
  );
  // P4: plain-text "valor a pagar" pattern (some states use this label instead)
  const p4 = plainText.match(
    /valor\s+a\s+pagar\s*:?\s*(?:R\$\s*)?([\d.]+,\d{2})/i,
  );

  const totalMatch = p1 || p2 || p3 || p4;
  if (totalMatch) {
    data.vNF = parseBRL(totalMatch[1]);
    console.log('[NFCE] Valor total extraído do HTML:', data.vNF);
  } else if (allVals.length) {
    data.vNF = Math.max(...allVals);
    console.log('[NFCE] Valor total do HTML (máximo R$):', data.vNF);
  }

  // Emission date (DD/MM/YYYY)
  if (!data.dEmi) {
    const dm = html.match(/(\d{2})\/(\d{2})\/(\d{4})/);
    if (dm) {
      const [, d, mo, y] = dm;
      data.dEmi = `${y}-${mo}-${d}T12:00:00`;
      console.log('[NFCE] Data extraída do HTML:', data.dEmi);
    }
  }

  // CNPJ (only when not already derived from access key)
  if (!data.cnpj) {
    const cm = html.match(/(\d{2}[\s.]?\d{3}[\s.]?\d{3}[\s/]?\d{4}[\s-]?\d{2})/);
    if (cm) {
      const candidate = cm[1].replace(/\D/g, '');
      if (candidate.length === 14) {
        data.cnpj = candidate;
        console.log('[NFCE] CNPJ extraído do HTML:', data.cnpj);
      }
    }
  }

  // Issuer name — try CSS class, then "Razão Social" label, then first <strong>/<b> on the page
  const nm = html.match(/class="[^"]*(?:nome|emitente|razao)[^"]*"[^>]*>\s*([^<\n]{3,80})/i)
    || html.match(/raz[aã]o\s+social\s*[:\s]+([^\n<]{3,80})/i)
    || html.match(/<(?:strong|b)>\s*([A-ZÁÉÍÓÚÂÊÔÃÕÇÜ][A-ZÁÉÍÓÚÂÊÔÃÕÇÜ\s]{5,79})\s*<\/(?:strong|b)>/i);
  if (nm) data.xNome = nm[1].trim();

  // Fuel product lines — names appear in one cell, quantity in another, so capture them separately
  const fuelRx = /(gasolina(?:\s+\w+)*|diesel(?:\s+s-?\d+)?|etanol|[aá]lcool|gnv)[^<\n]{0,120}/gi;
  const fuelMatches = html.match(fuelRx) || [];
  data.items = [...new Set(fuelMatches.map(s => s.trim()))].slice(0, 10);

  // Fuel quantity (liters) — SP SEFAZ puts quantity ("33,180") and unit ("LT") in
  // separate table cells; plainText brings them adjacent. Try patterns in priority order.
  const lP1 = plainText.match(/(\d{1,3}[,.]\d{3})\s*[Ll][Tt]?\b/);            // 33,180 LT or L
  const lP2 = plainText.match(/(\d{1,3}[,.]\d{1,3})\s*[Ll][Tt]?\b/);          // 33,18 LT (fallback)
  const lP3 = plainText.match(                                                  // Qtd: 33,180
    /(?:qtd\.?|quant\.?|quantidade)\s*:?\s*([\d]+[,.]\d+)/i,
  );
  const lP4 = plainText.match(                                                  // near fuel name
    /(?:gasolina|diesel|etanol|[aá]lcool|gnv)[^.]{0,120}?([\d]+[,.]\d{3})\s*[Ll][Tt]?\b/i,
  );

  data.liters = null;
  for (const m of [lP1, lP2, lP3, lP4]) {
    if (m) {
      const v = parseFloat(m[1].replace(',', '.'));
      if (v > 0) { data.liters = v; break; }
    }
  }

  // ── "Informações de interesse do contribuinte" (SP SEFAZ) ─────────────────
  // Contains attendant name and pump encerrante readings in a single <li> field.
  // Example: "#CF:B05 EI1456806,050 EF1456839,230 V33,180 - Atendente: 27-JUNIOR - PROCON-SP"
  const infoMatch = html.match(/<li>(#CF:[^<]+)<\/li>/);
  const infoText  = infoMatch ? infoMatch[1] : '';

  const attendantMatch = infoText.match(/Atendente:\s*([\w\-]+)/i);
  const attendant      = attendantMatch ? attendantMatch[1].trim() : null;
  if (attendant) console.log('[NFCE] Atendente:', attendant);

  const eiMatch  = infoText.match(/EI([\d,]+)/);
  const efMatch  = infoText.match(/EF([\d,]+)/);
  const volMatch = infoText.match(/V([\d,]+)/);

  const encInitial = eiMatch  ? parseFloat(eiMatch[1].replace(',', '.'))  : null;
  const encFinal   = efMatch  ? parseFloat(efMatch[1].replace(',', '.'))  : null;
  const encVolume  = volMatch ? parseFloat(volMatch[1].replace(',', '.')) : null;

  if (encInitial !== null && encFinal !== null) {
    const calculatedVolume = parseFloat((encFinal - encInitial).toFixed(3));
    const litersVal        = data.liters ?? encVolume;
    if (litersVal !== null) {
      const diff = Math.abs(calculatedVolume - litersVal);
      if (diff > 0.1) {
        console.log('[NFCE] ⚠️ Volume inconsistente:', {
          cupom:        litersVal,
          encerrante:   calculatedVolume,
          diferenca:    diff.toFixed(3),
        });
      } else {
        console.log('[NFCE] ✅ Volume validado pelos encerrantes:', calculatedVolume, 'L');
      }
    }
  }

  data.atendente  = attendant;
  data.encerrante = { inicial: encInitial, final: encFinal, volume: encVolume };

  console.log('[NFCE] parseHtmlNfceData resultado:', {
    cnpj: data.cnpj, vNF: data.vNF, dEmi: data.dEmi, xNome: data.xNome,
    items: data.items, liters: data.liters,
    atendente: data.atendente, encerrante: data.encerrante,
  });

  return data;
}

// ── parseNfce ─────────────────────────────────────────────────────────────────

async function parseNfce(qrCodeUrl) {
  if (!qrCodeUrl || typeof qrCodeUrl !== 'string') {
    throw createError('URL do QR Code é obrigatória.', 400);
  }

  console.log('[NFCE] URL recebida:', qrCodeUrl);

  const urlParams = extractParamsFromUrl(qrCodeUrl);
  console.log('[NFCE] Parâmetros extraídos da URL:', urlParams);

  // ── Fetch SEFAZ ──────────────────────────────────────────────────────────────
  let xmlText;
  let responseStatus;
  let isHtml = false;

  try {
    const response = await axios.get(qrCodeUrl, {
      timeout:      15000,
      responseType: 'text',
      headers: {
        'User-Agent':               'Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36',
        'Accept':                   'application/xml, text/xml, */*',
        'ngrok-skip-browser-warning': 'true',
      },
      validateStatus: (s) => s < 500,
    });

    responseStatus = response.status;
    console.log('[NFCE] Status HTTP:', responseStatus);
    console.log('[NFCE] Content-Type:', response.headers['content-type']);
    console.log('[NFCE] Resposta (primeiros 500 chars):', String(response.data).substring(0, 500));

    if (responseStatus === 404) {
      throw createError('Nota fiscal não encontrada na SEFAZ.', 422);
    }

    xmlText = response.data;

    // Detect HTML response — SP SEFAZ and others return a consultation HTML page
    if (typeof xmlText === 'string' && (xmlText.trimStart().startsWith('<html') || xmlText.trimStart().startsWith('<!DOCTYPE'))) {
      console.log('[NFCE] SEFAZ retornou página HTML em vez de XML — tentando fallback por parâmetros da URL.');
      isHtml = true;
    }
  } catch (err) {
    if (err.statusCode) throw err; // já é um createError
    if (err.code === 'ECONNABORTED' || err.code === 'ETIMEDOUT') {
      console.log('[NFCE] Timeout ao consultar SEFAZ:', err.message);
      throw createError('A SEFAZ não respondeu a tempo. Tente novamente.', 504);
    }
    console.log('[NFCE] Erro de rede ao consultar SEFAZ:', err.message, err.code);
    throw createError('Não foi possível consultar a SEFAZ. Verifique sua conexão com a internet.', 502);
  }

  // ── Parse XML ────────────────────────────────────────────────────────────────
  let doc;
  if (!isHtml) {
    try {
      doc = await parseXml(xmlText);
      console.log('[NFCE] XML parseado com sucesso. Chaves raiz:', Object.keys(doc));
    } catch (xmlErr) {
      console.log('[NFCE] Falha ao parsear XML:', xmlErr.message);
      console.log('[NFCE] Tentando fallback por parâmetros da URL...');
      isHtml = true; // treat as unreadable — fall through to URL param fallback
    }
  }

  // ── HTML / fallback path (SP SEFAZ and others that return a consultation page) ─
  if (isHtml || !doc) {
    console.log('[NFCE] Iniciando fallback — SEFAZ retornou HTML ou XML inválido.');

    // Try to extract structured data from the HTML body before falling back to URL params
    const htmlData = (typeof xmlText === 'string' && xmlText.length > 100)
      ? parseHtmlNfceData(xmlText, urlParams)
      : { cnpj: null, xNome: null, vNF: null, dEmi: null, items: [] };

    const chNFe      = urlParams.chNFe;
    const cnpj       = htmlData.cnpj   || urlParams.cnpjFromKey;
    const rawVNF     = htmlData.vNF    ?? (urlParams.vNF ? parseBRL(urlParams.vNF) : null);
    const rawDEmi    = htmlData.dEmi   || urlParams.dEmi;

    console.log('[NFCE] Fallback combinado:', { chNFe, cnpj, rawVNF, rawDEmi });

    if (!chNFe) {
      throw createError(
        'SEFAZ retornou uma página não legível e a chave de acesso não foi encontrada na URL do QR Code. Verifique o cupom.',
        422,
      );
    }

    const totalValue = (rawVNF && !isNaN(rawVNF) && rawVNF > 0) ? rawVNF : null;
    const emitDate   = rawDEmi ? new Date(rawDEmi) : null;

    if (!totalValue) {
      console.log('[NFCE] SEFAZ inacessível e não foi possível obter o valor (HTML + URL sem vNF) — salvando como pendente.');
      throw createError(
        'SEFAZ retornou página sem dados suficientes. O abastecimento será salvo para validação posterior.',
        502,
      );
    }

    // Map fuel items extracted from the HTML.
    // Liters may be in a separate table cell from the product name, so fall back to
    // the page-level liters value parsed by parseHtmlNfceData when inline isn't available.
    const items = htmlData.items.map(itemStr => {
      const fuelType = detectFuelType(itemStr);
      const inlineM  = itemStr.match(/([\d]+[,.][\d]+)\s*[Ll]/);
      const liters   = inlineM
        ? parseFloat(inlineM[1].replace(',', '.'))
        : (fuelType ? (htmlData.liters ?? null) : null);
      return { nome: itemStr, litros: liters, precoUnitario: null, tipoCombustivel: fuelType };
    });
    const fuelItem = items.find(i => i.tipoCombustivel);

    console.log('[NFCE] Fallback HTML OK — Valor:', totalValue, '| CNPJ:', cnpj, '| Combustível:', fuelItem?.tipoCombustivel ?? 'não identificado');

    return {
      cnpj,
      nomeEmitente:    htmlData.xNome || '',
      dataEmissao:     emitDate,
      valorTotal:      totalValue,
      chaveAcesso:     chNFe,
      tipoCombustivel: fuelItem?.tipoCombustivel ?? null,
      litros:          fuelItem?.litros          ?? null,
      itens:           items,
      atendente:       htmlData.atendente        ?? null,
      encerrante:      htmlData.encerrante       ?? null,
      fallback:        true,
    };
  }

  // ── Normal XML flow ──────────────────────────────────────────────────────────

  // Locate root elements — response may be nfeProc or NFe directly
  const root   = doc.nfeProc ?? doc.NFe ?? doc;
  const nfeArr = root.NFe ?? [];
  const nfe    = (Array.isArray(nfeArr) ? nfeArr[0] : nfeArr) ?? {};
  const infNFe = (Array.isArray(nfe.infNFe) ? nfe.infNFe[0] : nfe.infNFe) ?? {};

  const protNFe = (Array.isArray(root.protNFe) ? root.protNFe[0] : root.protNFe) ?? {};
  const infProt = (Array.isArray(protNFe.infProt) ? protNFe.infProt[0] : protNFe.infProt) ?? {};

  console.log('[NFCE] infProt cStat:', val(infProt, 'cStat'), '| chNFe:', val(infProt, 'chNFe'));

  // SEFAZ authorization check
  const cStat   = val(infProt, 'cStat');
  const erroMsg = sefazErro(cStat);
  if (erroMsg) throw createError(erroMsg, 422);

  // Access key (44 digits)
  const accessKey = val(infProt, 'chNFe') || urlParams.chNFe;
  if (!accessKey || !/^\d{44}$/.test(String(accessKey).trim())) {
    throw createError('Chave de acesso da NF-e inválida ou não encontrada. Verifique o QR Code.', 422);
  }

  // Issuer
  const emit  = (Array.isArray(infNFe.emit) ? infNFe.emit[0] : infNFe.emit) ?? {};
  const cnpj  = String(val(emit, 'CNPJ') ?? urlParams.cnpjFromKey ?? '').replace(/\D/g, '');
  const xNome = String(val(emit, 'xNome') ?? '');

  // Emission date
  const ide      = (Array.isArray(infNFe.ide) ? infNFe.ide[0] : infNFe.ide) ?? {};
  const dhEmi    = val(ide, 'dhEmi') || val(ide, 'dEmi') || urlParams.dEmi || '';
  const emitDate = dhEmi ? new Date(dhEmi) : null;

  // Total
  const total      = (Array.isArray(infNFe.total) ? infNFe.total[0] : infNFe.total) ?? {};
  const icms       = (Array.isArray(total.ICMSTot) ? total.ICMSTot[0] : total.ICMSTot) ?? {};
  const totalValue = parseFloat(val(icms, 'vNF') ?? urlParams.vNF ?? 0);

  console.log('[NFCE] Dados extraídos do XML — CNPJ:', cnpj, '| Emitente:', xNome, '| Valor:', totalValue, '| Data:', dhEmi);

  // Items (det array)
  const detList = Array.isArray(infNFe.det) ? infNFe.det : [];
  const items = detList.map((det) => {
    const prod  = Array.isArray(det.prod) ? det.prod[0] : (det.prod ?? {});
    const name   = String(val(prod, 'xProd') ?? '');
    const liters = parseFloat(val(prod, 'qCom')   ?? 0);
    const price  = parseFloat(val(prod, 'vUnCom') ?? 0);
    return {
      nome:            name,
      litros:          liters,
      precoUnitario:   price,
      tipoCombustivel: detectFuelType(name),
    };
  });

  console.log('[NFCE] Itens:', items.map((i) => `${i.nome} (${i.tipoCombustivel ?? 'sem tipo'})`));

  const fuelItem = items.find((i) => i.tipoCombustivel);

  return {
    cnpj,
    nomeEmitente:    xNome,
    dataEmissao:     emitDate,
    valorTotal:      totalValue,
    chaveAcesso:     String(accessKey).trim(),
    tipoCombustivel: fuelItem?.tipoCombustivel ?? null,
    litros:          fuelItem?.litros ?? null,
    itens:           items,
  };
}

// ── validateNfce ──────────────────────────────────────────────────────────────

async function validateNfce(qrCodeUrl, customerId, establishmentId) {
  // 1. Parse from SEFAZ — intercept connectivity failures to create a pending record
  let nfce;
  try {
    nfce = await parseNfce(qrCodeUrl);
  } catch (parseErr) {
    const isSefazDown = parseErr.statusCode === 502 || parseErr.statusCode === 504;
    if (!isSefazDown) throw parseErr;

    // SEFAZ unreachable — save a PENDING_VALIDATION record so the customer isn't left empty-handed
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

    const receiptCode = generateReceiptCode('PND');

    console.log(`[NFCE-PENDING] Criando transação pendente — customerId=${customer.id} establishmentId=${establishmentId}`);
    const pending = await prisma.transaction.create({
      data: {
        customerId:      customer.id,
        operatorId:      operator.id,
        establishmentId,
        amount:          0,
        cashbackPercent: 0,
        cashbackValue:   0,
        receiptCode,
        source:    'NFCE_QR_PENDING',
        status:    'PENDING_VALIDATION',
        qrCodeUrl: qrCodeUrl,
      },
    });

    await audit.log({
      action:     'NFCE_PENDING_VALIDATION',
      entity:     'Transaction',
      entityId:   pending.id,
      operatorId: operator.id,
      metadata:   { qrCodeUrl, customerId, establishmentId, motivo: parseErr.message },
    });

    return {
      pendente:  true,
      mensagem:  'Abastecimento salvo para validação posterior.',
      codigoCupom: receiptCode,
    };
  }

  // 2. Load establishment + customer in parallel
  // findFirst with OR so we match even when the DB stores CNPJ with or without formatting
  const nfceCnpj = String(nfce.cnpj || '').replace(/\D/g, '');
  const [establishment, customer] = await Promise.all([
    prisma.establishment.findFirst({
      where: {
        OR: [
          { id: establishmentId },
          ...(nfceCnpj ? [{ cnpj: nfceCnpj }] : []),
        ],
      },
    }),
    prisma.customer.findUnique({ where: { id: customerId } }),
  ]);

  if (!establishment) throw createError('Estabelecimento não encontrado.', 404);
  if (!customer)      throw createError('Cliente não encontrado.', 404);

  // 3. CNPJ must match this establishment — strip non-digits on both sides
  const estCnpj = String(establishment.cnpj || '').replace(/\D/g, '');
  console.log('[NFCE] Comparando CNPJ — NF-e:', nfceCnpj, '| Estabelecimento:', estCnpj);
  if (nfceCnpj && estCnpj && nfceCnpj !== estCnpj) {
    throw createError(
      `Esta nota fiscal pertence a outro estabelecimento (${nfce.nomeEmitente || 'desconhecido'}). ` +
      'Use somente notas fiscais emitidas neste posto.',
      422,
    );
  }

  // 4. Date within 48 hours (skipped for URL-param fallback — only AAMM precision available)
  if (!nfce.fallback) {
    if (!nfce.dataEmissao || isNaN(nfce.dataEmissao.getTime())) {
      throw createError('Data de emissão da nota fiscal não encontrada.', 422);
    }
    const ageMinutes = (Date.now() - nfce.dataEmissao.getTime()) / 60_000;
    if (ageMinutes < 0) {
      throw createError('A data da nota fiscal está no futuro. Verifique o QR Code.', 422);
    }
    if (ageMinutes > 48 * 60) {
      throw createError(
        `Este cupom fiscal foi emitido há mais de 48 horas (${formatDateBR(nfce.dataEmissao)}) e não pode mais ser utilizado.`,
        422,
      );
    }
  }

  // 5. Duplicate check
  const duplicate = await prisma.transaction.findUnique({
    where: { nfceKey: nfce.chaveAcesso },
  });
  if (duplicate) {
    throw createError('Este cupom fiscal já foi utilizado para gerar cashback anteriormente.', 409);
  }

  // 6. Total value sanity
  if (!nfce.valorTotal || nfce.valorTotal <= 0) {
    throw createError('O valor total da nota fiscal é inválido.', 422);
  }

  // 7. Find system operator
  const operator = await prisma.operator.findFirst({
    where:   { establishmentId },
    orderBy: { role: 'asc' },
  });
  if (!operator) throw createError('Posto sem operadores cadastrados.', 500);

  // 8. Calculate cashback (full logic: fuel type, bonuses, caps)
  const { cashbackValue, effectivePercent } = await computeCashback(
    nfce.valorTotal,
    nfce.tipoCombustivel,
    nfce.litros,
    establishmentId,
  );

  // 9. Fraud check
  await fraudService.checkTransaction(customer.cpf, nfce.valorTotal, cashbackValue, establishmentId);

  // 10. Create transaction + credit balance atomically
  const receiptCode = generateReceiptCode('NFC');
  console.log(`[NFCE] Criando transação — customerId=${customer.id} establishmentId=${establishmentId} valor=${nfce.valorTotal} cashback=${cashbackValue}`);

  const [transaction] = await prisma.$transaction([
    prisma.transaction.create({
      data: {
        customerId:       customer.id,
        operatorId:       operator.id,
        establishmentId,
        amount:           nfce.valorTotal,
        cashbackPercent:  effectivePercent,
        cashbackValue,
        receiptCode,
        fuelType:         nfce.tipoCombustivel ?? null,
        liters:           nfce.litros != null ? parseFloat(nfce.litros.toFixed(3)) : null,
        nfceKey:          nfce.chaveAcesso,
        source:           'NFCE_QR',
        status:           'CONFIRMED',
        attendantName:    nfce.atendente        ?? null,
        encerranteInicial: nfce.encerrante?.inicial ?? null,
        encerranteFinal:  nfce.encerrante?.final    ?? null,
      },
    }),
    prisma.customer.update({
      where: { id: customer.id },
      data:  { balance: { increment: cashbackValue } },
    }),
  ]);

  const updated = await prisma.customer.findUnique({ where: { id: customer.id } });

  await audit.log({
    action:     'NFCE_CASHBACK_EARNED',
    entity:     'Transaction',
    entityId:   transaction.id,
    operatorId: operator.id,
    metadata: {
      chaveAcesso:     nfce.chaveAcesso,
      cnpj:            nfce.cnpj,
      valorNota:       nfce.valorTotal,
      cashbackGerado:  cashbackValue,
      tipoCombustivel: nfce.tipoCombustivel,
      customerId:      customer.id,
    },
  });

  return {
    mensagem: 'Cashback gerado com sucesso via NFC-e!',
    nota: {
      chaveAcesso:     nfce.chaveAcesso,
      emitente:        nfce.nomeEmitente,
      dataEmissao:     formatDateBR(nfce.dataEmissao),
      valorTotal:      formatBRL(nfce.valorTotal),
      tipoCombustivel: nfce.tipoCombustivel,
      litros:          nfce.litros != null ? `${nfce.litros.toFixed(2)} L` : null,
    },
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

module.exports = { parseNfce, validateNfce };
