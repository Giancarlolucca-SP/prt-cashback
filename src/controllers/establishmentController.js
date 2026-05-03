const establishmentService = require('../services/establishmentService');

async function create(req, res, next) {
  try {
    const result = await establishmentService.create(req.body, req.operator?.id ?? null);
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
}

async function listAll(req, res, next) {
  try {
    const result = await establishmentService.listAll();
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

async function uploadLogo(req, res, next) {
  try {
    if (!req.file) {
      return res.status(400).json({ erro: 'Nenhum arquivo enviado.' });
    }
    const result = await establishmentService.uploadLogo(req.params.id, req.file.buffer);
    res.status(200).json({ mensagem: 'Logo enviado com sucesso.', ...result });
  } catch (err) {
    next(err);
  }
}

async function getQRCode(req, res, next) {
  try {
    const { buffer, name } = await establishmentService.generateQRCodeBuffer(req.params.id);
    const filename = `qrcode-${name.replace(/[^a-z0-9]/gi, '-').toLowerCase()}.png`;
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', buffer.length);
    res.send(buffer);
  } catch (err) {
    next(err);
  }
}

module.exports = { create, listAll, uploadLogo, getQRCode };
