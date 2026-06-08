"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import { apiGet } from "../auth/auth-client";
import { useAuth } from "../auth/auth-provider";

const periods = ["Hoje", "7 dias", "30 dias"] as const;
type Period = (typeof periods)[number];

type ExecutiveSummary = {
  revenueSeries: Array<{ month: string; vendas: number; margem: number }>;
};

type SalesFunnel = {
  leadsBySource?: Record<string, number>;
  leadsByStatus: Record<string, number>;
  salesByStatus: Record<string, number>;
  appointmentsByStatus: Record<string, number>;
};

const fallbackSummary: ExecutiveSummary = {
  revenueSeries: [
    { month: "Jan", vendas: 182000, margem: 31200 },
    { month: "Fev", vendas: 196000, margem: 34800 },
    { month: "Mar", vendas: 221000, margem: 41100 },
    { month: "Abr", vendas: 204500, margem: 37600 },
    { month: "Mai", vendas: 238000, margem: 45200 },
    { month: "Jun", vendas: 251500, margem: 48600 }
  ]
};

const fallbackFunnel: SalesFunnel = {
  leadsBySource: { WhatsApp: 34, Site: 21, Marketplace: 31, Loja: 14 },
  leadsByStatus: { NEW: 31, CONTACTED: 26, SCHEDULED: 13, NEGOTIATION: 14, WON: 7, LOST: 9 },
  salesByStatus: { PROPOSAL: 7, APPROVED: 2, DOCUMENTATION: 3, CLOSED: 7 },
  appointmentsByStatus: { SCHEDULED: 12, CONFIRMED: 8, DONE: 5 }
};

const COLORS = ["#00a884", "#7c5cff", "#ff8a3d", "#ff4d6d"];

function periodQuery(period: Period) {
  const now = new Date();
  const start = new Date(now);

  if (period === "Hoje") {
    start.setHours(0, 0, 0, 0);
  } else {
    start.setDate(now.getDate() - (period === "7 dias" ? 6 : 29));
    start.setHours(0, 0, 0, 0);
  }

  return `?from=${encodeURIComponent(start.toISOString())}&to=${encodeURIComponent(now.toISOString())}`;
}

function humanize(value: string) {
  if (value === "null") {
    return "Sem origem";
  }

  return value
    .toLowerCase()
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function sum(values: number[]) {
  return values.reduce((total, value) => total + value, 0);
}

function currencyTick(value: number) {
  return `${Math.round(value / 1000)}k`;
}

function currencyTooltip(value: unknown) {
  return new Intl.NumberFormat("pt-BR", { currency: "BRL", style: "currency" }).format(Number(value));
}

export function DashboardCharts() {
  const { hasPermission, token } = useAuth();
  const canReadDashboard = hasPermission({ module: "dashboard", action: "read" });
  const [period, setPeriod] = useState<Period>("7 dias");
  const [summary, setSummary] = useState<ExecutiveSummary>(fallbackSummary);
  const [funnel, setFunnel] = useState<SalesFunnel>(fallbackFunnel);

  useEffect(() => {
    if (!token || !canReadDashboard) {
      return;
    }

    let isCurrent = true;
    const query = periodQuery(period);

    Promise.all([
      apiGet<ExecutiveSummary>(`/analytics/executive-summary${query}`, token),
      apiGet<SalesFunnel>(`/analytics/sales-funnel${query}`, token),
    ])
      .then(([nextSummary, nextFunnel]) => {
        if (!isCurrent) {
          return;
        }

        setSummary(nextSummary);
        setFunnel(nextFunnel);
      })
      .catch(() => undefined);

    return () => {
      isCurrent = false;
    };
  }, [canReadDashboard, period, token]);

  const activeSourceData = useMemo(() => {
    const entries = Object.entries(funnel.leadsBySource ?? {});
    const total = sum(entries.map(([, value]) => value));

    if (total === 0) {
      return [{ name: "Sem dados", value: 100 }];
    }

    return entries
      .map(([name, value]) => ({
        name: humanize(name),
        value: Math.round((value / total) * 100),
      }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 4);
  }, [funnel.leadsBySource]);

  const funnelData = useMemo(() => {
    const leadTotal = sum(Object.values(funnel.leadsByStatus));
    const attended = sum([
      funnel.leadsByStatus.CONTACTED ?? 0,
      funnel.leadsByStatus.SCHEDULED ?? 0,
      funnel.leadsByStatus.NEGOTIATION ?? 0,
      funnel.leadsByStatus.WON ?? 0,
    ]);
    const visits = sum(Object.values(funnel.appointmentsByStatus));
    const proposals = sum([
      funnel.salesByStatus.PROPOSAL ?? 0,
      funnel.salesByStatus.APPROVED ?? 0,
      funnel.salesByStatus.DOCUMENTATION ?? 0,
      funnel.salesByStatus.CLOSED ?? 0,
    ]);

    return [
      { name: "Lead", value: leadTotal },
      { name: "Atendido", value: attended },
      { name: "Visita", value: visits },
      { name: "Proposta", value: proposals },
      { name: "Venda", value: funnel.salesByStatus.CLOSED ?? 0 },
    ];
  }, [funnel]);

  return (
    <section className="chart-zone" aria-label="Graficos do painel">
      <article className="panel chart-panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Origem</p>
            <h3>Distribuicao de leads</h3>
          </div>
          <div className="segmented-control" aria-label="Periodo do grafico">
            {periods.map((item) => (
              <button
                className={item === period ? "active" : ""}
                key={item}
                onClick={() => setPeriod(item)}
                type="button"
              >
                {item}
              </button>
            ))}
          </div>
        </div>
        <div className="chart-box">
          <ResponsiveContainer height={250} width="100%">
            <PieChart>
              <Pie
                cx="50%"
                cy="50%"
                data={activeSourceData}
                dataKey="value"
                innerRadius={62}
                nameKey="name"
                outerRadius={92}
                paddingAngle={3}
              >
                {activeSourceData.map((entry, index) => (
                  <Cell fill={COLORS[index % COLORS.length]} key={entry.name} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="legend-grid">
          {activeSourceData.map((item, index) => (
            <span key={item.name}>
              <i style={{ background: COLORS[index % COLORS.length] }} />
              {item.name} {item.value}%
            </span>
          ))}
        </div>
      </article>

      <article className="panel chart-panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Conversao</p>
            <h3>Funil comercial</h3>
          </div>
        </div>
        <div className="chart-box">
          <ResponsiveContainer height={250} width="100%">
            <BarChart data={funnelData}>
              <CartesianGrid stroke="#ebe7f4" vertical={false} />
              <XAxis dataKey="name" tickLine={false} />
              <YAxis hide />
              <Tooltip />
              <Bar dataKey="value" fill="#7c5cff" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </article>

      <article className="panel chart-panel wide">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Resultado semestral</p>
            <h3>Vendas e margem estimada</h3>
          </div>
        </div>
        <div className="chart-box">
          <ResponsiveContainer height={260} width="100%">
            <AreaChart data={summary.revenueSeries}>
              <defs>
                <linearGradient id="salesGradient" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="5%" stopColor="#00a884" stopOpacity={0.26} />
                  <stop offset="95%" stopColor="#00a884" stopOpacity={0.02} />
                </linearGradient>
                <linearGradient id="marginGradient" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="5%" stopColor="#ff8a3d" stopOpacity={0.24} />
                  <stop offset="95%" stopColor="#ff8a3d" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="#ebe7f4" vertical={false} />
              <XAxis dataKey="month" tickLine={false} />
              <YAxis tickFormatter={currencyTick} tickLine={false} />
              <Tooltip formatter={currencyTooltip} />
              <Area dataKey="vendas" fill="url(#salesGradient)" stroke="#00a884" strokeWidth={3} />
              <Area dataKey="margem" fill="url(#marginGradient)" stroke="#ff8a3d" strokeWidth={3} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </article>
    </section>
  );
}
