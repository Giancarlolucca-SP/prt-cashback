const { Router } = require('express');
const customerController = require('../controllers/customerController');
const { authenticate, requireAdmin } = require('../middlewares/authMiddleware');

const router = Router();

// All customer routes require authentication
router.use(authenticate);

// POST /customers — create or find by CPF
router.post('/', customerController.upsert);

// GET /customers — list with search/pagination (scoped to establishment)
router.get('/', customerController.list);

// GET /customers/all — list all (admin only)
router.get('/all', requireAdmin, customerController.listAll);

// GET /customers/:cpf — get customer details + history
router.get('/:cpf', customerController.findByCpf);

module.exports = router;
