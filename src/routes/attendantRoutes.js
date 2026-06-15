const { Router } = require('express');
const ctrl = require('../controllers/attendantController');
const { authenticate } = require('../middlewares/authMiddleware');
const upload = require('../middlewares/uploadMiddleware');

const router = Router();

// All routes are operator/admin only (establishment-scoped via the JWT).
router.get   ('/',           authenticate, ctrl.list);
router.post  ('/sync',       authenticate, ctrl.sync);
router.post  ('/',           authenticate, ctrl.create);
router.patch ('/:id',        authenticate, ctrl.update);
router.delete('/:id',        authenticate, ctrl.remove);
router.post  ('/:id/photo',  authenticate, upload.single('photo'), ctrl.uploadPhoto);

module.exports = router;
