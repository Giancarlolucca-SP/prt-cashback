const { PrismaClient } = require('@prisma/client');
const { createError } = require('../middlewares/errorMiddleware');

const prisma = new PrismaClient();

const DEFAULTS = {
  host:            '127.0.0.1',
  port:            2001,
  pollIntervalMs:  1000,
  retryIntervalMs: 5000,
  socketTimeoutMs: 8000,
  useChecksum:     false,
  readMode:        'identified',
};

function serialize(c) {
  return {
    host:            c.host,
    port:            c.port,
    pollIntervalMs:  c.pollIntervalMs,
    retryIntervalMs: c.retryIntervalMs,
    socketTimeoutMs: c.socketTimeoutMs,
    useChecksum:     c.useChecksum,
    readMode:        c.readMode,
    updatedAt:       c.updatedAt,
    lastHeartbeatAt: c.lastHeartbeatAt,
    lastHeartbeatOk: c.lastHeartbeatOk,
    lastError:       c.lastError,
    agentVersion:    c.agentVersion,
  };
}

function validate({ port, readMode, pollIntervalMs, retryIntervalMs, socketTimeoutMs }) {
  if (port != null && (!Number.isInteger(port) || port < 1 || port > 65535)) {
    throw createError('Porta deve ser um número inteiro entre 1 e 65535.', 400);
  }
  if (readMode != null && !['identified', 'plain'].includes(readMode)) {
    throw createError('Modo de leitura inválido. Use "identified" ou "plain".', 400);
  }
  for (const [label, v] of [['Intervalo de leitura', pollIntervalMs], ['Intervalo de nova tentativa', retryIntervalMs], ['Timeout do socket', socketTimeoutMs]]) {
    if (v != null && (!Number.isInteger(v) || v < 100)) {
      throw createError(`${label} deve ser um número inteiro (ms) maior ou igual a 100.`, 400);
    }
  }
}

async function getConfig(establishmentId) {
  const config = await prisma.concentradorConfig.upsert({
    where:  { establishmentId },
    create: { establishmentId, ...DEFAULTS },
    update: {},
  });
  return { configuracao: serialize(config) };
}

async function updateConfig(data, establishmentId) {
  const { host, port, pollIntervalMs, retryIntervalMs, socketTimeoutMs, useChecksum, readMode } = data;
  validate({ port, readMode, pollIntervalMs, retryIntervalMs, socketTimeoutMs });

  const config = await prisma.concentradorConfig.upsert({
    where: { establishmentId },
    create: {
      establishmentId,
      host:            host?.trim()    || DEFAULTS.host,
      port:            port            ?? DEFAULTS.port,
      pollIntervalMs:  pollIntervalMs  ?? DEFAULTS.pollIntervalMs,
      retryIntervalMs: retryIntervalMs ?? DEFAULTS.retryIntervalMs,
      socketTimeoutMs: socketTimeoutMs ?? DEFAULTS.socketTimeoutMs,
      useChecksum:     useChecksum     ?? DEFAULTS.useChecksum,
      readMode:        readMode        ?? DEFAULTS.readMode,
    },
    update: {
      ...(host    != null && { host: host.trim() }),
      ...(port    != null && { port }),
      ...(pollIntervalMs  != null && { pollIntervalMs }),
      ...(retryIntervalMs != null && { retryIntervalMs }),
      ...(socketTimeoutMs != null && { socketTimeoutMs }),
      ...(useChecksum != null && { useChecksum }),
      ...(readMode    != null && { readMode }),
    },
  });

  return { mensagem: 'Configuração do concentrador salva com sucesso! Reinicie o agente da pista para aplicar.', configuracao: serialize(config) };
}

// Agent-facing lookup: the agent authenticates with the shared AGENT_TOKEN (no
// establishment identity of its own), so it must pass its establishmentId explicitly.
async function getConfigForAgent(establishmentId) {
  if (!establishmentId) throw createError('establishmentId é obrigatório.', 400);
  const config = await prisma.concentradorConfig.findUnique({ where: { establishmentId } });
  return { configuracao: config ? serialize(config) : null };
}

// Agent-facing: reports whether it's currently connected to the concentrador,
// sent every ~20s regardless of fueling activity so idle stations don't look
// "offline" on the admin screen just because nobody has fueled in a while.
async function recordHeartbeat(establishmentId, { connected, error, agentVersion } = {}) {
  if (!establishmentId) throw createError('establishmentId é obrigatório.', 400);
  await prisma.concentradorConfig.upsert({
    where:  { establishmentId },
    create: {
      establishmentId, ...DEFAULTS,
      lastHeartbeatAt: new Date(),
      lastHeartbeatOk: !!connected,
      lastError:       error || null,
      agentVersion:    agentVersion || null,
    },
    update: {
      lastHeartbeatAt: new Date(),
      lastHeartbeatOk: !!connected,
      lastError:       error || null,
      ...(agentVersion != null && { agentVersion }),
    },
  });
  return { ok: true };
}

module.exports = { getConfig, updateConfig, getConfigForAgent, recordHeartbeat, DEFAULTS };
