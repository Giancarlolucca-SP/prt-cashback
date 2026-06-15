/**
 * Minimal fake concentrator for local testing (stands in for SimuladorCBC).
 * Listens on 127.0.0.1:2001 and speaks the CBC parens protocol:
 *   (&S...) -> a plausible status frame
 *   (&A...) -> the next queued fueling, or (0) when the pointer is past the end
 *   (&I...) -> advances the pointer (no reply, per spec)
 *
 * Run:  node test/fake-concentrator.js   (or  npm run fake)
 */
const net = require('net');

const HOST = process.env.FAKE_HOST || '127.0.0.1';
const PORT = parseInt(process.env.FAKE_PORT || '2001', 10);

// Fueling #1 = the DT435 §3.1.1 worked example (registro 683).
const F1 = '00038600386010003E001C0812164002068300000807890098';
// Fueling #2 = same layout, different registro (0684) + encerrante -> distinct.
const F2 = F1.slice(0, 32) + '0684' + '0000080900' + F1.slice(46);

const FUELINGS = [F1, F2];
let pointer = 0;

const STATUS = '(S' + 'P'.repeat(32) + '00' + '00' + '6' + '0100' + '0100' + '1' + '00)';

const server = net.createServer((sock) => {
  sock.setEncoding('latin1');
  let buf = '';
  console.log(`[fake] cliente conectado de ${sock.remoteAddress}:${sock.remotePort}`);

  sock.on('data', (d) => {
    buf += d;
    let open;
    let close;
    while ((open = buf.indexOf('(')) !== -1 && (close = buf.indexOf(')', open + 1)) !== -1) {
      const content = buf.slice(open + 1, close);
      buf = buf.slice(close + 1);
      const header = content.slice(0, 2);

      if (header === '&A') {
        const reply = pointer < FUELINGS.length ? `(${FUELINGS[pointer]})` : '(0)';
        console.log(`[fake] (&A) -> ${reply}`);
        sock.write(reply, 'latin1');
      } else if (header === '&I') {
        if (pointer < FUELINGS.length) pointer += 1;
        console.log(`[fake] (&I) -> ponteiro agora = ${pointer}`);
        // no reply (spec: &I não retorna parâmetros)
      } else if (header === '&S') {
        console.log('[fake] (&S) -> status');
        sock.write(STATUS, 'latin1');
      } else {
        console.log(`[fake] comando ignorado: ${content}`);
      }
    }
  });

  sock.on('error', (e) => console.log('[fake] erro de socket:', e.message));
  sock.on('close', () => console.log('[fake] cliente desconectado'));
});

server.listen(PORT, HOST, () => {
  console.log(`[fake] concentrador simulado ouvindo em ${HOST}:${PORT} — ${FUELINGS.length} abastecimento(s) na fila`);
});
