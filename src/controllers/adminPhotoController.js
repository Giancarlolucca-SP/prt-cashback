const photoService = require('../services/photoValidationService');

async function listPhotoValidations(req, res, next) {
  try {
    const { establishmentId } = req.operator;
    const items = await photoService.listPhotoValidations(establishmentId);
    res.json({ total: items.length, itens: items });
  } catch (err) { next(err); }
}

async function approvePhoto(req, res, next) {
  try {
    const { id } = req.params;
    const { amount, fuelType, liters } = req.body;
    if (!amount) return res.status(400).json({ erro: 'O campo amount é obrigatório.' });

    const result = await photoService.approvePhotoValidation({
      transactionId: id,
      amount,
      fuelType,
      liters,
      operatorId: req.operator.id,
    });
    res.json(result);
  } catch (err) { next(err); }
}

async function rejectPhoto(req, res, next) {
  try {
    const { id }    = req.params;
    const { motivo } = req.body;

    const result = await photoService.rejectPhotoValidation({
      transactionId: id,
      motivo:        motivo || 'Cupom inválido.',
      operatorId:    req.operator.id,
    });
    res.json(result);
  } catch (err) { next(err); }
}

module.exports = { listPhotoValidations, approvePhoto, rejectPhoto };
