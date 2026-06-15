/**
 * Durable local queue (append-only JSONL). A fueling is persisted to disk
 * BEFORE the agent advances the concentrator pointer, so nothing is ever lost
 * if the cloud is down or the process dies mid-flight.
 */
const fs = require('fs');
const path = require('path');

const DIR = path.join(__dirname, '..', 'data');
const FILE = path.join(DIR, 'pending.jsonl');

function ensure() { if (!fs.existsSync(DIR)) fs.mkdirSync(DIR, { recursive: true }); }

function keyOf(f) {
  return `${f.registro}|${f.encerranteFinal}|${new Date(f.fuelingDateTime).toISOString()}`;
}

function readAll() {
  ensure();
  if (!fs.existsSync(FILE)) return [];
  return fs.readFileSync(FILE, 'utf8').split('\n').filter(Boolean)
    .map((l) => { try { return JSON.parse(l); } catch { return null; } })
    .filter(Boolean);
}

// Append a fueling if not already pending. Returns true if newly persisted.
function persist(f) {
  ensure();
  const k = keyOf(f);
  if (readAll().some((x) => x._key === k)) return false;
  fs.appendFileSync(FILE, JSON.stringify({ ...f, _key: k, _persistedAt: new Date().toISOString() }) + '\n');
  return true;
}

// Remove a fueling from the pending file (after the cloud confirmed + pointer advanced).
function confirm(f) {
  ensure();
  const k = keyOf(f);
  const kept = readAll().filter((x) => x._key !== k);
  fs.writeFileSync(FILE, kept.map((x) => JSON.stringify(x)).join('\n') + (kept.length ? '\n' : ''));
}

function pendingCount() { return readAll().length; }

module.exports = { persist, confirm, pendingCount, keyOf, readAll };
