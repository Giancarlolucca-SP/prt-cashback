/**
 * Mock concentrador — emite UM abastecimento IDENTIFICADO de HOJE.
 *
 * Para usar com o agente em READ_MODE=identified:
 *   "(&A67)" -> resposta de 73 chars (§3.1.3) com o I[16] preenchido.
 * Após "(&I)" o ponteiro avança e "(&A67)" passa a responder "(0)".
 *
 * Dados emitidos (fixos, exceto a data/hora que é a de AGORA):
 *   bico 4 · 16,25 L · R$ 18,24 · preço R$ 1,123/L · encerrante 1234,56 · registro 10
 *   identificador (I[16]) = "CARTAOTESTE00001"
 *
 * Rodar:  node test/mock-concentrador.js   (escuta em 127.0.0.1:2001)
 */
const net = require('net');

const HOST = process.env.MOCK_HOST || '127.0.0.1';
const PORT = parseInt(process.env.MOCK_PORT || '2001', 10);

// I[16] — código de teste fixo (16 caracteres). Mapeie EXATAMENTE este valor em Cartões.
const IDENTFID = 'CARTAOTESTE00001';

const pad = (n, w) => String(n).padStart(w, '0');

// Monta a resposta identificada (73 chars) com a data/hora de agora (BRT/local).
function buildIdentifiedFueling() {
  const now = new Date();
  const T = '001824';        // total 18,24  (vírgula 3A -> 2 casas)
  const L = '001625';        // volume 16,25 (2 casas)
  const P = '1123';          // preço 1,123  (3 casas)
  const V = '3A';            // código de vírgula: total 2 / volume 2 / preço 3
  const C = '0001';          // tempo (hex) — irrelevante p/ o teste
  const B = '04';            // bico 4 (hex)
  const D = pad(now.getDate(), 2);
  const H = pad(now.getHours(), 2);
  const M = pad(now.getMinutes(), 2);
  const N = pad(now.getMonth() + 1, 2);
  const R = '0010';          // registro 10 (decimal)
  const E = '0000123456';    // encerrante 1234,56 (2 casas, via correção do agente)
  const S = '00';            // status de memória ok
  const M2 = '0000', P2 = '00', K = '00'; // campos finais (não usados no teste)

  const core = T + L + P + V + C + B + D + H + M + N + R + E + S; // 48 chars
  const content = 'A' + core + IDENTFID + M2 + P2 + K;            // 1 + 48 + 16 + 4 + 2 + 2 = 73
  return `(${content})`;
}

const STATUS = '(S' + 'L'.repeat(32) + '00' + '00' + '6' + '0100' + '0100' + '1' + '00)';

let served = false; // serve o abastecimento uma vez; depois (&A) -> (0)

const server = net.createServer((sock) => {
  sock.setEncoding('latin1');
  let buf = '';
  console.log(`[mock] cliente conectado de ${sock.remoteAddress}:${sock.remotePort}`);

  sock.on('data', (d) => {
    buf += d;
    let open;
    let close;
    while ((open = buf.indexOf('(')) !== -1 && (close = buf.indexOf(')', open + 1)) !== -1) {
      const content = buf.slice(open + 1, close);
      buf = buf.slice(close + 1);
      const header = content.slice(0, 2); // ignora o checksum (ex.: &A67 -> &A)

      if (header === '&A') {
        if (!served) {
          const reply = buildIdentifiedFueling();
          console.log(`[mock] (&A) -> ${reply}  (73 chars, I[16]="${IDENTFID}")`);
          sock.write(reply, 'latin1');
        } else {
          console.log('[mock] (&A) -> (0)');
          sock.write('(0)', 'latin1');
        }
      } else if (header === '&I') {
        served = true;
        console.log('[mock] (&I) -> ponteiro avançado (próximo &A = (0))');
      } else if (header === '&S') {
        console.log('[mock] (&S) -> status');
        sock.write(STATUS, 'latin1');
      } else {
        console.log(`[mock] comando ignorado: ${content}`);
      }
    }
  });

  sock.on('error', (e) => console.log('[mock] erro de socket:', e.message));
  sock.on('close', () => console.log('[mock] cliente desconectado'));
});

server.listen(PORT, HOST, () => {
  console.log(`[mock] concentrador IDENTIFICADO ouvindo em ${HOST}:${PORT}`);
  console.log(`[mock] abastecimento: bico 4 · 16,25 L · R$ 18,24 · identfid="${IDENTFID}" · data=HOJE`);
});
