const express = require('express');
const router = express.Router();
const { authenticate } = require('../middlewares/authMiddleware');
const { preview, create, list, close, listReturnees, getQueueStatus, getGlobalQueueStatus } = require('../controllers/campaignController');

router.get('/queue-status',      authenticate, getGlobalQueueStatus);
router.get('/preview',           authenticate, preview);
router.get('/',                  authenticate, list);
router.post('/',                 authenticate, create);
router.patch('/:id/close',       authenticate, close);
router.get('/:id/returnees',     authenticate, listReturnees);
router.get('/:id/queue-status',  authenticate, getQueueStatus);

module.exports = router;
