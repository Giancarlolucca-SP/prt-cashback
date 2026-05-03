const cashbackSettingsService = require('../services/cashbackSettingsService');

async function get(req, res, next) {
  try {
    const result = await cashbackSettingsService.getSettings(req.operator.establishmentId);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

async function update(req, res, next) {
  try {
    const result = await cashbackSettingsService.updateSettings(
      req.body,
      req.operator.establishmentId
    );
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

module.exports = { get, update };
