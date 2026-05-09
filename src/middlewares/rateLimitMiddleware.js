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

/**
 * NF-e / photo validation — max 10 per hour per IP.
 * These hit external services (SEFAZ, OCR) and are expensive to abuse.
 */
const nfceLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    erro: 'Limite de validações de cupom atingido. Tente novamente em 1 hora.',
  },
});

/**
 * Registration limiter — max 3 registrations per hour per IP.
 * Prevents mass account creation.
 */
const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    erro: 'Muitos cadastros deste endereço. Tente novamente em 1 hora.',
  },
});

module.exports = { apiLimiter, authLimiter, redemptionLimiter, nfceLimiter, registerLimiter };
