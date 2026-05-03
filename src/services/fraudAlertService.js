const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

// ── Haversine distance (metres) ───────────────────────────────────────────────

function haversineMetres(lat1, lon1, lat2, lon2) {
  const R    = 6_371_000;
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const dPhi = ((lat2 - lat1) * Math.PI) / 180;
  const dLam = ((lon2 - lon1) * Math.PI) / 180;
  const a    = Math.sin(dPhi / 2) ** 2
             + Math.cos(phi1) * Math.cos(phi2) * Math.sin(dLam / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ── logAlert ──────────────────────────────────────────────────────────────────

async function logAlert(type, customerId, establishmentId, metadata = {}) {
  try {
    const alert = await prisma.fraudAlert.create({
      data: { type, customerId, establishmentId, metadata },
    });
    console.warn(`[FraudAlert] ${type} | customer=${customerId} | est=${establishmentId}`, metadata);
    return alert;
  } catch (err) {
    console.error('[FraudAlert] Falha ao registrar alerta:', err.message);
    return null;
  }
}

// ── countAlertsToday ──────────────────────────────────────────────────────────

async function countAlertsToday(type, customerId) {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  return prisma.fraudAlert.count({
    where: { type, customerId, createdAt: { gte: start } },
  });
}

// ── checkDailyRedemptions ─────────────────────────────────────────────────────
// Returns the number of redemptions this customer completed today.

async function checkDailyRedemptions(customerId, establishmentId) {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  return prisma.redemption.count({
    where: { customerId, establishmentId, createdAt: { gte: start } },
  });
}

// ── checkVelocity ─────────────────────────────────────────────────────────────
// Returns true if the location change since last seen is physically plausible.
// Flags as suspicious if > 300 km/h implied speed (fast commercial flight excluded).

async function checkVelocity(customerId, newLat, newLng) {
  const customer = await prisma.customer.findUnique({
    where:  { id: customerId },
    select: { lastLat: true, lastLng: true, lastLocAt: true },
  });

  if (!customer?.lastLat || !customer?.lastLng || !customer?.lastLocAt) {
    return { suspicious: false };
  }

  const distM   = haversineMetres(
    parseFloat(customer.lastLat),
    parseFloat(customer.lastLng),
    newLat,
    newLng,
  );
  const elapsedMs = Date.now() - new Date(customer.lastLocAt).getTime();
  const elapsedH  = elapsedMs / 3_600_000;

  if (elapsedH <= 0) return { suspicious: false };

  const speedKmh = distM / 1000 / elapsedH;
  const suspicious = speedKmh > 300;

  return { suspicious, speedKmh: Math.round(speedKmh), distanceKm: Math.round(distM / 1000) };
}

// ── updateCustomerLocation ────────────────────────────────────────────────────

async function updateCustomerLocation(customerId, lat, lng) {
  try {
    await prisma.customer.update({
      where: { id: customerId },
      data:  { lastLat: lat, lastLng: lng, lastLocAt: new Date() },
    });
  } catch (err) {
    console.error('[FraudAlert] Falha ao atualizar localização:', err.message);
  }
}

// ── validateGeolocation ───────────────────────────────────────────────────────
// Returns null if valid, or an error message string if too far.

async function validateGeolocation(establishmentId, customerLat, customerLng) {
  const establishment = await prisma.establishment.findUnique({
    where:  { id: establishmentId },
    select: { latitude: true, longitude: true, name: true },
  });

  if (!establishment?.latitude || !establishment?.longitude) {
    // Establishment has no coordinates set → skip geo check
    return null;
  }

  const distM = haversineMetres(
    parseFloat(establishment.latitude),
    parseFloat(establishment.longitude),
    customerLat,
    customerLng,
  );

  if (distM > 500) {
    return `Você precisa estar no posto para validar o cupom. Distância atual: ${Math.round(distM)}m.`;
  }

  return null;
}

module.exports = {
  logAlert,
  countAlertsToday,
  checkDailyRedemptions,
  checkVelocity,
  updateCustomerLocation,
  validateGeolocation,
  haversineMetres,
};
