const { Router } = require('express');
const fraudController = require('../controllers/fraudController');
const { authenticate, requireAdmin } = require('../middlewares/authMiddleware');

const router = Router();

// Fraud thresholds/blacklist are admin-only — same fix as campaignRoutes:
// previously relied entirely on the global operatorLockdown middleware
// rather than being self-documenting here.

// GET  /fraud/settings — get fraud settings for the operator's establishment
router.get('/settings',         authenticate, requireAdmin, fraudController.getSettings);

// PUT  /fraud/settings — update fraud settings
router.put('/settings',         authenticate, requireAdmin, fraudController.updateSettings);

// GET  /fraud/blacklist — list all blocked CPFs
router.get('/blacklist',        authenticate, requireAdmin, fraudController.getBlacklist);

// POST /fraud/blacklist — block a CPF
router.post('/blacklist',       authenticate, requireAdmin, fraudController.addToBlacklist);

// DELETE /fraud/blacklist/:cpf — unblock a CPF
router.delete('/blacklist/:cpf', authenticate, requireAdmin, fraudController.removeFromBlacklist);

module.exports = router;
