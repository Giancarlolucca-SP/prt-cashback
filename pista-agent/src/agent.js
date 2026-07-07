/**
 * Read-loop state machine:
 *   connect -> read status (&S) -> read fueling (&A)
 *   if a valid fueling: persist locally -> POST to cloud
 *     -> ONLY on cloud success send (&I) to advance the pointer -> read next
 *   if "(0)"/empty: wait POLL_INTERVAL and poll again
 *   reconnect on socket error; keep the pointer (retry) while the cloud is down.
 */
const config = require('./config');
const log = require('./logger');
const proto = require('./protocol');
const queue = require('./queue');
const cloud = require('./cloud');
const Concentrator = require('./concentrator');
const pkg = require('../package.json');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const HEARTBEAT_INTERVAL_MS = 20000;

// Updated by the main loop on every connect success/failure; read by the
// heartbeat timer below. Kept independent of the read loop so a heartbeat
// still goes out even while the loop is blocked waiting on a slow socket.
const state = { connected: false, lastError: null };

function startHeartbeat() {
  const send = () => {
    cloud.postHeartbeat(config.apiUrl, config.agentToken, {
      establishmentId: config.establishmentId,
      connected: state.connected,
      error: state.lastError,
      agentVersion: pkg.version,
    }).catch((e) => log.warn('Heartbeat falhou (sem impacto na leitura):', e.message));
  };
  // No immediate call: at t=0 the first connect() attempt hasn't resolved yet,
  // so `state.connected` would still read its stale initial value and report
  // a false "offline". The first real heartbeat fires once state is accurate.
  return setInterval(send, HEARTBEAT_INTERVAL_MS);
}

function validateConfig() {
  const missing = [];
  if (!config.agentToken) missing.push('AGENT_TOKEN');
  if (!config.establishmentId) missing.push('ESTABLISHMENT_ID');
  if (!config.apiUrl) missing.push('POSTOCASH_API_URL');
  if (missing.length) {
    log.error('Configuração faltando no .env:', missing.join(', '));
    process.exit(1);
  }
}

// Concentrador connection settings (host/port/timeouts/checksum/readMode) are
// configurable remotely (Painel da Pista → Concentrador) so a station doesn't
// need someone editing its local .env on every change. Fetched once at
// startup; falls back to local .env values if the cloud is unreachable or no
// remote config has been saved yet.
async function loadRemoteConfig() {
  try {
    const res = await cloud.getConcentradorConfig(config.apiUrl, config.agentToken, config.establishmentId);
    if (res.status < 200 || res.status >= 300) {
      log.warn(`Config remota indisponível (HTTP ${res.status}); usando valores locais do .env.`);
      return;
    }
    const remote = JSON.parse(res.body).configuracao;
    if (!remote) {
      log.info('Nenhuma configuração remota salva ainda; usando valores locais do .env.');
      return;
    }
    Object.assign(config, {
      host:            remote.host,
      port:            remote.port,
      pollIntervalMs:  remote.pollIntervalMs,
      retryIntervalMs: remote.retryIntervalMs,
      socketTimeoutMs: remote.socketTimeoutMs,
      useChecksum:     remote.useChecksum,
      readMode:        remote.readMode,
    });
    log.info('Configuração do concentrador carregada da nuvem.', remote);
  } catch (e) {
    log.warn('Falha ao buscar configuração remota; usando valores locais do .env.', e.message);
  }
}

function toPayload(f) {
  return {
    establishmentId: config.establishmentId,
    registro:        f.registro,
    nozzleCode:      f.nozzleCode,
    fuelCode:        f.fuelCode,
    volumeLiters:    f.volumeLiters,
    totalValue:      f.totalValue,
    unitPrice:       f.unitPrice,
    fuelingDateTime: new Date(f.fuelingDateTime).toISOString(),
    encerranteFinal: f.encerranteFinal,
    attendantTag:    f.attendantTag || null,
    identfidCode:    f.identfidCode || null,
    rawPayload:      f.rawContent,
  };
}

async function pushToCloud(f) {
  try {
    const res = await cloud.postAbastecimento(config.apiUrl, config.agentToken, toPayload(f));
    if (res.status >= 200 && res.status < 300) {
      let dup = false;
      try { dup = JSON.parse(res.body).duplicado === true; } catch { /* ignore */ }
      return { ok: true, status: res.status, dup };
    }
    return { ok: false, status: res.status, body: res.body };
  } catch (err) {
    return { ok: false, err };
  }
}

async function runLoop() {
  validateConfig();
  await loadRemoteConfig();
  const identified = config.readMode === 'identified';
  log.info('Agente da Pista iniciando', {
    concentrador: `${config.host}:${config.port}`,
    api: config.apiUrl,
    establishmentId: config.establishmentId,
    readMode: config.readMode,
    comando: identified ? '(&A67)' : '(&A)',
  });
  log.info(`Fila local pendente: ${queue.pendingCount()} abastecimento(s).`);
  startHeartbeat();

  // Identified read uses the checksummed command "(&A67)". Plain read starts
  // without checksum and toggles on if the concentrator ignores "(&A)".
  let useChecksum = identified ? true : config.useChecksum;

  // Outer loop: (re)connect forever
  while (true) {
    const conc = new Concentrator({ host: config.host, port: config.port, timeoutMs: config.socketTimeoutMs });
    try {
      log.step(`Conectando ao concentrador ${config.host}:${config.port}…`);
      await conc.connect();
      log.info('Conectado ao concentrador.');
      state.connected = true;
      state.lastError = null;

      // Read status once
      try {
        const st = await conc.sendCommand(proto.CMD.STATUS, { withChecksum: useChecksum });
        log.info('Status (&S):', st);
      } catch (e) {
        log.warn('Leitura de status (&S) falhou:', e.message);
      }

      // Inner loop: read -> push -> increment
      while (true) {
        let content;
        try {
          content = await conc.sendCommand(proto.CMD.READ_FUELING, { withChecksum: useChecksum });
        } catch (e) {
          // Plain mode only: if "(&A)" is ignored, retry once with checksum "(&A67)".
          if (!identified && !useChecksum) {
            log.warn('Sem resposta para "(&A)"; alternando para checksum "(&A67)".');
            useChecksum = true;
            continue;
          }
          throw e; // bubble up -> reconnect
        }

        let fueling;
        try {
          fueling = proto.parseFuelingResponse(content);  // auto-detects identified (73) vs plain (50)
        } catch (e) {
          log.warn('Falha ao interpretar resposta:', e.message, '| bruto:', content);
          await sleep(config.pollIntervalMs);
          continue;
        }

        if (!fueling) { await sleep(config.pollIntervalMs); continue; } // (0) = nenhum

        // Raw payload logged so we can confirm field offsets (esp. the identifier) live.
        log.info(`Resposta bruta [${fueling.mode}] (${(content || '').length} chars): ${content}`);
        log.step('Abastecimento lido:', {
          registro: fueling.registro,
          bico: fueling.nozzleCode,
          litros: fueling.volumeLiters,
          valor: fueling.totalValue,
          precoLitro: fueling.unitPrice,
          dataHora: new Date(fueling.fuelingDateTime).toLocaleString('pt-BR'),
          encerranteFinal: fueling.encerranteFinal,
          memStatus: fueling.memStatus,
        });
        if (fueling.mode === 'identified') {
          if (fueling.identfidCode) {
            log.info(`Identificador (frentista): "${fueling.identfidCode}" | I[16] bruto offset 49..65 = "${fueling.identifierRaw}"`);
          } else {
            log.info(`Sem identificador neste abastecimento (I[16] em branco = "${fueling.identifierRaw}").`);
          }
        }

        // Durability BEFORE advancing the pointer
        const isNew = queue.persist(fueling);
        log.info(isNew ? 'Persistido na fila local.' : 'Já estava na fila local.');

        log.step('Enviando para a nuvem (POST /pista/abastecimentos)…');
        const result = await pushToCloud(fueling);

        if (result.ok) {
          log.info(`Nuvem confirmou (HTTP ${result.status})${result.dup ? ' [duplicado — idempotente]' : ''}.`);
          log.step('Avançando ponteiro de leitura (&I).');
          try {
            await conc.sendCommand(proto.CMD.INCREMENT, { withChecksum: useChecksum, expectResponse: false });
          } catch (e) {
            log.warn('Incremento (&I) falhou:', e.message);
          }
          queue.confirm(fueling);
        } else {
          const why = result.err ? result.err.message : `HTTP ${result.status} ${result.body || ''}`;
          log.error(`Falha ao enviar para a nuvem: ${why}. Mantendo o ponteiro; nova tentativa em ${config.retryIntervalMs}ms.`);
          await sleep(config.retryIntervalMs);
        }
      }
    } catch (e) {
      log.error('Erro de comunicação com o concentrador:', e.message, `— reconectando em ${config.retryIntervalMs}ms.`);
      state.connected = false;
      state.lastError = e.message;
      conc.close();
      await sleep(config.retryIntervalMs);
    }
  }
}

module.exports = { runLoop };
