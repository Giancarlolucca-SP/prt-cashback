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
    // Customer tokens (signed by appService.signCustomerToken) carry
    // `type: 'customer'` and no `role` — reject them here so every route
    // gated by bare `authenticate` can't be reached with a customer's own
    // token, without each route needing its own staff-only check.
    if (payload.type === 'customer' || !payload.role) {
      return res.status(403).json({
        erro: 'Token de cliente não é válido para esta rota.',
      });
    }
    req.operator = payload;
    next();
  } catch {
    return res.status(401).json({
      erro: 'Token inválido ou expirado.',
    });
  }
}

function requireAdmin(req, res, next) {
  // SUPERADMIN outranks ADMIN in the Role hierarchy — it must satisfy every
  // ADMIN-gated route too, not just its own requireSuperAdmin routes.
  if (!req.operator || (req.operator.role !== 'ADMIN' && req.operator.role !== 'SUPERADMIN')) {
    return res.status(403).json({
      erro: 'Acesso negado. Apenas administradores podem realizar esta ação.',
    });
  }
  next();
}

function requireSuperAdmin(req, res, next) {
  if (!req.operator || req.operator.role !== 'SUPERADMIN') {
    return res.status(403).json({
      erro: 'Acesso negado. Apenas o super administrador pode realizar esta ação.',
    });
  }
  next();
}

module.exports = { authenticate, requireAdmin, requireSuperAdmin };
