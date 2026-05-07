const campaignService = require('../services/campaignService');
const { formatBRL } = require('../utils/currencyFormatter');
const { formatDateBR } = require('../utils/dateFormatter');

async function preview(req, res, next) {
  try {
    const { filterType, filterPeriod, rewardType, rewardValue } = req.query;
    const result = await campaignService.preview(
      { filterType, filterPeriod, rewardType, rewardValue },
      req.operator.establishmentId
    );
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

async function create(req, res, next) {
  try {
    const result = await campaignService.create(req.body, req.operator);
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
}

async function list(req, res, next) {
  try {
    const { status, page } = req.query;
    const result = await campaignService.list(
      { status, page },
      req.operator.establishmentId
    );
    res.status(200).json(result);
  } catch (err) {
    console.log('[CAMPAIGNS] Error:', err.message, err.stack);
    next(err);
  }
}

async function close(req, res, next) {
  try {
    const result = await campaignService.close(
      req.params.id,
      req.operator.establishmentId
    );
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

async function listReturnees(req, res, next) {
  try {
    const result = await campaignService.getReturnees(
      req.params.id,
      req.operator.establishmentId
    );
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

module.exports = { preview, create, list, close, listReturnees };
