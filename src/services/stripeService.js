const Stripe = require('stripe');
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const emailService = require('./emailService');

const prisma = new PrismaClient();

let _stripe = null;

function getStripe() {
  if (!_stripe) {
    if (!process.env.STRIPE_SECRET_KEY) throw new Error('STRIPE_SECRET_KEY não configurado');
    _stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  }
  return _stripe;
}

async function ensurePrice() {
  const s = getStripe();

  const product = await s.products.create({
    name: 'PostoCash — Sistema de Fidelidade',
    description: 'Assinatura mensal — acesso completo ao sistema PostoCash para postos de combustível',
  });

  const price = await s.prices.create({
    product: product.id,
    unit_amount: 20000, // R$ 200,00 em centavos
    currency: 'brl',
    recurring: { interval: 'month' },
  });

  return price.id;
}

async function createCustomer(email, name) {
  const customer = await getStripe().customers.create({ email, name });
  return customer.id;
}

async function createSetupIntent(customerId) {
  const si = await getStripe().setupIntents.create({
    customer: customerId,
    payment_method_types: ['card'],
  });
  return { clientSecret: si.client_secret };
}

async function createSubscription(customerId, priceId, paymentMethodId) {
  const s = getStripe();

  // Attach payment method to customer
  await s.paymentMethods.attach(paymentMethodId, { customer: customerId });

  // Set as default
  await s.customers.update(customerId, {
    invoice_settings: { default_payment_method: paymentMethodId },
  });

  const subscription = await s.subscriptions.create({
    customer: customerId,
    items: [{ price: priceId }],
    payment_settings: { save_default_payment_method: 'on_subscription' },
    expand: ['latest_invoice.payment_intent'],
  });

  const invoice        = subscription.latest_invoice;
  const paymentIntent  = invoice?.payment_intent;

  return {
    subscriptionId:       subscription.id,
    status:               subscription.status,
    clientSecret:         paymentIntent?.client_secret   ?? null,
    paymentIntentStatus:  paymentIntent?.status          ?? null,
  };
}

async function createCheckoutSession({ priceInCents, successUrl, cancelUrl, metadata, utms }) {
  const mode = 'subscription';

  console.log('[STRIPE] Criando session:', JSON.stringify({
    mode, successUrl, cancelUrl, metadata,
  }));

  const sessionParams = {
    payment_method_types: ['card'],
    mode,
    line_items: [{
      price_data: {
        currency: 'brl',
        product_data: {
          name: 'PostoCash Essencial',
          description: 'Sistema de cashback para postos de combustível',
        },
        unit_amount: priceInCents,
        recurring: { interval: 'month' },
      },
      quantity: 1,
    }],
    success_url: successUrl,
    cancel_url:  cancelUrl,
    metadata:    metadata || {},
  };

  // Pre-fill customer email on Stripe's hosted page if available
  if (metadata?.email) {
    sessionParams.customer_email = metadata.email;
  }

  const session = await getStripe().checkout.sessions.create(sessionParams);

  console.log('[STRIPE] Session criada:', session.id, session.url);

  return { sessionId: session.id };
}

async function cancelSubscription(subscriptionId) {
  const subscription = await getStripe().subscriptions.update(subscriptionId, {
    cancel_at_period_end: true,
  });
  return {
    cancelled: true,
    endsAt: new Date(subscription.current_period_end * 1000),
  };
}

async function getSubscriptionStatus(subscriptionId) {
  const subscription = await getStripe().subscriptions.retrieve(subscriptionId, {
    expand: ['default_payment_method'],
  });

  const pm = subscription.default_payment_method;

  return {
    status:            subscription.status,
    currentPeriodEnd:  new Date(subscription.current_period_end * 1000),
    cancelAtPeriodEnd: subscription.cancel_at_period_end,
    card: pm?.card ? {
      brand:    pm.card.brand,
      last4:    pm.card.last4,
      expMonth: pm.card.exp_month,
      expYear:  pm.card.exp_year,
    } : null,
  };
}

async function handleCheckoutComplete(session) {
  console.log('[STRIPE] Session completa:', JSON.stringify({
    id:               session.id,
    customer_email:   session.customer_email,
    customer_details: session.customer_details,
    metadata:         session.metadata,
    customer:         session.customer,
  }));

  const email = session.customer_email
    || session.customer_details?.email
    || session.metadata?.email;

  if (!email) {
    console.log('[STRIPE] Sem email — buscando via customer ID:', session.customer);

    if (session.customer) {
      const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
      const customer = await stripe.customers.retrieve(session.customer);
      if (customer.email) {
        return processCheckout(session, customer.email);
      }
    }

    console.log('[STRIPE] checkout.session.completed sem email — ignorado');
    return;
  }

  return processCheckout(session, email);
}

async function processCheckout(session, email) {
  console.log('[STRIPE] Processando checkout para:', email);

  const existing = await prisma.operator.findFirst({ where: { email } });
  if (existing) {
    console.log('[STRIPE] Operador já existe:', email);
    return;
  }

  const metadata = session.metadata || {};
  const name = metadata.nome || email.split('@')[0];
  const cnpj = metadata.cnpj || `${Date.now()}`.slice(-14).padStart(14, '0');

  const establishment = await prisma.establishment.create({
    data: {
      name,
      cnpj,
      cashbackPercent:      5,
      stripeCustomerId:     session.customer,
      stripeSubscriptionId: session.subscription,
      subscriptionStatus:   'ACTIVE',
    },
  });

  const password = Math.random().toString(36).slice(-8).toUpperCase();
  const hashed   = await bcrypt.hash(password, 10);

  await prisma.operator.create({
    data: {
      name:            (metadata.operatorName || name).trim(),
      email,
      password:        hashed,
      role:            'ADMIN',
      establishmentId: establishment.id,
    },
  });

  await emailService.sendWelcomeEmail({
    name:              (metadata.operatorName || name).trim(),
    email,
    password,
    establishmentName: name,
  }).catch((err) => console.error('[EMAIL] Falha ao enviar boas-vindas:', err.message));

  console.log('[STRIPE] Estabelecimento criado com sucesso:', name, email);
}

function constructWebhookEvent(payload, signature) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    console.warn('[STRIPE] STRIPE_WEBHOOK_SECRET não configurado — pulando verificação de assinatura');
    return JSON.parse(payload.toString());
  }
  return getStripe().webhooks.constructEvent(payload, signature, secret);
}

module.exports = {
  ensurePrice,
  createCustomer,
  createSetupIntent,
  createCheckoutSession,
  createSubscription,
  cancelSubscription,
  getSubscriptionStatus,
  constructWebhookEvent,
  handleCheckoutComplete,
};
