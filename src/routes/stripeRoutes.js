const express    = require('express');
const router     = express.Router();
const { authenticate } = require('../middlewares/authMiddleware');
const {
  createCheckoutSession,
  createSetupIntent,
  confirmSubscription,
  activateAfterPayment,
  getMySubscription,
  cancelMySubscription,
} = require('../controllers/stripeController');

// Public
router.post('/create-checkout-session', createCheckoutSession);
router.post('/create-setup-intent',     createSetupIntent);
router.post('/confirm-subscription', confirmSubscription);
router.post('/activate',             activateAfterPayment);

// Authenticated
router.get('/subscription/my',       authenticate, getMySubscription);
router.post('/cancel-subscription',  authenticate, cancelMySubscription);

module.exports = router;
