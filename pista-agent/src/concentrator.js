/**
 * TCP client for the CBC/Companytec concentrator (or the SimuladorCBC emulator).
 * Speaks the parens-framed ASCII protocol. READ-ONLY commands only.
 */
const net = require('net');
const { extractFrame, checksum } = require('./protocol');

class Concentrator {
  constructor({ host, port, timeoutMs = 8000 }) {
    this.host = host;
    this.port = port;
    this.timeoutMs = timeoutMs;
    this.sock = null;
    this.buffer = '';
  }

  connect() {
    return new Promise((resolve, reject) => {
      this.buffer = '';
      const s = net.createConnection({ host: this.host, port: this.port });
      this.sock = s;
      s.setEncoding('latin1'); // 1 byte = 1 char (ASCII protocol)
      let settled = false;
      s.once('connect', () => { settled = true; resolve(); });
      s.on('data', (d) => { this.buffer += d; });
      s.once('error', (err) => { if (!settled) { settled = true; reject(err); } });
      s.once('close', () => { /* surfaced via sendCommand failures */ });
    });
  }

  /**
   * Send a read-only command. `header` must be &A, &I or &S.
   * Resolves with the content BETWEEN the response parens (or null when no
   * response is expected, e.g. &I).
   */
  sendCommand(header, { withChecksum = false, expectResponse = true, responseTimeoutMs = null } = {}) {
    if (!['&A', '&I', '&S'].includes(header)) {
      return Promise.reject(new Error(`Comando não permitido (somente leitura): ${header}`));
    }
    const cmd = withChecksum ? `(${header}${checksum(header)})` : `(${header})`;
    return new Promise((resolve, reject) => {
      if (!this.sock || this.sock.destroyed) return reject(new Error('socket não conectado'));
      this.buffer = '';
      this.sock.write(cmd, 'latin1');

      if (!expectResponse) { setTimeout(() => resolve(null), 150); return; }

      const limit = responseTimeoutMs || this.timeoutMs;
      const start = Date.now();
      const iv = setInterval(() => {
        const fr = extractFrame(this.buffer);
        if (fr) { clearInterval(iv); this.buffer = fr.rest; resolve(fr.content); return; }
        if (Date.now() - start > limit) {
          clearInterval(iv);
          reject(new Error(`timeout aguardando resposta de "${header}"`));
        }
      }, 20);
    });
  }

  close() { try { if (this.sock) this.sock.destroy(); } catch { /* ignore */ } this.sock = null; }
}

module.exports = Concentrator;
