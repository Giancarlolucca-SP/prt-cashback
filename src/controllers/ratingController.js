const ratingService = require('../services/ratingService');

// POST /ratings — submitted by an authenticated customer (mobile app)
async function createRating(req, res, next) {
  try {
    const result = await ratingService.createRating(req.body, req.customer);
    res.status(201).json(result);
  } catch (err) { next(err); }
}

// GET /ratings/attendants — customer-facing list of attendants to choose from
async function listAttendants(req, res, next) {
  try {
    const result = await ratingService.listAttendants(req.customer);
    res.status(200).json(result);
  } catch (err) { next(err); }
}

// GET /ratings — admin/operator only: list + per-attendant aggregates
async function listRatings(req, res, next) {
  try {
    const result = await ratingService.listRatings(req.operator, req.query);
    res.status(200).json(result);
  } catch (err) { next(err); }
}

module.exports = { createRating, listAttendants, listRatings };
