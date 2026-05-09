const Stripe = require('stripe');

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
  createSubscription,
  cancelSubscription,
  getSubscriptionStatus,
  constructWebhookEvent,
};
