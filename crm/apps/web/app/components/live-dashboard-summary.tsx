"use client";

import { useEffect, useMemo, useState } from "react";
import { CarFront, CircleDollarSign, Clock3, TrendingUp } from "lucide-react";
import { apiGet } from "../auth/auth-client";
import { useAuth } from "../auth/auth-provider";

type ExecutiveSummary = {
  totals: {
    leads: number;
    inventory: number;
    openSales: number;
    closedSales: number;
    saleRevenue: string;
    grossMargin: string;
    grossMarginRate: string | null;
    openReceivablesAndPayables: string;
    unreadNotifications: number;
  };
};

type SalesFunnel = {
  leadsByStatus: Record<string, number>;
  salesByStatus: Record<string, number>;
  appointmentsByStatus: Record<string, number>;
};

type InventoryPerformance = {
  inventoryByStatus: Record<string, number>;
  listingMetrics: {
    views: number;
    clicks: number;
    leads: number;
    ctr: string | null;
  };
};

type DashboardData = {
  summary: ExecutiveSummary;
  funnel: SalesFunnel;
  inventory: InventoryPerformance;
};

const fallbackData: DashboardData = {
  summary: {
    totals: {
      leads: 84,
      inventory: 17,
      openSales: 9,
      closedSales: 7,
      saleRevenue: "428000.00",
      grossMargin: "76184.00",
      grossMarginRate: "0.1780",
      openReceivablesAndPayables: "31400.00",
      unreadNotifications: 6,
    },
  },
  funnel: {
    leadsByStatus: { NEW: 31, CONTACTED: 26, QUALIFIED: 18, LOST: 9 },
    salesByStatus: { PROPOSAL: 7, APPROVED: 2, CLOSED: 7 },
    appointmentsByStatus: { SCHEDULED: 12, CONFIRMED: 8, DONE: 5 },
  },
  inventory: {
    inventoryByStatus: { AVAILABLE: 12, IN_PREPARATION: 3, RESERVED: 2 },
    listingMetrics: { views: 0, clicks: 0, leads: 0, ctr: null },
  },
};

const quickActions = [
  "Responder lead quente",
  "Abrir checklist de compra",
  "Gerar OS de preparacao",
  "Conferir anuncios ativos",
];

const currencyFormatter = new Intl.NumberFormat("pt-BR", {
  currency: "BRL",
  maximumFractionDigits: 0,
  style: "currency",
});

function asNumber(value: string | null | undefined) {
  return value ? Number(value) : 0;
}

function formatCurrency(value: string) {
  return currencyFormatter.format(asNumber(value));
}

function formatPercent(value: string | null) {
  return value ? `${(Number(value) * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%` : "--";
}

function sumStatuses(source: Record<string, number>, statuses: string[]) {
  return statuses.reduce((total, status) => total + (source[status] ?? 0), 0);
}

export function LiveDashboardSummary() {
  const { hasPermission, token } = useAuth();
  const canReadDashboard = hasPermission({ module: "dashboard", action: "read" });
  const [data, setData] = useState<DashboardData>(fallbackData);
  const [status, setStatus] = useState<"fallback" | "loading" | "live" | "error" | "locked">("fallback");

  useEffect(() => {
    if (!token) {
      return;
    }

    if (!canReadDashboard) {
      setStatus("locked");
      return;
    }

    let isCurrent = true;
    setStatus("loading");

    Promise.all([
      apiGet<ExecutiveSummary>("/analytics/executive-summary", token),
      apiGet<SalesFunnel>("/analytics/sales-funnel", token),
      apiGet<InventoryPerformance>("/analytics/inventory-performance", token),
    ])
      .then(([summary, funnel, inventory]) => {
        if (!isCurrent) {
          return;
        }

        setData({ summary, funnel, inventory });
        setStatus("live");
      })
      .catch(() => {
        if (isCurrent) {
          setStatus("error");
        }
      });

    return () => {
      isCurrent = false;
    };
  }, [canReadDashboard, token]);

  const dashboard = useMemo(() => {
    const actionableStock = sumStatuses(data.inventory.inventoryByStatus, ["AVAILABLE", "IN_PREPARATION", "RESERVED"]);
    const activeLeads = data.summary.totals.leads;
    const openSales = data.summary.totals.openSales;
    const pendingFinance = data.summary.totals.openReceivablesAndPayables;
    const funnelLeadTotal = Object.values(data.funnel.leadsByStatus).reduce((total, count) => total + count, 0);

    return {
      decisionCards: [
        {
          icon: Clock3,
          title: "SLA comercial",
          value: `${funnelLeadTotal || activeLeads} leads`,
          text: "volume atual no funil comercial",
          tone: "teal",
        },
        {
          icon: CarFront,
          title: "Estoque acionavel",
          value: `${actionableStock} carros`,
          text: "prontos ou quase prontos para oferta",
          tone: "blue",
        },
        {
          icon: CircleDollarSign,
          title: "Pendencias financeiras",
          value: formatCurrency(pendingFinance),
          text: "contas abertas e agendadas",
          tone: "amber",
        },
      ],
      metrics: [
        {
          detail: `${data.summary.totals.closedSales} vendas fechadas no periodo`,
          label: "Leads ativos",
          tone: "teal",
          trend: `${openSales} vendas abertas`,
          value: String(activeLeads),
        },
        {
          detail: "receita de vendas fechadas",
          label: "Venda realizada",
          tone: "blue",
          trend: `${data.summary.totals.closedSales} fechadas`,
          value: formatCurrency(data.summary.totals.saleRevenue),
        },
        {
          detail: `${formatCurrency(data.summary.totals.grossMargin)} de margem bruta`,
          label: "Margem bruta",
          tone: "amber",
          trend: formatPercent(data.summary.totals.grossMarginRate),
          value: formatPercent(data.summary.totals.grossMarginRate),
        },
        {
          detail: `${data.inventory.listingMetrics.leads} leads vindos de anuncios`,
          label: "Alertas ativos",
          tone: "rose",
          trend: `${data.summary.totals.unreadNotifications} novas`,
          value: String(data.summary.totals.unreadNotifications),
        },
      ],
    };
  }, [data]);

  const statusLabel = {
    error: "Usando fallback",
    fallback: "Fallback visual",
    live: "Dados reais",
    loading: "Sincronizando",
    locked: "Sem permissao",
  }[status];

  return (
    <>
      <section className="decision-strip" aria-label="Resumo de decisoes do dia">
        {dashboard.decisionCards.map((card) => {
          const Icon = card.icon;
          return (
            <article className={`decision-card ${card.tone}`} key={card.title}>
              <Icon aria-hidden="true" size={19} />
              <div>
                <span>{card.title}</span>
                <strong>{card.value}</strong>
                <p>{card.text}</p>
              </div>
            </article>
          );
        })}

        <article className="quick-actions" aria-label="Acoes rapidas">
          <strong>Acoes rapidas</strong>
          <div>
            {quickActions.map((action) => (
              <button key={action} type="button">
                {action}
              </button>
            ))}
            <span className="live-pill">{statusLabel}</span>
          </div>
        </article>
      </section>

      <section className="metric-grid" aria-label="Indicadores principais">
        {dashboard.metrics.map((metric) => (
          <article className={`metric-card ${metric.tone}`} key={metric.label}>
            <div>
              <h3>{metric.label}</h3>
              <strong>{metric.value}</strong>
              <span>{metric.detail}</span>
            </div>
            <div className="metric-trend">
              <TrendingUp aria-hidden="true" size={16} />
              {metric.trend}
            </div>
          </article>
        ))}
      </section>
    </>
  );
}
