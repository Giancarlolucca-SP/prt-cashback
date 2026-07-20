/**
 * Per-establishment maps for the Painel da Pista:
 *   - Fuel map:  nozzleCode (bico) -> fuelName + isAditivada
 *   - Card map:  identfidCode (Identfid) -> Attendant (frentista identity source of truth)
 * Plus resolvers used by ingest/dashboard, and a one-time backfill.
 */
const { PrismaClient } = require('@prisma/client');
const { createError } = require('../middlewares/errorMiddleware');

const prisma = new PrismaClient();

// ── Fuel map ──────────────────────────────────────────────────────────────────

async function listFuelMap(operator) {
  const establishmentId = operator.establishmentId;
  const maps = await prisma.pistaFuelMap.findMany({ where: { establishmentId }, orderBy: { nozzleCode: 'asc' } });
  return { maps: maps.map((m) => ({ id: m.id, nozzleCode: m.nozzleCode, fuelName: m.fuelName, isAditivada: m.isAditivada })) };
}

async function upsertFuelMap(operator, { nozzleCode, fuelName, isAditivada }) {
  const establishmentId = operator.establishmentId;
  const code = parseInt(nozzleCode, 10);
  if (!Number.isInteger(code)) throw createError('Código de bico inválido.', 400);
  if (!fuelName || !fuelName.trim()) throw createError('Combustível é obrigatório.', 400);

  const map = await prisma.pistaFuelMap.upsert({
    where:  { establishmentId_nozzleCode: { establishmentId, nozzleCode: code } },
    create: { establishmentId, nozzleCode: code, fuelName: fuelName.trim(), isAditivada: !!isAditivada },
    update: { fuelName: fuelName.trim(), isAditivada: !!isAditivada },
  });
  return { mensagem: 'Mapa de combustível salvo.', map: { id: map.id, nozzleCode: map.nozzleCode, fuelName: map.fuelName, isAditivada: map.isAditivada } };
}

async function deleteFuelMap(operator, id) {
  const map = await prisma.pistaFuelMap.findUnique({ where: { id } });
  if (!map || map.establishmentId !== operator.establishmentId) throw createError('Mapa não encontrado.', 404);
  await prisma.pistaFuelMap.delete({ where: { id } });
  return { mensagem: 'Mapa de combustível removido.' };
}

// Resolve a nozzle code -> { fuelName, isAditivada } | null
async function resolveFuel(establishmentId, nozzleCode) {
  if (nozzleCode == null) return null;
  const m = await prisma.pistaFuelMap.findUnique({
    where: { establishmentId_nozzleCode: { establishmentId, nozzleCode: parseInt(nozzleCode, 10) } },
  });
  return m ? { fuelName: m.fuelName, isAditivada: m.isAditivada } : null;
}

// Backfill fuelName/isAditivada on existing Abastecimento rows from the current map.
// One updateMany per distinct nozzle (typically a couple dozen) instead of
// one update per fueling row (which grows unbounded with history — an
// established station's abastecimentos can run into the thousands, each
// previously issuing its own sequential round-trip to the DB).
async function backfillFuel(operator) {
  const establishmentId = operator.establishmentId;
  const maps = await prisma.pistaFuelMap.findMany({ where: { establishmentId } });
  // Each nozzle's updateMany touches a disjoint set of rows (filtered by its
  // own nozzleCode) — safe to run concurrently instead of paying one
  // sequential network round-trip per nozzle.
  const results = await Promise.all(maps.map((m) =>
    prisma.abastecimento.updateMany({
      where: { establishmentId, nozzleCode: m.nozzleCode },
      data:  { fuelName: m.fuelName, isAditivada: m.isAditivada },
    })
  ));
  const updated = results.reduce((sum, r) => sum + r.count, 0);
  return { mensagem: `${updated} abastecimento(s) atualizado(s) pelo mapa de combustível.`, updated };
}

// ── Card map ──────────────────────────────────────────────────────────────────

async function listCardMap(operator) {
  const establishmentId = operator.establishmentId;
  const maps = await prisma.pistaCardMap.findMany({
    where: { establishmentId }, orderBy: { createdAt: 'asc' },
    include: { attendant: { select: { id: true, name: true, photoUrl: true, code: true } } },
  });
  return {
    maps: maps.map((m) => ({
      id: m.id, identfidCode: m.identfidCode,
      attendantId: m.attendantId, attendantNome: m.attendant?.name, attendantFoto: m.attendant?.photoUrl || null,
    })),
  };
}

async function upsertCardMap(operator, { identfidCode, attendantId }) {
  const establishmentId = operator.establishmentId;
  const code = String(identfidCode || '').trim();
  if (!code) throw createError('Código Identfid é obrigatório.', 400);
  const att = await prisma.attendant.findUnique({ where: { id: attendantId } });
  if (!att || att.establishmentId !== establishmentId) throw createError('Atendente não encontrado.', 404);

  const map = await prisma.pistaCardMap.upsert({
    where:  { establishmentId_identfidCode: { establishmentId, identfidCode: code } },
    create: { establishmentId, identfidCode: code, attendantId },
    update: { attendantId },
  });
  return { mensagem: 'Cartão vinculado ao frentista.', map: { id: map.id, identfidCode: map.identfidCode, attendantId } };
}

async function deleteCardMap(operator, id) {
  const map = await prisma.pistaCardMap.findUnique({ where: { id } });
  if (!map || map.establishmentId !== operator.establishmentId) throw createError('Vínculo não encontrado.', 404);
  await prisma.pistaCardMap.delete({ where: { id } });
  return { mensagem: 'Vínculo removido.' };
}

// Resolve an identfidCode -> Attendant {id,name,photoUrl} | null
async function resolveAttendant(establishmentId, identfidCode) {
  if (!identfidCode) return null;
  const m = await prisma.pistaCardMap.findUnique({
    where: { establishmentId_identfidCode: { establishmentId, identfidCode: String(identfidCode).trim() } },
    include: { attendant: { select: { id: true, name: true, photoUrl: true, active: true } } },
  });
  return m?.attendant?.active ? m.attendant : null;
}

module.exports = {
  listFuelMap, upsertFuelMap, deleteFuelMap, resolveFuel, backfillFuel,
  listCardMap, upsertCardMap, deleteCardMap, resolveAttendant,
};
