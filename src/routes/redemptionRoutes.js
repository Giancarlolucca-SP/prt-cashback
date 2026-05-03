const { Router } = require('express');
const redemptionController = require('../controllers/redemptionController');
const { authenticate } = require('../middlewares/authMiddleware');
const { redemptionLimiter } = require('../middlewares/rateLimitMiddleware');

const router = Router();

router.use(authenticate);

// POST /redeem — redeem cashback
router.post('/', redemptionLimiter, redemptionController.redeem);

// GET /redeem/:cpf — list redemptions for a customer
router.get('/:cpf', redemptionController.listByCustomer);

module.exports = router;
