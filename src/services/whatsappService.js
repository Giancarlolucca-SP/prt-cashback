const axios = require('axios');

// ── Provider selection ────────────────────────────────────────────────────────
// Set WHATSAPP_PROVIDER=evolution in .env to use Evolution API.
// Defaults to z-api (existing behaviour).

const PROVIDER = (process.env.WHATSAPP_PROVIDER || 'z-api').toLowerCase();

// ── Evolution API config ──────────────────────────────────────────────────────
const EVOLUTION_URL      = process.env.EVOLUTION_API_URL || 'https://postocash-evo-api.onrender.com';
const EVOLUTION_API_KEY  = process.env.EVOLUTION_API_KEY || 'postocash-evo-2026';
const EVOLUTION_INSTANCE = process.env.EVOLUTION_INSTANCE || 'postocash';

// ── Z-API config (legacy) ─────────────────────────────────────────────────────
const ZAPI_INSTANCE_ID = process.env.ZAPI_INSTANCE_ID;
const ZAPI_TOKEN       = process.env.ZAPI_TOKEN;
const ZAPI_BASE_URL    = process.env.ZAPI_BASE_URL;

// ── Phone normaliser ──────────────────────────────────────────────────────────
function normalisePhone(phone) {
  const digits = phone.replace(/\D/g, '');
  return digits.startsWith('55') ? digits : `55${digits}`;
}

// ── Evolution API sender ──────────────────────────────────────────────────────
async function sendViaEvolution(phone, message) {
  const number = normalisePhone(phone);
  const url    = `${EVOLUTION_URL}/message/sendText/${EVOLUTION_INSTANCE}`;

  const response = await axios.post(
    url,
    { number, text: message },
    { headers: { apikey: EVOLUTION_API_KEY, 'Content-Type': 'application/json' } }
  );

  return response.data;
}

// ── Z-API sender (legacy) ─────────────────────────────────────────────────────
async function sendViaZapi(phone, message) {
  const number = normalisePhone(phone);
  const url    = `${ZAPI_BASE_URL}/instances/${ZAPI_INSTANCE_ID}/token/${ZAPI_TOKEN}/send-text`;

  const response = await axios.post(url, { phone: number, message });
  return response.data;
}

// ── Public: send single message ───────────────────────────────────────────────
async function sendMessage(phone, message) {
  try {
    const data = PROVIDER === 'evolution'
      ? await sendViaEvolution(phone, message)
      : await sendViaZapi(phone, message);

    console.log(`[WHATSAPP/${PROVIDER.toUpperCase()}] Enviado para ${normalisePhone(phone).slice(0, 6)}****`);
    return { success: true, data };
  } catch (error) {
    console.error(
      `[WHATSAPP/${PROVIDER.toUpperCase()}] Erro ao enviar:`,
      error.response?.data || error.message
    );
    return { success: false, error: error.message };
  }
}

// ── Public: send campaign batch ───────────────────────────────────────────────
async function sendCampaignMessages(customers, campaignData) {
  const results = [];

  for (const customer of customers) {
    if (!customer.phone) continue;

    const message = formatCampaignMessage(customer, campaignData);
    const result  = await sendMessage(customer.phone, message);
    results.push({ customerId: customer.id, ...result });

    // 1 s de intervalo entre envios para evitar bloqueio por spam
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  return results;
}

// ── Message formatter ─────────────────────────────────────────────────────────
function formatCampaignMessage(customer, campaign) {
  const firstName = customer.name.split(' ')[0];

  const rewardText = campaign.rewardType === 'FIXED'
    ? `R$ ${Number(campaign.rewardValue).toFixed(2).replace('.', ',')} de cashback`
    : `R$ ${Number(campaign.rewardValue).toFixed(2).replace('.', ',')} de cashback por litro`;

  return `Olá ${firstName}! 👋

🎉 *${campaign.establishmentName}* tem uma promoção especial para você!

_"${campaign.message}"_

💰 *Recompensa:* ${rewardText}

Válido por 30 dias.
📲 Abra o app e aproveite!`;
}

module.exports = { sendMessage, sendCampaignMessages, formatCampaignMessage };
