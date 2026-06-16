const attendantService = require('../services/attendantService');

async function list(req, res, next) {
  try {
    const result = await attendantService.listAttendants(req.operator);
    res.status(200).json(result);
  } catch (err) { next(err); }
}

async function create(req, res, next) {
  try {
    const result = await attendantService.createAttendant(req.operator, req.body);
    res.status(201).json(result);
  } catch (err) { next(err); }
}

async function update(req, res, next) {
  try {
    const result = await attendantService.updateAttendant(req.operator, req.params.id, req.body);
    res.status(200).json(result);
  } catch (err) { next(err); }
}

async function remove(req, res, next) {
  try {
    const result = await attendantService.deleteAttendant(req.operator, req.params.id);
    res.status(200).json(result);
  } catch (err) { next(err); }
}

async function uploadPhoto(req, res, next) {
  try {
    if (!req.file) return res.status(400).json({ erro: 'Nenhum arquivo enviado.' });
    const result = await attendantService.uploadPhoto(req.operator, req.params.id, req.file.buffer);
    res.status(200).json(result);
  } catch (err) { next(err); }
}

async function sync(req, res, next) {
  try {
    const result = await attendantService.syncFromTransactions(req.operator);
    res.status(200).json(result);
  } catch (err) { next(err); }
}

module.exports = { list, create, update, remove, uploadPhoto, sync };
