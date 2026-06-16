const { PrismaClient } = require('@prisma/client');
const { createError } = require('../middlewares/errorMiddleware');
const audit = require('./auditService');
const pistaMaps = require('./pistaMapsService');

const prisma = new PrismaClient();

function num(v, field) {
  const n = Number(v);
  if (v == null || Number.isNaN(n)) throw createError(`Campo inválido: ${field}.`, 400);
  return n;
}

/**
 * Ingest one fueling pushed by the local agent. Idempotent: the unique key
 * (establishmentId, registro, encerranteFinal, fuelingDateTime) means re-sends
 * never duplicate — a repeat returns { duplicado: true }.
 */
async function ingest(payload) {
  const establishmentId = String(payload.establishmentId || '').trim();
  if (!establishmentId) throw createError('establishmentId é obrigatório.', 400);

  const est = await prisma.establishment.findUnique({ where: { id: establishmentId }, select: { id: true } });
  if (!est) throw createError('Estabelecimento não encontrado.', 404);

  const fuelingDateTime = new Date(payload.fuelingDateTime);
  if (Number.isNaN(fuelingDateTime.getTime())) throw createError('fuelingDateTime inválido.', 400);

  const data = {
    establishmentId,
    registro:        num(payload.registro, 'registro'),
    nozzleCode:      num(payload.nozzleCode, 'nozzleCode'),
    fuelCode:        payload.fuelCode != null ? num(payload.fuelCode, 'fuelCode') : null,
    volumeLiters:    num(payload.volumeLiters, 'volumeLiters'),
    totalValue:      num(payload.totalValue, 'totalValue'),
    unitPrice:       num(payload.unitPrice, 'unitPrice'),
    fuelingDateTime,
    encerranteFinal: num(payload.encerranteFinal, 'encerranteFinal'),
    attendantTag:    payload.attendantTag ? String(payload.attendantTag).trim() : null,
    identfidCode:    payload.identfidCode ? String(payload.identfidCode).trim() : null,
    rawPayload:      String(payload.rawPayload || ''),
  };

  // Resolve fuel classification from the per-establishment fuel map (bico -> combustível)
  const fuel = await pistaMaps.resolveFuel(establishmentId, data.nozzleCode);
  if (fuel) { data.fuelName = fuel.fuelName; data.isAditivada = fuel.isAditivada; }

  try {
    const created = await prisma.abastecimento.create({ data });
    await audit.log({
      action: 'ABASTECIMENTO_INGESTED', entity: 'Abastecimento', entityId: created.id,
      metadata: { establishmentId, registro: data.registro, nozzleCode: data.nozzleCode, encerranteFinal: data.encerranteFinal },
    });
    return {
      mensagem: 'Abastecimento registrado.',
      duplicado: false,
      abastecimento: { id: created.id, registro: created.registro, encerranteFinal: parseFloat(created.encerranteFinal) },
    };
  } catch (err) {
    if (err.code === 'P2002') {
      // Already ingested — idempotent success
      return { mensagem: 'Abastecimento já registrado.', duplicado: true };
    }
    throw err;
  }
}

module.exports = { ingest };
