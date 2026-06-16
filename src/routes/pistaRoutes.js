const { Router } = require('express');
const ctrl = require('../controllers/pistaController');
const { authenticate } = require('../middlewares/authMiddleware');

const router = Router();

// All pista routes are operator/frentista only (establishment-scoped via JWT).
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
router.get   ('/fuel-map',                       ctrl.listFuelMap);
router.post  ('/fuel-map',                       ctrl.upsertFuelMap);
router.delete('/fuel-map/:id',                   ctrl.deleteFuelMap);
router.post  ('/fuel-map/backfill',              ctrl.backfillFuel);

// Config — card map (Identfid -> frentista/Attendant)
router.get   ('/card-map',                       ctrl.listCardMap);
router.post  ('/card-map',                       ctrl.upsertCardMap);
router.delete('/card-map/:id',                   ctrl.deleteCardMap);

module.exports = router;
