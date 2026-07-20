const { PrismaClient } = require('@prisma/client');
const { createError } = require('../middlewares/errorMiddleware');

const prisma = new PrismaClient();

const DEFAULT_FUEL_TYPES = {
  gasoline:          { active: false, percent: 5,    centsPerLiter: 0.05 },
  ethanol:           { active: false, percent: 5,    centsPerLiter: 0.05 },
  diesel:            { active: false, percent: 4,    centsPerLiter: 0.04 },
  gnv:               { active: false, percent: 3,    centsPerLiter: 0.03 },
  carWash:           { active: false, percent: 5,    fixedValue: 0 },
  convenienceStore:  { active: false, percent: 5,    fixedValue: 0 },
};

function serialize(s) {
  const fuelTypes = s.fuelTypes && typeof s.fuelTypes === 'object' && !Array.isArray(s.fuelTypes)
    ? s.fuelTypes
    : DEFAULT_FUEL_TYPES;

  return {
    mode:                      s.mode,
    defaultPercent:            parseFloat(s.defaultPercent),
    defaultCentsPerLiter:      parseFloat(s.defaultCentsPerLiter),
    fuelTypes,
    minFuelAmount:             parseFloat(s.minFuelAmount),
    maxCashbackPerTransaction: parseFloat(s.maxCashbackPerTransaction),
    doubleBonus:               s.doubleBonus,
    doubleBonusStart:          s.doubleBonusStart,
    doubleBonusEnd:            s.doubleBonusEnd,
    rushHourBonus:             s.rushHourBonus,
    rushHourStart:             s.rushHourStart,
    rushHourEnd:               s.rushHourEnd,
    rushHourPercent:           parseFloat(s.rushHourPercent),
  };
}

// `upsert({..., update: {}})` was used here (and in transactionService's
// computeCashback, which loads these same settings on every single fueling)
// to lazily create a default row — but Prisma's `@updatedAt` bumps on any
// `update` call regardless of whether the data actually changed, so every
// read was touching `updatedAt` on a row nothing was actually updating.
// That made `updatedAt` useless as "when were settings last changed" (it'd
// show the last time anyone fueled, not the last admin edit) and did a
// pointless write on the hot path. find-then-create (with a P2002 catch for
// the first-ever concurrent read racing to create the same row) only writes
// when a row is genuinely missing.
async function getOrCreateSettings(establishmentId) {
  let settings = await prisma.cashbackSettings.findUnique({ where: { establishmentId } });
  if (settings) return settings;

  try {
    settings = await prisma.cashbackSettings.create({
      data: { establishmentId, fuelTypes: DEFAULT_FUEL_TYPES },
    });
  } catch (err) {
    if (err.code === 'P2002') {
      settings = await prisma.cashbackSettings.findUnique({ where: { establishmentId } });
    }
    if (!settings) throw err;
  }
  return settings;
}

async function getSettings(establishmentId) {
  const settings = await getOrCreateSettings(establishmentId);

  return {
    mensagem: 'Configurações de cashback carregadas com sucesso.',
    configuracoes: serialize(settings),
  };
}

// These values feed transactionService.computeCashback() directly for every
// fueling at the establishment. maxCashbackPerTransaction only guards
// against a cashbackValue that's too HIGH (`cashbackValue > cap`) — a
// negative percent/cents-per-liter would produce a negative cashbackValue,
// which is never greater than a positive cap, so it would sail through
// uncapped and silently DEDUCT from the customer's balance on
// `balance: { increment: cashbackValue }` every time they fuel. Bounding
// these here is the only thing standing between a typo (or a compromised
// admin session) and either draining or over-crediting every customer.
const MAX_PERCENT = 100;

function assertPercent(value, label) {
  if (value == null) return;
  const n = parseFloat(value);
  if (isNaN(n) || n < 0 || n > MAX_PERCENT) {
    throw createError(`${label} deve estar entre 0 e ${MAX_PERCENT}.`, 400);
  }
}

function assertNonNegative(value, label) {
  if (value == null) return;
  const n = parseFloat(value);
  if (isNaN(n) || n < 0) {
    throw createError(`${label} não pode ser negativo.`, 400);
  }
}

function validateFuelTypes(fuelTypes) {
  if (fuelTypes == null) return;
  if (typeof fuelTypes !== 'object' || Array.isArray(fuelTypes)) {
    throw createError('fuelTypes deve ser um objeto.', 400);
  }
  for (const [key, cfg] of Object.entries(fuelTypes)) {
    if (!cfg || typeof cfg !== 'object') continue;
    assertPercent(cfg.percent, `Percentual de cashback (${key})`);
    assertNonNegative(cfg.centsPerLiter, `Centavos por litro (${key})`);
    assertNonNegative(cfg.fixedValue, `Valor fixo (${key})`);
  }
}

async function updateSettings(data, establishmentId) {
  const {
    mode,
    defaultPercent,
    defaultCentsPerLiter,
    fuelTypes,
    minFuelAmount,
    maxCashbackPerTransaction,
    doubleBonus,
    doubleBonusStart,
    doubleBonusEnd,
    rushHourBonus,
    rushHourStart,
    rushHourEnd,
    rushHourPercent,
  } = data;

  if (mode && !['PERCENTAGE', 'CENTS_PER_LITER'].includes(mode)) {
    throw createError('Modo inválido. Use PERCENTAGE ou CENTS_PER_LITER.', 400);
  }

  assertPercent(defaultPercent, 'Percentual padrão de cashback');
  assertPercent(rushHourPercent, 'Percentual extra de horário de pico');
  assertNonNegative(defaultCentsPerLiter, 'Centavos por litro padrão');
  assertNonNegative(minFuelAmount, 'Valor mínimo de abastecimento');
  assertNonNegative(maxCashbackPerTransaction, 'Teto de cashback por transação');
  validateFuelTypes(fuelTypes);

  if (doubleBonus && doubleBonusStart && doubleBonusEnd) {
    if (new Date(doubleBonusStart) >= new Date(doubleBonusEnd)) {
      throw createError('A data de início deve ser anterior à data de fim da promoção.', 400);
    }
  }

  const toDate = (v) => (v ? new Date(v) : null);

  const settings = await prisma.cashbackSettings.upsert({
    where: { establishmentId },
    create: {
      establishmentId,
      mode:                      mode                      ?? 'PERCENTAGE',
      defaultPercent:            defaultPercent            ?? 5,
      defaultCentsPerLiter:      defaultCentsPerLiter      ?? 0.05,
      fuelTypes:                 fuelTypes                 ?? DEFAULT_FUEL_TYPES,
      minFuelAmount:             minFuelAmount             ?? 0,
      maxCashbackPerTransaction: maxCashbackPerTransaction ?? 50,
      doubleBonus:               doubleBonus               ?? false,
      doubleBonusStart:          toDate(doubleBonusStart),
      doubleBonusEnd:            toDate(doubleBonusEnd),
      rushHourBonus:             rushHourBonus             ?? false,
      rushHourStart:             rushHourStart             ?? '06:00',
      rushHourEnd:               rushHourEnd               ?? '10:00',
      rushHourPercent:           rushHourPercent           ?? 10,
    },
    update: {
      ...(mode                      != null && { mode }),
      ...(defaultPercent            != null && { defaultPercent }),
      ...(defaultCentsPerLiter      != null && { defaultCentsPerLiter }),
      ...(fuelTypes                 != null && { fuelTypes }),
      ...(minFuelAmount             != null && { minFuelAmount }),
      ...(maxCashbackPerTransaction != null && { maxCashbackPerTransaction }),
      ...(doubleBonus               != null && { doubleBonus }),
      doubleBonusStart: toDate(doubleBonusStart),
      doubleBonusEnd:   toDate(doubleBonusEnd),
      ...(rushHourBonus  != null && { rushHourBonus }),
      ...(rushHourStart  != null && { rushHourStart }),
      ...(rushHourEnd    != null && { rushHourEnd }),
      ...(rushHourPercent != null && { rushHourPercent }),
    },
  });

  return {
    mensagem: 'Configurações de cashback salvas com sucesso!',
    configuracoes: serialize(settings),
  };
}

module.exports = { getSettings, updateSettings, getOrCreateSettings, DEFAULT_FUEL_TYPES };
