function errorHandler(err, req, res, next) {
  const isDev = process.env.NODE_ENV === 'development';

  // Log all errors server-side
  console.error(`[${new Date().toISOString()}] ${err.message}`);
  if (isDev) console.error(err.stack);

  // Prisma unique constraint violation
  if (err.code === 'P2002') {
    return res.status(409).json({
      erro: 'Registro já existe com estes dados.',
    });
  }

  // Prisma record not found
  if (err.code === 'P2025') {
    return res.status(404).json({
      erro: 'Registro não encontrado.',
    });
  }

  // Known operational errors (thrown by services)
  if (err.isOperational) {
    return res.status(err.statusCode || 400).json({
      erro: err.message,
    });
  }

  // Unknown / unexpected errors — never expose internals in production
  return res.status(500).json({
    erro: 'Erro interno do servidor. Tente novamente mais tarde.',
    ...(isDev && { detalhe: err.message, stack: err.stack }),
  });
}

/**
 * Creates a typed operational error that the error handler understands.
 * Use this to signal known business rule violations.
 */
function createError(message, statusCode = 400) {
  const error = new Error(message);
  error.isOperational = true;
  error.statusCode = statusCode;
  return error;
}

module.exports = { errorHandler, createError };
