const multer = require('multer');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter(req, file, cb) {
    if (!['image/jpeg', 'image/png'].includes(file.mimetype)) {
      return cb(Object.assign(new Error('Formato inválido. Use PNG ou JPG.'), { status: 400 }));
    }
    cb(null, true);
  },
});

module.exports = upload;
