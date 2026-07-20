const { PrismaClient } = require('@prisma/client');
const fraudAlertService = require('../services/fraudAlertService');

const prisma = new PrismaClient();

/**
 * Validates that the X-Device-Id header matches the device ID stored for this customer.
 *
 * - If the customer has no deviceId stored yet → bind whatever is presented now (first use)
 * - If deviceId matches → allow
 * - If deviceId is missing or does NOT match a stored one → log FraudAlert and return 403
 *
 * Attach after `authenticateCustomer` so `req.customer` is populated.
 */
async function validateDeviceId(req, res, next) {
  const headerDeviceId = req.headers['x-device-id'];
  const customerId     = req.customer?.sub;

  if (!customerId) return next(); // No customer payload — other middleware will handle

  try {
    const customer = await prisma.customer.findUnique({
      where:  { id: customerId },
      select: { deviceId: true, establishmentId: true },
    });

    if (!customer) return next(); // Customer not found — auth middleware will catch

    // No device ID stored yet → bind this device now (first use after a
    // legacy registration). Only binds when a header is actually present —
    // an omitted header shouldn't erase the requirement for future requests.
    if (!customer.deviceId) {
      if (headerDeviceId) {
        // CAS: two concurrent requests (e.g. a stolen-but-not-yet-bound JWT
        // racing the legitimate first login) could both read deviceId:null —
        // updateMany + count check ensures only the first actually claims it.
        const claim = await prisma.customer.updateMany({
          where: { id: customerId, deviceId: null },
          data:  { deviceId: headerDeviceId },
        });
        if (claim.count === 0) {
          // Lost the race — re-check against whichever device actually won.
          const fresh = await prisma.customer.findUnique({ where: { id: customerId }, select: { deviceId: true } });
          if (fresh?.deviceId && fresh.deviceId !== headerDeviceId) {
            await fraudAlertService.logAlert(
              'WRONG_DEVICE',
              customerId,
              customer.establishmentId,
              { storedDevice: fresh.deviceId, requestDevice: headerDeviceId },
            );
            return res.status(403).json({
              erro: 'Dispositivo não autorizado. Realize o processo de recuperação de conta.',
              codigo: 'WRONG_DEVICE',
            });
          }
        }
      }
      return next();
    }

    // Device matches → allow
    if (headerDeviceId && customer.deviceId === headerDeviceId) return next();

    // Missing or mismatched header on an already-bound device → log fraud
    // alert and block. The header is attached automatically by every current
    // client (see mobile/src/api/client.ts's request interceptor), so an
    // absent header on a bound account is itself a signal, not a legacy case
    // — treating it as "skip the check" let a stolen JWT bypass device
    // binding entirely just by omitting one header.
    await fraudAlertService.logAlert(
      'WRONG_DEVICE',
      customerId,
      customer.establishmentId,
      { storedDevice: customer.deviceId, requestDevice: headerDeviceId || null },
    );

    return res.status(403).json({
      erro: 'Dispositivo não autorizado. Realize o processo de recuperação de conta.',
      codigo: 'WRONG_DEVICE',
    });
  } catch (err) {
    // Fail CLOSED: this check exists specifically to block a stolen JWT used
    // from a different device, so swallowing errors and letting the request
    // through would silently reopen exactly that bypass on any transient
    // Prisma error — the same class of "quiet failure defeats the guard" bug
    // this middleware itself was written to close.
    console.error('[DeviceMiddleware] Erro:', err.message);
    return res.status(503).json({ erro: 'Não foi possível validar o dispositivo. Tente novamente.' });
  }
}

module.exports = { validateDeviceId };
