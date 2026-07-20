const { Router } = require('express');
const dashboardController = require('../controllers/dashboardController');
const { authenticate, requireAdmin } = require('../middlewares/authMiddleware');

const router = Router();

router.get('/',                 authenticate, requireAdmin, dashboardController.getSummary);
router.get('/campaign-results', authenticate, requireAdmin, dashboardController.getCampaignResults);
router.get('/fuel-types',       authenticate, requireAdmin, dashboardController.getFuelTypes);
router.get('/attendants',       authenticate, requireAdmin, dashboardController.getAttendantRanking);

module.exports = router;
