const { Router } = require('express');
const cashbackSettingsController = require('../controllers/cashbackSettingsController');
const { authenticate, requireAdmin } = require('../middlewares/authMiddleware');

const router = Router();
router.use(authenticate);

// Same fix as campaignRoutes/fraudRoutes: cashback settings directly control
// how much every customer earns — admin only, now explicit on the route
// instead of relying solely on the global operatorLockdown middleware.
router.get('/', requireAdmin, cashbackSettingsController.get);
router.put('/', requireAdmin, cashbackSettingsController.update);

module.exports = router;
