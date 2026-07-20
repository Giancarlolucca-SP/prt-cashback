const { Router } = require('express');
const rankingController = require('../controllers/rankingController');
const { authenticate, requireAdmin }  = require('../middlewares/authMiddleware');

const router = Router();

router.get('/', authenticate, requireAdmin, rankingController.getRanking);

module.exports = router;
