const pistaService = require('../services/pistaService');
const pistaMaps = require('../services/pistaMapsService');
const pistaDashboard = require('../services/pistaDashboardService');

const wrap = (fn) => async (req, res, next) => { try { res.json(await fn(req)); } catch (err) { next(err); } };

async function accrue(req, res, next) {
  try { res.status(201).json(await pistaService.accrueByCpf(req.body, req.operator)); }
  catch (err) { next(err); }
}

async function listRequests(req, res, next) {
  try { res.status(200).json(await pistaService.listRequests(req.operator)); }
  catch (err) { next(err); }
}

async function confirmRequest(req, res, next) {
  try { res.status(200).json(await pistaService.confirmRequest(req.operator, req.params.id, req.body)); }
  catch (err) { next(err); }
}

async function cancelRequest(req, res, next) {
  try { res.status(200).json(await pistaService.cancelRequest(req.operator, req.params.id)); }
  catch (err) { next(err); }
}

async function comprovante(req, res, next) {
  try { res.status(200).json(await pistaService.getComprovante(req.operator, req.params.type, req.params.id)); }
  catch (err) { next(err); }
}

async function caixa(req, res, next) {
  try { res.status(200).json(await pistaService.caixaReport(req.operator, req.query)); }
  catch (err) { next(err); }
}

// ── Fuel map ──────────────────────────────────────────────────────────────────
const listFuelMap   = wrap((req) => pistaMaps.listFuelMap(req.operator));
const upsertFuelMap = wrap((req) => pistaMaps.upsertFuelMap(req.operator, req.body));
const deleteFuelMap = wrap((req) => pistaMaps.deleteFuelMap(req.operator, req.params.id));
const backfillFuel  = wrap((req) => pistaMaps.backfillFuel(req.operator));

// ── Card map ──────────────────────────────────────────────────────────────────
const listCardMap   = wrap((req) => pistaMaps.listCardMap(req.operator));
const upsertCardMap = wrap((req) => pistaMaps.upsertCardMap(req.operator, req.body));
const deleteCardMap = wrap((req) => pistaMaps.deleteCardMap(req.operator, req.params.id));

// ── Dashboard + fuelings + cashback-from-fueling ──────────────────────────────
const dashboard       = wrap((req) => pistaDashboard.dashboard(req.operator, req.query));
const listFuelings    = wrap((req) => pistaService.listFuelings(req.operator, req.query));
const accrueFromFueling = wrap((req) => pistaService.accrueFromFueling(req.operator, req.body));

module.exports = {
  accrue, listRequests, confirmRequest, cancelRequest, comprovante, caixa,
  listFuelMap, upsertFuelMap, deleteFuelMap, backfillFuel,
  listCardMap, upsertCardMap, deleteCardMap,
  dashboard, listFuelings, accrueFromFueling,
};
