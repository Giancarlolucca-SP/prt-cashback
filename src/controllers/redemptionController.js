const redemptionService = require('../services/redemptionService');

async function redeem(req, res, next) {
  try {
    const result = await redemptionService.redeem(req.body, req.operator);
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
}

async function listByCustomer(req, res, next) {
  try {
    const result = await redemptionService.listByCustomer(
      req.params.cpf,
      req.operator.establishmentId
    );
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

module.exports = { redeem, listByCustomer };
