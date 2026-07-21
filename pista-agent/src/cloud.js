/**
 * Talks to the PostoCash API. Zero external deps — uses Node's built-in
 * http/https. Auth via the shared AGENT_TOKEN (Bearer).
 */
const http = require('http');
const https = require('https');
const { URL } = require('url');

// Caps how much of a response body we'll buffer in memory — guards against an
// unexpected huge/streaming response (misconfigured proxy, HTML error page
// from an intermediary, runaway body) growing unbounded before 'end' fires.
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024; // 2MB — every real response here is small JSON

function request(apiUrl, path, { method = 'GET', token, body, timeoutMs = 15000 } = {}) {
  return new Promise((resolve, reject) => {
    let u;
    try { u = new URL(path, apiUrl); } catch (e) { return reject(e); }
    const data = body != null ? JSON.stringify(body) : null;
    const lib = u.protocol === 'https:' ? https : http;
    const headers = {
      Authorization: `Bearer ${token}`,
      'ngrok-skip-browser-warning': 'true',
    };
    if (data != null) {
      headers['Content-Type'] = 'application/json';
      headers['Content-Length'] = Buffer.byteLength(data);
    }
    let settled = false;
    const done = (fn, arg) => { if (!settled) { settled = true; clearTimeout(deadline); fn(arg); } };

    const req = lib.request(
      {
        hostname: u.hostname,
        port: u.port || (u.protocol === 'https:' ? 443 : 80),
        path: u.pathname + u.search,
        method,
        headers,
      },
      (res) => {
        let raw = '';
        let bytes = 0;
        res.on('data', (d) => {
          bytes += d.length;
          if (bytes > MAX_RESPONSE_BYTES) {
            req.destroy();
            done(reject, new Error('resposta da nuvem excedeu o tamanho máximo esperado'));
            return;
          }
          raw += d;
        });
        res.on('end', () => done(resolve, { status: res.statusCode, body: raw }));
      }
    );
    req.on('error', (err) => done(reject, err));

    // req.setTimeout() is an INACTIVITY timer — it resets on every byte of
    // activity, so a slow-trickle response (one byte every timeoutMs-1ms)
    // would never time out. This is a real deadline: fires timeoutMs after
    // the request started, no matter what.
    const deadline = setTimeout(() => {
      req.destroy();
      done(reject, new Error('timeout na requisição à nuvem'));
    }, timeoutMs);

    if (data != null) req.write(data);
    req.end();
  });
}

function postAbastecimento(apiUrl, token, body, timeoutMs = 15000) {
  return request(apiUrl, '/pista/abastecimentos', { method: 'POST', token, body, timeoutMs });
}

// Fetches the concentrador TCP settings configured remotely (Painel da Pista →
// Concentrador), so the agent doesn't need someone editing its local .env on
// every change. Read-only; the agent falls back to local .env if this fails.
function getConcentradorConfig(apiUrl, token, establishmentId, timeoutMs = 8000) {
  const path = `/pista/abastecimentos/config?establishmentId=${encodeURIComponent(establishmentId)}`;
  return request(apiUrl, path, { method: 'GET', token, timeoutMs });
}

// Reports the agent is alive (and whether it's currently connected to the
// concentrador) every ~20s, independent of fueling activity — lets the admin
// screen show online/offline instead of just the saved connection settings.
function postHeartbeat(apiUrl, token, body, timeoutMs = 8000) {
  return request(apiUrl, '/pista/abastecimentos/heartbeat', { method: 'POST', token, body, timeoutMs });
}

module.exports = { postAbastecimento, getConcentradorConfig, postHeartbeat };
