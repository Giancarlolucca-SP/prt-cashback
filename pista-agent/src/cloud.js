/**
 * Talks to the PostoCash API. Zero external deps — uses Node's built-in
 * http/https. Auth via the shared AGENT_TOKEN (Bearer).
 */
const http = require('http');
const https = require('https');
const { URL } = require('url');

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
        res.on('data', (d) => { raw += d; });
        res.on('end', () => resolve({ status: res.statusCode, body: raw }));
      }
    );
    req.on('error', reject);
    req.setTimeout(timeoutMs, () => req.destroy(new Error('timeout na requisição à nuvem')));
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
