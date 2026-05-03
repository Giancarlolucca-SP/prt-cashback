const transactionService = require('../services/transactionService');

async function earn(req, res, next) {
  try {
    const result = await transactionService.earn(req.body, req.operator);
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
}

async function listByCustomer(req, res, next) {
  try {
    const result = await transactionService.listByCustomer(
      req.params.cpf,
      req.operator.establishmentId
    );
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

module.exports = { earn, listByCustomer };
