require('dotenv').config();

module.exports = {
  host:            process.env.CONCENTRADOR_HOST || '127.0.0.1',
  port:            parseInt(process.env.CONCENTRADOR_PORT || '2001', 10),
  pollIntervalMs:  parseInt(process.env.POLL_INTERVAL_MS || '1000', 10),
  retryIntervalMs: parseInt(process.env.RETRY_INTERVAL_MS || '5000', 10),
  socketTimeoutMs: parseInt(process.env.SOCKET_TIMEOUT_MS || '8000', 10),
  useChecksum:     String(process.env.USE_CHECKSUM || 'false').toLowerCase() === 'true',
  // 'identified' -> "(&A67)" identified read (§3.1.3, captures the Identfid/frentista)
  // 'plain'      -> "(&A)" plain read (§3.1.1)
  readMode:        (process.env.READ_MODE || 'identified').toLowerCase() === 'plain' ? 'plain' : 'identified',
  apiUrl:          process.env.POSTOCASH_API_URL || 'http://127.0.0.1:3000',
  agentToken:      process.env.AGENT_TOKEN || '',
  establishmentId: process.env.ESTABLISHMENT_ID || '',
};
