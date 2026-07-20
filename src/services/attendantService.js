/**
 * attendantService.js
 *
 * Registry of frentistas (attendants) per establishment, with optional photo
 * stored in the Supabase 'attendants' bucket (public — photos are shown to
 * customers on the rating screen).
 *
 * The `attendantKey` is the SAME key the ranking/ratings use
 * (Transaction.attendantName, e.g. "27-JUNIOR"), so a registered attendant
 * links automatically to their transactions, ranking position and ratings.
 */

const sharp = require('sharp');
const { createClient } = require('@supabase/supabase-js');
const { PrismaClient } = require('@prisma/client');
const { createError } = require('../middlewares/errorMiddleware');

const prisma = new PrismaClient();

const PHOTO_BUCKET = 'attendants';
const PHOTO_SIZE   = 400;
const PHOTO_QUALITY = 80;

// ── Supabase (lazy) ───────────────────────────────────────────────────────────

let _supabase = null;
function getSupabase() {
  if (_supabase) return _supabase;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) return null;
  _supabase = createClient(url, key, { auth: { persistSession: false } });
  return _supabase;
}

let _bucketEnsured = false;
async function ensureBucket(supabase) {
  if (_bucketEnsured) return;
  try {
    const { data } = await supabase.storage.getBucket(PHOTO_BUCKET);
    if (!data) {
      await supabase.storage.createBucket(PHOTO_BUCKET, { public: true });
    }
  } catch {
    // createBucket throws if it already exists — safe to ignore
    try { await supabase.storage.createBucket(PHOTO_BUCKET, { public: true }); } catch {}
  }
  _bucketEnsured = true;
}

// ── Key helpers ───────────────────────────────────────────────────────────────

// Normalize for matching: uppercase, trim, collapse inner whitespace.
function norm(s) {
  return String(s || '').trim().toUpperCase().replace(/\s+/g, ' ');
}

// Build the ranking key from name + optional code, e.g. ("JUNIOR","27") -> "27-JUNIOR"
function buildKey(name, code) {
  const n = norm(name);
  const c = norm(code);
  return c ? `${c}-${n}` : n;
}

function serialize(a) {
  return {
    id:         a.id,
    name:       a.name,
    code:       a.code,
    key:        a.attendantKey,
    photoUrl:   a.photoUrl,
    active:     a.active,
    operatorId: a.operatorId ?? null,
  };
}

// Reject an operatorId that doesn't belong to the same establishment (cross-tenant guard).
async function assertOperatorInEstablishment(operatorId, establishmentId) {
  if (!operatorId) return;
  const op = await prisma.operator.findUnique({ where: { id: operatorId } });
  if (!op || op.establishmentId !== establishmentId) {
    throw createError('Operador inválido para este estabelecimento.', 400);
  }
}

// ── CRUD ──────────────────────────────────────────────────────────────────────

async function listAttendants(operator) {
  const establishmentId = operator.establishmentId;
  if (!establishmentId) throw createError('Operador sem estabelecimento.', 400);

  const attendants = await prisma.attendant.findMany({
    where:   { establishmentId },
    orderBy: [{ active: 'desc' }, { name: 'asc' }],
  });
  return { attendants: attendants.map(serialize) };
}

async function createAttendant(operator, { name, code, operatorId }) {
  const establishmentId = operator.establishmentId;
  if (!establishmentId) throw createError('Operador sem estabelecimento.', 400);
  if (!name || !name.trim()) throw createError('Nome do atendente é obrigatório.', 400);

  const attendantKey = buildKey(name, code);

  const existing = await prisma.attendant.findUnique({
    where: { establishmentId_attendantKey: { establishmentId, attendantKey } },
  });
  if (existing) throw createError('Já existe um atendente com este nome/código.', 409);

  await assertOperatorInEstablishment(operatorId, establishmentId);

  // The findUnique above is check-then-act, not atomic — two concurrent
  // submissions for the same name/code (double-click) can both pass it
  // before either commits. Catch the resulting P2002 instead of letting it
  // surface as an unhandled 500.
  let attendant;
  try {
    attendant = await prisma.attendant.create({
      data: {
        establishmentId,
        name:         name.trim(),
        code:         code ? String(code).trim() : null,
        attendantKey,
        operatorId:   operatorId || null,
      },
    });
  } catch (err) {
    if (err.code === 'P2002') throw createError('Já existe um atendente com este nome/código.', 409);
    throw err;
  }
  return { mensagem: 'Atendente cadastrado.', attendant: serialize(attendant) };
}

async function findOwned(operator, id) {
  const establishmentId = operator.establishmentId;
  const attendant = await prisma.attendant.findUnique({ where: { id } });
  if (!attendant || attendant.establishmentId !== establishmentId) {
    throw createError('Atendente não encontrado.', 404);
  }
  return attendant;
}

async function updateAttendant(operator, id, { name, code, active, operatorId }) {
  const attendant = await findOwned(operator, id);

  const newName = name != null ? String(name).trim() : attendant.name;
  const newCode = code !== undefined ? (code ? String(code).trim() : null) : attendant.code;
  const attendantKey = buildKey(newName, newCode);

  // Guard the unique (establishmentId, attendantKey) when name/code change
  if (attendantKey !== attendant.attendantKey) {
    const clash = await prisma.attendant.findUnique({
      where: { establishmentId_attendantKey: { establishmentId: attendant.establishmentId, attendantKey } },
    });
    if (clash && clash.id !== id) throw createError('Já existe um atendente com este nome/código.', 409);
  }

  if (operatorId !== undefined) await assertOperatorInEstablishment(operatorId, attendant.establishmentId);

  // Same check-then-act gap as createAttendant: two concurrent edits that
  // land on the same new attendantKey (e.g. both renaming to the same code)
  // can both pass the clash check above before either commits.
  let updated;
  try {
    updated = await prisma.attendant.update({
      where: { id },
      data: {
        name:         newName,
        code:         newCode,
        attendantKey,
        ...(active !== undefined ? { active: !!active } : {}),
        ...(operatorId !== undefined ? { operatorId: operatorId || null } : {}),
      },
    });
  } catch (err) {
    if (err.code === 'P2002') throw createError('Já existe um atendente com este nome/código.', 409);
    throw err;
  }
  return { mensagem: 'Atendente atualizado.', attendant: serialize(updated) };
}

async function deleteAttendant(operator, id) {
  const attendant = await findOwned(operator, id);

  // Delete the DB row first: if a PistaCardMap still references this attendant
  // (FK restrict), fail here with a clear message instead of after the photo
  // is already gone.
  try {
    await prisma.attendant.delete({ where: { id } });
  } catch (err) {
    if (err.code === 'P2003') {
      throw createError('Não é possível remover: há um cartão vinculado a este atendente. Remova o vínculo primeiro.', 409);
    }
    throw err;
  }

  // Best-effort remove the stored photo, now that the row is confirmed gone.
  const supabase = getSupabase();
  if (supabase && attendant.photoUrl) {
    try { await supabase.storage.from(PHOTO_BUCKET).remove([`${attendant.establishmentId}/${attendant.id}.jpg`]); } catch {}
  }

  return { mensagem: 'Atendente removido.' };
}

// ── Photo upload ──────────────────────────────────────────────────────────────

async function uploadPhoto(operator, id, fileBuffer) {
  const attendant = await findOwned(operator, id);
  if (!fileBuffer || !fileBuffer.length) throw createError('Nenhuma imagem enviada.', 400);

  const supabase = getSupabase();
  if (!supabase) throw createError('Armazenamento de imagens não configurado.', 503);
  await ensureBucket(supabase);

  const buf = await sharp(fileBuffer)
    .resize(PHOTO_SIZE, PHOTO_SIZE, { fit: 'cover', position: 'centre' })
    .jpeg({ quality: PHOTO_QUALITY })
    .toBuffer();

  const path = `${attendant.establishmentId}/${attendant.id}.jpg`;
  const { error } = await supabase.storage
    .from(PHOTO_BUCKET)
    .upload(path, buf, { contentType: 'image/jpeg', upsert: true });
  if (error) throw createError(`Falha ao enviar a foto: ${error.message}`, 502);

  const { data } = supabase.storage.from(PHOTO_BUCKET).getPublicUrl(path);
  // Cache-bust so the admin/customer sees the new photo immediately on re-upload
  const photoUrl = data?.publicUrl ? `${data.publicUrl}?v=${Date.now()}` : null;

  const updated = await prisma.attendant.update({
    where: { id },
    data:  { photoUrl },
  });
  return { mensagem: 'Foto atualizada.', attendant: serialize(updated) };
}

// ── Reconciliation ────────────────────────────────────────────────────────────

/**
 * Create Attendant rows for every distinct Transaction.attendantName seen at the
 * establishment that isn't registered yet — so seed/ranking attendants and the
 * registry share the same identity. Idempotent (keyed by attendantKey).
 */
async function syncFromTransactions(operator) {
  const establishmentId = operator.establishmentId;
  if (!establishmentId) throw createError('Operador sem estabelecimento.', 400);

  const [rows, existing] = await Promise.all([
    prisma.transaction.findMany({
      where:    { establishmentId, attendantName: { not: null }, status: 'CONFIRMED' },
      distinct: ['attendantName'],
      select:   { attendantName: true },
    }),
    prisma.attendant.findMany({ where: { establishmentId }, select: { attendantKey: true } }),
  ]);

  const have = new Set(existing.map((a) => a.attendantKey));
  const toCreate = [];
  for (const r of rows) {
    const key = norm(r.attendantName);
    if (!key || have.has(key)) continue;
    have.add(key);
    const dash = key.indexOf('-');
    const code = dash === -1 ? null : key.slice(0, dash);
    const name = dash === -1 ? key : key.slice(dash + 1);
    toCreate.push({ establishmentId, name, code, attendantKey: key });
  }

  if (toCreate.length) {
    await prisma.attendant.createMany({ data: toCreate, skipDuplicates: true });
  }
  return { mensagem: `${toCreate.length} atendente(s) importado(s) do histórico.`, imported: toCreate.length };
}

// ── Matching (used by NFCe auto-detect) ───────────────────────────────────────

/**
 * Match a raw attendant string from a cupom (e.g. "27-JUNIOR") to a registered
 * attendant in this establishment. Case-insensitive / trimmed.
 * Returns the Attendant record or null.
 */
async function matchByRaw(establishmentId, rawAttendant) {
  if (!establishmentId || !rawAttendant) return null;
  const key = norm(rawAttendant);

  // 1. Exact key match (fast path via unique index)
  const exact = await prisma.attendant.findUnique({
    where: { establishmentId_attendantKey: { establishmentId, attendantKey: key } },
  });
  if (exact) return exact;

  // 2. Fallback: parse "code-name" and match by name only (handles code drift)
  const dash = key.indexOf('-');
  const nameOnly = dash === -1 ? key : key.slice(dash + 1);
  const candidates = await prisma.attendant.findMany({ where: { establishmentId } });
  return candidates.find((a) => norm(a.name) === nameOnly) || null;
}

/**
 * Build a quick map of attendantKey -> { name, photoUrl } for an establishment,
 * used to enrich the customer-facing attendant list / history with photos.
 */
async function photoMap(establishmentId) {
  const rows = await prisma.attendant.findMany({
    where:  { establishmentId },
    select: { attendantKey: true, name: true, photoUrl: true },
  });
  const map = new Map();
  for (const r of rows) map.set(r.attendantKey, { name: r.name, photoUrl: r.photoUrl });
  return map;
}

module.exports = {
  listAttendants,
  createAttendant,
  updateAttendant,
  deleteAttendant,
  uploadPhoto,
  syncFromTransactions,
  matchByRaw,
  photoMap,
  buildKey,
  norm,
};
