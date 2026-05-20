const { Router } = require('express');
const authController = require('../controllers/authController');
const { authLimiter } = require('../middlewares/rateLimitMiddleware');

const router = Router();

// POST /auth/login
router.post('/login',    authLimiter, authController.login);

// POST /auth/google
router.post('/google',   authLimiter, authController.googleLogin);

// POST /auth/facebook
router.post('/facebook', authLimiter, authController.facebookLogin);

module.exports = router;
