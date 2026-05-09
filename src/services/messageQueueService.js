const { PrismaClient } = require('@prisma/client');
const whatsappService = require('./whatsappService');

const prisma = new PrismaClient();

// Horário de envio permitido (BRT = UTC-3)
const SEND_HOUR_START = 8;   // 08:00
const SEND_HOUR_END   = 20;  // 20:00

// Intervalo base entre mensagens (ms) — randomizado em 3–6 s pelo worker
const BASE_INTERVAL_MS = 4000;
const MAX_RETRIES      = 3;

// ── Helpers ───────────────────────────────────────────────────────────────────

function getCurrentHourBRT() {
  const now = new Date();
  // Converte para BRT (UTC-3)
  const brt = new Date(now.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
  return brt.getHours();
}

function isWithinSendingHours() {
  const hour = getCurrentHourBRT();
  return hour >= SEND_HOUR_START && hour < SEND_HOUR_END;
}

function randomDelay() {
  // 3 a 6 segundos — variação evita detecção de padrão por spam
  return 3000 + Math.floor(Math.random() * 3000);
}

// ── addToQueue ────────────────────────────────────────────────────────────────

async function addToQueue(messages) {
  if (!messages || messages.length === 0) return { queued: 0, estimatedMinutes: 0 };

  const records = messages.map((m) => ({
    establishmentId: m.establishmentId,
    campaignId:      m.campaignId ?? null,
    customerId:      m.customerId ?? null,
    customerPhone:   m.phone,
    customerName:    m.name,
    message:         m.message,
    status:          'PENDING',
    priority:        m.priority ?? 0,
  }));

  await prisma.messageQueue.createMany({ data: records });

  const totalPending = await prisma.messageQueue.count({ where: { status: 'PENDING' } });
  const estimatedMinutes = Math.ceil((totalPending * BASE_INTERVAL_MS) / 60000);

  console.log(`[FILA] ${records.length} mensagens adicionadas. Total na fila: ${totalPending}`);

  return {
    queued:            records.length,
    estimatedMinutes,
    previsao:          buildEstimateText(estimatedMinutes),
  };
}

// ── processNextMessage ────────────────────────────────────────────────────────
// Called by the worker each cycle. Processes exactly one message.

async function processNextMessage() {
  if (!isWithinSendingHours()) {
    return { skipped: true, reason: 'Fora do horário de envio (08:00–20:00 BRT)' };
  }

  // Pick oldest PENDING message (FIFO, high priority first)
  const msg = await prisma.messageQueue.findFirst({
    where:   { status: 'PENDING' },
    orderBy: [{ priority: 'desc' }, { scheduledAt: 'asc' }],
  });

  if (!msg) return { empty: true };

  // Mark as PROCESSING to prevent double-pick in concurrent scenarios
  await prisma.messageQueue.update({
    where: { id: msg.id },
    data:  { status: 'PROCESSING' },
  });

  const maskedPhone = msg.customerPhone
    ? `${msg.customerPhone.slice(0, 4)}****${msg.customerPhone.slice(-2)}`
    : '?';
  console.log(`[FILA] Enviando para ${msg.customerName} (${maskedPhone})…`);

  const result = await whatsappService.sendMessage(msg.customerPhone, msg.message);

  if (result.success) {
    await prisma.messageQueue.update({
      where: { id: msg.id },
      data:  { status: 'SENT', sentAt: new Date(), errorMessage: null },
    });
    console.log(`[FILA] ✅ Enviado para ${msg.customerName}`);
    return { sent: true, id: msg.id };
  }

  // Failed — retry or mark FAILED
  const newRetryCount = msg.retryCount + 1;

  if (newRetryCount >= MAX_RETRIES) {
    await prisma.messageQueue.update({
      where: { id: msg.id },
      data:  {
        status:       'FAILED',
        failedAt:     new Date(),
        retryCount:   newRetryCount,
        errorMessage: result.error ?? 'Falha ao enviar',
      },
    });
    console.warn(`[FILA] ❌ Falha definitiva para ${msg.customerName} (${newRetryCount} tentativas)`);
    return { failed: true, id: msg.id };
  }

  // Volta para PENDING para nova tentativa
  await prisma.messageQueue.update({
    where: { id: msg.id },
    data:  {
      status:       'PENDING',
      retryCount:   newRetryCount,
      errorMessage: result.error ?? 'Erro ao enviar',
      scheduledAt:  new Date(Date.now() + 60_000 * newRetryCount), // backoff
    },
  });
  console.warn(`[FILA] ⚠️ Tentativa ${newRetryCount}/${MAX_RETRIES} falhou para ${msg.customerName}`);
  return { retry: true, id: msg.id, attempt: newRetryCount };
}

// ── getQueueStatus ────────────────────────────────────────────────────────────

async function getQueueStatus(establishmentId) {
  const [pending, sent, failed, processing] = await Promise.all([
    prisma.messageQueue.count({ where: { establishmentId, status: 'PENDING' } }),
    prisma.messageQueue.count({ where: { establishmentId, status: 'SENT' } }),
    prisma.messageQueue.count({ where: { establishmentId, status: 'FAILED' } }),
    prisma.messageQueue.count({ where: { establishmentId, status: 'PROCESSING' } }),
  ]);

  const totalPending   = await prisma.messageQueue.count({ where: { status: { in: ['PENDING', 'PROCESSING'] } } });
  const estimatedMinutes = Math.ceil((totalPending * BASE_INTERVAL_MS) / 60000);

  return {
    pending,
    processing,
    sent,
    failed,
    estimatedMinutes,
    previsao:    buildEstimateText(estimatedMinutes),
    dentroHorario: isWithinSendingHours(),
  };
}

// ── getCampaignQueueStatus ────────────────────────────────────────────────────

async function getCampaignQueueStatus(campaignId) {
  const [pending, sent, failed, processing] = await Promise.all([
    prisma.messageQueue.count({ where: { campaignId, status: 'PENDING' } }),
    prisma.messageQueue.count({ where: { campaignId, status: 'SENT' } }),
    prisma.messageQueue.count({ where: { campaignId, status: 'FAILED' } }),
    prisma.messageQueue.count({ where: { campaignId, status: 'PROCESSING' } }),
  ]);

  const total          = pending + sent + failed + processing;
  const percentComplete = total > 0 ? Math.round(((sent + failed) / total) * 100) : 0;

  const totalPendingGlobal = await prisma.messageQueue.count({ where: { status: { in: ['PENDING', 'PROCESSING'] } } });
  const estimatedMinutes   = Math.ceil((totalPendingGlobal * BASE_INTERVAL_MS) / 60000);

  return {
    total,
    pending,
    processing,
    sent,
    failed,
    percentComplete,
    estimatedMinutes,
    previsao:       buildEstimateText(estimatedMinutes),
    completo:       total > 0 && pending === 0 && processing === 0,
    dentroHorario:  isWithinSendingHours(),
  };
}

// ── getGlobalQueueStatus ──────────────────────────────────────────────────────

async function getGlobalQueueStatus() {
  const [totalPending, totalSent, totalFailed, totalProcessing] = await Promise.all([
    prisma.messageQueue.count({ where: { status: 'PENDING' } }),
    prisma.messageQueue.count({ where: { status: 'SENT' } }),
    prisma.messageQueue.count({ where: { status: 'FAILED' } }),
    prisma.messageQueue.count({ where: { status: 'PROCESSING' } }),
  ]);

  // Sent today
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const sentToday = await prisma.messageQueue.count({
    where: { status: 'SENT', sentAt: { gte: startOfDay } },
  });

  // Distinct establishments with pending messages
  const postsInQueue = await prisma.messageQueue.groupBy({
    by:    ['establishmentId'],
    where: { status: { in: ['PENDING', 'PROCESSING'] } },
  });

  const estimatedMinutes   = Math.ceil(((totalPending + totalProcessing) * BASE_INTERVAL_MS) / 60000);

  return {
    totalPending,
    totalProcessing,
    totalSent,
    totalSentToday: sentToday,
    totalFailed,
    postsInQueue:      postsInQueue.length,
    estimatedClearTime: buildEstimateText(estimatedMinutes),
    dentroHorario:      isWithinSendingHours(),
    workerAtivo:        true, // se chegou aqui, o processo está rodando
  };
}

// ── buildEstimateText ─────────────────────────────────────────────────────────

function buildEstimateText(minutes) {
  if (minutes <= 0)   return 'Sem mensagens pendentes';
  if (minutes === 1)  return 'Aproximadamente 1 minuto';
  if (minutes < 60)   return `Aproximadamente ${minutes} minutos`;
  const hours   = Math.floor(minutes / 60);
  const restMin = minutes % 60;
  if (restMin === 0) {
    return hours === 1 ? 'Aproximadamente 1 hora' : `Aproximadamente ${hours} horas`;
  }
  return `Aproximadamente ${hours}h${restMin}min`;
}

module.exports = {
  addToQueue,
  processNextMessage,
  getQueueStatus,
  getCampaignQueueStatus,
  getGlobalQueueStatus,
  isWithinSendingHours,
  randomDelay,
};
