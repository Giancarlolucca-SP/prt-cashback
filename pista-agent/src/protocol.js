/**
 * CBC / Companytec concentrator protocol (DT435).
 *
 * Frame:  "(" + HEADER + PARAMS + [CHECKSUM] + ")"
 *   CHECKSUM = (sum of ASCII codes of HEADER+PARAMS chars) & 0xFF, 2-digit uppercase hex.
 *
 * Read fueling  "(&A)" -> "(" + 50 chars + ")"  or  "(0)" if none.
 *   Layout (50): T[6] L[6] P[4] V[2] C[4] B[2] D[2] H[2] M[2] N[2] R[4] E[10] S[2] K[2]
 *     T total, L volume, P unit price  (decimals from the §3.7 comma code V)
 *     V comma code (hex), C time (hex), B nozzle code (hex)
 *     D day, H hour, M minute, N month (decimal)
 *     R register (decimal), E final totalizer (decimal), S mem status (00=ok), K checksum
 * Increment   "(&I)"  (no params returned).
 * Status      "(&S)".
 *
 * READ-ONLY: only &A, &I, &S are ever built here.
 */

const CMD = { READ_FUELING: '&A', INCREMENT: '&I', STATUS: '&S' };

// Checksum over HEADER+PARAMS chars; low byte only; 2-digit uppercase hex.
function checksum(headerParams) {
  let acc = 0;
  for (let i = 0; i < headerParams.length; i++) acc = (acc + headerParams.charCodeAt(i)) & 0xff;
  return acc.toString(16).toUpperCase().padStart(2, '0');
}

function buildCommand(headerParams, withChecksum = false) {
  return withChecksum ? `(${headerParams}${checksum(headerParams)})` : `(${headerParams})`;
}

// §3.7 comma code (1 byte hex): bits[1:0]=total, bits[3:2]=volume, bits[5:4]=price decimals.
function decimalsFromComma(commaHex) {
  const b = parseInt(commaHex, 16) || 0;
  return { total: b & 0b11, volume: (b >> 2) & 0b11, price: (b >> 4) & 0b11 };
}

// Insert a decimal point `decimals` places from the right (Companytec PutComma).
function applyDecimals(digits, decimals) {
  const clean = String(digits).replace(/[^0-9]/g, '') || '0';
  if (decimals <= 0) return parseInt(clean, 10);
  const padded = clean.padStart(decimals + 1, '0');
  const cut = padded.length - decimals;
  return parseFloat(`${padded.slice(0, cut)}.${padded.slice(cut)}`);
}

// Pull the first complete "(...)" frame out of a buffer string.
// Returns { content, raw, rest } or null when no full frame yet.
function extractFrame(buffer) {
  const open = buffer.indexOf('(');
  if (open === -1) return null;
  const close = buffer.indexOf(')', open + 1);
  if (close === -1) return null;
  return {
    content: buffer.slice(open + 1, close),
    raw:     buffer.slice(open, close + 1),
    rest:    buffer.slice(close + 1),
  };
}

// Build a Date from D/H/M/N (no year in &A) — assume current year, fall back a
// year if the result lands clearly in the future (clock skew / Jan rollover).
function buildFuelingDateTime({ day, hour, minute, month }) {
  const now = new Date();
  let dt = new Date(now.getFullYear(), (month || 1) - 1, day || 1, hour || 0, minute || 0, 0);
  if (dt.getTime() - now.getTime() > 24 * 60 * 60 * 1000) {
    dt = new Date(now.getFullYear() - 1, (month || 1) - 1, day || 1, hour || 0, minute || 0, 0);
  }
  return dt;
}

// Decode the 48-char core block T[6]L[6]P[4]V[2]C[4]B[2]D[2]H[2]M[2]N[2]R[4]E[10]S[2]
// (shared by the plain and identified parsers).
function decodeFuelingFields(block) {
  let i = 0;
  const take = (n) => { const v = block.slice(i, i + n); i += n; return v; };
  const T = take(6), L = take(6), P = take(4), V = take(2), C = take(4), B = take(2),
        D = take(2), H = take(2), M = take(2), N = take(2), R = take(4), E = take(10), S = take(2);

  const dec = decimalsFromComma(V);
  const day = parseInt(D, 10), hour = parseInt(H, 10), minute = parseInt(M, 10), month = parseInt(N, 10);
  return {
    registro:        parseInt(R, 10),
    nozzleCode:      parseInt(B, 16),
    fuelCode:        null,                          // not in the &A frame; mappable via DT360
    commaCode:       V,
    timeCode:        parseInt(C, 16),
    totalValue:      applyDecimals(T, dec.total),
    volumeLiters:    applyDecimals(L, dec.volume),
    unitPrice:       applyDecimals(P, dec.price),
    day, hour, minute, month,
    fuelingDateTime: buildFuelingDateTime({ day, hour, minute, month }),
    encerranteFinal: applyDecimals(E, 2),           // totalizer with 2 decimals (e.g. 1625 -> 16.25)
    memStatus:       S,                              // "00" = ok
  };
}

// An identifier of all-zeros, all-F (16x) or blank means "no card" -> null.
function normalizeIdentifier(raw) {
  if (raw == null) return null;
  const t = String(raw).trim();
  if (!t) return null;
  if (/^0+$/.test(t)) return null;
  if (/^F+$/i.test(t)) return null;
  return t;
}

/**
 * Plain read "(&A)" -> 50 chars between parens (§3.1.1).
 * Returns null when there is no fueling ("0"/empty).
 */
function parseFueling(content) {
  if (content == null) return null;
  const c = String(content).trim();
  if (c === '' || c === '0') return null;
  if (c.length < 50) throw new Error(`Resposta &A inesperada (${c.length} chars): "${c}"`);
  const s = c.slice(0, 50);
  return {
    ...decodeFuelingFields(s.slice(0, 48)),
    identfidCode:  null,
    attendantTag:  null,
    identifierRaw: null,
    checksum:      s.slice(48, 50),
    rawContent:    s,
    mode:          'plain',
  };
}

/**
 * Identified read "(&A67)" -> 73 chars between parens (§3.1.3):
 *   A[1] T[6] L[6] P[4] V[2] C[4] B[2] D[2] H[2] M[2] N[2] R[4] E[10] S[2] I[16] M[4] P[2] K[2]
 * I[16] (the Identfid card code = frentista) sits at content offset 49..65.
 */
function parseIdentifiedFueling(content) {
  if (content == null) return null;
  const c = String(content).trim();
  if (c === '' || c === '0') return null;
  if (c.length < 73) throw new Error(`Resposta &A67 (identificada) inesperada (${c.length} chars): "${c}"`);
  const s = c.slice(0, 73);
  const identifierRaw = s.slice(49, 65);            // I[16]
  const identfid = normalizeIdentifier(identifierRaw);
  return {
    ...decodeFuelingFields(s.slice(1, 49)),         // skip A[1] prefix
    prefix:        s.slice(0, 1),
    identfidCode:  identfid,
    attendantTag:  identfid,
    identifierRaw,
    extraM:        s.slice(65, 69),                 // M[4]
    extraP:        s.slice(69, 71),                 // P[2]
    checksum:      s.slice(71, 73),                 // K[2]
    rawContent:    s,
    mode:          'identified',
  };
}

// Auto-detect by length: >=73 -> identified (has I[16]); else plain.
function parseFuelingResponse(content) {
  const c = String(content == null ? '' : content).trim();
  if (c === '' || c === '0') return null;
  return c.length >= 73 ? parseIdentifiedFueling(c) : parseFueling(c);
}

module.exports = {
  CMD, checksum, buildCommand, decimalsFromComma, applyDecimals,
  extractFrame, buildFuelingDateTime, decodeFuelingFields, normalizeIdentifier,
  parseFueling, parseIdentifiedFueling, parseFuelingResponse,
};
