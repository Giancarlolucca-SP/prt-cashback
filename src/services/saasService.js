const Stripe = require('stripe');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

function getStripe() {
  if (!process.env.STRIPE_SECRET_KEY) throw new Error('STRIPE_SECRET_KEY não configurado');
  return new Stripe(process.env.STRIPE_SECRET_KEY);
}

async function getSaasMetrics() {
  const stripe = getStripe();
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  // ── Stripe: all subscriptions ──────────────────────────────────────────────
  const [allSubsResp, cancelledSubsResp] = await Promise.all([
    stripe.subscriptions.list({ limit: 100, status: 'all', expand: ['data.items.data.price'] }),
    stripe.subscriptions.list({ limit: 100, status: 'canceled' }),
  ]);

  const allSubs       = allSubsResp.data;
  const cancelledSubs = cancelledSubsResp.data;
  const activeSubs    = allSubs.filter(s => s.status === 'active' || s.status === 'trialing');

  // MRR in cents → normalized to monthly
  const mrrCents = activeSubs.reduce((sum, sub) => {
    const item     = sub.items?.data?.[0];
    const amount   = item?.price?.unit_amount || 0;
    const interval = item?.price?.recurring?.interval;
    return sum + (interval === 'year' ? Math.round(amount / 12) : amount);
  }, 0);

  const newThisMonth = allSubs.filter(s => new Date(s.created * 1000) >= startOfMonth).length;

  const cancelledThisMonth = cancelledSubs.filter(s => {
    const at = s.canceled_at ? new Date(s.canceled_at * 1000) : null;
    return at && at >= startOfMonth;
  }).length;

  const totalSubs = allSubs.length;
  const churnRate = totalSubs > 0
    ? parseFloat(((cancelledThisMonth / totalSubs) * 100).toFixed(2))
    : 0;

  const ticketMedio = mrrCents / 100;
  const ltv = churnRate > 0 ? parseFloat((ticketMedio / (churnRate / 100)).toFixed(2)) : 0;

  // ── Stripe: revenue by month (last 12 months) ──────────────────────────────
  const twelveMonthsAgoTs = Math.floor(
    new Date(now.getFullYear(), now.getMonth() - 11, 1).getTime() / 1000
  );

  const invoicesResp = await stripe.invoices.list({
    limit: 100,
    created: { gte: twelveMonthsAgoTs },
    status: 'paid',
  });

  const revenueMap = {};
  for (let i = 11; i >= 0; i--) {
    const d   = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    revenueMap[key] = {
      month:   d.toLocaleString('pt-BR', { month: 'short', year: '2-digit' }),
      revenue: 0,
    };
  }

  invoicesResp.data.forEach(inv => {
    const d   = new Date(inv.created * 1000);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    if (revenueMap[key]) revenueMap[key].revenue += (inv.amount_paid || 0) / 100;
  });

  const revenueByMonth = Object.values(revenueMap);

  // ── Prisma: establishments ─────────────────────────────────────────────────
  const dbEstablishments = await prisma.establishment.findMany({
    select: {
      id:                  true,
      name:                true,
      createdAt:           true,
      subscriptionStatus:  true,
      subscriptionEndsAt:  true,
      stripeSubscriptionId: true,
      operators: {
        where:  { role: 'ADMIN' },
        select: { email: true },
        take:   1,
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  // Build Stripe sub map for next-payment lookup
  const subMap = {};
  allSubs.forEach(s => { subMap[s.id] = s; });

  const establishments = dbEstablishments.map(est => {
    const sub         = est.stripeSubscriptionId ? subMap[est.stripeSubscriptionId] : null;
    const nextPayment = sub?.current_period_end
      ? new Date(sub.current_period_end * 1000).toISOString()
      : null;
    const amount = sub?.items?.data?.[0]?.price?.unit_amount != null
      ? sub.items.data[0].price.unit_amount / 100
      : 200;

    return {
      name:        est.name,
      email:       est.operators?.[0]?.email || '—',
      status:      est.subscriptionStatus,
      startDate:   est.createdAt.toISOString(),
      nextPayment,
      amount,
      endsAt:      est.subscriptionEndsAt?.toISOString() || null,
    };
  });

  return {
    mrr:                  mrrCents / 100,
    arr:                  (mrrCents * 12) / 100,
    activeSubscriptions:  activeSubs.length,
    newThisMonth,
    cancelledThisMonth,
    churnRate,
    ltv,
    revenueByMonth,
    establishments,
  };
}

module.exports = { getSaasMetrics };
