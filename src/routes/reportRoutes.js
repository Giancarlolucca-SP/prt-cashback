const { Router } = require('express');
const reportController = require('../controllers/reportController');
const { authenticate, requireAdmin } = require('../middlewares/authMiddleware');

const router = Router();

router.use(authenticate, requireAdmin);

router.get('/preview',      reportController.preview);
router.get('/export/pdf',   reportController.exportPdf);
router.get('/export/excel', reportController.exportExcel);

module.exports = router;
