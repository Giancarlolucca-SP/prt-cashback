// In-memory OTP store with 5-minute TTL
// In production this would use Redis or SMS provider

const EXPIRY_MS = 5 * 60 * 1000;

const store = new Map(); // key: `${phone}:${establishmentId}` → { code, expiresAt }

// Cleanup expired entries every 2 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of store.entries()) {
    if (now > entry.expiresAt) store.delete(key);
  }
}, 2 * 60 * 1000);

function storeKey(phone, establishmentId) {
  return `${phone}:${establishmentId}`;
}

function generateCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

/**
 * Generate and store an OTP for the given phone + establishment.
 * Returns the code (in dev mode, also logged to console).
 */
function send(phone, establishmentId) {
  const code      = generateCode();
  const expiresAt = Date.now() + EXPIRY_MS;
  store.set(storeKey(phone, establishmentId), { code, expiresAt });

  // In production: call SMS provider here
  // For now just log so devs can test
  console.log(`[OTP] ${phone} @ ${establishmentId} → ${code}  (valid 5 min)`);

  return code; // returned so the API can include it in dev response
}

/**
 * Verify an OTP. Returns true if valid, false otherwise.
 * Deletes the entry on success.
 */
function verify(phone, establishmentId, code) {
  const key   = storeKey(phone, establishmentId);
  const entry = store.get(key);
  if (!entry) return false;
  if (Date.now() > entry.expiresAt) { store.delete(key); return false; }
  if (entry.code !== String(code))   return false;
  store.delete(key);
  return true;
}

module.exports = { send, verify };
