/**
 * In-memory store for pending QR redemption codes.
 * Each entry expires after EXPIRY_MS milliseconds.
 *
 * Also tracks recently-used codes (for 1 hour) to detect duplicate-scan fraud.
 */

const EXPIRY_MS      = 10 * 60 * 1000; // 10 minutes
const USED_TRACK_MS  = 60 * 60 * 1000; // 1 hour — track used codes for duplicate detection

const store     = new Map(); // pending codes
const usedCodes = new Map(); // code → usedAt timestamp

function set(code, data) {
  store.set(code, { ...data, createdAt: Date.now() });
}

function get(code) {
  const entry = store.get(code);
  if (!entry) return null;
  if (Date.now() - entry.createdAt > EXPIRY_MS) {
    store.delete(code);
    return null;
  }
  return entry;
}

function del(code) {
  store.delete(code);
}

function markUsed(code) {
  usedCodes.set(code, Date.now());
}

/**
 * Returns true if this code was already successfully redeemed
 * (within the last hour — helps detect duplicate scan fraud).
 */
function wasUsed(code) {
  const usedAt = usedCodes.get(code);
  if (!usedAt) return false;
  if (Date.now() - usedAt > USED_TRACK_MS) {
    usedCodes.delete(code);
    return false;
  }
  return true;
}

function expiresAt(code) {
  const entry = store.get(code);
  if (!entry) return null;
  return new Date(entry.createdAt + EXPIRY_MS);
}

// Periodic cleanup
setInterval(() => {
  const now = Date.now();
  for (const [key, val] of store) {
    if (now - val.createdAt > EXPIRY_MS) store.delete(key);
  }
  for (const [key, ts] of usedCodes) {
    if (now - ts > USED_TRACK_MS) usedCodes.delete(key);
  }
}, 5 * 60 * 1000);

module.exports = { set, get, del, expiresAt, markUsed, wasUsed };
