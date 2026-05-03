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

async function getSettings(establishmentId) {
  const settings = await prisma.cashbackSettings.upsert({
    where:  { establishmentId },
    create: { establishmentId, fuelTypes: DEFAULT_FUEL_TYPES },
    update: {},
  });

  return {
    mensagem: 'Configurações de cashback carregadas com sucesso.',
    configuracoes: serialize(settings),
  };
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

module.exports = { getSettings, updateSettings, DEFAULT_FUEL_TYPES };
