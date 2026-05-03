const { Router } = require('express');
const { authenticate } = require('../middlewares/authMiddleware');
const ctrl = require('../controllers/adminPhotoController');

const router = Router();

// Listar fotos pendentes de validação
router.get('/',           authenticate, ctrl.listPhotoValidations);

// Aprovar foto — credita cashback
router.post('/:id/approve', authenticate, ctrl.approvePhoto);

// Rejeitar foto — cancela a transação
router.post('/:id/reject',  authenticate, ctrl.rejectPhoto);

module.exports = router;
