const { PrismaClient } = require('@prisma/client');
const fraudAlertService = require('../services/fraudAlertService');

const prisma = new PrismaClient();

/**
 * Validates that the X-Device-Id header matches the device ID stored for this customer.
 *
 * - If the customer has no deviceId stored yet → allow (first use after a legacy registration)
 * - If deviceId matches → allow
 * - If deviceId does NOT match → log FraudAlert and return 403
 *
 * Attach after `authenticateCustomer` so `req.customer` is populated.
 */
async function validateDeviceId(req, res, next) {
  const headerDeviceId = req.headers['x-device-id'];
  const customerId     = req.customer?.sub;

  if (!customerId) return next(); // No customer payload — other middleware will handle

  // No device ID header sent → skip check (allows older clients to work)
  if (!headerDeviceId) return next();

  try {
    const customer = await prisma.customer.findUnique({
      where:  { id: customerId },
      select: { deviceId: true, establishmentId: true },
    });

    if (!customer) return next(); // Customer not found — auth middleware will catch

    // No device ID stored yet → bind this device now
    if (!customer.deviceId) {
      await prisma.customer.update({
        where: { id: customerId },
        data:  { deviceId: headerDeviceId },
      });
      return next();
    }

    // Device matches → allow
    if (customer.deviceId === headerDeviceId) return next();

    // Mismatch → log fraud alert and block
    await fraudAlertService.logAlert(
      'WRONG_DEVICE',
      customerId,
      customer.establishmentId,
      { storedDevice: customer.deviceId, requestDevice: headerDeviceId },
    );

    return res.status(403).json({
      erro: 'Dispositivo não autorizado. Realize o processo de recuperação de conta.',
      codigo: 'WRONG_DEVICE',
    });
  } catch (err) {
    console.error('[DeviceMiddleware] Erro:', err.message);
    next(); // Fail open — don't break the app over a device check error
  }
}

module.exports = { validateDeviceId };
