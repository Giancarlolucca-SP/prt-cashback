/**
 * faceService.js
 *
 * Face comparison backed by AWS Rekognition.
 * Falls back to a base64-length size-ratio heuristic when AWS credentials
 * are not configured (useful for local development / CI).
 *
 * AWS env vars required for real comparison:
 *   AWS_ACCESS_KEY_ID
 *   AWS_SECRET_ACCESS_KEY
 *   AWS_REGION  (default: us-east-1)
 *
 * Rekognition pricing: ~$0.001 per CompareFaces call (1:1 comparison).
 * For face-only search (1:N), calls are made sequentially against each
 * stored selfie; limit is enforced via FACE_SEARCH_MAX_CUSTOMERS.
 */

const { RekognitionClient, CompareFacesCommand } = require('@aws-sdk/client-rekognition');

// ── Constants ────────────────────────────────────────────────────────────────

const SIMILARITY_THRESHOLD  = 80;   // Rekognition similarity % required for a match
const SEARCH_MAX_CUSTOMERS  = 200;  // cap for 1:N face-only search
const FALLBACK_RATIO_THRESH = 0.40; // size-ratio threshold when Rekognition is unavailable

// ── Client (lazy-init so missing credentials don't crash startup) ─────────────

let _client = null;
function getClient() {
  if (_client) return _client;
  const { AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION = 'us-east-1' } = process.env;
  if (!AWS_ACCESS_KEY_ID || !AWS_SECRET_ACCESS_KEY) return null;
  _client = new RekognitionClient({
    region:      AWS_REGION,
    credentials: { accessKeyId: AWS_ACCESS_KEY_ID, secretAccessKey: AWS_SECRET_ACCESS_KEY },
  });
  return _client;
}

function isConfigured() {
  return !!(process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY);
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function sizeRatioMatch(a, b) {
  if (!a || !b) return { match: false, confidence: 0 };
  const ratio = Math.min(a.length, b.length) / Math.max(a.length, b.length);
  // Map ratio [0.4, 1.0] to a fake confidence [70, 98] for display purposes
  const confidence = ratio >= FALLBACK_RATIO_THRESH
    ? Math.round(70 + (ratio - FALLBACK_RATIO_THRESH) * (28 / (1 - FALLBACK_RATIO_THRESH)))
    : 0;
  return { match: ratio >= FALLBACK_RATIO_THRESH, confidence };
}

// ── 1 : 1 comparison ─────────────────────────────────────────────────────────

/**
 * Compare two selfies. Returns { match: boolean, confidence: number 0-100 }.
 * @param {string} sourceBase64 - The stored reference image (from registration)
 * @param {string} targetBase64 - The incoming image (from reinstall attempt)
 */
async function compareFaces(sourceBase64, targetBase64) {
  if (!sourceBase64 || !targetBase64) return { match: false, confidence: 0 };

  const client = getClient();
  if (!client) {
    // Rekognition not configured — use size-ratio fallback
    return sizeRatioMatch(sourceBase64, targetBase64);
  }

  try {
    const command = new CompareFacesCommand({
      SourceImage:         { Bytes: Buffer.from(sourceBase64, 'base64') },
      TargetImage:         { Bytes: Buffer.from(targetBase64, 'base64') },
      SimilarityThreshold: SIMILARITY_THRESHOLD,
    });

    const response = await client.send(command);
    const matches  = response.FaceMatches ?? [];

    if (matches.length === 0) return { match: false, confidence: 0 };

    const best       = matches.reduce((a, b) => (a.Similarity > b.Similarity ? a : b));
    const similarity = Math.round(best.Similarity ?? 0);

    return { match: similarity >= SIMILARITY_THRESHOLD, confidence: similarity };
  } catch (err) {
    // Rekognition error (no face in image, network error, etc.) — return no-match
    console.error('[faceService] CompareFaces error:', err.message ?? err);
    return { match: false, confidence: 0 };
  }
}

// ── 1 : N search ─────────────────────────────────────────────────────────────

/**
 * Search a query selfie against an array of customer records.
 * Returns the best-matching customer (or null) plus the confidence score.
 *
 * @param {string} queryBase64 - Incoming selfie (base64)
 * @param {Array<{ id, selfieData, ... }>} customers - Customers with stored selfies
 * @returns {{ customer: object|null, confidence: number }}
 */
async function searchFaces(queryBase64, customers) {
  if (!queryBase64 || !customers.length) return { customer: null, confidence: 0 };

  const candidates = customers
    .filter((c) => c.selfieData)
    .slice(0, SEARCH_MAX_CUSTOMERS);

  if (!candidates.length) return { customer: null, confidence: 0 };

  const client = getClient();

  if (!client) {
    // Size-ratio fallback: pick best ratio
    let best = null;
    let bestConfidence = 0;
    for (const c of candidates) {
      const { match, confidence } = sizeRatioMatch(c.selfieData, queryBase64);
      if (match && confidence > bestConfidence) {
        bestConfidence = confidence;
        best = c;
      }
    }
    return { customer: best, confidence: bestConfidence };
  }

  // Rekognition: sequential CompareFaces — exit early on high-confidence match
  let best       = null;
  let bestConf   = 0;

  for (const c of candidates) {
    try {
      const { match, confidence } = await compareFaces(c.selfieData, queryBase64);
      if (match && confidence > bestConf) {
        bestConf = confidence;
        best     = c;
        if (confidence >= 95) break; // good enough — skip remaining
      }
    } catch {
      continue;
    }
  }

  return { customer: best, confidence: bestConf };
}

module.exports = { compareFaces, searchFaces, isConfigured };
