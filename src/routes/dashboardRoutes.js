const { Router } = require('express');
const dashboardController = require('../controllers/dashboardController');
const { authenticate } = require('../middlewares/authMiddleware');

const router = Router();

router.get('/',                 authenticate, dashboardController.getSummary);
router.get('/campaign-results', authenticate, dashboardController.getCampaignResults);
router.get('/fuel-types',       authenticate, dashboardController.getFuelTypes);

module.exports = router;
