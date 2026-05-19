const saasService = require('../services/saasService');

async function getSaasMetrics(req, res, next) {
  try {
    const data = await saasService.getSaasMetrics();
    res.json(data);
  } catch (err) {
    next(err);
  }
}

module.exports = { getSaasMetrics };
