const axios = require('axios');

const INSTANCE_ID = process.env.ZAPI_INSTANCE_ID;
const TOKEN       = process.env.ZAPI_TOKEN;
const BASE_URL    = process.env.ZAPI_BASE_URL;

async function sendMessage(phone, message) {
  try {
    const cleanPhone = phone.replace(/\D/g, '');
    const phoneWithCountry = cleanPhone.startsWith('55')
      ? cleanPhone
      : `55${cleanPhone}`;

    console.log('[ZAPI] Enviando para:', phoneWithCountry);

    const response = await axios.post(
      `${BASE_URL}/instances/${INSTANCE_ID}/token/${TOKEN}/send-text`,
      { phone: phoneWithCountry, message }
    );

    console.log('[ZAPI] Enviado com sucesso:', response.data);
    return { success: true, data: response.data };
  } catch (error) {
    console.error('[ZAPI] Erro ao enviar:', error.response?.data || error.message);
    return { success: false, error: error.message };
  }
}

async function sendCampaignMessages(customers, campaignData) {
  const results = [];

  for (const customer of customers) {
    if (!customer.phone) continue;

    const message = formatCampaignMessage(customer, campaignData);
    const result  = await sendMessage(customer.phone, message);
    results.push({ customerId: customer.id, ...result });

    // Aguarda 1 segundo entre envios para evitar bloqueio por spam
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  return results;
}

function formatCampaignMessage(customer, campaign) {
  const firstName = customer.name.split(' ')[0];

  let rewardText = '';
  if (campaign.rewardType === 'FIXED') {
    rewardText = `R$ ${campaign.rewardValue.toFixed(2).replace('.', ',')} de cashback`;
  } else {
    rewardText = `R$ ${campaign.rewardValue.toFixed(2).replace('.', ',')} de cashback por litro`;
  }

  return `Olá ${firstName}! 👋

🎉 *${campaign.establishmentName}* tem uma promoção especial para você!

_"${campaign.message}"_

💰 *Recompensa:* ${rewardText}

Válido por 30 dias.
📲 Abra o app e aproveite!`;
}

module.exports = { sendMessage, sendCampaignMessages, formatCampaignMessage };
