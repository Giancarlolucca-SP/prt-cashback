"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowUpRight,
  BadgeDollarSign,
  Banknote,
  BarChart3,
  CalendarClock,
  CarFront,
  Gauge,
  Percent,
  TrendingUp,
} from "lucide-react";
import { apiGet } from "../auth/auth-client";
import { useAuth } from "../auth/auth-provider";
import { DreComparisonModal } from "./dre-comparison-modal";

type ExecutiveSummary = {
  totals: {
    closedSales: number;
    saleRevenue: string;
    grossMargin: string;
    grossMarginRate: string | null;
    financialIncome: string;
    financialExpense: string;
    financialNet: string;
    openReceivablesAndPayables: string;
  };
};

type InventoryPerformance = {
  inventoryValue: {
    askingPrice: string;
    purchaseCost: string;
    capitalizedCosts: string;
  };
};

type FinanceSummary = {
  totals: {
    income: number;
    expense: number;
    paid: number;
    open: number;
    net: number;
  };
  count: number;
};

type ResultsData = {
  executive: ExecutiveSummary;
  inventory: InventoryPerformance;
  finance: FinanceSummary;
  forecast: Array<{ period: string; finance: FinanceSummary }>;
};

const fallbackData: ResultsData = {
  executive: {
    totals: {
      closedSales: 7,
      saleRevenue: "428000.00",
      grossMargin: "76400.00",
      grossMarginRate: "0.1780",
      financialIncome: "428000.00",
      financialExpense: "74800.00",
      financialNet: "353200.00",
      openReceivablesAndPayables: "31400.00",
    },
  },
  inventory: {
    inventoryValue: {
      askingPrice: "1450000.00",
      purchaseCost: "1180000.00",
      capitalizedCosts: "28400.00",
    },
  },
  finance: {
    count: 18,
    totals: { income: 428000, expense: 74800, paid: 278000, open: 31400, net: 353200 },
  },
  forecast: [
    { period: "Semana atual", finance: { count: 5, totals: { income: 84000, expense: 28000, paid: 0, open: 56000, net: 56000 } } },
    { period: "Proxima semana", finance: { count: 7, totals: { income: 132000, expense: 46000, paid: 0, open: 86000, net: 86000 } } },
    { period: "15 dias", finance: { count: 11, totals: { income: 211000, expense: 93000, paid: 0, open: 118000, net: 118000 } } },
    { period: "30 dias", finance: { count: 20, totals: { income: 376000, expense: 188000, paid: 0, open: 188000, net: 188000 } } },
  ],
};

const filters = ["Mes atual", "30 dias", "Trimestre", "Semestre", "Ano", "Personalizado"];

const currency = new Intl.NumberFormat("pt-BR", {
  currency: "BRL",
  maximumFractionDigits: 0,
  style: "currency",
});

function toNumber(value: string | number | null | undefined) {
  return typeof value === "number" ? value : Number(value ?? 0);
}

function formatCurrency(value: string | number) {
  return currency.format(toNumber(value));
}

function formatPercent(value: number | string | null) {
  return value === null ? "--" : `${(toNumber(value) * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
}

function isoDate(date: Date) {
  return date.toISOString();
}

function periodQuery(from: Date, to: Date) {
  return `?from=${encodeURIComponent(isoDate(from))}&to=${encodeURIComponent(isoDate(to))}`;
}

function monthRange() {
  const now = new Date();
  return {
    from: new Date(now.getFullYear(), now.getMonth(), 1),
    to: now,
  };
}

function daysFromNow(startOffset: number, endOffset: number) {
  const from = new Date();
  const to = new Date();
  from.setDate(from.getDate() + startOffset);
  to.setDate(to.getDate() + endOffset);
  from.setHours(0, 0, 0, 0);
  to.setHours(23, 59, 59, 999);
  return { from, to };
}

export function LiveResultsSummary() {
  const { hasPermission, token } = useAuth();
  const canReadDashboard = hasPermission({ module: "dashboard", action: "read" });
  const canReadFinance = hasPermission({ module: "finance", action: "read", scope: "ALL", sensitiveArea: "financial" });
  const [data, setData] = useState<ResultsData>(fallbackData);
  const [status, setStatus] = useState<"fallback" | "loading" | "live" | "error" | "locked">("fallback");

  useEffect(() => {
    if (!token) {
      return;
    }

    if (!canReadFinance) {
      setStatus("locked");
      return;
    }

    let isCurrent = true;
    const currentMonth = monthRange();
    const forecastRanges = [
      { period: "Semana atual", ...daysFromNow(0, 7) },
      { period: "Proxima semana", ...daysFromNow(8, 14) },
      { period: "15 dias", ...daysFromNow(0, 15) },
      { period: "30 dias", ...daysFromNow(0, 30) },
    ];

    setStatus("loading");

    Promise.all([
      canReadDashboard
        ? apiGet<ExecutiveSummary>(`/analytics/executive-summary${periodQuery(currentMonth.from, currentMonth.to)}`, token)
        : Promise.resolve(fallbackData.executive),
      canReadDashboard ? apiGet<InventoryPerformance>("/analytics/inventory-performance", token) : Promise.resolve(fallbackData.inventory),
      apiGet<FinanceSummary>(`/finance/summary${periodQuery(currentMonth.from, currentMonth.to)}`, token),
      Promise.all(
        forecastRanges.map(async (range) => ({
          period: range.period,
          finance: await apiGet<FinanceSummary>(`/finance/summary${periodQuery(range.from, range.to)}`, token),
        })),
      ),
    ])
      .then(([executive, inventory, finance, forecast]) => {
        if (!isCurrent) {
          return;
        }

        setData({ executive, inventory, finance, forecast });
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
  }, [canReadDashboard, canReadFinance, token]);

  const view = useMemo(() => {
    const revenue = toNumber(data.executive.totals.saleRevenue);
    const grossMargin = toNumber(data.executive.totals.grossMargin);
    const expenses = data.finance.totals.expense;
    const netProfit = grossMargin - expenses;
    const ebitda = netProfit;
    const inventoryCapital = toNumber(data.inventory.inventoryValue.purchaseCost) + toNumber(data.inventory.inventoryValue.capitalizedCosts);
    const ebitdaMargin = revenue > 0 ? ebitda / revenue : null;
    const stockProfitability = inventoryCapital > 0 ? grossMargin / inventoryCapital : null;
    const roi = inventoryCapital > 0 ? netProfit / inventoryCapital : null;

    return {
      businessRows: [
        { label: "Vendas de veiculos", value: formatCurrency(revenue), detail: `${data.executive.totals.closedSales} unidades no mes`, icon: CarFront },
        { label: "Receita de repasses", value: formatCurrency(0), detail: "aguardando classificacao dedicada", icon: ArrowUpRight },
        { label: "Lucro bruto de vendas", value: formatCurrency(grossMargin), detail: "margem antes das despesas", icon: BadgeDollarSign },
        { label: "Despesas operacionais", value: formatCurrency(expenses), detail: `${data.finance.count} lancamentos no periodo`, icon: Banknote },
        { label: "Margem media", value: formatPercent(data.executive.totals.grossMarginRate), detail: "visivel apenas para gestor", icon: TrendingUp },
      ],
      dreRows: [
        { label: "Receita bruta de vendas", value: formatCurrency(revenue), kind: "positive" },
        { label: "Receita financeira registrada", value: formatCurrency(data.finance.totals.income), kind: "positive" },
        { label: "Deducoes, impostos e taxas", value: formatCurrency(0), kind: "negative" },
        { label: "Receita liquida", value: formatCurrency(revenue), kind: "subtotal" },
        { label: "CMV / custo dos veiculos vendidos", value: formatCurrency(Math.max(revenue - grossMargin, 0)), kind: "negative" },
        { label: "Servicos, preparacao e terceiros", value: formatCurrency(toNumber(data.inventory.inventoryValue.capitalizedCosts)), kind: "negative" },
        { label: "Lucro bruto", value: formatCurrency(grossMargin), kind: "subtotal" },
        { label: "Despesas operacionais", value: formatCurrency(expenses), kind: "negative" },
        { label: "EBITDA", value: formatCurrency(ebitda), kind: "highlight" },
        { label: "Resultado financeiro liquido", value: formatCurrency(data.finance.totals.net), kind: data.finance.totals.net >= 0 ? "positive" : "negative" },
        { label: "Lucro liquido estimado", value: formatCurrency(netProfit), kind: "final" },
      ],
      executiveMetrics: [
        { label: "EBITDA", value: formatCurrency(ebitda), detail: "resultado operacional estimado", icon: BarChart3 },
        { label: "Margem EBITDA", value: ebitdaMargin === null ? "--" : formatPercent(ebitdaMargin), detail: "EBITDA sobre receita bruta", icon: Percent },
        { label: "Capital em estoque", value: formatCurrency(inventoryCapital), detail: "custo + gastos capitalizados", icon: CarFront },
        { label: "Rentabilidade estoque", value: stockProfitability === null ? "--" : formatPercent(stockProfitability), detail: "margem sobre capital em estoque", icon: Gauge },
        { label: "Giro de estoque", value: "--", detail: "aguardando historico de venda por veiculo", icon: CalendarClock },
        { label: "ROI operacional", value: roi === null ? "--" : formatPercent(roi), detail: "lucro estimado sobre capital operacional", icon: TrendingUp },
      ],
      resultMetrics: [
        { label: "Receita mes", value: formatCurrency(revenue), detail: "vendas fechadas", tone: "teal" },
        { label: "Lucro estimado", value: formatCurrency(netProfit), detail: "margem menos despesas", tone: "blue" },
        { label: "Fluxo 30 dias", value: formatCurrency(data.forecast[3]?.finance.totals.net ?? 0), detail: "previsao liquida", tone: "amber" },
        { label: "Risco caixa", value: formatCurrency(data.executive.totals.openReceivablesAndPayables), detail: "pendencias e bloqueios", tone: "rose" },
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
      <section className="metric-grid" aria-label="Indicadores de resultado">
        {view.resultMetrics.map((metric) => (
          <article className={`metric-card ${metric.tone}`} key={metric.label}>
            <div>
              <h3>{metric.label}</h3>
              <strong>{metric.value}</strong>
              <span>{metric.detail}</span>
            </div>
          </article>
        ))}
      </section>

      <section className="leads-toolbar panel" aria-label="Filtros de resultados">
        <div>
          {filters.map((filter, index) => (
            <button className={index === 0 ? "active" : ""} key={filter} type="button">
              {filter}
            </button>
          ))}
        </div>
        <span className="live-pill">{statusLabel}</span>
      </section>

      <section className="results-grid">
        <section className="panel results-board" aria-label="Metricas de negocio">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Negocio</p>
              <h3>Receita, margem e despesas</h3>
            </div>
            <BarChart3 aria-hidden="true" size={20} />
          </div>

          <div className="business-list">
            {view.businessRows.map((row) => {
              const Icon = row.icon;
              return (
                <article className="business-row" key={row.label}>
                  <Icon aria-hidden="true" size={20} />
                  <div>
                    <strong>{row.label}</strong>
                    <span>{row.detail}</span>
                  </div>
                  <em>{row.value}</em>
                </article>
              );
            })}
          </div>
        </section>

        <section className="panel forecast-board" aria-label="Previsao de fluxo de caixa">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Fluxo de caixa</p>
              <h3>Previsao por periodo</h3>
            </div>
            <BarChart3 aria-hidden="true" size={20} />
          </div>

          <div className="forecast-list">
            {data.forecast.map((row) => (
              <article className="forecast-row" key={row.period}>
                <div>
                  <CalendarClock aria-hidden="true" size={17} />
                  <strong>{row.period}</strong>
                </div>
                <span>Entradas {formatCurrency(row.finance.totals.income)}</span>
                <span>Saidas {formatCurrency(row.finance.totals.expense)}</span>
                <em>{formatCurrency(row.finance.totals.net)}</em>
              </article>
            ))}
          </div>
        </section>
      </section>

      <section className="dre-grid">
        <section className="panel dre-panel" aria-label="DRE gerencial">
          <div className="section-heading">
            <div>
              <p className="eyebrow">DRE gerencial</p>
              <h3>Demonstrativo de resultado do negocio</h3>
            </div>
            <DreComparisonModal />
          </div>

          <div className="dre-table">
            {view.dreRows.map((row) => (
              <article className={`dre-row ${row.kind}`} key={row.label}>
                <span>{row.label}</span>
                <strong>{row.value}</strong>
              </article>
            ))}
          </div>
        </section>

        <aside className="panel executive-metrics" aria-label="Metricas executivas avancadas">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Metricas executivas</p>
              <h3>Rentabilidade e eficiencia</h3>
            </div>
            <Gauge aria-hidden="true" size={20} />
          </div>

          <div className="executive-metric-list">
            {view.executiveMetrics.map((metric) => {
              const Icon = metric.icon;
              return (
                <article className="executive-metric-card" key={metric.label}>
                  <Icon aria-hidden="true" size={18} />
                  <div>
                    <span>{metric.label}</span>
                    <strong>{metric.value}</strong>
                    <em>{metric.detail}</em>
                  </div>
                </article>
              );
            })}
          </div>
        </aside>
      </section>
    </>
  );
}
