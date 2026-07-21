const { PrismaClient } = require('@prisma/client');
const jwt = require('jsonwebtoken');
const { isValidCpf, stripCpf, formatCpf } = require('../utils/cpfValidator');
const { formatBRL } = require('../utils/currencyFormatter');
const { formatDateBR } = require('../utils/dateFormatter');
const { createError } = require('../middlewares/errorMiddleware');
const { generateReceiptCode } = require('../utils/receiptCode');
const transactionService = require('./transactionService');
const pending = require('./pendingRedemptions');
const otpService = require('./otpService');
const audit = require('./auditService');
const fraudAlert = require('./fraudAlertService');
const notify     = require('./notificationService');
const faceService   = require('./faceService');
const selfieService = require('./selfieService');
const attendantService = require('./attendantService');

const prisma = new PrismaClient();

const TOKEN_EXPIRES = '30d';

// ── Helpers ───────────────────────────────────────────────────────────────────

function generateCode(length = 8) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = 'PostoCash-';
  for (let i = 0; i < length; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

function signCustomerToken({ customerId, cpf, name, establishmentId }) {
  return jwt.sign(
    { sub: customerId, cpf, name, establishmentId, type: 'customer' },
    process.env.JWT_SECRET,
    { expiresIn: TOKEN_EXPIRES }
  );
}

async function findEstablishment(cnpjOrId) {
  const clean = String(cnpjOrId || '').replace(/\D/g, '');
  const establishment = await prisma.establishment.findFirst({
    where: {
      OR: [
        { id: cnpjOrId },
        ...(clean ? [{ cnpj: clean }, { cnpj: cnpjOrId }] : []),
      ],
    },
  });

  if (!establishment) {
    throw createError('Estabelecimento não encontrado.', 404);
  }

  return establishment;
}

// Find an operator to attribute mobile transactions (prefer ADMIN)
async function findSystemOperator(establishmentId) {
  const operator = await prisma.operator.findFirst({
    where: { establishmentId },
    orderBy: { role: 'asc' }, // ADMIN sorts before OPERATOR alphabetically
  });
  if (!operator) throw createError('Posto sem operadores cadastrados.', 500);
  return operator;
}

function serializeCustomer(c) {
  return {
    id:      c.id,
    nome:    c.name,
    cpf:     formatCpf(c.cpf),
    telefone: c.phone,
    saldo:   parseFloat(c.balance),
    saldoFormatado: formatBRL(c.balance),
  };
}

// ── register ──────────────────────────────────────────────────────────────────

async function register({ cpf, name, phone, establishmentCnpj, deviceId, selfieBase64, selfieThumb, selfieFull }) {
  if (!cpf || !isValidCpf(cpf)) throw createError('CPF inválido.', 400);
  if (!name || !name.trim())    throw createError('Nome é obrigatório.', 400);
  if (!phone || !phone.trim())  throw createError('Telefone é obrigatório.', 400);
  if (!establishmentCnpj)       throw createError('CNPJ do estabelecimento é obrigatório.', 400);

  const strippedCpf   = stripCpf(cpf);
  const establishment = await findEstablishment(establishmentCnpj);

  // Use pre-compressed thumbnail when provided; fall back to raw base64
  const thumbToStore = selfieThumb || selfieBase64;

  const updateData = {
    name:  name.trim(),
    phone: phone.replace(/\D/g, ''),
    registered: true, // claim any pista stub row (CPF without account) and keep its balance
  };
  if (deviceId)      updateData.deviceId   = deviceId;
  if (thumbToStore)  updateData.selfieData  = thumbToStore; // legacy field for Rekognition

  const customer = await prisma.customer.upsert({
    where: { cpf_establishmentId: { cpf: strippedCpf, establishmentId: establishment.id } },
    create: {
      cpf:             strippedCpf,
      establishmentId: establishment.id,
      ...updateData,
    },
    update: updateData,
  });

  // Upload to Supabase Storage (non-blocking — don't delay registration response)
  if (thumbToStore) {
    const uploadFn = (selfieThumb && selfieFull)
      ? selfieService.uploadProcessed(selfieThumb, selfieFull, customer.id, establishment.id)
      : selfieService.uploadSelfie(selfieBase64, customer.id, establishment.id);

    uploadFn.catch((err) =>
      console.error('[register] selfie upload error:', err.message)
    );
  }

  const token = signCustomerToken({
    customerId:      customer.id,
    cpf:             customer.cpf,
    name:            customer.name,
    establishmentId: establishment.id,
  });

  return {
    mensagem: 'Cadastro realizado com sucesso.',
    token,
    cliente: serializeCustomer(customer),
    estabelecimento: { nome: establishment.name },
  };
}

// ── login ─────────────────────────────────────────────────────────────────────

async function login({ cpf, establishmentCnpj, recoveryToken }) {
  if (!cpf || !isValidCpf(cpf)) throw createError('CPF inválido.', 400);
  if (!establishmentCnpj)       throw createError('CNPJ do estabelecimento é obrigatório.', 400);
  if (!recoveryToken)           throw createError('Verificação por SMS obrigatória.', 401);

  const strippedCpf = stripCpf(cpf);
  const establishment = await findEstablishment(establishmentCnpj);

  const customer = await prisma.customer.findUnique({
    where: { cpf_establishmentId: { cpf: strippedCpf, establishmentId: establishment.id } },
  });
  if (!customer) throw createError('Cliente não encontrado. Realize o cadastro primeiro.', 404);

  // Require proof (minted by verifyOtp) that the caller just demonstrated
  // control of THIS customer's phone — CPF and the establishment's CNPJ are
  // both non-secret (CPF printed on receipts, CNPJ public business registry
  // data), so without this check anyone who knew both could mint a session
  // for any customer with no OTP/password/device check at all.
  let proof;
  try {
    proof = jwt.verify(recoveryToken, process.env.JWT_SECRET);
  } catch {
    throw createError('Verificação por SMS expirada. Solicite um novo código.', 401);
  }
  if (
    proof.purpose !== 'recovery' ||
    proof.establishmentId !== establishment.id ||
    proof.phone !== customer.phone
  ) {
    throw createError('Verificação por SMS inválida para esta conta.', 403);
  }
  await assertPhoneUniqueToCustomer(establishment.id, proof.phone);

  const token = signCustomerToken({
    customerId:      customer.id,
    cpf:             customer.cpf,
    name:            customer.name,
    establishmentId: establishment.id,
  });

  return {
    mensagem: 'Login realizado com sucesso.',
    token,
    cliente: serializeCustomer(customer),
    estabelecimento: { nome: establishment.name },
  };
}

// ── getBalance ────────────────────────────────────────────────────────────────

async function getBalance({ customerId, establishmentId }) {
  const customer = await prisma.customer.findUnique({ where: { id: customerId } });
  if (!customer || customer.establishmentId !== establishmentId) {
    throw createError('Cliente não encontrado.', 404);
  }

  return {
    mensagem: 'Saldo consultado com sucesso.',
    saldo:          parseFloat(customer.balance),
    saldoFormatado: formatBRL(customer.balance),
    nome:           customer.name,
    cpf:            formatCpf(customer.cpf),
  };
}

// ── recordTransaction ─────────────────────────────────────────────────────────

async function recordTransaction({ amount, fuelType, liters }, customerPayload) {
  const { cpf, establishmentId } = customerPayload;

  const parsedAmount = parseFloat(amount);
  if (isNaN(parsedAmount) || parsedAmount <= 0) {
    throw createError('Valor do abastecimento deve ser maior que zero.', 400);
  }

  // Find a system operator for this establishment to attribute the transaction
  const operator = await findSystemOperator(establishmentId);

  const result = await transactionService.earn(
    { cpf, amount: parsedAmount, fuelType, liters },
    { id: operator.id, establishmentId }
  );

  // Fire push notification for cashback earned (non-blocking)
  const customerId = customerPayload.sub;
  const cashback   = parseFloat(result.transacao?.cashbackGerado ?? result.transacao?.cashbackGerado ?? 0);
  if (customerId) {
    notify.notifyCashbackEarned(customerId, {
      amount:     cashback,
      newBalance: parseFloat(result.transacao?.novoSaldo ?? 0),
    }).catch(() => {});
  }

  return result;
}

// ── generateRedemption ────────────────────────────────────────────────────────

async function generateRedemption({ amount, latitude, longitude }, customerPayload) {
  const { sub: customerId, establishmentId } = customerPayload;

  const parsedAmount = parseFloat(amount);
  if (isNaN(parsedAmount) || parsedAmount <= 0) {
    throw createError('Valor de resgate deve ser maior que zero.', 400);
  }

  const customer = await prisma.customer.findUnique({ where: { id: customerId } });
  if (!customer) throw createError('Cliente não encontrado.', 404);

  const balance = parseFloat(customer.balance);
  if (parsedAmount > balance) {
    throw createError(`Saldo insuficiente. Saldo disponível: ${formatBRL(balance)}.`, 400);
  }

  // Geolocation check (only if customer provided coordinates)
  let geoWarning = null;
  if (latitude != null && longitude != null) {
    const lat = parseFloat(latitude);
    const lng = parseFloat(longitude);

    // Velocity / impossibly-fast-movement check
    const velocity = await fraudAlert.checkVelocity(customerId, lat, lng);
    if (velocity.suspicious) {
      await fraudAlert.logAlert('VELOCITY_ANOMALY', customerId, establishmentId, velocity);
    }

    // Distance from establishment check
    geoWarning = await fraudAlert.validateGeolocation(establishmentId, lat, lng);
    if (geoWarning) {
      await fraudAlert.logAlert('LOCATION_MISMATCH', customerId, establishmentId, { lat, lng });
    }

    // Update customer's last known location
    await fraudAlert.updateCustomerLocation(customerId, lat, lng);
  }

  const code = generateCode(6);

  pending.set(code, {
    customerId,
    cpf:             customer.cpf,
    name:            customer.name,
    establishmentId,
    amount:          parsedAmount,
  });

  const exp = pending.expiresAt(code);

  return {
    mensagem:    'Código de resgate gerado com sucesso.',
    codigo:      code,
    qrData:      JSON.stringify({ type: 'PostoCash_REDEEM', code, amount: parsedAmount }),
    valor:       parsedAmount,
    valorFormatado: formatBRL(parsedAmount),
    expiresAt:   exp ? exp.toISOString() : null,
    validoPor:   '10 minutos',
    avisoGeo:    geoWarning, // non-null = warning but not hard block
  };
}

// ── validateRedemption ────────────────────────────────────────────────────────

async function validateRedemption({ code, latitude, longitude }) {
  if (!code) throw createError('Código de resgate é obrigatório.', 400);

  // Duplicate-QR fraud detection
  if (pending.wasUsed(code)) {
    // Find the establishment from AuditLog or just log without customer context
    await audit.log({
      action:   'FRAUD_DUPLICATE_QR',
      entity:   'Redemption',
      entityId: code,
      metadata: { code },
    });
    throw createError('Este código já foi utilizado. Tentativa de uso duplicado registrada.', 400);
  }

  // Remove from pending map immediately (single-threaded Node.js guard against
  // concurrent requests carrying the same code to both pass the pending.get check)
  const entry = pending.get(code);
  if (!entry) throw createError('Código inválido ou expirado.', 400);
  pending.del(code);
  pending.markUsed(code);

  const { customerId, cpf, name, establishmentId, amount } = entry;

  const operator = await findSystemOperator(establishmentId);

  // Atomic redemption: SELECT FOR UPDATE locks the customer row so concurrent
  // validations cannot both pass the balance check before either commits.
  // idempotencyKey=code: a non-operational error (e.g. a connection drop
  // between Postgres committing and the ack reaching this process) can't be
  // told apart from "nothing committed" from the exception alone — that
  // ambiguity is exactly why the redemption is keyed on the code itself
  // (Redemption.idempotencyKey, unique per establishment). Reviving the code
  // below is therefore safe even when something DID commit: a retry with the
  // same code hits the unique constraint and returns the existing redemption
  // instead of debiting a second time.
  let redemption;
  try {
    redemption = await prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw`
        SELECT balance FROM "Customer" WHERE id = ${customerId} FOR UPDATE
      `;
      if (!locked.length) throw createError('Cliente não encontrado.', 404);

      const balance = parseFloat(locked[0].balance);
      if (amount > balance) {
        throw createError('Saldo insuficiente no momento da validação.', 400);
      }

      const rdm = await tx.redemption.create({
        data: {
          customerId,
          operatorId:     operator.id,
          establishmentId,
          amountUsed:     amount,
          receiptCode:    generateReceiptCode('RDM'),
          idempotencyKey: code,
        },
      });

      await tx.customer.update({
        where: { id: customerId },
        data:  { balance: { decrement: amount } },
      });

      return rdm;
    });
  } catch (err) {
    if (err.code === 'P2002') {
      // A prior attempt with this same code already committed (this is the
      // revived-code retry path) — return that result instead of debiting
      // again. The code stays consumed; there's nothing to revive.
      const existing = await prisma.redemption.findUnique({
        where: { establishmentId_idempotencyKey: { establishmentId, idempotencyKey: code } },
      });
      if (existing) {
        redemption = existing;
      } else {
        throw err;
      }
    } else if (!err.isOperational) {
      // A transient failure (not insufficient balance / customer not found —
      // those are legitimate rejections and the code should stay consumed).
      // Nothing was actually debited here, but the code was already consumed
      // above as a mutex against concurrent double-use — revive it so the
      // customer isn't permanently stuck with a burned code for money that
      // never moved. Safe even if this guess is wrong: see comment above.
      pending.set(code, entry);
      pending.unmarkUsed(code);
      throw err;
    } else {
      throw err;
    }
  }

  // The $transaction above already committed (Redemption created, balance
  // debited) — everything below is best-effort. A transient failure here
  // must NOT throw, or the caller would see an error for a redemption that
  // already succeeded.
  try {
    await audit.log({
      action:    'CASHBACK_REDEEMED_MOBILE',
      entity:    'Redemption',
      entityId:  redemption.id,
      operatorId: operator.id,
      metadata:  { customerId, amount, code, establishmentId },
    });
  } catch (err) {
    console.error(`[appService] Falha ao registrar auditoria do resgate ${redemption.id} (já confirmado):`, err.message);
  }

  // Fire push notification (non-blocking)
  notify.notifyRedemptionConfirmed(customerId, { amount }).catch(() => {});

  // Daily limit check — alert after 3+ redemptions today
  try {
    const dailyCount = await fraudAlert.checkDailyRedemptions(customerId, establishmentId);
    if (dailyCount >= 3) {
      await fraudAlert.logAlert('DAILY_LIMIT_EXCEEDED', customerId, establishmentId, {
        count: dailyCount,
        amount,
      });
    }
  } catch (err) {
    console.error(`[appService] Falha na checagem de limite diário do resgate ${redemption.id} (já confirmado):`, err.message);
  }

  let novoSaldo = null;
  for (let attempt = 1; attempt <= 3 && novoSaldo === null; attempt++) {
    try {
      const updated = await prisma.customer.findUnique({ where: { id: customerId } });
      novoSaldo = formatBRL(updated.balance);
    } catch (err) {
      console.error(`[appService] Falha ao reler saldo após o resgate ${redemption.id} (tentativa ${attempt}/3, já confirmado):`, err.message);
      if (attempt < 3) await new Promise((r) => setTimeout(r, 150));
    }
  }

  return {
    mensagem:       'Resgate processado com sucesso.',
    valorResgatado: formatBRL(amount),
    novoSaldo:      novoSaldo ?? 'indisponível no momento',
    nomeCliente:    name,
  };
}

// ── getHistory ────────────────────────────────────────────────────────────────

async function getHistory({ customerId, establishmentId }, { page = 1, limit = 20 } = {}) {
  const skip = (page - 1) * limit;

  const [transactions, total] = await Promise.all([
    prisma.transaction.findMany({
      where:   { customerId, establishmentId },
      orderBy: { createdAt: 'desc' },
      take:    limit,
      skip,
    }),
    prisma.transaction.count({ where: { customerId, establishmentId } }),
  ]);

  // Enrich with attendant info (photo from the registry) + whether already rated,
  // so the history can offer "Avaliar atendimento" for past visits.
  const [photoMap, existingRatings] = await Promise.all([
    attendantService.photoMap(establishmentId),
    prisma.attendantRating.findMany({
      where:  { transactionId: { in: transactions.map((t) => t.id) } },
      select: { transactionId: true },
    }),
  ]);
  const ratedIds = new Set(existingRatings.map((r) => r.transactionId));

  function attendantOf(attendantName) {
    if (!attendantName) return null;
    const reg = photoMap.get(attendantName);
    const dash = attendantName.indexOf('-');
    const code = dash === -1 ? '' : attendantName.slice(0, dash);
    const name = dash === -1 ? attendantName : attendantName.slice(dash + 1);
    return {
      key:      attendantName,
      name:     reg?.name || name,
      code,
      photoUrl: reg?.photoUrl || null,
      matched:  !!reg,
    };
  }

  return {
    mensagem: 'Histórico de abastecimentos.',
    total,
    pagina:   page,
    transacoes: transactions.map((t) => ({
      id:                 t.id,
      codigoCupom:        t.receiptCode,
      status:             t.status ?? 'CONFIRMED',
      pendente:           (t.status ?? 'CONFIRMED') === 'PENDING_VALIDATION',
      valor:              parseFloat(t.amount),
      valorFormatado:     formatBRL(t.amount),
      cashbackPercent:    parseFloat(t.cashbackPercent),
      cashbackGerado:     parseFloat(t.cashbackValue),
      cashbackFormatado:  formatBRL(t.cashbackValue),
      tipoCombustivel:    t.fuelType || null,
      litros:             t.liters ? parseFloat(t.liters) : null,
      data:               formatDateBR(t.createdAt),
      dataISO:            t.createdAt.toISOString(),
      atendente:          attendantOf(t.attendantName),
      jaAvaliado:         ratedIds.has(t.id),
    })),
  };
}

// ── getStatement ──────────────────────────────────────────────────────────────

async function getStatement({ customerId, establishmentId }, { page = 1, limit = 30 } = {}) {
  const [transactions, redemptions] = await Promise.all([
    prisma.transaction.findMany({
      where:   { customerId, establishmentId },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.redemption.findMany({
      where:   { customerId, establishmentId },
      orderBy: { createdAt: 'desc' },
    }),
  ]);

  const credits = transactions.map((t) => ({
    id:          t.id,
    tipo:        'credito',
    status:      t.status ?? 'CONFIRMED',
    pendente:    (t.status ?? 'CONFIRMED') === 'PENDING_VALIDATION',
    descricao:   (t.status ?? 'CONFIRMED') === 'PENDING_VALIDATION'
                   ? 'Abastecimento pendente de validação'
                   : 'Cashback — abastecimento',
    valor:       parseFloat(t.cashbackValue),
    valorFormatado: formatBRL(t.cashbackValue),
    data:        formatDateBR(t.createdAt),
    dataISO:     t.createdAt.toISOString(),
  }));

  const debits = redemptions.map((r) => ({
    id:          r.id,
    tipo:        'debito',
    descricao:   'Resgate de cashback',
    valor:       parseFloat(r.amountUsed),
    valorFormatado: formatBRL(r.amountUsed),
    data:        formatDateBR(r.createdAt),
    dataISO:     r.createdAt.toISOString(),
  }));

  const all = [...credits, ...debits].sort(
    (a, b) => new Date(b.dataISO) - new Date(a.dataISO)
  );

  const totalCreditos = credits.reduce((s, c) => s + c.valor, 0);
  const totalDebitos  = debits.reduce((s, d) => s + d.valor, 0);

  const total = all.length;
  const paginated = all.slice((page - 1) * limit, page * limit);

  return {
    mensagem: 'Extrato de cashback.',
    total,
    pagina:   page,
    entradas: paginated,
    resumo: {
      totalCreditos:          parseFloat(totalCreditos.toFixed(2)),
      totalCreditosFormatado: formatBRL(totalCreditos),
      totalDebitos:           parseFloat(totalDebitos.toFixed(2)),
      totalDebitosFormatado:  formatBRL(totalDebitos),
      saldoPeriodo:           parseFloat((totalCreditos - totalDebitos).toFixed(2)),
      saldoPeriodoFormatado:  formatBRL(totalCreditos - totalDebitos),
    },
  };
}

// ── sendOtp ───────────────────────────────────────────────────────────────────

async function sendOtp({ phone, establishmentCnpj }) {
  if (!phone || !phone.trim()) throw createError('Telefone é obrigatório.', 400);
  if (!establishmentCnpj)      throw createError('CNPJ do estabelecimento é obrigatório.', 400);

  const establishment = await findEstablishment(establishmentCnpj);
  const rawPhone      = phone.replace(/\D/g, '');

  const code = otpService.send(rawPhone, establishment.id);

  // Inverted on purpose: this must default CLOSED. `NODE_ENV !== 'production'`
  // means a forgotten/misconfigured/blank NODE_ENV — the actual failure mode
  // for a fresh install — leaks every OTP straight into the API response,
  // silently defeating the whole phone-possession check recovery/login rely
  // on. Requiring an explicit opt-in means an unset env var fails safe.
  const debugMode = process.env.OTP_DEBUG_MODE === 'true';
  return {
    mensagem: 'Código enviado com sucesso.',
    // Return code only when explicitly enabled, so the mobile app can
    // auto-fill during local testing.
    ...(debugMode ? { codigo: code } : {}),
  };
}

// ── verifyOtp ─────────────────────────────────────────────────────────────────

const RECOVERY_PROOF_EXPIRES = '5m';

// Short-lived proof that the caller just verified an OTP sent to `phone` at
// `establishmentId`. recoveryComplete() requires this instead of trusting
// CPF+CNPJ alone — without it, anyone who knows a customer's CPF (printed on
// receipts, not secret) could call the public recovery endpoint directly and
// take over the account with no phone possession check at all.
function signRecoveryProof({ phone, establishmentId }) {
  return jwt.sign(
    { phone, establishmentId, purpose: 'recovery' },
    process.env.JWT_SECRET,
    { expiresIn: RECOVERY_PROOF_EXPIRES },
  );
}

// The OTP proof above only establishes control of a PHONE NUMBER, not of a
// specific account — it's minted before we know which customer the caller
// will submit. If that phone is shared across more than one Customer row at
// the same establishment (e.g. a family sharing one line), the proof is
// ambiguous: anyone who verified the OTP could submit ANY of those CPFs and
// pass the `proof.phone === customer.phone` check. Refuse instead of
// silently trusting whichever CPF happened to be submitted.
async function assertPhoneUniqueToCustomer(establishmentId, phone) {
  const count = await prisma.customer.count({ where: { establishmentId, phone } });
  if (count > 1) {
    throw createError(
      'Este telefone está vinculado a mais de uma conta neste posto. Entre em contato com o suporte.',
      409,
    );
  }
}

async function verifyOtp({ phone, code, establishmentCnpj }) {
  if (!phone || !code) throw createError('Telefone e código são obrigatórios.', 400);
  if (!establishmentCnpj) throw createError('CNPJ do estabelecimento é obrigatório.', 400);

  const establishment = await findEstablishment(establishmentCnpj);
  const rawPhone      = phone.replace(/\D/g, '');

  const valid = otpService.verify(rawPhone, establishment.id, String(code));
  if (!valid) throw createError('Código inválido ou expirado.', 400);

  const recoveryToken = signRecoveryProof({ phone: rawPhone, establishmentId: establishment.id });

  return { mensagem: 'Código verificado com sucesso.', verificado: true, recoveryToken };
}

// ── getConfig ─────────────────────────────────────────────────────────────────
// Returns white-label configuration for the establishment.
// If no auth, returns global defaults.

async function getConfig(customerPayload) {
  const establishmentId = customerPayload?.establishmentId ?? null;

  const defaults = {
    appName:         'PostoCash',
    primaryColor:    '#1e3a5f',
    secondaryColor:  '#D97706',
    logoUrl:         null,
    cashbackPercent: 5,
    minRedemption:   10,
    postoName:       'Posto',
    supportWhatsApp: '',
    termsUrl:        '',
    cnpj:            '',
  };

  if (!establishmentId) {
    // For single-establishment deployments, return the first establishment's public data
    const est = await prisma.establishment.findFirst({
      select: { cnpj: true, name: true, cashbackPercent: true, minRedemption: true, phone: true, logoUrl: true, primaryColor: true, secondaryColor: true },
    });
    if (!est) return defaults;
    return {
      ...defaults,
      postoName:       est.name,
      cashbackPercent: parseFloat(est.cashbackPercent),
      minRedemption:   est.minRedemption ? parseFloat(est.minRedemption) : defaults.minRedemption,
      supportWhatsApp: est.phone ?? '',
      cnpj:            est.cnpj,
      logoUrl:         est.logoUrl ?? null,
      primaryColor:    est.primaryColor ?? defaults.primaryColor,
      secondaryColor:  est.secondaryColor ?? defaults.secondaryColor,
    };
  }

  const [establishment, settings] = await Promise.all([
    prisma.establishment.findUnique({
      where:  { id: establishmentId },
      select: { cnpj: true, name: true, phone: true, cashbackPercent: true, minRedemption: true, logoUrl: true, primaryColor: true, secondaryColor: true },
    }),
    prisma.cashbackSettings.findUnique({
      where:  { establishmentId },
      select: { defaultPercent: true },
    }),
  ]);

  if (!establishment) return defaults;

  return {
    ...defaults,
    postoName:       establishment.name,
    cashbackPercent: settings
      ? parseFloat(settings.defaultPercent)
      : parseFloat(establishment.cashbackPercent),
    minRedemption: establishment.minRedemption
      ? parseFloat(establishment.minRedemption)
      : defaults.minRedemption,
    supportWhatsApp: establishment.phone ?? '',
    cnpj:            establishment.cnpj,
    logoUrl:         establishment.logoUrl ?? null,
    primaryColor:    establishment.primaryColor ?? defaults.primaryColor,
    secondaryColor:  establishment.secondaryColor ?? defaults.secondaryColor,
  };
}

// ── savePushToken ─────────────────────────────────────────────────────────────

async function savePushToken({ token: pushToken }, customerPayload) {
  const customerId = customerPayload?.sub;
  if (!customerId) return { mensagem: 'Token não salvo.' };

  // Explicit null clears it (customer turned off push notifications in the
  // app) — distinct from an absent/falsy token, which is just a bad request.
  if (pushToken === null) {
    await prisma.customer.update({ where: { id: customerId }, data: { pushToken: null } });
    return { mensagem: 'Token de push removido.' };
  }
  if (!pushToken) return { mensagem: 'Token não salvo.' };

  await prisma.customer.update({
    where: { id: customerId },
    data:  { pushToken },
  });

  return { mensagem: 'Token de push salvo com sucesso.' };
}

// ── recoveryLookup ────────────────────────────────────────────────────────────
// Step 1 of reinstall recovery: confirm the customer exists and return masked phone.

async function recoveryLookup({ cpf, establishmentCnpj }) {
  if (!cpf || !isValidCpf(cpf)) throw createError('CPF inválido.', 400);
  if (!establishmentCnpj)       throw createError('CNPJ do estabelecimento é obrigatório.', 400);

  const strippedCpf   = stripCpf(cpf);
  const establishment = await findEstablishment(establishmentCnpj);

  const customer = await prisma.customer.findUnique({
    where: { cpf_establishmentId: { cpf: strippedCpf, establishmentId: establishment.id } },
  });
  if (!customer) throw createError('Conta não encontrada. Verifique o CPF e o posto informados.', 404);

  // Mask phone: (11) 9****-1234
  const phone  = customer.phone;
  const masked = phone.length >= 8
    ? `(${phone.slice(0, 2)}) ${phone[2]}****-${phone.slice(-4)}`
    : '****';

  return {
    mensagem:      'Conta encontrada.',
    telefoneMascarado: masked,
    telefoneRaw:   phone, // needed to send OTP
  };
}

// ── recoveryComplete ──────────────────────────────────────────────────────────
// Step 3 of reinstall recovery: called after OTP verified.
// Binds the new device, optionally updates selfie, issues a fresh token.

async function recoveryComplete({ cpf, establishmentCnpj, deviceId, selfieBase64, selfieThumb, selfieFull, recoveryToken }) {
  if (!cpf || !isValidCpf(cpf)) throw createError('CPF inválido.', 400);
  if (!establishmentCnpj)       throw createError('CNPJ do estabelecimento é obrigatório.', 400);
  if (!deviceId)                throw createError('ID do dispositivo é obrigatório.', 400);
  if (!recoveryToken)           throw createError('Verificação por SMS obrigatória.', 401);

  const strippedCpf   = stripCpf(cpf);
  const establishment = await findEstablishment(establishmentCnpj);

  const customer = await prisma.customer.findUnique({
    where: { cpf_establishmentId: { cpf: strippedCpf, establishmentId: establishment.id } },
  });
  if (!customer) throw createError('Cliente não encontrado.', 404);

  // Require proof (minted by verifyOtp) that the caller just demonstrated
  // control of THIS customer's phone number — CPF alone is not a secret.
  let proof;
  try {
    proof = jwt.verify(recoveryToken, process.env.JWT_SECRET);
  } catch {
    throw createError('Verificação por SMS expirada. Solicite um novo código.', 401);
  }
  if (
    proof.purpose !== 'recovery' ||
    proof.establishmentId !== establishment.id ||
    proof.phone !== customer.phone
  ) {
    throw createError('Verificação por SMS inválida para esta conta.', 403);
  }
  await assertPhoneUniqueToCustomer(establishment.id, proof.phone);

  const incomingSelfie = selfieThumb || selfieBase64;
  const hasSelfieOnFile = customer.selfieData || customer.selfieThumbnailUrl;

  // A customer with a selfie on file MUST prove identity with a new one — a
  // caller hitting this endpoint directly (not through the vetted mobile
  // client) could otherwise just omit the selfie fields entirely and skip
  // biometric verification, rebinding the device with only the OTP proof.
  if (hasSelfieOnFile && !incomingSelfie) {
    throw createError('Verificação por selfie é obrigatória para esta conta.', 400);
  }

  // Selfie similarity check using pixel comparison (thumbnail is preferred)
  if (incomingSelfie && hasSelfieOnFile) {
    const result = await selfieService.compareFaces(incomingSelfie, customer.id);

    if (!result.match) {
      await fraudAlert.logAlert('SELFIE_MISMATCH', customer.id, establishment.id, {
        confidence: result.confidence,
        method:     customer.selfieThumbnailUrl ? 'pixel-supabase' : 'pixel-legacy',
      });
      throw createError(
        'Não foi possível verificar sua identidade.\nEntre em contato com o posto.',
        403,
      );
    }
  }

  // Update device binding and refresh selfie data
  const updateData = { deviceId };
  if (incomingSelfie) updateData.selfieData = incomingSelfie;

  await prisma.customer.update({
    where: { id: customer.id },
    data:  updateData,
  });

  // Upload new selfie to Supabase (non-blocking)
  if (incomingSelfie) {
    const uploadFn = (selfieThumb && selfieFull)
      ? selfieService.uploadProcessed(selfieThumb, selfieFull, customer.id, establishment.id)
      : selfieService.uploadSelfie(incomingSelfie, customer.id, establishment.id);

    uploadFn.catch((err) =>
      console.error('[recoveryComplete] selfie upload error:', err.message)
    );
  }

  const token = signCustomerToken({
    customerId:      customer.id,
    cpf:             customer.cpf,
    name:            customer.name,
    establishmentId: establishment.id,
  });

  await audit.log({
    action:   'ACCOUNT_RECOVERED',
    entity:   'Customer',
    entityId: customer.id,
    metadata: { deviceId },
  });

  return {
    mensagem: 'Conta recuperada com sucesso.',
    token,
    cliente:  serializeCustomer(customer),
    estabelecimento: { nome: establishment.name },
  };
}

// ── verifyFace ────────────────────────────────────────────────────────────────
// Reinstall flow — verify identity by selfie comparison.
// Without CPF  (step 1): scan all customers at the establishment, best size-ratio match.
// With CPF     (step 4): look up by CPF, compare selfies.
// On success: bind new deviceId, refresh selfie, issue token.

async function verifyFace({ selfieBase64, selfieThumb, selfieFull, cnpj, cpf, deviceId }) {
  // Accept pre-compressed thumb (preferred) or raw base64 (legacy)
  const incomingThumb = selfieThumb || selfieBase64;
  if (!incomingThumb) throw createError('Selfie obrigatória.', 400);
  if (!cnpj)          throw createError('CNPJ do estabelecimento é obrigatório.', 400);
  if (!deviceId)      throw createError('ID do dispositivo é obrigatório.', 400);

  const establishment = await findEstablishment(cnpj);
  let customer        = null;
  let confidence      = 0;

  if (cpf) {
    // Path A — CPF + selfie: 1:1 comparison
    if (!isValidCpf(cpf)) throw createError('CPF inválido.', 400);
    const strippedCpf = stripCpf(cpf);
    customer = await prisma.customer.findUnique({
      where: { cpf_establishmentId: { cpf: strippedCpf, establishmentId: establishment.id } },
    });
    if (!customer) return { match: false, confidence: 0 };

    let result;
    if (faceService.isConfigured()) {
      // Rekognition — works best with the full image; fall back to thumbnail
      const referenceImage = customer.selfieData;
      result = await faceService.compareFaces(referenceImage, incomingThumb);
    } else {
      // Pixel comparison using stored thumbnail from Supabase (or selfieData)
      result = await selfieService.compareFaces(incomingThumb, customer.id);
    }

    if (!result.match) return { match: false, confidence: result.confidence };
    confidence = result.confidence;
  } else {
    // Path B — face-only: 1:N search across all customers at this establishment
    if (faceService.isConfigured()) {
      const customers = await prisma.customer.findMany({
        where: { establishmentId: establishment.id, selfieData: { not: null } },
      });
      const { customer: found, confidence: foundConf } =
        await faceService.searchFaces(incomingThumb, customers);
      if (!found) return { match: false, confidence: 0 };
      customer   = found;
      confidence = foundConf;
    } else {
      // Pixel comparison: compare thumbnail against all stored thumbnails
      const customers = await prisma.customer.findMany({
        where: {
          establishmentId: establishment.id,
          OR: [
            { selfieThumbnailUrl: { not: null } },
            { selfieData:         { not: null } },
          ],
        },
        select: {
          id:                 true,
          name:               true,
          cpf:                true,
          phone:              true,
          balance:            true,
          establishmentId:    true,
          deviceId:           true,
          selfieData:         true,
          selfieThumbnailUrl: true,
          selfieStoragePath:  true,
        },
      });
      if (!customers.length) return { match: false, confidence: 0 };

      let best     = null;
      let bestConf = 0;

      for (const c of customers) {
        const result = await selfieService.compareFacesDirect(incomingThumb, c);
        if (result.match && result.confidence > bestConf) {
          bestConf = result.confidence;
          best     = c;
          if (bestConf >= 95) break; // high confidence — stop early
        }
      }

      if (!best) return { match: false, confidence: 0 };
      customer   = best;
      confidence = bestConf;
    }
  }

  // Bind new device and refresh selfie data
  await prisma.customer.update({
    where: { id: customer.id },
    data:  {
      deviceId,
      selfieData:    incomingThumb,
      lastVerifiedAt: new Date(),
    },
  });

  // Upload new selfie to Supabase in the background (non-blocking)
  if (selfieThumb && selfieFull) {
    selfieService.uploadProcessed(selfieThumb, selfieFull, customer.id, establishment.id)
      .catch((err) => console.error('[verifyFace] selfie upload error:', err.message));
  } else if (selfieBase64) {
    selfieService.uploadSelfie(selfieBase64, customer.id, establishment.id)
      .catch((err) => console.error('[verifyFace] selfie upload error:', err.message));
  }

  const token = signCustomerToken({
    customerId:      customer.id,
    cpf:             customer.cpf,
    name:            customer.name,
    establishmentId: establishment.id,
  });

  await audit.log({
    action:   'FACE_VERIFIED',
    entity:   'Customer',
    entityId: customer.id,
    metadata: { deviceId, hasCpf: !!cpf, confidence, rekognition: faceService.isConfigured() },
  });

  return {
    match:           true,
    confidence,
    token,
    cliente:         serializeCustomer(customer),
    estabelecimento: { nome: establishment.name },
  };
}

// ── refreshToken ──────────────────────────────────────────────────────────────
// Silently extend a still-valid JWT.

async function refreshToken(customerPayload) {
  const { sub: customerId, cpf, name, establishmentId } = customerPayload;

  const customer = await prisma.customer.findUnique({ where: { id: customerId } });
  if (!customer) throw createError('Cliente não encontrado.', 404);

  const token = signCustomerToken({ customerId, cpf, name, establishmentId });

  return {
    mensagem: 'Token renovado com sucesso.',
    token,
    cliente:  serializeCustomer(customer),
  };
}

// ── verifyCpf ─────────────────────────────────────────────────────────────────
// Public endpoint — used on reinstall to detect returning users before
// going through full registration. Returns whether the CPF already has
// an account at this establishment so the app can branch to recovery mode.

async function verifyCpf({ cpf, establishmentCnpj }) {
  if (!cpf || !isValidCpf(cpf)) throw createError('CPF inválido.', 400);
  if (!establishmentCnpj)       throw createError('CNPJ do estabelecimento é obrigatório.', 400);

  const strippedCpf    = stripCpf(cpf);
  const establishment  = await findEstablishment(establishmentCnpj);

  const customer = await prisma.customer.findUnique({
    where: { cpf_establishmentId: { cpf: strippedCpf, establishmentId: establishment.id } },
    select: { name: true },
  });

  return {
    existe: !!customer,
    nome:   customer?.name ?? null,
  };
}

// ── registerSelfie ────────────────────────────────────────────────────────────
// Protected endpoint — upload selfie after account creation.
// Called from the mobile selfie screen after /app/register has already
// issued a JWT. Stores both compressed versions in Supabase Storage.

async function registerSelfie({ selfie }, customerPayload) {
  const customerId      = customerPayload.sub;
  const establishmentId = customerPayload.establishmentId;

  console.log(`[registerSelfie] customerId=${customerId} establishmentId=${establishmentId}`);

  if (!selfie) throw createError('Selfie obrigatória.', 400);

  const base64Clean = selfie.replace(/^data:image\/\w+;base64,/, '');
  console.log(`[registerSelfie] tamanho recebido (chars): ${base64Clean.length}`);

  // Responde imediatamente — processamento e upload ocorrem em background
  setImmediate(async () => {
    try {
      console.log('[registerSelfie] iniciando processamento com sharp (thumb 100×100 q85 / full 300×300 q75)...');
      const { thumbnailUrl, fullUrl } = await selfieService.uploadSelfie(
        base64Clean,
        customerId,
        establishmentId,
      );
      console.log(`[registerSelfie] upload concluído — thumb=${thumbnailUrl ?? 'sem URL'} full=${fullUrl ?? 'sem URL'}`);

      await prisma.customer.update({
        where: { id: customerId },
        data:  { lastVerifiedAt: new Date() },
      });
      console.log('[registerSelfie] lastVerifiedAt atualizado.');
    } catch (err) {
      console.error('[registerSelfie] erro no background:', err.message);
    }
  });

  return { mensagem: 'Selfie recebida. Processamento em andamento.' };
}

module.exports = {
  register,
  login,
  verifyCpf,
  verifyFace,
  sendOtp,
  verifyOtp,
  getConfig,
  savePushToken,
  recoveryLookup,
  recoveryComplete,
  registerSelfie,
  refreshToken,
  getBalance,
  recordTransaction,
  generateRedemption,
  validateRedemption,
  getHistory,
  getStatement,
};
