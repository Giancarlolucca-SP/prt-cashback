const appService          = require('../services/appService');
const nfceService         = require('../services/nfceService');
const photoValidationService = require('../services/photoValidationService');
const establishmentService   = require('../services/establishmentService');

async function register(req, res, next) {
  try {
    console.log('[REGISTER] Body recebido:', JSON.stringify(req.body));
    const result = await appService.register(req.body);
    res.status(201).json(result);
  } catch (err) { next(err); }
}

async function verifyCpf(req, res, next) {
  try {
    const result = await appService.verifyCpf(req.body);
    res.status(200).json(result);
  } catch (err) { next(err); }
}

async function login(req, res, next) {
  try {
    const result = await appService.login(req.body);
    res.status(200).json(result);
  } catch (err) { next(err); }
}

async function getBalance(req, res, next) {
  try {
    const customerId      = req.customer.sub;
    const establishmentId = req.customer.establishmentId;
    console.log(`[BALANCE] customerId=${customerId} establishmentId=${establishmentId}`);
    const result = await appService.getBalance({ customerId, establishmentId });
    res.status(200).json(result);
  } catch (err) { next(err); }
}

async function recordTransaction(req, res, next) {
  try {
    const result = await appService.recordTransaction(req.body, req.customer);
    res.status(201).json(result);
  } catch (err) { next(err); }
}

async function generateRedemption(req, res, next) {
  try {
    const result = await appService.generateRedemption(req.body, req.customer);
    res.status(200).json(result);
  } catch (err) { next(err); }
}

async function validateRedemption(req, res, next) {
  try {
    const result = await appService.validateRedemption(req.body);
    res.status(200).json(result);
  } catch (err) { next(err); }
}

async function getHistory(req, res, next) {
  try {
    const customerId      = req.customer.sub;
    const establishmentId = req.customer.establishmentId;
    const { page, limit } = req.query;
    console.log(`[HISTORY] customerId=${customerId} establishmentId=${establishmentId} page=${page || 1}`);
    const result = await appService.getHistory(
      { customerId, establishmentId },
      { page: parseInt(page) || 1, limit: parseInt(limit) || 20 }
    );
    console.log(`[HISTORY] encontrou ${result.total} transação(ões) para customerId=${customerId}`);
    res.status(200).json(result);
  } catch (err) { next(err); }
}

async function getStatement(req, res, next) {
  try {
    const customerId      = req.customer.sub;
    const establishmentId = req.customer.establishmentId;
    const { page, limit } = req.query;
    console.log(`[STATEMENT] customerId=${customerId} establishmentId=${establishmentId} page=${page || 1}`);
    const result = await appService.getStatement(
      { customerId, establishmentId },
      { page: parseInt(page) || 1, limit: parseInt(limit) || 30 }
    );
    console.log(`[STATEMENT] encontrou ${result.total} lançamento(s) para customerId=${customerId}`);
    res.status(200).json(result);
  } catch (err) { next(err); }
}

async function sendOtp(req, res, next) {
  try {
    const result = await appService.sendOtp(req.body);
    res.status(200).json(result);
  } catch (err) { next(err); }
}

async function verifyOtp(req, res, next) {
  try {
    const result = await appService.verifyOtp(req.body);
    res.status(200).json(result);
  } catch (err) { next(err); }
}

async function getConfig(req, res, next) {
  try {
    const result = await appService.getConfig(req.customer ?? null);
    res.status(200).json(result);
  } catch (err) { next(err); }
}

async function savePushToken(req, res, next) {
  try {
    const result = await appService.savePushToken(req.body, req.customer);
    res.status(200).json(result);
  } catch (err) { next(err); }
}

async function verifyFace(req, res, next) {
  try {
    const result = await appService.verifyFace(req.body);
    res.status(200).json(result);
  } catch (err) { next(err); }
}

async function recoveryLookup(req, res, next) {
  try {
    const result = await appService.recoveryLookup(req.body);
    res.status(200).json(result);
  } catch (err) { next(err); }
}

async function recoveryComplete(req, res, next) {
  try {
    const result = await appService.recoveryComplete(req.body);
    res.status(200).json(result);
  } catch (err) { next(err); }
}

async function registerSelfie(req, res, next) {
  try {
    const result = await appService.registerSelfie(req.body, req.customer);
    res.status(200).json(result);
  } catch (err) { next(err); }
}

async function refreshToken(req, res, next) {
  try {
    const result = await appService.refreshToken(req.customer);
    res.status(200).json(result);
  } catch (err) { next(err); }
}

async function validateNfce(req, res, next) {
  try {
    const { qrCodeUrl } = req.body;
    if (!qrCodeUrl) {
      return res.status(400).json({ erro: 'O campo qrCodeUrl é obrigatório.' });
    }
    const customerId      = req.customer.sub;
    const establishmentId = req.customer.establishmentId;
    console.log(`[VALIDATE-NFCE] customerId=${customerId} establishmentId=${establishmentId}`);
    const result = await nfceService.validateNfce(qrCodeUrl, customerId, establishmentId);
    console.log(`[VALIDATE-NFCE] resultado pendente=${!!result.pendente} para customerId=${customerId}`);
    res.status(200).json(result);
  } catch (err) { next(err); }
}

async function validatePhoto(req, res, next) {
  try {
    const { photo } = req.body;
    if (!photo) return res.status(400).json({ erro: 'O campo photo (base64) é obrigatório.' });

    const result = await photoValidationService.validatePhoto({
      base64Photo:     photo,
      customerId:      req.customer.sub,
      establishmentId: req.customer.establishmentId,
    });
    res.status(200).json(result);
  } catch (err) { next(err); }
}

async function getEstablishmentQRCodeData(req, res, next) {
  try {
    const data = await establishmentService.getPublicData(req.params.id);
    res.status(200).json(data);
  } catch (err) { next(err); }
}

module.exports = {
  register,
  registerSelfie,
  login,
  verifyCpf,
  verifyFace,
  sendOtp,
  verifyOtp,
  getConfig,
  savePushToken,
  recoveryLookup,
  recoveryComplete,
  refreshToken,
  getBalance,
  recordTransaction,
  generateRedemption,
  validateRedemption,
  getHistory,
  getStatement,
  validateNfce,
  validatePhoto,
  getEstablishmentQRCodeData,
};
