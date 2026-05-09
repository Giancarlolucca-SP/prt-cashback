const { Router } = require('express');
const rankingController = require('../controllers/rankingController');
const { authenticate }  = require('../middlewares/authMiddleware');

const router = Router();

router.get('/', authenticate, rankingController.getRanking);

module.exports = router;
