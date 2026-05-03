const jwt = require('jsonwebtoken');

function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      erro: 'Token de autenticação não fornecido.',
    });
  }

  const token = authHeader.split(' ')[1];

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.operator = payload;
    next();
  } catch {
    return res.status(401).json({
      erro: 'Token inválido ou expirado.',
    });
  }
}

function requireAdmin(req, res, next) {
  if (!req.operator || req.operator.role !== 'ADMIN') {
    return res.status(403).json({
      erro: 'Acesso negado. Apenas administradores podem realizar esta ação.',
    });
  }
  next();
}

module.exports = { authenticate, requireAdmin };
