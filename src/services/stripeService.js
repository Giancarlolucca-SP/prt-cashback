const Stripe = require('stripe');
const crypto = require('crypto');
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

// Deterministic idempotency key for Stripe's OWN native idempotency support
// (the `Idempotency-Key` request header) — same inputs always hash to the
// same key, so if a client retries the exact same logical request (timeout,
// double-click) Stripe itself recognizes it as a duplicate and returns the
// original result instead of creating a second subscription/charge. This is
// a different, Stripe-side layer of protection from our own DB-level checks
// below, which only guard against duplicate rows in OUR database — neither
// one alone stops a real double-charge on the customer's card.
function idempotencyKeyFor(...parts) {
  return crypto.createHash('sha256').update(parts.join(':')).digest('hex');
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
    currency: 'usd',
    recurring: { interval: 'month' },
  });

  return price.id;
}

async function createCustomer(email, name) {
  // Keyed by email+name: a retry of the same signup submission (page reload,
  // double-click) reuses the same Stripe customer instead of creating a new
  // one every time. Stripe's idempotency cache expires after 24h, so a
  // genuine later re-signup with the same email still gets a fresh customer.
  // Including `name` (not just email) avoids Stripe's "parameters mismatch"
  // error if a resubmission legitimately corrects the name while reusing the
  // same idempotency-cache window — that's a distinct request, not a retry.
  const customer = await getStripe().customers.create(
    { email, name },
    { idempotencyKey: idempotencyKeyFor('cust', email, name) },
  );
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

  // Idempotency key tied to (customer, price, payment method, 5-min time
  // bucket): a client retry of the exact same confirm-subscription
  // submission (timeout, double-click) reuses the same paymentMethodId
  // within seconds, landing in the same bucket, so Stripe recognizes the
  // duplicate and returns the original subscription instead of billing the
  // card twice. The time bucket keeps this from also colliding with a
  // legitimate LATER resubscribe using the same card (e.g. after a prior
  // subscription was canceled) within Stripe's 24h idempotency cache window,
  // which would otherwise silently return the old (canceled) subscription.
  const FIVE_MINUTES_MS = 5 * 60 * 1000;
  const timeBucket = Math.floor(Date.now() / FIVE_MINUTES_MS);
  const subscription = await s.subscriptions.create(
    {
      customer: customerId,
      items: [{ price: priceId }],
      payment_settings: { save_default_payment_method: 'on_subscription' },
      expand: ['latest_invoice.payment_intent'],
    },
    { idempotencyKey: idempotencyKeyFor('sub', customerId, priceId, paymentMethodId, timeBucket) },
  );

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
  console.log('[STRIPE] Criando session:', JSON.stringify({
    successUrl, cancelUrl, metadata,
  }));

  const session = await getStripe().checkout.sessions.create({
    payment_method_types: ['card'],
    mode: 'subscription',
    line_items: [{
      price: process.env.STRIPE_PRICE_ID,
      quantity: 1,
    }],
    success_url: successUrl,
    cancel_url:  cancelUrl,
    customer_email: metadata?.email || undefined,
    metadata: metadata || {},
  });

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

  // Stripe redelivers webhooks that don't ack quickly, or on any transient
  // failure — this same event (or its sibling customer.subscription.created)
  // can arrive more than once. This check makes a clean retry a no-op; the
  // $transaction + P2002 handling below is the real guard against two
  // deliveries racing concurrently before either commits.
  const existing = await prisma.operator.findFirst({ where: { email } });
  if (existing) {
    console.log('[STRIPE] Operador já existe:', email);
    return;
  }

  const metadata = session.metadata || {};
  const name = metadata.nome || email.split('@')[0];
  const cnpj = metadata.cnpj || `${Date.now()}`.slice(-14).padStart(14, '0');

  const password = Math.random().toString(36).slice(-8).toUpperCase();
  const hashed   = await bcrypt.hash(password, 10);

  // Establishment + operator created atomically: previously these were two
  // separate writes, so if operator.create failed for ANY reason (including
  // the expected email race below) the establishment row was already
  // permanently committed — orphaned, no operator ever attached, requiring
  // manual cleanup — and the webhook still returned 500, so Stripe would
  // keep redelivering the same event and creating another orphan each time.
  let establishment;
  try {
    establishment = await prisma.$transaction(async (tx) => {
      const est = await tx.establishment.create({
        data: {
          name,
          cnpj,
          cashbackPercent:      5,
          stripeCustomerId:     session.customer,
          stripeSubscriptionId: session.subscription,
          subscriptionStatus:   'ACTIVE',
        },
      });
      await tx.operator.create({
        data: {
          name:            (metadata.operatorName || name).trim(),
          email,
          password:        hashed,
          role:            'ADMIN',
          establishmentId: est.id,
        },
      });
      return est;
    });
  } catch (err) {
    if (err.code === 'P2002') {
      const target = Array.isArray(err.meta?.target) ? err.meta.target.join(',') : String(err.meta?.target || '');
      if (target.includes('email')) {
        // Concurrent delivery of the same event (or a sibling event for the
        // same checkout) won the race on the operator's email — nothing to
        // do, this one is a no-op.
        console.log('[STRIPE] Checkout já processado concorrentemente para:', email);
        return;
      }
      // Any other unique violation (e.g. cnpj) is NOT the expected duplicate-
      // delivery race — the email check above already confirmed no operator
      // exists for this email, so this is a genuine data conflict (e.g. a
      // reused/malformed cnpj) that silently swallowing would leave the
      // customer paying Stripe with no PostoCash account and no error
      // surfaced anywhere. Let it propagate so the webhook returns 500 and
      // Stripe retries — and so it shows up in server logs for investigation.
      console.error(`[STRIPE] Falha ao criar estabelecimento/operador para ${email} — conflito em ${target || 'campo desconhecido'}:`, err.message);
    }
    throw err;
  }

  await emailService.sendWelcomeEmail({
    name:              (metadata.operatorName || name).trim(),
    email,
    password,
    establishmentName: name,
  }).catch((err) => console.error('[EMAIL] Falha ao enviar boas-vindas:', err.message));

  console.log('[STRIPE] Estabelecimento criado com sucesso:', name, email);
}

async function handleSubscriptionCreated(subscription) {
  try {
    const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
    const customer = await stripe.customers.retrieve(subscription.customer);

    if (!customer.email) {
      console.log('[STRIPE] Sem email no customer — ignorado');
      return;
    }

    console.log('[STRIPE] Assinatura criada para:', customer.email);
    await processCheckout({
      customer:     subscription.customer,
      subscription: subscription.id,
      metadata:     customer.metadata || {},
    }, customer.email);
  } catch (err) {
    console.error('[STRIPE] Erro handleSubscriptionCreated:', err.message);
  }
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
  handleSubscriptionCreated,
};
