/**
 * Pushes a fueling to the PostoCash API. Zero external deps — uses Node's
 * built-in http/https. Auth via the shared AGENT_TOKEN (Bearer).
 */
const http = require('http');
const https = require('https');
const { URL } = require('url');

function postAbastecimento(apiUrl, token, body, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    let u;
    try { u = new URL('/pista/abastecimentos', apiUrl); } catch (e) { return reject(e); }
    const data = JSON.stringify(body);
    const lib = u.protocol === 'https:' ? https : http;
    const req = lib.request(
      {
        hostname: u.hostname,
        port: u.port || (u.protocol === 'https:' ? 443 : 80),
        path: u.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(data),
          Authorization: `Bearer ${token}`,
          'ngrok-skip-browser-warning': 'true',
        },
      },
      (res) => {
        let raw = '';
        res.on('data', (d) => { raw += d; });
        res.on('end', () => resolve({ status: res.statusCode, body: raw }));
      }
    );
    req.on('error', reject);
    req.setTimeout(timeoutMs, () => req.destroy(new Error('timeout na requisição à nuvem')));
    req.write(data);
    req.end();
  });
}

// Fetches the concentrador TCP settings configured remotely (Painel da Pista →
// Concentrador), so the agent doesn't need someone editing its local .env on
// every change. Read-only; the agent falls back to local .env if this fails.
function getConcentradorConfig(apiUrl, token, establishmentId, timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    let u;
    try { u = new URL(`/pista/abastecimentos/config?establishmentId=${encodeURIComponent(establishmentId)}`, apiUrl); } catch (e) { return reject(e); }
    const lib = u.protocol === 'https:' ? https : http;
    const req = lib.request(
      {
        hostname: u.hostname,
        port: u.port || (u.protocol === 'https:' ? 443 : 80),
        path: u.pathname + u.search,
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
          'ngrok-skip-browser-warning': 'true',
        },
      },
      (res) => {
        let raw = '';
        res.on('data', (d) => { raw += d; });
        res.on('end', () => resolve({ status: res.statusCode, body: raw }));
      }
    );
    req.on('error', reject);
    req.setTimeout(timeoutMs, () => req.destroy(new Error('timeout na requisição à nuvem')));
    req.end();
  });
}

// Reports the agent is alive (and whether it's currently connected to the
// concentrador) every ~20s, independent of fueling activity — lets the admin
// screen show online/offline instead of just the saved connection settings.
function postHeartbeat(apiUrl, token, body, timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    let u;
    try { u = new URL('/pista/abastecimentos/heartbeat', apiUrl); } catch (e) { return reject(e); }
    const data = JSON.stringify(body);
    const lib = u.protocol === 'https:' ? https : http;
    const req = lib.request(
      {
        hostname: u.hostname,
        port: u.port || (u.protocol === 'https:' ? 443 : 80),
        path: u.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(data),
          Authorization: `Bearer ${token}`,
          'ngrok-skip-browser-warning': 'true',
        },
      },
      (res) => {
        let raw = '';
        res.on('data', (d) => { raw += d; });
        res.on('end', () => resolve({ status: res.statusCode, body: raw }));
      }
    );
    req.on('error', reject);
    req.setTimeout(timeoutMs, () => req.destroy(new Error('timeout na requisição à nuvem')));
    req.write(data);
    req.end();
  });
}

module.exports = { postAbastecimento, getConcentradorConfig, postHeartbeat };
