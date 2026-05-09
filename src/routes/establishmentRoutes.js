const { Router } = require('express');
const establishmentController = require('../controllers/establishmentController');
const { authenticate, requireAdmin } = require('../middlewares/authMiddleware');
const upload = require('../middlewares/uploadMiddleware');

const router = Router();

// POST /establishments — public self-registration (no auth required)
router.post('/', establishmentController.create);

// GET  /establishments — list all establishments (admin only)
router.get('/', authenticate, requireAdmin, establishmentController.listAll);

// POST  /establishments/:id/logo     — upload/replace logo (authenticated)
router.post('/:id/logo', authenticate, upload.single('logo'), establishmentController.uploadLogo);

// PATCH /establishments/:id/branding — update brand colors (authenticated)
router.patch('/:id/branding', authenticate, establishmentController.updateBranding);

// GET  /establishments/:id/qrcode — generate QR Code PNG (admin only)
router.get('/:id/qrcode', authenticate, requireAdmin, establishmentController.getQRCode);

module.exports = router;
