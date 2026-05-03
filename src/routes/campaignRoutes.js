const express = require('express');
const router = express.Router();
const { authenticate } = require('../middlewares/authMiddleware');
const { preview, create, list, close, listReturnees } = require('../controllers/campaignController');

router.get('/preview',           authenticate, preview);
router.get('/',                  authenticate, list);
router.post('/',                 authenticate, create);
router.patch('/:id/close',       authenticate, close);
router.get('/:id/returnees',     authenticate, listReturnees);

module.exports = router;
