/**
 * Expo Push Notification Service
 * Sends push notifications via the Expo Push API.
 * https://docs.expo.dev/push-notifications/sending-notifications/
 */

const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

// ── Core sender ───────────────────────────────────────────────────────────────

async function sendPush({ to, title, body, data = {} }) {
  if (!to) return;

  const message = { to, title, body, data, sound: 'default', priority: 'high' };

  try {
    const res = await fetch(EXPO_PUSH_URL, {
      method:  'POST',
      headers: {
        Accept:         'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(message),
    });

    const json = await res.json();
    if (!res.ok || json?.data?.status === 'error') {
      console.warn('[Push] Falha ao enviar:', JSON.stringify(json));
    }
  } catch (err) {
    console.error('[Push] Erro na requisição:', err.message);
  }
}

// ── Get customer push token ───────────────────────────────────────────────────

async function getToken(customerId) {
  const c = await prisma.customer.findUnique({
    where:  { id: customerId },
    select: { pushToken: true },
  });
  return c?.pushToken ?? null;
}

// ── Notification templates ────────────────────────────────────────────────────

async function notifyCashbackEarned(customerId, { amount, newBalance }) {
  const token = await getToken(customerId);
  await sendPush({
    to:    token,
    title: 'Cashback creditado!',
    body:  `R$ ${amount.toFixed(2).replace('.', ',')} de cashback foram adicionados ao seu saldo.`,
    data:  { type: 'CASHBACK_EARNED', amount, newBalance },
  });
}

async function notifyRedemptionConfirmed(customerId, { amount }) {
  const token = await getToken(customerId);
  await sendPush({
    to:    token,
    title: 'Resgate confirmado!',
    body:  `Seu resgate de R$ ${amount.toFixed(2).replace('.', ',')} foi processado com sucesso.`,
    data:  { type: 'REDEMPTION_CONFIRMED', amount },
  });
}

async function notifyBalanceReminder(customerId, { balance }) {
  const token = await getToken(customerId);
  await sendPush({
    to:    token,
    title: 'Você tem cashback esperando!',
    body:  `R$ ${balance.toFixed(2).replace('.', ',')} de saldo disponível para resgatar no posto.`,
    data:  { type: 'BALANCE_REMINDER', balance },
  });
}

async function notifyCampaign(customerId, { message }) {
  const token = await getToken(customerId);
  await sendPush({
    to:    token,
    title: 'Promoção especial para você!',
    body:  message,
    data:  { type: 'CAMPAIGN' },
  });
}

async function notifyCashbackExpiring(customerId, { balance, daysLeft }) {
  const token = await getToken(customerId);
  await sendPush({
    to:    token,
    title: `Seu cashback vence em ${daysLeft} dias`,
    body:  `Você tem R$ ${balance.toFixed(2).replace('.', ',')} prestes a expirar. Resgate agora!`,
    data:  { type: 'CASHBACK_EXPIRING', balance, daysLeft },
  });
}

module.exports = {
  sendPush,
  notifyCashbackEarned,
  notifyRedemptionConfirmed,
  notifyBalanceReminder,
  notifyCampaign,
  notifyCashbackExpiring,
};
