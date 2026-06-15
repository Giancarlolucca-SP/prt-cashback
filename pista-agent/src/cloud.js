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

module.exports = { postAbastecimento };
