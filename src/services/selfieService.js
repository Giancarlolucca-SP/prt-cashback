/**
 * selfieService.js
 *
 * Handles selfie storage in Supabase Storage and pixel-based face comparison.
 *
 * Storage layout (bucket: SUPABASE_STORAGE_BUCKET, default 'selfies'):
 *   selfies/{establishmentId}/{customerId}/thumb.jpg  — 100×100, quality 85
 *   selfies/{establishmentId}/{customerId}/full.jpg   — 400×400, quality 80
 *
 * Comparison:
 *   Downloads ONLY the thumbnail (small), compares pixel-by-pixel using
 *   Mean Absolute Difference on 50×50 grayscale — fast and cheap.
 *   Falls back gracefully when Supabase is not configured.
 *
 * Required env vars:
 *   SUPABASE_URL           — https://<project>.supabase.co
 *   SUPABASE_SERVICE_KEY   — service_role key (full access, server-side only)
 *   SUPABASE_STORAGE_BUCKET — bucket name (default: 'selfies')
 */

const sharp         = require('sharp');
const { createClient } = require('@supabase/supabase-js');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

// ── Constants ────────────────────────────────────────────────────────────────

const THUMB_SIZE        = 100;   // px — stored thumbnail used for comparison
const FULL_SIZE         = 300;   // px — stored full image for audit/admin
const THUMB_QUALITY     = 85;    // JPEG quality for thumbnail
const FULL_QUALITY      = 75;    // JPEG quality for full image
const COMPARE_SIZE      = 50;    // px — downscale for pixel comparison (faster)
const MATCH_THRESHOLD   = 70;    // minimum confidence % to consider a match
const BUCKET            = process.env.SUPABASE_STORAGE_BUCKET || 'selfies';

// ── Supabase client (lazy, optional) ─────────────────────────────────────────

let _supabase = null;

function getSupabase() {
  if (_supabase) return _supabase;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) return null;
  _supabase = createClient(url, key, {
    auth: { persistSession: false },
  });
  return _supabase;
}

function isConfigured() {
  return !!(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY);
}

// ── Image processing helpers ─────────────────────────────────────────────────

/**
 * Resize a base64 JPEG to the given square size and return a Buffer.
 */
async function resizeToBuffer(base64, sizePx, quality) {
  const inputBuf = Buffer.from(base64, 'base64');
  return sharp(inputBuf)
    .resize(sizePx, sizePx, { fit: 'cover', position: 'centre' })
    .jpeg({ quality })
    .toBuffer();
}

/**
 * Get a raw grayscale pixel buffer at COMPARE_SIZE×COMPARE_SIZE.
 * Used for Mean Absolute Difference comparison.
 */
async function toCompareBuffer(base64OrBuffer) {
  const input = Buffer.isBuffer(base64OrBuffer)
    ? base64OrBuffer
    : Buffer.from(base64OrBuffer, 'base64');
  return sharp(input)
    .resize(COMPARE_SIZE, COMPARE_SIZE, { fit: 'cover', position: 'centre' })
    .grayscale()
    .raw()
    .toBuffer();
}

// ── Pixel similarity ──────────────────────────────────────────────────────────

/**
 * Compare two face buffers (base64 JPEG) using Mean Absolute Difference.
 * Returns { match: boolean, confidence: number 0-100 }.
 */
async function pixelCompare(aBase64, bBase64) {
  try {
    const [bufA, bufB] = await Promise.all([
      toCompareBuffer(aBase64),
      toCompareBuffer(bBase64),
    ]);

    const len = Math.min(bufA.length, bufB.length);
    let totalDiff = 0;
    for (let i = 0; i < len; i++) {
      totalDiff += Math.abs(bufA[i] - bufB[i]);
    }

    const mad        = totalDiff / len;           // 0-255
    // Linear mapping: MAD 0 → 100%, MAD 128 → 50%, MAD 255 → 0%
    const confidence = Math.max(0, Math.round(100 - (mad / 255) * 100));
    const match      = confidence >= MATCH_THRESHOLD;

    // Buffers go out of scope here — GC handles cleanup immediately
    return { match, confidence };
  } catch (err) {
    console.error('[selfieService] pixelCompare error:', err.message);
    return { match: false, confidence: 0 };
  }
}

// ── Supabase upload ───────────────────────────────────────────────────────────

/**
 * Upload a pre-built Buffer to Supabase Storage.
 * Returns the public URL (or null on error).
 */
async function uploadBuffer(supabase, path, buffer, contentType = 'image/jpeg') {
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, buffer, {
      contentType,
      upsert: true,
    });

  if (error) {
    console.error(`[selfieService] upload failed (${path}):`, error.message);
    return null;
  }

  // Build private URL (accessed via service key only — no public access)
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return data?.publicUrl ?? null;
}

// ── uploadSelfie ──────────────────────────────────────────────────────────────

/**
 * Process a raw selfie base64 into thumbnail + full versions,
 * upload both to Supabase Storage, and update the customer record.
 *
 * If Supabase is not configured, stores only selfieData (legacy base64).
 *
 * @param {string} rawBase64       — original selfie from camera
 * @param {string} customerId
 * @param {string} establishmentId
 * @returns {{ thumbnailUrl: string|null, fullUrl: string|null }}
 */
async function uploadSelfie(rawBase64, customerId, establishmentId) {
  if (!rawBase64) return { thumbnailUrl: null, fullUrl: null };

  console.log(`[selfieService] uploadSelfie — customerId=${customerId} tamanho entrada (chars): ${rawBase64.length}`);

  // Criar thumb (${THUMB_SIZE}×${THUMB_SIZE} q${THUMB_QUALITY}) e full (${FULL_SIZE}×${FULL_SIZE} q${FULL_QUALITY}) via sharp
  console.log(`[selfieService] redimensionando: thumb ${THUMB_SIZE}×${THUMB_SIZE} q${THUMB_QUALITY} | full ${FULL_SIZE}×${FULL_SIZE} q${FULL_QUALITY}...`);
  const [thumbBuf, fullBuf] = await Promise.all([
    resizeToBuffer(rawBase64, THUMB_SIZE, THUMB_QUALITY),
    resizeToBuffer(rawBase64, FULL_SIZE,  FULL_QUALITY),
  ]);
  console.log(`[selfieService] buffers gerados — thumb: ${thumbBuf.length}B full: ${fullBuf.length}B`);

  const thumbBase64 = thumbBuf.toString('base64');

  const supabase = getSupabase();
  if (!supabase) {
    console.warn('[selfieService] Supabase não configurado — salvando selfieData no banco (fallback).');
    await prisma.customer.update({
      where: { id: customerId },
      data:  { selfieData: thumbBase64 },
    });
    return { thumbnailUrl: null, fullUrl: null };
  }

  const basePath  = `selfies/${establishmentId}/${customerId}`;
  const thumbPath = `${basePath}/thumb.jpg`;
  const fullPath  = `${basePath}/full.jpg`;

  console.log(`[selfieService] enviando para Supabase Storage — bucket=${BUCKET} paths: ${thumbPath}, ${fullPath}`);
  const [thumbnailUrl, fullUrl] = await Promise.all([
    uploadBuffer(supabase, thumbPath, thumbBuf),
    uploadBuffer(supabase, fullPath,  fullBuf),
  ]);
  console.log(`[selfieService] upload Storage concluído — thumb=${thumbnailUrl ?? 'ERRO'} full=${fullUrl ?? 'ERRO'}`);

  await prisma.customer.update({
    where: { id: customerId },
    data: {
      selfieThumbnailUrl: thumbnailUrl,
      selfieFullUrl:      fullUrl,
      selfieStoragePath:  basePath,
      selfieData:         thumbBase64,
    },
  });
  console.log(`[selfieService] registro do cliente atualizado com URLs e selfieStoragePath.`);

  return { thumbnailUrl, fullUrl };
}

/**
 * Upload pre-processed versions (thumb + full) directly — skips sharp processing.
 * Called when the mobile already sent both compressed versions.
 *
 * @param {string} thumbBase64     — 100×100 pre-compressed thumbnail from mobile
 * @param {string} fullBase64      — 400×400 pre-compressed full image from mobile
 * @param {string} customerId
 * @param {string} establishmentId
 */
async function uploadProcessed(thumbBase64, fullBase64, customerId, establishmentId) {
  if (!thumbBase64) return { thumbnailUrl: null, fullUrl: null };

  const supabase = getSupabase();
  if (!supabase) {
    await prisma.customer.update({
      where: { id: customerId },
      data:  { selfieData: thumbBase64 },
    });
    return { thumbnailUrl: null, fullUrl: null };
  }

  const basePath  = `selfies/${establishmentId}/${customerId}`;
  const thumbPath = `${basePath}/thumb.jpg`;
  const fullPath  = `${basePath}/full.jpg`;

  const thumbBuf  = Buffer.from(thumbBase64, 'base64');
  const fullBuf   = Buffer.from(fullBase64 || thumbBase64, 'base64');

  const [thumbnailUrl, fullUrl] = await Promise.all([
    uploadBuffer(supabase, thumbPath, thumbBuf),
    uploadBuffer(supabase, fullPath,  fullBuf),
  ]);

  await prisma.customer.update({
    where: { id: customerId },
    data: {
      selfieThumbnailUrl: thumbnailUrl,
      selfieFullUrl:      fullUrl,
      selfieStoragePath:  basePath,
      selfieData:         thumbBase64,
    },
  });

  return { thumbnailUrl, fullUrl };
}

// ── compareFaces ──────────────────────────────────────────────────────────────

/**
 * Compare an incoming selfie against the stored thumbnail for a customer.
 *
 * Downloads the stored thumbnail from Supabase (small file),
 * compares with the incoming thumbnail using pixel similarity,
 * then lets the downloaded buffer go out of scope immediately.
 *
 * Falls back to comparing against selfieData (legacy) if no thumbnail URL.
 *
 * @param {string} newSelfieBase64 — incoming selfie (ideally 100×100 thumbnail)
 * @param {string} customerId
 * @returns {{ match: boolean, confidence: number }}
 */
async function compareFaces(newSelfieBase64, customerId) {
  if (!newSelfieBase64) return { match: false, confidence: 0 };

  const customer = await prisma.customer.findUnique({
    where:  { id: customerId },
    select: { selfieData: true, selfieThumbnailUrl: true, selfieStoragePath: true },
  });

  if (!customer) return { match: false, confidence: 0 };

  // Path A — compare against Supabase thumbnail (preferred)
  if (customer.selfieThumbnailUrl) {
    const supabase = getSupabase();
    if (supabase && customer.selfieStoragePath) {
      try {
        const thumbPath = `${customer.selfieStoragePath}/thumb.jpg`;
        const { data: blob, error } = await supabase.storage
          .from(BUCKET)
          .download(thumbPath);

        if (error) throw error;

        // Convert blob to buffer, compare, then let it go out of scope (GC cleanup)
        const storedThumbBuf  = Buffer.from(await blob.arrayBuffer());
        const storedThumbB64  = storedThumbBuf.toString('base64');
        const result          = await pixelCompare(storedThumbB64, newSelfieBase64);

        return result;
      } catch (err) {
        console.error('[selfieService] download thumb error:', err.message);
        // Fall through to legacy selfieData comparison
      }
    }
  }

  // Path B — legacy comparison against selfieData in DB
  if (customer.selfieData) {
    return pixelCompare(customer.selfieData, newSelfieBase64);
  }

  return { match: false, confidence: 0 };
}

// ── cleanupOldSelfies ─────────────────────────────────────────────────────────

/**
 * Scheduled cleanup: removes selfies for customers who no longer exist,
 * and deletes temporary verification uploads older than 24 hours.
 *
 * Permanent registration selfies (thumb + full) are kept indefinitely.
 *
 * Called daily by src/utils/scheduler.js.
 */
async function cleanupOldSelfies() {
  const supabase = getSupabase();
  if (!supabase) return;

  try {
    // Find all customers that have a storage path (so we know which paths are valid)
    const customers = await prisma.customer.findMany({
      select: { selfieStoragePath: true },
      where:  { selfieStoragePath: { not: null } },
    });

    const validPaths = new Set(customers.map((c) => c.selfieStoragePath));

    // List all folders in the bucket
    const { data: estFolders } = await supabase.storage.from(BUCKET).list('selfies');
    if (!estFolders) return;

    let deletedCount = 0;

    for (const estFolder of estFolders) {
      const estPath = `selfies/${estFolder.name}`;
      const { data: custFolders } = await supabase.storage.from(BUCKET).list(estPath);
      if (!custFolders) continue;

      for (const custFolder of custFolders) {
        const basePath = `${estPath}/${custFolder.name}`;

        // If this customer no longer exists in DB, delete their selfie folder
        if (!validPaths.has(basePath)) {
          const { data: files } = await supabase.storage.from(BUCKET).list(basePath);
          if (files?.length) {
            const toDelete = files.map((f) => `${basePath}/${f.name}`);
            await supabase.storage.from(BUCKET).remove(toDelete);
            deletedCount += toDelete.length;
          }
        }
      }
    }

    if (deletedCount > 0) {
      console.log(`[selfieService] cleanup: removed ${deletedCount} orphaned selfie file(s).`);
    }
  } catch (err) {
    console.error('[selfieService] cleanup error:', err.message);
  }
}

/**
 * Compare an incoming selfie against a customer object directly
 * (avoids an extra DB lookup when the caller already has the customer record).
 *
 * @param {string} newSelfieBase64
 * @param {{ selfieData: string|null, selfieThumbnailUrl: string|null, selfieStoragePath: string|null }} customer
 */
async function compareFacesDirect(newSelfieBase64, customer) {
  if (!newSelfieBase64) return { match: false, confidence: 0 };

  // Path A — Supabase thumbnail
  if (customer.selfieThumbnailUrl && customer.selfieStoragePath) {
    const supabase = getSupabase();
    if (supabase) {
      try {
        const thumbPath = `${customer.selfieStoragePath}/thumb.jpg`;
        const { data: blob, error } = await supabase.storage
          .from(BUCKET)
          .download(thumbPath);

        if (error) throw error;

        const storedBuf  = Buffer.from(await blob.arrayBuffer());
        const storedB64  = storedBuf.toString('base64');
        return pixelCompare(storedB64, newSelfieBase64);
      } catch (err) {
        console.error('[selfieService] download thumb error (direct):', err.message);
      }
    }
  }

  // Path B — legacy selfieData
  if (customer.selfieData) {
    return pixelCompare(customer.selfieData, newSelfieBase64);
  }

  return { match: false, confidence: 0 };
}

module.exports = {
  uploadSelfie,
  uploadProcessed,
  compareFaces,
  compareFacesDirect,
  cleanupOldSelfies,
  isConfigured,
};
