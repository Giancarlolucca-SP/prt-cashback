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

// Keyed by the target phone/CPF (not the caller's IP): the whole point of
// this limiter is bounding how many guesses a given phone number's OTP can
// take. A pure per-IP key (express-rate-limit's default) lets an attacker
// reset their budget for free by rotating IPs while still hammering the same
// victim — the global apiLimiter (200/15min per IP, applied to every route in
// app.js) still bounds each IP's overall volume as a second layer; this key
// closes the specific "rotate IP, keep the target fixed" bypass.
function otpKeyGenerator(req) {
  const target = String(req.body?.phone || req.body?.cpf || '').replace(/\D/g, '');
  return target ? `otp:${target}` : req.ip;
}

/**
 * OTP send/verify limiter — same budget as password login (10/15min).
 * Previously these endpoints only had the generic apiLimiter (200/15min,
 * shared across the whole /app surface), far weaker than what a comparable
 * credential-guessing risk (password login) already gets.
 */
const otpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: otpKeyGenerator,
  message: {
    erro: 'Muitas tentativas. Tente novamente em 15 minutos.',
  },
});

module.exports = { apiLimiter, authLimiter, redemptionLimiter, nfceLimiter, registerLimiter, otpLimiter };
