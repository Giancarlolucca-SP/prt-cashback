"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Bot, FileSearch, KeyRound, LockKeyhole, ShieldCheck, UserCog } from "lucide-react";
import { apiGet } from "../auth/auth-client";
import { useAuth } from "../auth/auth-provider";

type AuditResult = "SUCCESS" | "DENIED" | "FAILED";
type AuditView = "audit" | "technical" | "security";

type AuditLog = {
  id: string;
  actorId: string | null;
  actorRole: string | null;
  module: string;
  action: string;
  entityType: string | null;
  entityId: string | null;
  result: AuditResult;
  metadata: unknown;
  createdAt: string;
};

type TechnicalEvent = {
  id: string;
  level: string;
  source: string;
  message: string;
  metadata: unknown;
  createdAt: string;
};

type SecurityEvent = {
  id: string;
  userId: string | null;
  type: string;
  severity: string;
  metadata: unknown;
  createdAt: string;
};

type AuditSummary = {
  auditByResult: Record<string, number>;
  technicalByLevel: Record<string, number>;
  securityBySeverity: Record<string, number>;
};

type ListResponse<T> = {
  items: T[];
  page: number;
  pageSize: number;
  total?: number;
};

const fallbackSummary: AuditSummary = {
  auditByResult: { DENIED: 1, SUCCESS: 2 },
  securityBySeverity: { warning: 1 },
  technicalByLevel: { info: 2 },
};

const fallbackLogs: AuditLog[] = [
  {
    id: "fallback-audit-1",
    actorId: null,
    actorRole: "OWNER_MANAGER",
    module: "finance",
    action: "view_margin",
    entityType: "vehicle",
    entityId: null,
    result: "SUCCESS",
    metadata: {},
    createdAt: new Date().toISOString(),
  },
];

const fallbackTechnical: TechnicalEvent[] = [
  {
    id: "fallback-tech-1",
    level: "info",
    source: "automation",
    message: "Job processado com sucesso.",
    metadata: {},
    createdAt: new Date().toISOString(),
  },
];

const fallbackSecurity: SecurityEvent[] = [
  {
    id: "fallback-security-1",
    userId: null,
    type: "permission_denied",
    severity: "warning",
    metadata: {},
    createdAt: new Date().toISOString(),
  },
];

const viewLabels: Record<AuditView, string> = {
  audit: "Trilha",
  security: "Seguranca",
  technical: "Tecnico",
};

const resultLabels: Record<AuditResult, string> = {
  DENIED: "Bloqueado",
  FAILED: "Falhou",
  SUCCESS: "Sucesso",
};

function relativeDate(dateIso: string) {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(dateIso).getTime()) / 60000));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h`;
  return `${Math.round(hours / 24)} d`;
}

function metadataText(metadata: unknown) {
  if (!metadata || typeof metadata !== "object") return "sem metadados";
  const keys = Object.keys(metadata);
  return keys.length > 0 ? keys.slice(0, 3).join(", ") : "sem metadados";
}

function toneForResult(result: string) {
  if (result === "DENIED") return "blocked";
  if (result === "FAILED" || result.toLowerCase().includes("error") || result.toLowerCase().includes("critical")) return "risk";
  if (result.toLowerCase().includes("warning")) return "warning";
  return "normal";
}

export function LiveAuditWorkspace() {
  const { hasPermission, token } = useAuth();
  const canReadAudit = hasPermission({ module: "audit", action: "read", scope: "ALL", sensitiveArea: "audit" });
  const [activeView, setActiveView] = useState<AuditView>("audit");
  const [auditLogs, setAuditLogs] = useState(fallbackLogs);
  const [moduleFilter, setModuleFilter] = useState("");
  const [resultFilter, setResultFilter] = useState<"" | AuditResult>("");
  const [securityEvents, setSecurityEvents] = useState(fallbackSecurity);
  const [status, setStatus] = useState<"fallback" | "loading" | "live" | "error" | "locked">("fallback");
  const [summary, setSummary] = useState(fallbackSummary);
  const [technicalEvents, setTechnicalEvents] = useState(fallbackTechnical);

  useEffect(() => {
    if (!token) return;
    if (!canReadAudit) {
      setStatus("locked");
      return;
    }

    let isCurrent = true;
    const auditQuery = new URLSearchParams({ page: "1", page_size: "50" });
    if (moduleFilter.trim()) auditQuery.set("module", moduleFilter.trim());
    if (resultFilter) auditQuery.set("result", resultFilter);

    setStatus("loading");
    Promise.all([
      apiGet<AuditSummary>("/audit/summary", token),
      apiGet<ListResponse<AuditLog>>(`/audit/logs?${auditQuery.toString()}`, token),
      apiGet<ListResponse<TechnicalEvent>>("/audit/technical-events?page=1&page_size=30", token),
      apiGet<ListResponse<SecurityEvent>>("/audit/security-events?page=1&page_size=30", token),
    ])
      .then(([nextSummary, logs, technical, security]) => {
        if (!isCurrent) return;
        setSummary(nextSummary);
        setAuditLogs(logs.items);
        setTechnicalEvents(technical.items);
        setSecurityEvents(security.items);
        setStatus("live");
      })
      .catch(() => {
        if (isCurrent) setStatus("error");
      });

    return () => {
      isCurrent = false;
    };
  }, [canReadAudit, moduleFilter, resultFilter, token]);

  const view = useMemo(() => {
    const success = summary.auditByResult.SUCCESS ?? 0;
    const denied = summary.auditByResult.DENIED ?? 0;
    const failed = summary.auditByResult.FAILED ?? 0;
    const technical = Object.values(summary.technicalByLevel).reduce((sum, value) => sum + value, 0);
    const security = Object.values(summary.securityBySeverity).reduce((sum, value) => sum + value, 0);
    const risk = denied + failed + security;

    return {
      metrics: [
        { detail: "logs de acesso e alteracao", label: "Eventos", tone: "teal", value: String(success + denied + failed) },
        { detail: "negados ou falhos", label: "Acoes sensiveis", tone: "amber", value: String(denied + failed) },
        { detail: "eventos tecnicos", label: "Automacoes rastreadas", tone: "blue", value: String(technical) },
        { detail: "exigem revisao do gestor", label: "Alertas de risco", tone: "rose", value: String(risk) },
      ],
    };
  }, [summary]);

  const statusLabel = {
    error: "Usando fallback",
    fallback: "Fallback visual",
    live: "Dados reais",
    loading: "Sincronizando",
    locked: "Sem permissao",
  }[status];

  return (
    <>
      <section className="metric-grid" aria-label="Indicadores de auditoria">
        {view.metrics.map((metric) => (
          <article className={`metric-card ${metric.tone}`} key={metric.label}>
            <div><h3>{metric.label}</h3><strong>{metric.value}</strong><span>{metric.detail}</span></div>
          </article>
        ))}
      </section>

      <section className="leads-toolbar panel" aria-label="Filtros de auditoria">
        <div>
          {(Object.keys(viewLabels) as AuditView[]).map((item) => (
            <button className={item === activeView ? "active" : ""} key={item} onClick={() => setActiveView(item)} type="button">
              {viewLabels[item]}
            </button>
          ))}
        </div>
        <label className="search-box">
          <input aria-label="Modulo" onChange={(event) => setModuleFilter(event.target.value)} placeholder="Modulo: finance, users..." value={moduleFilter} />
        </label>
        <select className="kanban-stage-select" onChange={(event) => setResultFilter(event.target.value as "" | AuditResult)} value={resultFilter}>
          <option value="">Todos resultados</option>
          <option value="SUCCESS">Sucesso</option>
          <option value="DENIED">Bloqueado</option>
          <option value="FAILED">Falhou</option>
        </select>
      </section>

      <section className="audit-grid">
        <section className="panel audit-board" aria-label="Eventos de auditoria">
          <div className="section-heading">
            <div><p className="eyebrow">{viewLabels[activeView]}</p><h3>Acessos e alteracoes recentes</h3></div>
            <span className="live-pill">{statusLabel}</span>
          </div>

          <div className="audit-list">
            {activeView === "audit" ? auditLogs.map((event) => (
              <article className={`audit-card ${toneForResult(event.result)}`} key={event.id}>
                <div className="audit-main"><ShieldCheck aria-hidden="true" size={22} /><div><strong>{event.actorRole || "Sistema"}</strong><span>{event.module}.{event.action}</span></div></div>
                <div className="audit-tags"><span>{event.entityType || "sem entidade"}</span><span>{metadataText(event.metadata)}</span><span>{resultLabels[event.result]}</span></div>
                <div className="audit-time"><strong>{relativeDate(event.createdAt)}</strong><span>{new Date(event.createdAt).toLocaleDateString("pt-BR")}</span></div>
              </article>
            )) : null}

            {activeView === "technical" ? technicalEvents.map((event) => (
              <article className={`audit-card ${toneForResult(event.level)}`} key={event.id}>
                <div className="audit-main"><Bot aria-hidden="true" size={22} /><div><strong>{event.source}</strong><span>{event.message}</span></div></div>
                <div className="audit-tags"><span>{event.level}</span><span>{metadataText(event.metadata)}</span><span>tecnico</span></div>
                <div className="audit-time"><strong>{relativeDate(event.createdAt)}</strong><span>{new Date(event.createdAt).toLocaleDateString("pt-BR")}</span></div>
              </article>
            )) : null}

            {activeView === "security" ? securityEvents.map((event) => (
              <article className={`audit-card ${toneForResult(event.severity)}`} key={event.id}>
                <div className="audit-main"><LockKeyhole aria-hidden="true" size={22} /><div><strong>{event.type}</strong><span>{event.userId ? `Usuario ${event.userId.slice(0, 8)}` : "Sem usuario vinculado"}</span></div></div>
                <div className="audit-tags"><span>{event.severity}</span><span>{metadataText(event.metadata)}</span><span>seguranca</span></div>
                <div className="audit-time"><strong>{relativeDate(event.createdAt)}</strong><span>{new Date(event.createdAt).toLocaleDateString("pt-BR")}</span></div>
              </article>
            )) : null}
          </div>
        </section>

        <aside className="panel audit-side" aria-label="Permissoes e alertas">
          <div className="section-heading"><div><p className="eyebrow">RBAC</p><h3>Permissoes por perfil</h3></div><LockKeyhole aria-hidden="true" size={20} /></div>
          <ul className="permission-list">
            {[
              { role: "Dono/Gestor", access: "metricas financeiras, margem, custos, permissoes e auditoria completa" },
              { role: "Administrativo", access: "custo do veiculo, conciliacao, documentos, pagamentos e consultas" },
              { role: "Vendedor", access: "status comercial, clientes proprios e acompanhamento operacional permitido" },
              { role: "SDR", access: "leads, contatos, retorno e passagem comercial sem dados financeiros sensiveis" },
            ].map((group) => (
              <li key={group.role}><UserCog aria-hidden="true" size={18} /><div><strong>{group.role}</strong><span>{group.access}</span></div></li>
            ))}
          </ul>
          <div className="stock-actions">
            <button type="button"><KeyRound aria-hidden="true" size={17} />Revisar permissoes</button>
            <button type="button"><FileSearch aria-hidden="true" size={17} />Exportar trilha</button>
            <button type="button"><Bot aria-hidden="true" size={17} />Auditar automacao</button>
          </div>
          <div className="automation-status warning"><AlertTriangle aria-hidden="true" size={18} /><span>Dados sensiveis nao devem aparecer no frontend para perfis sem permissao.</span></div>
        </aside>
      </section>
    </>
  );
}
