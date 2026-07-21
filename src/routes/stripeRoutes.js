const express    = require('express');
const router     = express.Router();
const { authenticate } = require('../middlewares/authMiddleware');
const { registerLimiter } = require('../middlewares/rateLimitMiddleware');
const {
  createCheckoutSession,
  createSetupIntent,
  confirmSubscription,
  activateAfterPayment,
  getMySubscription,
  cancelMySubscription,
} = require('../controllers/stripeController');

// Public — part of the same unauthenticated onboarding flow as POST
// /establishments (a Stripe subscription/customer ID acts as the real gate
// on confirmSubscription/activateAfterPayment, not a JWT). Each of these
// makes a real external Stripe API call, previously with no rate limit at
// all — same budget as establishment self-registration.
router.post('/create-checkout-session', registerLimiter, createCheckoutSession);
router.post('/create-setup-intent',     registerLimiter, createSetupIntent);
router.post('/confirm-subscription', registerLimiter, confirmSubscription);
router.post('/activate',             registerLimiter, activateAfterPayment);

// Authenticated
router.get('/subscription/my',       authenticate, getMySubscription);
router.post('/cancel-subscription',  authenticate, cancelMySubscription);

module.exports = router;
