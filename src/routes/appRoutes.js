const express = require('express');
const jwt = require('jsonwebtoken');
const router = express.Router();
const ctrl = require('../controllers/appController');
const { validateDeviceId } = require('../middlewares/deviceMiddleware');

// ── Customer auth middleware ───────────────────────────────────────────────────

function authenticateCustomer(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ erro: 'Token de autenticação não fornecido.' });
  }
  try {
    const payload = jwt.verify(authHeader.split(' ')[1], process.env.JWT_SECRET);
    if (payload.type !== 'customer') {
      return res.status(403).json({ erro: 'Token de operador não é válido para esta rota.' });
    }
    req.customer = payload;
    next();
  } catch {
    res.status(401).json({ erro: 'Token inválido ou expirado.' });
  }
}

// Variant used exclusively on /token/refresh — verifies signature but ignores
// expiration so an expired token can still be exchanged for a fresh one.
function authenticateExpiredCustomer(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ erro: 'Token de autenticação não fornecido.' });
  }
  try {
    const payload = jwt.verify(
      authHeader.split(' ')[1],
      process.env.JWT_SECRET,
      { ignoreExpiration: true },
    );
    if (payload.type !== 'customer') {
      return res.status(403).json({ erro: 'Token de operador não é válido para esta rota.' });
    }
    req.customer = payload;
    next();
  } catch {
    // Signature invalid — token was not issued by this server
    res.status(401).json({ erro: 'Token inválido.' });
  }
}

// ── Public routes (no auth) ───────────────────────────────────────────────────

router.get ('/establishment/:id/qrcode-data', ctrl.getEstablishmentQRCodeData);

router.post('/register',              ctrl.register);
router.post('/login',                 ctrl.login);
router.post('/verify-cpf',            ctrl.verifyCpf);
router.post('/verify-face',           ctrl.verifyFace);
router.post('/otp/send',              ctrl.sendOtp);
router.post('/otp/verify',            ctrl.verifyOtp);
router.get ('/config',                ctrl.getConfig);  // public — also works with auth
router.post('/recovery/lookup',       ctrl.recoveryLookup);
router.post('/recovery/complete',     ctrl.recoveryComplete);

// Validate QR code — no customer auth; the code itself is the credential
router.post('/redeem/validate',       ctrl.validateRedemption);

// ── Protected routes (customer JWT + device validation) ───────────────────────

router.get ('/balance',          authenticateCustomer, validateDeviceId, ctrl.getBalance);
router.post('/transaction',      authenticateCustomer, validateDeviceId, ctrl.recordTransaction);
router.post('/redeem/generate',  authenticateCustomer, validateDeviceId, ctrl.generateRedemption);
router.get ('/history',          authenticateCustomer, validateDeviceId, ctrl.getHistory);
router.get ('/statement',        authenticateCustomer, validateDeviceId, ctrl.getStatement);
router.post('/token/refresh',    authenticateExpiredCustomer, ctrl.refreshToken);
router.post('/push-token',       authenticateCustomer, ctrl.savePushToken);
router.post('/register-selfie',  authenticateCustomer, ctrl.registerSelfie);
router.post('/validate-nfce',    authenticateCustomer, validateDeviceId, ctrl.validateNfce);
router.post('/validate-photo',   authenticateCustomer, validateDeviceId, ctrl.validatePhoto);

module.exports = router;
