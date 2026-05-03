/**
 * scheduler.js
 *
 * Background jobs for PRT Cashback.
 * Uses node-cron — jobs run in the same process as the Express server.
 *
 * Jobs:
 *   selfie-cleanup         — daily at 02:00 BRT
 *   retry-pending-nfce     — every 30 minutes (retries PENDING_VALIDATION transactions)
 */

const cron                    = require('node-cron');
const selfieService           = require('../services/selfieService');
const { retryPendingValidations } = require('../services/schedulerService');

function startScheduler() {
  // Limpeza de selfies: diariamente às 02:00 BRT
  cron.schedule(
    '0 2 * * *',
    async () => {
      console.log('[scheduler] Iniciando limpeza de selfies antigas...');
      try {
        await selfieService.cleanupOldSelfies();
        console.log('[scheduler] Limpeza de selfies concluída.');
      } catch (err) {
        console.error('[scheduler] Erro na limpeza de selfies:', err.message);
      }
    },
    { timezone: 'America/Sao_Paulo' }
  );

  // Revalidação de cupons pendentes: a cada 30 minutos
  cron.schedule(
    '*/30 * * * *',
    async () => {
      try {
        await retryPendingValidations();
      } catch (err) {
        console.error('[scheduler] Erro no job de revalidação:', err.message);
      }
    },
    { timezone: 'America/Sao_Paulo' }
  );

  console.log('[scheduler] Agendamentos iniciados:');
  console.log('[scheduler]   • Limpeza de selfies: diária às 02:00 BRT');
  console.log('[scheduler]   • Revalidação de cupons pendentes: a cada 30 minutos');
}

module.exports = { startScheduler };
