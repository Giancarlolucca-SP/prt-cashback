const operatorService = require('../services/operatorService');

async function create(req, res, next) {
  try { res.status(201).json(await operatorService.createOperador(req.operator, req.body)); }
  catch (err) { next(err); }
}

async function list(req, res, next) {
  try { res.status(200).json(await operatorService.listOperadores(req.operator)); }
  catch (err) { next(err); }
}

async function remove(req, res, next) {
  try { res.status(200).json(await operatorService.deleteOperador(req.operator, req.params.id)); }
  catch (err) { next(err); }
}

module.exports = { create, list, remove };
