const multer = require('multer');
const { createError } = require('./errorMiddleware');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter(req, file, cb) {
    if (!['image/jpeg', 'image/png'].includes(file.mimetype)) {
      // createError sets isOperational+statusCode — the shape errorMiddleware
      // actually checks. The previous `{ status: 400 }` didn't match either
      // that or Multer's own error shape, so this fell through to the
      // generic 500 "erro interno do servidor" instead of the specific
      // message below ever reaching the client.
      return cb(createError('Formato inválido. Use PNG ou JPG.', 400));
    }
    cb(null, true);
  },
});

module.exports = upload;
