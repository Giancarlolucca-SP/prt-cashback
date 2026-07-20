const { Router } = require('express');
const ctrl = require('../controllers/attendantController');
const { authenticate, requireAdmin } = require('../middlewares/authMiddleware');
const upload = require('../middlewares/uploadMiddleware');

const router = Router();

// GET is intentionally reachable by OPERATOR too (whitelisted in
// operatorLockdown — lets the Painel da Pista's FrentistaBar picker load who's
// on shift). Every write here is admin-only; that was previously enforced
// only by operatorLockdown's external whitelist (OPERATOR-role tokens 403
// before reaching these), not self-documented on the route itself.
router.get   ('/',           authenticate, ctrl.list);
router.post  ('/sync',       authenticate, requireAdmin, ctrl.sync);
router.post  ('/',           authenticate, requireAdmin, ctrl.create);
router.patch ('/:id',        authenticate, requireAdmin, ctrl.update);
router.delete('/:id',        authenticate, requireAdmin, ctrl.remove);
router.post  ('/:id/photo',  authenticate, requireAdmin, upload.single('photo'), ctrl.uploadPhoto);

module.exports = router;
