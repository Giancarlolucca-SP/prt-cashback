const { Router } = require('express');
const fraudController = require('../controllers/fraudController');
const { authenticate } = require('../middlewares/authMiddleware');

const router = Router();

// GET  /fraud/settings — get fraud settings for the operator's establishment
router.get('/settings',         authenticate, fraudController.getSettings);

// PUT  /fraud/settings — update fraud settings
router.put('/settings',         authenticate, fraudController.updateSettings);

// GET  /fraud/blacklist — list all blocked CPFs
router.get('/blacklist',        authenticate, fraudController.getBlacklist);

// POST /fraud/blacklist — block a CPF
router.post('/blacklist',       authenticate, fraudController.addToBlacklist);

// DELETE /fraud/blacklist/:cpf — unblock a CPF
router.delete('/blacklist/:cpf', authenticate, fraudController.removeFromBlacklist);

module.exports = router;
