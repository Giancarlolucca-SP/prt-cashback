"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, BarChart3, ClipboardCheck, Filter, RefreshCw, UsersRound } from "lucide-react";
import { apiGet } from "../auth/auth-client";
import { useAuth } from "../auth/auth-provider";

type ModuleKey = "overview" | "sdr" | "sales";
type LoadStatus = "idle" | "loading" | "live" | "error" | "locked";

type CommercialFilters = {
  from: string;
  to: string;
  responsibleUserId: string;
  origin: string;
  channel: string;
  stage: string;
};

type CommercialOverview = {
  filters: {
    responsibleUserId: string | null;
    origin: string | null;
    channel: string | null;
    stage: string | null;
  };
  modules: string[];
  totals: {
    activeCards: number;
    newLeads: number;
    commercialCards: number;
    salesCards: number;
    documentationProcesses: number;
    appointments: number;
    overdueFollowUps: number;
    highRiskLeads: number;
    stalledNegotiations: number;
    closedDeals: number;
    pendingNotifications: number;
    resolvedNotifications: number;
    technicalDeliveries: {
      scheduled: number;
      pendingSignedCopy: number;
      completed: number;
    };
  };
  distributions: {
    commercialCardsByStage: Record<string, number>;
    salesByStage: Record<string, number>;
    appointmentsByStatus: Record<string, number>;
    activeAlertsByType: Record<string, number>;
    activeAlertsBySeverity: Record<string, number>;
    notificationsByStatus: Record<string, number>;
    technicalDeliveriesByStatus: Record<string, number>;
    byResponsible: Record<string, number>;
    byOrigin: Record<string, number>;
    byChannel: Record<string, number>;
  };
};

type CommercialSdr = {
  filters: {
    responsibleUserId: string | null;
    origin: string | null;
    channel: string | null;
    stage: string | null;
  };
  totals: {
    cards: number;
    transferredToSales: number;
    conversionRate: number | null;
    followUpsOverdue: number;
    leadCooling: number;
    leadHighRisk: number;
    visitsConfirmed: number;
    visitsAttended: number;
    noShows: number;
    reschedules: number;
  };
  cardsByStage: Record<string, number>;
  appointmentsByStatus: Record<string, number>;
  appointmentsByType: Record<string, number>;
  alertsByType: Record<string, number>;
  alertsBySeverity: Record<string, number>;
  byOrigin: Record<string, number>;
  byChannel: Record<string, number>;
};

type CommercialSales = {
  filters: {
    sellerUserId: string | null;
    origin: string | null;
    channel: string | null;
    stage: string | null;
  };
  totals: {
    salesCards: number;
    receivedFromSdr: number;
    directSales: number;
    customersAtStore: number;
    testDrives: number;
    negotiationsInProgress: number;
    awaitingReturn: number;
    closedDeals: number;
    lostDeals: number;
    sentToDocumentation: number;
    stalledNegotiations: number;
    followUpsOverdue: number;
  };
  salesByStage: Record<string, number>;
  salesByStatus: Record<string, number>;
  appointmentsByStatus: Record<string, number>;
  alertsByType: Record<string, number>;
  alertsBySeverity: Record<string, number>;
  bySeller: Record<string, number>;
  byOrigin: Record<string, number>;
  byChannel: Record<string, number>;
};

const fullViewRoles = new Set(["OWNER_MANAGER", "ADMIN", "ADMINISTRATIVE"]);
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const commercialStages = [
  { key: "NEW_LEAD", label: "Novo lead" },
  { key: "IN_CONTACT", label: "Em contato" },
  { key: "SCHEDULED", label: "Agendado" },
  { key: "VISITED", label: "Visitou loja" },
  { key: "TEST_DRIVE", label: "Test drive" },
  { key: "NEGOTIATION", label: "Em negociacao" },
  { key: "AWAITING_RETURN", label: "Aguardando retorno" },
  { key: "AWAITING_PURCHASE_CONFIRMATION", label: "Confirmacao compra" },
  { key: "LOST", label: "Perdido" },
] as const;

const salesStages = [
  { key: "ASSUMED", label: "Vendedor assumiu" },
  { key: "IN_NEGOTIATION", label: "Em negociacao" },
  { key: "AWAITING_RETURN", label: "Aguardando retorno" },
  { key: "LOST", label: "Perdido" },
  { key: "CLOSED_WON", label: "Negocio fechado" },
] as const;

const moduleLabels: Record<ModuleKey, { eyebrow: string; title: string; description: string }> = {
  overview: {
    eyebrow: "Geral",
    title: "Operacao comercial",
    description: "SDR, Vendas, documentacao, agenda e alertas em uma leitura unica.",
  },
  sdr: {
    eyebrow: "Kanban SDR",
    title: "Qualificacao e passagem",
    description: "Cards por etapa, visitas, leads esfriando e transferencia para Vendas.",
  },
  sales: {
    eyebrow: "Kanban Vendas",
    title: "Negociacao e fechamento",
    description: "Recebidos do SDR, negociacoes paradas, fechamentos e envio para Gestao.",
  },
};

function isoDateInput(date: Date) {
  return date.toISOString().slice(0, 10);
}

function defaultFilters(): CommercialFilters {
  const now = new Date();
  const from = new Date(now);
  from.setDate(now.getDate() - 29);
  return {
    from: isoDateInput(from),
    to: isoDateInput(now),
    responsibleUserId: "",
    origin: "",
    channel: "",
    stage: "",
  };
}

function modulesForRole(role?: string): ModuleKey[] {
  if (!role) {
    return [];
  }
  if (fullViewRoles.has(role)) {
    return ["overview", "sdr", "sales"];
  }
  if (role === "SDR") {
    return ["sdr"];
  }
  if (role === "SELLER") {
    return ["sales"];
  }
  return [];
}

function modulePath(module: ModuleKey) {
  return {
    overview: "/analytics/commercial-overview",
    sdr: "/analytics/commercial-sdr",
    sales: "/analytics/commercial-sales",
  }[module];
}

function stageOptions(module: ModuleKey) {
  return module === "sales" ? salesStages : commercialStages;
}

function toDateTime(value: string, endOfDay = false) {
  if (!value) {
    return null;
  }
  const date = new Date(`${value}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}`);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function buildQuery(filters: CommercialFilters, canFilterResponsible: boolean) {
  const params = new URLSearchParams();
  const from = toDateTime(filters.from);
  const to = toDateTime(filters.to, true);
  if (from) {
    params.set("from", from);
  }
  if (to) {
    params.set("to", to);
  }
  if (canFilterResponsible && uuidPattern.test(filters.responsibleUserId.trim())) {
    params.set("responsible_user_id", filters.responsibleUserId.trim());
  }
  if (filters.origin.trim()) {
    params.set("origin", filters.origin.trim());
  }
  if (filters.channel.trim()) {
    params.set("channel", filters.channel.trim());
  }
  if (filters.stage) {
    params.set("stage", filters.stage);
  }
  const query = params.toString();
  return query ? `?${query}` : "";
}

function formatPercent(value: number | null) {
  return value === null ? "--" : `${(value * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
}

function humanize(value: string) {
  if (value === "sem_valor" || value === "null") {
    return "Sem valor";
  }
  return value
    .toLowerCase()
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function totalRecord(source: Record<string, number>) {
  return Object.values(source).reduce((total, value) => total + value, 0);
}

function topEntries(source: Record<string, number>, limit = 5) {
  return Object.entries(source)
    .sort(([, a], [, b]) => b - a)
    .slice(0, limit);
}

function metric(label: string, value: number | string, detail: string, tone: "teal" | "blue" | "amber" | "rose" = "teal") {
  return { label, value: String(value), detail, tone };
}

function metricsFor(module: ModuleKey, data: CommercialOverview | CommercialSdr | CommercialSales | null) {
  if (!data) {
    return [
      metric("Cards ativos", 0, "aguardando dados reais"),
      metric("Gargalos", 0, "sem leitura carregada", "amber"),
      metric("Fechados", 0, "sem leitura carregada", "blue"),
      metric("Follow-ups", 0, "sem leitura carregada", "rose"),
    ];
  }

  if (module === "overview") {
    const overview = data as CommercialOverview;
    return [
      metric("Cards ativos", overview.totals.activeCards, `${overview.totals.newLeads} leads novos`),
      metric("Vendas", overview.totals.salesCards, `${overview.totals.closedDeals} fechadas`, "blue"),
      metric("Documentacao", overview.totals.documentationProcesses, "processos recebidos", "amber"),
      metric("Riscos", overview.totals.highRiskLeads + overview.totals.stalledNegotiations, "leads/negociacoes em alerta", "rose"),
    ];
  }

  if (module === "sdr") {
    const sdr = data as CommercialSdr;
    return [
      metric("Cards SDR", sdr.totals.cards, "leads em qualificacao"),
      metric("Transferidos", sdr.totals.transferredToSales, `conversao ${formatPercent(sdr.totals.conversionRate)}`, "blue"),
      metric("Visitas", sdr.totals.visitsConfirmed + sdr.totals.visitsAttended, `${sdr.totals.noShows} no-show`, "amber"),
      metric("Esfriando", sdr.totals.leadCooling + sdr.totals.leadHighRisk, `${sdr.totals.followUpsOverdue} follow-ups vencidos`, "rose"),
    ];
  }

  const sales = data as CommercialSales;
  return [
    metric("Cards Vendas", sales.totals.salesCards, `${sales.totals.receivedFromSdr} vindos do SDR`),
    metric("Fechados", sales.totals.closedDeals, `${sales.totals.lostDeals} perdidos`, "blue"),
    metric("Em negociacao", sales.totals.negotiationsInProgress, `${sales.totals.awaitingReturn} aguardando retorno`, "amber"),
    metric("Gargalos", sales.totals.stalledNegotiations + sales.totals.followUpsOverdue, `${sales.totals.sentToDocumentation} enviados para Gestao`, "rose"),
  ];
}

function stageCountsFor(module: ModuleKey, data: CommercialOverview | CommercialSdr | CommercialSales | null) {
  if (!data) {
    return { commercial: {}, sales: {} };
  }
  if (module === "overview") {
    const overview = data as CommercialOverview;
    return {
      commercial: overview.distributions.commercialCardsByStage,
      sales: overview.distributions.salesByStage,
    };
  }
  if (module === "sdr") {
    return { commercial: (data as CommercialSdr).cardsByStage, sales: {} };
  }
  return { commercial: {}, sales: (data as CommercialSales).salesByStage };
}

function breakdownsFor(module: ModuleKey, data: CommercialOverview | CommercialSdr | CommercialSales | null) {
  if (!data) {
    return [];
  }
  if (module === "overview") {
    const overview = data as CommercialOverview;
    return [
      { title: "Origem", items: topEntries(overview.distributions.byOrigin) },
      { title: "Canal", items: topEntries(overview.distributions.byChannel) },
      { title: "Alertas", items: topEntries(overview.distributions.activeAlertsByType) },
      { title: "Entregas", items: topEntries(overview.distributions.technicalDeliveriesByStatus) },
    ];
  }
  if (module === "sdr") {
    const sdr = data as CommercialSdr;
    return [
      { title: "Origem", items: topEntries(sdr.byOrigin) },
      { title: "Canal", items: topEntries(sdr.byChannel) },
      { title: "Agenda", items: topEntries(sdr.appointmentsByStatus) },
      { title: "Alertas", items: topEntries(sdr.alertsByType) },
    ];
  }
  const sales = data as CommercialSales;
  return [
    { title: "Origem", items: topEntries(sales.byOrigin) },
    { title: "Canal", items: topEntries(sales.byChannel) },
    { title: "Status", items: topEntries(sales.salesByStatus) },
    { title: "Alertas", items: topEntries(sales.alertsByType) },
  ];
}

function StageList({
  counts,
  title,
  stages,
}: {
  counts: Record<string, number>;
  title: string;
  stages: readonly { key: string; label: string }[];
}) {
  const total = Math.max(totalRecord(counts), 1);

  return (
    <article className="panel commercial-stage-panel">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Etapas</p>
          <h3>{title}</h3>
        </div>
        <span className="live-pill">{totalRecord(counts)} cards</span>
      </div>
      <div className="commercial-stage-list">
        {stages.map((stage) => {
          const value = counts[stage.key] ?? 0;
          return (
            <div className="commercial-stage-row" key={stage.key}>
              <span>{stage.label}</span>
              <div aria-hidden="true">
                <i style={{ width: `${Math.max(4, (value / total) * 100)}%` }} />
              </div>
              <strong>{value}</strong>
            </div>
          );
        })}
      </div>
    </article>
  );
}

export function LiveCommercialAnalytics() {
  const { hasPermission, token, user } = useAuth();
  const [activeModule, setActiveModule] = useState<ModuleKey>("overview");
  const [filters, setFilters] = useState<CommercialFilters>(() => defaultFilters());
  const [status, setStatus] = useState<LoadStatus>("idle");
  const [data, setData] = useState<CommercialOverview | CommercialSdr | CommercialSales | null>(null);

  const canReadDashboard = hasPermission({ module: "dashboard", action: "read" });
  const availableModules = useMemo(() => modulesForRole(user?.role), [user?.role]);
  const canFilterResponsible = Boolean(user?.role && fullViewRoles.has(user.role));
  const responsibleFilterInvalid = filters.responsibleUserId.trim().length > 0 && !uuidPattern.test(filters.responsibleUserId.trim());

  useEffect(() => {
    if (availableModules.length > 0 && !availableModules.includes(activeModule)) {
      setActiveModule(availableModules[0]);
    }
  }, [activeModule, availableModules]);

  useEffect(() => {
    if (!token || !canReadDashboard || availableModules.length === 0) {
      setStatus("locked");
      setData(null);
      return;
    }
    if (!availableModules.includes(activeModule) || responsibleFilterInvalid) {
      return;
    }

    let isCurrent = true;
    setStatus("loading");
    apiGet<CommercialOverview | CommercialSdr | CommercialSales>(
      `${modulePath(activeModule)}${buildQuery(filters, canFilterResponsible)}`,
      token,
    )
      .then((nextData) => {
        if (!isCurrent) {
          return;
        }
        setData(nextData);
        setStatus("live");
      })
      .catch(() => {
        if (!isCurrent) {
          return;
        }
        setData(null);
        setStatus("error");
      });

    return () => {
      isCurrent = false;
    };
  }, [activeModule, availableModules, canFilterResponsible, canReadDashboard, filters, responsibleFilterInvalid, token]);

  const currentMetrics = useMemo(() => metricsFor(activeModule, data), [activeModule, data]);
  const stageCounts = useMemo(() => stageCountsFor(activeModule, data), [activeModule, data]);
  const breakdowns = useMemo(() => breakdownsFor(activeModule, data), [activeModule, data]);
  const selectedModule = moduleLabels[activeModule];
  const statusLabel = {
    error: "Erro ao carregar",
    idle: "Aguardando",
    live: "Dados reais",
    loading: "Sincronizando",
    locked: "Sem permissao",
  }[status];
  const hasAnyData = data ? currentMetrics.some((item) => Number(item.value) > 0) : false;

  function clearFilters() {
    setFilters(defaultFilters());
  }

  return (
    <section className="commercial-dashboard" aria-label="Metricas comerciais da Sprint 2">
      <section className="panel commercial-control-panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Sprint 2</p>
            <h3>Metricas comerciais basicas</h3>
          </div>
          <span className="live-pill">{statusLabel}</span>
        </div>

        <div className="commercial-module-tabs segmented-control" aria-label="Selecionar modulo comercial">
          {availableModules.length > 0 ? (
            availableModules.map((module) => (
              <button
                className={module === activeModule ? "active" : ""}
                key={module}
                onClick={() => setActiveModule(module)}
                type="button"
              >
                {moduleLabels[module].eyebrow}
              </button>
            ))
          ) : (
            <button className="active" type="button">
              Bloqueado
            </button>
          )}
        </div>

        <div className="commercial-filter-grid" aria-label="Filtros comerciais">
          <label>
            De
            <input
              type="date"
              value={filters.from}
              onChange={(event) => setFilters((current) => ({ ...current, from: event.target.value }))}
            />
          </label>
          <label>
            Ate
            <input
              type="date"
              value={filters.to}
              onChange={(event) => setFilters((current) => ({ ...current, to: event.target.value }))}
            />
          </label>
          <label>
            Responsavel
            <input
              disabled={!canFilterResponsible}
              placeholder={canFilterResponsible ? "UUID do responsavel" : "Escopo proprio"}
              value={filters.responsibleUserId}
              onChange={(event) => setFilters((current) => ({ ...current, responsibleUserId: event.target.value }))}
            />
          </label>
          <label>
            Origem
            <input
              placeholder="WhatsApp, Site..."
              value={filters.origin}
              onChange={(event) => setFilters((current) => ({ ...current, origin: event.target.value }))}
            />
          </label>
          <label>
            Canal
            <input
              placeholder="Loja, campanha..."
              value={filters.channel}
              onChange={(event) => setFilters((current) => ({ ...current, channel: event.target.value }))}
            />
          </label>
          <label>
            Etapa
            <select value={filters.stage} onChange={(event) => setFilters((current) => ({ ...current, stage: event.target.value }))}>
              <option value="">Todas</option>
              {stageOptions(activeModule).map((stage) => (
                <option key={stage.key} value={stage.key}>
                  {stage.label}
                </option>
              ))}
            </select>
          </label>
          <button className="text-button" onClick={clearFilters} type="button">
            Limpar
          </button>
        </div>

        {responsibleFilterInvalid ? (
          <p className="commercial-helper">Informe um UUID valido para filtrar por responsavel.</p>
        ) : (
          <p className="commercial-helper">
            {selectedModule.description} Filtros aplicados direto nas fontes transacionais.
          </p>
        )}
      </section>

      <section className="metric-grid" aria-label={`Indicadores do modulo ${selectedModule.eyebrow}`}>
        {currentMetrics.map((item) => (
          <article className={`metric-card ${item.tone}`} key={item.label}>
            <div>
              <h3>{item.label}</h3>
              <strong>{item.value}</strong>
              <span>{item.detail}</span>
            </div>
          </article>
        ))}
      </section>

      {status === "locked" ? (
        <section className="panel commercial-state-panel">
          <Filter aria-hidden="true" size={22} />
          <div>
            <strong>Sem acesso ao dashboard comercial</strong>
            <span>Esta leitura exige permissao de dashboard e papel comercial habilitado.</span>
          </div>
        </section>
      ) : null}

      {status === "error" ? (
        <section className="panel commercial-state-panel warning">
          <AlertTriangle aria-hidden="true" size={22} />
          <div>
            <strong>Nao foi possivel carregar as metricas agora</strong>
            <span>Os dados anteriores foram descartados para evitar contagem enganosa.</span>
          </div>
          <button className="primary-action" onClick={() => setFilters((current) => ({ ...current }))} type="button">
            <RefreshCw aria-hidden="true" size={17} />
            Tentar de novo
          </button>
        </section>
      ) : null}

      {status === "live" && !hasAnyData ? (
        <section className="panel commercial-state-panel">
          <BarChart3 aria-hidden="true" size={22} />
          <div>
            <strong>Sem dados para este recorte</strong>
            <span>Troque periodo, etapa ou origem para ampliar a leitura.</span>
          </div>
        </section>
      ) : null}

      <section className="commercial-stage-grid" aria-label="Distribuicao por etapa">
        {activeModule === "overview" || activeModule === "sdr" ? (
          <StageList counts={stageCounts.commercial} stages={commercialStages} title="Kanban SDR" />
        ) : null}
        {activeModule === "overview" || activeModule === "sales" ? (
          <StageList counts={stageCounts.sales} stages={salesStages} title="Kanban Vendas" />
        ) : null}
      </section>

      <section className="commercial-breakdown-grid" aria-label="Quebras comerciais">
        {breakdowns.map((section) => (
          <article className="panel commercial-breakdown-panel" key={section.title}>
            <div className="section-heading">
              <div>
                <p className="eyebrow">Distribuicao</p>
                <h3>{section.title}</h3>
              </div>
              {section.title === "Alertas" ? <AlertTriangle aria-hidden="true" size={20} /> : <UsersRound aria-hidden="true" size={20} />}
            </div>
            <ul className="commercial-breakdown-list">
              {section.items.length > 0 ? (
                section.items.map(([label, value]) => (
                  <li key={`${section.title}-${label}`}>
                    <span>{humanize(label)}</span>
                    <strong>{value}</strong>
                  </li>
                ))
              ) : (
                <li>
                  <span>Sem dados</span>
                  <strong>0</strong>
                </li>
              )}
            </ul>
          </article>
        ))}

        {activeModule === "overview" && data ? (
          <article className="panel commercial-breakdown-panel">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Gestao</p>
                <h3>Documentos e entrega</h3>
              </div>
              <ClipboardCheck aria-hidden="true" size={20} />
            </div>
            <ul className="commercial-breakdown-list">
              <li>
                <span>Notificacoes pendentes</span>
                <strong>{(data as CommercialOverview).totals.pendingNotifications}</strong>
              </li>
              <li>
                <span>Notificacoes resolvidas</span>
                <strong>{(data as CommercialOverview).totals.resolvedNotifications}</strong>
              </li>
              <li>
                <span>Entregas agendadas</span>
                <strong>{(data as CommercialOverview).totals.technicalDeliveries.scheduled}</strong>
              </li>
              <li>
                <span>Pendente assinatura/anexo</span>
                <strong>{(data as CommercialOverview).totals.technicalDeliveries.pendingSignedCopy}</strong>
              </li>
            </ul>
          </article>
        ) : null}
      </section>
    </section>
  );
}
