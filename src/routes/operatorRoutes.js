const { Router } = require('express');
const ctrl = require('../controllers/operatorController');
const { authenticate, requireAdmin } = require('../middlewares/authMiddleware');

const router = Router();

// Admin-only: manage OPERATOR (frentista) logins for the establishment.
router.use(authenticate, requireAdmin);

router.get   ('/',    ctrl.list);
router.post  ('/',    ctrl.create);
router.delete('/:id', ctrl.remove);

module.exports = router;
