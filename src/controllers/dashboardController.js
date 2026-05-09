const dashboardService = require('../services/dashboardService');

async function getAttendantRanking(req, res, next) {
  try {
    const result = await dashboardService.getAttendantRanking(req.operator, req.query);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

async function getSummary(req, res, next) {
  try {
    const result = await dashboardService.getAnalytics(req.operator, req.query);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

async function getCampaignResults(req, res, next) {
  try {
    const result = await dashboardService.getCampaignResults(req.operator, req.query);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

async function getFuelTypes(req, res, next) {
  try {
    const result = await dashboardService.getFuelTypes(req.operator, req.query);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

module.exports = { getSummary, getCampaignResults, getFuelTypes, getAttendantRanking };
