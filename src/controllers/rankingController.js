const rankingService = require('../services/rankingService');

async function getRanking(req, res, next) {
  try {
    const result = await rankingService.getRanking(req.operator, req.query);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

module.exports = { getRanking };
