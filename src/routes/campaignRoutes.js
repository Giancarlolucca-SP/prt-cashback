const express = require('express');
const router = express.Router();
const { authenticate, requireAdmin } = require('../middlewares/authMiddleware');
const { preview, create, list, close, listReturnees, getQueueStatus, getGlobalQueueStatus } = require('../controllers/campaignController');

// Campaigns credit real cashback to every matching customer — admin only.
// Was previously bare `authenticate`, relying entirely on the global
// operatorLockdown middleware (blocks OPERATOR since /campaigns isn't in its
// whitelist) rather than being self-documenting on the route itself, same
// class of gap fixed earlier this session for dashboard/ranking/report/etc.
router.get('/queue-status',      authenticate, requireAdmin, getGlobalQueueStatus);
router.get('/preview',           authenticate, requireAdmin, preview);
router.get('/',                  authenticate, requireAdmin, list);
router.post('/',                 authenticate, requireAdmin, create);
router.patch('/:id/close',       authenticate, requireAdmin, close);
router.get('/:id/returnees',     authenticate, requireAdmin, listReturnees);
router.get('/:id/queue-status',  authenticate, requireAdmin, getQueueStatus);

module.exports = router;
