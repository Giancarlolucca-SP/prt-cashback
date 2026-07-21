const { Router } = require('express');
const establishmentController = require('../controllers/establishmentController');
const { authenticate, requireAdmin } = require('../middlewares/authMiddleware');
const { registerLimiter } = require('../middlewares/rateLimitMiddleware');
const upload = require('../middlewares/uploadMiddleware');

const router = Router();

// POST /establishments/completar-cadastro — finish OAuth registration (authenticated)
router.post('/completar-cadastro', authenticate, establishmentController.completarCadastro);

// POST /establishments — public self-registration (no auth required). Same
// budget as customer registration (/app/register) — unauthenticated, does a
// bcrypt hash + DB transaction per request, and previously had no rate limit
// at all despite that real per-request cost.
router.post('/', registerLimiter, establishmentController.create);

// GET  /establishments — list all establishments (admin only)
router.get('/', authenticate, requireAdmin, establishmentController.listAll);

// POST  /establishments/:id/logo     — upload/replace logo (own establishment; SUPERADMIN any)
router.post('/:id/logo', authenticate, requireAdmin, upload.single('logo'), establishmentController.uploadLogo);

// PATCH /establishments/:id/branding — update brand colors (own establishment; SUPERADMIN any)
router.patch('/:id/branding', authenticate, requireAdmin, establishmentController.updateBranding);

// GET  /establishments/:id/qrcode — generate QR Code PNG (admin only)
router.get('/:id/qrcode', authenticate, requireAdmin, establishmentController.getQRCode);

module.exports = router;
