const { Router } = require('express');
const ctrl = require('../controllers/pistaController');
const { authenticate, requireAdmin } = require('../middlewares/authMiddleware');

const router = Router();

// All pista routes require login; the day-to-day frentista actions below
// (accrual, fuelings, redemption queue, comprovante, caixa, dashboard) are
// also reachable by OPERATOR role (whitelisted in operatorLockdown). The
// config screens further down (fuel-map, card-map, concentrador-config)
// are admin-only — that was previously enforced only by operatorLockdown's
// external whitelist rejecting OPERATOR tokens before reaching these, not
// self-documented on the routes themselves.
router.use(authenticate);

// Cashback (manual fallback + from selected fueling)
router.post('/accrual',                          ctrl.accrue);              // Plano B: CPF + valor
router.post('/accrual-from-fueling',             ctrl.accrueFromFueling);   // seleciona abastecimento + CPF
router.get ('/fuelings',                         ctrl.listFuelings);        // lista de abastecimentos do dia

// Redemption queue
router.get ('/redemption-requests',              ctrl.listRequests);
router.post('/redemption-requests/:id/confirm',  ctrl.confirmRequest);
router.post('/redemption-requests/:id/cancel',   ctrl.cancelRequest);

// Comprovante + caixa
router.get ('/comprovante/:type/:id',            ctrl.comprovante);
router.get ('/caixa',                            ctrl.caixa);

// Live frentista dashboard
router.get ('/dashboard',                        ctrl.dashboard);

// Config — fuel map (bico -> combustível)
router.get   ('/fuel-map',                       requireAdmin, ctrl.listFuelMap);
router.post  ('/fuel-map',                       requireAdmin, ctrl.upsertFuelMap);
router.delete('/fuel-map/:id',                   requireAdmin, ctrl.deleteFuelMap);
router.post  ('/fuel-map/backfill',              requireAdmin, ctrl.backfillFuel);

// Config — card map (Identfid -> frentista/Attendant)
router.get   ('/card-map',                       requireAdmin, ctrl.listCardMap);
router.post  ('/card-map',                       requireAdmin, ctrl.upsertCardMap);
router.delete('/card-map/:id',                   requireAdmin, ctrl.deleteCardMap);

// Config — concentrador (Companytec TCP connection settings for the local agent)
router.get('/concentrador-config',               requireAdmin, ctrl.getConcentradorConfig);
router.put('/concentrador-config',               requireAdmin, ctrl.updateConcentradorConfig);

module.exports = router;
