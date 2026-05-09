const messageQueueService = require('../services/messageQueueService');

let active  = false;
let timer   = null;

async function tick() {
  try {
    await messageQueueService.processNextMessage();
  } catch (err) {
    console.error('[WORKER] Erro inesperado no ciclo da fila:', err.message);
  } finally {
    if (active) {
      timer = setTimeout(tick, messageQueueService.randomDelay());
    }
  }
}

function startWorker() {
  if (active) return;
  active = true;
  console.log('[WORKER] Fila de mensagens iniciada — processando a cada 3–6s (horário: 08:00–20:00 BRT)');
  timer = setTimeout(tick, messageQueueService.randomDelay());
}

function stopWorker() {
  active = false;
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  console.log('[WORKER] Fila de mensagens parada.');
}

module.exports = { startWorker, stopWorker };
