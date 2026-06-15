const { Router } = require('express');
const jwt = require('jsonwebtoken');
const ratingController = require('../controllers/ratingController');
const { authenticate } = require('../middlewares/authMiddleware');
const { validateDeviceId } = require('../middlewares/deviceMiddleware');

const router = Router();

// ── Customer auth (same contract as /app routes) ──────────────────────────────
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

// ── Customer routes ───────────────────────────────────────────────────────────
router.get ('/attendants', authenticateCustomer, validateDeviceId, ratingController.listAttendants);
router.post('/',           authenticateCustomer, validateDeviceId, ratingController.createRating);

// Reject customer tokens on staff-only routes (operator tokens carry `role`,
// customer tokens carry `type: 'customer'`).
function requireStaff(req, res, next) {
  if (!req.operator || req.operator.type === 'customer' || !req.operator.role) {
    return res.status(403).json({ erro: 'Acesso restrito a operadores do estabelecimento.' });
  }
  next();
}

// ── Admin/operator route ──────────────────────────────────────────────────────
router.get ('/', authenticate, requireStaff, ratingController.listRatings);

module.exports = router;
