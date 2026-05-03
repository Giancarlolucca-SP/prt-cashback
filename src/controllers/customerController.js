const customerService = require('../services/customerService');

async function upsert(req, res, next) {
  try {
    const result = await customerService.upsert(req.body, req.operator);
    const status = result.mensagem.includes('cadastrado') ? 201 : 200;
    res.status(status).json(result);
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

async function listAll(req, res, next) {
  try {
    const { page, limit } = req.query;
    const result = await customerService.listAll(
      { page: parseInt(page) || 1, limit: parseInt(limit) || 20 },
      req.operator.establishmentId
    );
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

async function list(req, res, next) {
  try {
    const { search = '', page, limit } = req.query;
    const result = await customerService.list(
      { search, page: parseInt(page) || 1, limit: parseInt(limit) || 20 },
      req.operator.establishmentId
    );
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

module.exports = { upsert, findByCpf, listAll, list };
