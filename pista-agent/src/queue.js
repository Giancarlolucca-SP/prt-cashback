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

// In-memory mirror of the pending file, loaded once and kept in sync on every
// persist()/confirm() — avoids re-reading and re-JSON-parsing the entire file
// on every single fueling event (was O(n) per event, O(n²) to drain a backlog
// built up during a multi-day cloud outage).
let cache = null;

function load() {
  if (cache) return cache;
  ensure();
  cache = fs.existsSync(FILE)
    ? fs.readFileSync(FILE, 'utf8').split('\n').filter(Boolean)
        .map((l) => { try { return JSON.parse(l); } catch { return null; } })
        .filter(Boolean)
    : [];
  return cache;
}

function readAll() { return load().slice(); }

// Append a fueling if not already pending. Returns true if newly persisted.
function persist(f) {
  ensure();
  const list = load();
  const k = keyOf(f);
  if (list.some((x) => x._key === k)) return false;
  const entry = { ...f, _key: k, _persistedAt: new Date().toISOString() };
  list.push(entry);
  fs.appendFileSync(FILE, JSON.stringify(entry) + '\n');
  return true;
}

// Remove a fueling from the pending file (after the cloud confirmed + pointer advanced).
function confirm(f) {
  ensure();
  const list = load();
  const k = keyOf(f);
  const idx = list.findIndex((x) => x._key === k);
  if (idx === -1) return;
  list.splice(idx, 1);
  fs.writeFileSync(FILE, list.map((x) => JSON.stringify(x)).join('\n') + (list.length ? '\n' : ''));
}

function pendingCount() { return load().length; }

module.exports = { persist, confirm, pendingCount, keyOf, readAll };
