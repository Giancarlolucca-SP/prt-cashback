const { PrismaClient } = require('@prisma/client');
const stripeService = require('../services/stripeService');
const establishmentService = require('../services/establishmentService');
const emailService = require('../services/emailService');
const { createError } = require('../middlewares/errorMiddleware');

const prisma = new PrismaClient();

function generatePassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length: 8 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

// POST /stripe/create-checkout-session — PUBLIC
async function createCheckoutSession(req, res, next) {
  try {
    const { priceInCents, successUrl, cancelUrl, metadata, utms } = req.body;

    if (!successUrl?.trim()) throw createError('successUrl é obrigatório.', 400);
    if (!cancelUrl?.trim())  throw createError('cancelUrl é obrigatório.', 400);

    const result = await stripeService.createCheckoutSession({
      priceInCents: priceInCents || 20000,
      successUrl,
      cancelUrl,
      metadata,
      utms,
    });

    res.json(result);
  } catch (err) {
    next(err);
  }
}

// POST /stripe/create-setup-intent — PUBLIC
async function createSetupIntent(req, res, next) {
  try {
    const { email, name } = req.body;
    if (!email?.trim()) throw createError('E-mail é obrigatório.', 400);

    const customerId = await stripeService.createCustomer(email.trim(), name || email.trim());
    const result     = await stripeService.createSetupIntent(customerId);

    res.json({ ...result, customerId });
  } catch (err) {
    next(err);
  }
}

// POST /stripe/confirm-subscription — PUBLIC
async function confirmSubscription(req, res, next) {
  try {
    const { paymentMethodId, nome, cnpj, email, telefone, operatorName } = req.body;

    if (!paymentMethodId)  throw createError('paymentMethodId é obrigatório.', 400);
    if (!nome?.trim())     throw createError('Nome do estabelecimento é obrigatório.', 400);
    if (!cnpj)             throw createError('CNPJ é obrigatório.', 400);
    if (!email?.trim())    throw createError('E-mail é obrigatório.', 400);

    const priceId = process.env.STRIPE_PRICE_ID;
    if (!priceId) throw createError('Sistema de pagamento não disponível. Tente em instantes.', 503);

    // 1. Create Stripe customer
    const customerId = await stripeService.createCustomer(email.trim(), nome.trim());

    // 2. Create subscription
    const { subscriptionId, status, clientSecret } = await stripeService.createSubscription(
      customerId,
      priceId,
      paymentMethodId,
    );

    // 3. Payment already active → create establishment + return credentials
    if (status === 'active' || status === 'trialing') {
      const password = generatePassword();

      await establishmentService.createFromStripe({
        nome:                nome.trim(),
        cnpj,
        telefone,
        operatorName:        (operatorName || nome).trim(),
        operatorEmail:       email.trim(),
        operatorPassword:    password,
        stripeCustomerId:    customerId,
        stripeSubscriptionId: subscriptionId,
      });

      console.log(`[STRIPE] Novo estabelecimento criado: ${nome} (${email}) | ${subscriptionId}`);

      emailService.sendWelcomeEmail({
        name:              (operatorName || nome).trim(),
        email:             email.trim(),
        password,
        establishmentName: nome.trim(),
      }).catch((err) => console.error('[EMAIL] Falha ao enviar boas-vindas:', err.message));

      return res.json({
        success: true,
        credentials: {
          email:    email.trim(),
          password,
          adminUrl: process.env.FRONTEND_URL || 'https://app.sistemapostocash.app',
        },
      });
    }

    // 4. Payment requires 3D Secure confirmation
    return res.json({
      success:        false,
      requiresAction: true,
      clientSecret,
      customerId,
      subscriptionId,
    });
  } catch (err) {
    next(err);
  }
}

// POST /stripe/activate — PUBLIC, called after frontend confirms 3DS
async function activateAfterPayment(req, res, next) {
  try {
    const { subscriptionId, customerId, nome, cnpj, email, telefone, operatorName } = req.body;

    if (!subscriptionId) throw createError('subscriptionId é obrigatório.', 400);

    const Stripe = require('stripe');
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    const sub = await stripe.subscriptions.retrieve(subscriptionId);

    if (sub.status !== 'active' && sub.status !== 'trialing') {
      throw createError('Pagamento ainda não confirmado pelo Stripe. Tente novamente.', 402);
    }

    // Idempotency check
    const existing = await prisma.establishment.findFirst({
      where: { stripeSubscriptionId: subscriptionId },
    });
    if (existing) {
      return res.json({ success: true, alreadyActive: true });
    }

    const password = generatePassword();

    await establishmentService.createFromStripe({
      nome, cnpj, telefone,
      operatorName:        (operatorName || nome).trim(),
      operatorEmail:       email.trim(),
      operatorPassword:    password,
      stripeCustomerId:    customerId,
      stripeSubscriptionId: subscriptionId,
    });

    emailService.sendWelcomeEmail({
      name:              (operatorName || nome).trim(),
      email:             email.trim(),
      password,
      establishmentName: nome?.trim() || email.trim(),
    }).catch((err) => console.error('[EMAIL] Falha ao enviar boas-vindas:', err.message));

    return res.json({
      success: true,
      credentials: {
        email,
        password,
        adminUrl: process.env.FRONTEND_URL || 'https://app.sistemapostocash.app',
      },
    });
  } catch (err) {
    next(err);
  }
}

// POST /stripe/webhook — PUBLIC, needs raw body
async function handleWebhook(req, res) {
  let event;
  try {
    event = stripeService.constructWebhookEvent(
      req.body,
      req.headers['stripe-signature'] || '',
    );
  } catch (err) {
    console.error('[STRIPE WEBHOOK] Falha na verificação:', err.message);
    return res.status(400).json({ error: 'Assinatura do webhook inválida.' });
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        console.log('[STRIPE] Checkout completo:', session.customer_email);
        await stripeService.handleCheckoutComplete(session);
        break;
      }
      case 'invoice.paid': {
        const inv = event.data.object;
        console.log(`[STRIPE WEBHOOK] Fatura paga: ${inv.id} (cliente: ${inv.customer})`);
        break;
      }
      case 'invoice.payment_failed': {
        const inv = event.data.object;
        console.warn(`[STRIPE WEBHOOK] Falha no pagamento: ${inv.id} (cliente: ${inv.customer})`);
        break;
      }
      case 'customer.subscription.updated': {
        const sub = event.data.object;
        const statusMap = {
          active:             'ACTIVE',
          trialing:           'ACTIVE',
          past_due:           'PAST_DUE',
          canceled:           'CANCELLED',
          unpaid:             'UNPAID',
          incomplete:         'INCOMPLETE',
          incomplete_expired: 'CANCELLED',
          paused:             'PAST_DUE',
        };
        await prisma.establishment.updateMany({
          where: { stripeSubscriptionId: sub.id },
          data: {
            subscriptionStatus: statusMap[sub.status] ?? 'ACTIVE',
            subscriptionEndsAt: sub.cancel_at ? new Date(sub.cancel_at * 1000) : null,
          },
        });
        break;
      }
      case 'customer.subscription.deleted': {
        const sub = event.data.object;
        await prisma.establishment.updateMany({
          where: { stripeSubscriptionId: sub.id },
          data: { subscriptionStatus: 'CANCELLED', subscriptionEndsAt: new Date() },
        });
        console.log(`[STRIPE WEBHOOK] Assinatura cancelada: ${sub.id}`);
        break;
      }
      default:
        break;
    }
    res.json({ received: true });
  } catch (err) {
    console.error('[STRIPE WEBHOOK] Erro ao processar evento:', err.message);
    res.status(500).json({ error: 'Erro interno.' });
  }
}

// GET /stripe/subscription/my — authenticated
async function getMySubscription(req, res, next) {
  try {
    const establishment = await prisma.establishment.findUnique({
      where: { id: req.operator.establishmentId },
      select: {
        stripeSubscriptionId: true,
        stripeCustomerId:     true,
        subscriptionStatus:   true,
        subscriptionEndsAt:   true,
      },
    });

    if (!establishment) throw createError('Estabelecimento não encontrado.', 404);

    if (!establishment.stripeSubscriptionId) {
      return res.json({
        hasSubscription:    false,
        subscriptionStatus: establishment.subscriptionStatus ?? 'ACTIVE',
      });
    }

    const status = await stripeService.getSubscriptionStatus(establishment.stripeSubscriptionId);

    res.json({
      hasSubscription:      true,
      subscriptionId:       establishment.stripeSubscriptionId,
      subscriptionStatus:   establishment.subscriptionStatus,
      subscriptionEndsAt:   establishment.subscriptionEndsAt,
      ...status,
    });
  } catch (err) {
    next(err);
  }
}

// POST /stripe/cancel-subscription — authenticated
async function cancelMySubscription(req, res, next) {
  try {
    const establishment = await prisma.establishment.findUnique({
      where: { id: req.operator.establishmentId },
      select: { stripeSubscriptionId: true },
    });

    if (!establishment?.stripeSubscriptionId) {
      throw createError('Nenhuma assinatura ativa encontrada.', 404);
    }

    const result = await stripeService.cancelSubscription(establishment.stripeSubscriptionId);

    await prisma.establishment.update({
      where: { id: req.operator.establishmentId },
      data: {
        subscriptionStatus: 'CANCELLING',
        subscriptionEndsAt: result.endsAt,
      },
    });

    res.json({
      mensagem: 'Assinatura cancelada. Seu acesso continua até o final do período pago.',
      endsAt:   result.endsAt,
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  createCheckoutSession,
  createSetupIntent,
  confirmSubscription,
  activateAfterPayment,
  handleWebhook,
  getMySubscription,
  cancelMySubscription,
};
