const { Router } = require('express');
const { authenticateAgent } = require('../middlewares/agentAuthMiddleware');
const abastecimentoService = require('../services/abastecimentoService');
const concentradorConfigService = require('../services/concentradorConfigService');

const router = Router();

// POST /pista/abastecimentos — ingest one fueling from the local concentrator agent
router.post('/', authenticateAgent, async (req, res, next) => {
  try {
    const result = await abastecimentoService.ingest(req.body);
    res.status(result.duplicado ? 200 : 201).json(result);
  } catch (err) { next(err); }
});

// GET /pista/abastecimentos/config — the agent fetches its concentrador TCP
// settings on startup. The agent has no identity of its own (shared token), so
// it must pass its own establishmentId (same one used in its .env).
router.get('/config', authenticateAgent, async (req, res, next) => {
  try {
    const result = await concentradorConfigService.getConfigForAgent(req.query.establishmentId);
    res.status(200).json(result);
  } catch (err) { next(err); }
});

// POST /pista/abastecimentos/heartbeat — the agent reports it's alive every
// ~20s, independent of fueling activity, so the admin screen can show
// online/offline instead of just the saved connection settings.
router.post('/heartbeat', authenticateAgent, async (req, res, next) => {
  try {
    const { establishmentId, connected, error, agentVersion } = req.body;
    const result = await concentradorConfigService.recordHeartbeat(establishmentId, { connected, error, agentVersion });
    res.status(200).json(result);
  } catch (err) { next(err); }
});

module.exports = router;
