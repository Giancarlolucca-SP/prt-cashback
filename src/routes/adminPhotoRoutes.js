const { Router } = require('express');
const { authenticate, requireAdmin } = require('../middlewares/authMiddleware');
const ctrl = require('../controllers/adminPhotoController');

const router = Router();

// Listar fotos pendentes de validação
router.get('/',           authenticate, requireAdmin, ctrl.listPhotoValidations);

// Aprovar foto — credita cashback com um valor informado pelo admin
router.post('/:id/approve', authenticate, requireAdmin, ctrl.approvePhoto);

// Rejeitar foto — cancela a transação
router.post('/:id/reject',  authenticate, requireAdmin, ctrl.rejectPhoto);

module.exports = router;
