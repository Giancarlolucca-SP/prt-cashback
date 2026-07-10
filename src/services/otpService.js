// In-memory OTP store with 5-minute TTL
// In production this would use Redis or SMS provider

const crypto = require('crypto');

const EXPIRY_MS     = 5 * 60 * 1000;
const MAX_ATTEMPTS  = 5; // per code — beyond this, force a resend instead of continued guessing

const store = new Map(); // key: `${phone}:${establishmentId}` → { code, expiresAt, attempts }

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
  return String(crypto.randomInt(100000, 1000000));
}

/**
 * Generate and store an OTP for the given phone + establishment.
 * Returns the code (in dev mode, also logged to console).
 */
function send(phone, establishmentId) {
  const code      = generateCode();
  const expiresAt = Date.now() + EXPIRY_MS;
  store.set(storeKey(phone, establishmentId), { code, expiresAt, attempts: 0 });

  // In production: call SMS provider here
  const maskedPhone = phone ? `${phone.slice(0, 2)}****${phone.slice(-2)}` : '?';
  console.log(`[OTP] Código gerado para ${maskedPhone} @ ${establishmentId} (válido 5 min)`);

  return code; // returned so the API can include it in dev response
}

/**
 * Verify an OTP. Returns true if valid, false otherwise.
 * Deletes the entry on success, or once MAX_ATTEMPTS wrong guesses have been
 * made (forcing a resend instead of allowing unlimited brute-force guesses
 * against the same code for the rest of its 5-minute TTL).
 */
function verify(phone, establishmentId, code) {
  const key   = storeKey(phone, establishmentId);
  const entry = store.get(key);
  if (!entry) return false;
  if (Date.now() > entry.expiresAt) { store.delete(key); return false; }

  entry.attempts += 1;
  if (entry.attempts > MAX_ATTEMPTS) { store.delete(key); return false; }

  if (entry.code !== String(code)) return false;
  store.delete(key);
  return true;
}

module.exports = { send, verify };
