const rateLimit = require('express-rate-limit');

/**
 * General API rate limiter — protects all routes.
 */
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    erro: 'Muitas requisições. Tente novamente em alguns minutos.',
  },
});

/**
 * Strict limiter for auth endpoints.
 */
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    erro: 'Muitas tentativas de login. Tente novamente em 15 minutos.',
  },
});

/**
 * Redemption-specific limiter — per operator IP.
 * Prevents burst redemption abuse.
 */
const redemptionLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    erro: 'Limite de resgates atingido. Aguarde um momento.',
  },
});

module.exports = { apiLimiter, authLimiter, redemptionLimiter };
