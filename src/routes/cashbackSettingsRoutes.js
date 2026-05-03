const { Router } = require('express');
const cashbackSettingsController = require('../controllers/cashbackSettingsController');
const { authenticate } = require('../middlewares/authMiddleware');

const router = Router();
router.use(authenticate);

router.get('/', cashbackSettingsController.get);
router.put('/', cashbackSettingsController.update);

module.exports = router;
