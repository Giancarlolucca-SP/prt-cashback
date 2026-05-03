const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

/**
 * Records an audit log entry for any significant action.
 * Non-blocking: errors are logged but never bubble up.
 */
async function log({ action, entity, entityId, operatorId = null, metadata = null }) {
  try {
    await prisma.auditLog.create({
      data: {
        action,
        entity,
        entityId,
        operatorId,
        metadata,
      },
    });
  } catch (err) {
    // Audit log failures must never crash the main flow
    console.error('[AuditLog] Falha ao registrar log:', err.message);
  }
}

module.exports = { log };
