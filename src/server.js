const fs   = require('fs');
const path = require('path');
const app = require('./app');
const { startScheduler } = require('./utils/scheduler');
const { startWorker }    = require('./workers/messageWorker');

const PORT = process.env.PORT || 3000;

async function ensureStripePrice() {
  if (!process.env.STRIPE_SECRET_KEY) return;

  if (process.env.STRIPE_PRICE_ID) {
    console.log(`[STRIPE] Price ID: ${process.env.STRIPE_PRICE_ID}`);
    return;
  }

  try {
    const stripeService = require('./services/stripeService');
    const priceId = await stripeService.ensurePrice();
    process.env.STRIPE_PRICE_ID = priceId;

    // Persist to .env for future restarts
    const envPath = path.join(__dirname, '..', '.env');
    if (fs.existsSync(envPath)) {
      let content = fs.readFileSync(envPath, 'utf8');
      if (content.includes('STRIPE_PRICE_ID=')) {
        content = content.replace(/STRIPE_PRICE_ID=.*/, `STRIPE_PRICE_ID=${priceId}`);
      } else {
        content += `\nSTRIPE_PRICE_ID=${priceId}\n`;
      }
      fs.writeFileSync(envPath, content);
    }

    console.log(`[STRIPE] Produto PostoCash criado. STRIPE_PRICE_ID=${priceId}`);
  } catch (err) {
    console.error('[STRIPE] Erro ao criar produto:', err.message);
  }
}

app.listen(PORT, async () => {
  console.log(`\n🚀 PostoCash rodando na porta ${PORT}`);
  console.log(`   Ambiente : ${process.env.NODE_ENV || 'development'}`);
  console.log(`   Health   : http://localhost:${PORT}/health\n`);

  startScheduler();
  startWorker();
  await ensureStripePrice();
});
