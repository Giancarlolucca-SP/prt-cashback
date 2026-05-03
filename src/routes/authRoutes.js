const { Router } = require('express');
const authController = require('../controllers/authController');
const { authLimiter } = require('../middlewares/rateLimitMiddleware');

const router = Router();

// POST /auth/login
router.post('/login', authLimiter, authController.login);

module.exports = router;
