const { Router } = require('express');
const transactionController = require('../controllers/transactionController');
const { authenticate } = require('../middlewares/authMiddleware');

const router = Router();

router.use(authenticate);

// POST /transactions — earn cashback
router.post('/', transactionController.earn);

// GET /transactions/:cpf — list transactions for a customer
router.get('/:cpf', transactionController.listByCustomer);

module.exports = router;
