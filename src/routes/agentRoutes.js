const { Router } = require('express');
const { authenticateAgent } = require('../middlewares/agentAuthMiddleware');
const abastecimentoService = require('../services/abastecimentoService');

const router = Router();

// POST /pista/abastecimentos — ingest one fueling from the local concentrator agent
router.post('/', authenticateAgent, async (req, res, next) => {
  try {
    const result = await abastecimentoService.ingest(req.body);
    res.status(result.duplicado ? 200 : 201).json(result);
  } catch (err) { next(err); }
});

module.exports = router;
