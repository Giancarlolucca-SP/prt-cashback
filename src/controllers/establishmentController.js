const establishmentService = require('../services/establishmentService');

// Neither the service layer nor these routes previously checked that the
// caller's own establishment matched req.params.id — any ADMIN (of ANY
// establishment) could upload a logo or change branding colors for a
// completely different one just by supplying its id in the URL. SUPERADMIN
// legitimately manages every establishment; a plain ADMIN must be confined
// to their own.
function assertOwnEstablishment(req, res) {
  if (req.operator.role === 'SUPERADMIN') return true;
  if (req.operator.establishmentId === req.params.id) return true;
  res.status(403).json({ erro: 'Você só pode gerenciar o seu próprio estabelecimento.' });
  return false;
}

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
    if (!assertOwnEstablishment(req, res)) return;
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

async function updateBranding(req, res, next) {
  try {
    if (!assertOwnEstablishment(req, res)) return;
    const { primaryColor, secondaryColor } = req.body;
    const result = await establishmentService.updateBranding(
      req.params.id,
      { primaryColor, secondaryColor },
      req.operator?.id ?? null,
    );
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

async function completarCadastro(req, res, next) {
  try {
    const result = await establishmentService.completarCadastroOAuth(req.body, req.operator.id);
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
}

module.exports = { create, listAll, uploadLogo, updateBranding, getQRCode, completarCadastro };
