const customerService = require('../services/customerService');

async function upsert(req, res, next) {
  try {
    const result = await customerService.upsert(req.body, req.operator);
    res.status(result.criado ? 201 : 200).json(result);
  } catch (err) {
    next(err);
  }
}

async function findByCpf(req, res, next) {
  try {
    const result = await customerService.findByCpf(req.params.cpf, req.operator.establishmentId);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

function clampPage(v)  { return Math.max(1, parseInt(v) || 1); }
function clampLimit(v) { return Math.min(100, Math.max(1, parseInt(v) || 20)); }

async function listAll(req, res, next) {
  try {
    const { page, limit, includeUnregistered } = req.query;
    const result = await customerService.listAll(
      { page: clampPage(page), limit: clampLimit(limit), includeUnregistered: includeUnregistered === '1' || includeUnregistered === 'true' },
      req.operator.establishmentId
    );
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

async function list(req, res, next) {
  try {
    const { search = '', page, limit, includeUnregistered } = req.query;
    const result = await customerService.list(
      { search, page: clampPage(page), limit: clampLimit(limit), includeUnregistered: includeUnregistered === '1' || includeUnregistered === 'true' },
      req.operator.establishmentId
    );
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

module.exports = { upsert, findByCpf, listAll, list };
