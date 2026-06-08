"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Bot, Braces, Clock, Gauge, Plus, RotateCcw, ShieldCheck, Workflow, X } from "lucide-react";
import { apiGet, apiPost } from "../auth/auth-client";
import { useAuth } from "../auth/auth-provider";

type RuleStatus = "DRAFT" | "ACTIVE" | "PAUSED" | "ARCHIVED";
type JobStatus = "QUEUED" | "RUNNING" | "SUCCEEDED" | "FAILED" | "CANCELLED";

type AutomationRule = {
  id: string;
  name: string;
  trigger: string;
  status: RuleStatus;
  currentVersion: number;
  createdAt: string;
  updatedAt: string;
};

type BackgroundJob = {
  id: string;
  jobType: string;
  status: JobStatus;
  entityType: string | null;
  entityId: string | null;
  attempts: number;
  maxAttempts: number;
  scheduledAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  lastError: string | null;
};

type ListResponse<T> = {
  items: T[];
  page: number;
  pageSize: number;
  total?: number;
};

type RuleFormState = {
  action: string;
  name: string;
  status: RuleStatus;
  trigger: string;
};

type JobFormState = {
  jobType: string;
  payload: string;
};

const emptyRuleForm: RuleFormState = {
  action: "notify",
  name: "",
  status: "DRAFT",
  trigger: "lead.created",
};

const emptyJobForm: JobFormState = {
  jobType: "automation.manual",
  payload: "{}",
};

const fallbackRules: AutomationRule[] = [
  {
    id: "fallback-1",
    name: "Webhook lead marketplace",
    trigger: "lead.created",
    status: "ACTIVE",
    currentVersion: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

const fallbackJobs: BackgroundJob[] = [
  {
    id: "fallback-job-1",
    jobType: "document.ocr",
    status: "QUEUED",
    entityType: "file_attachment",
    entityId: null,
    attempts: 0,
    maxAttempts: 3,
    scheduledAt: new Date().toISOString(),
    startedAt: null,
    finishedAt: null,
    lastError: null,
  },
];

const ruleFilters: Array<{ label: string; status?: RuleStatus }> = [
  { label: "Todas" },
  { label: "Ativas", status: "ACTIVE" },
  { label: "Rascunhos", status: "DRAFT" },
  { label: "Pausadas", status: "PAUSED" },
  { label: "Arquivadas", status: "ARCHIVED" },
];

const ruleStatusLabels: Record<RuleStatus, string> = {
  ACTIVE: "Ativa",
  ARCHIVED: "Arquivada",
  DRAFT: "Rascunho",
  PAUSED: "Pausada",
};

const jobStatusLabels: Record<JobStatus, string> = {
  CANCELLED: "Cancelado",
  FAILED: "Falhou",
  QUEUED: "Fila",
  RUNNING: "Processando",
  SUCCEEDED: "Concluido",
};

function parsePayload(value: string) {
  try {
    return JSON.parse(value) as Record<string, unknown>;
  } catch {
    return { raw: value };
  }
}

function relativeDate(dateIso: string | null) {
  if (!dateIso) return "sem data";
  const minutes = Math.max(0, Math.round((Date.now() - new Date(dateIso).getTime()) / 60000));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h`;
  return `${Math.round(hours / 24)} d`;
}

export function LiveAutomationsWorkspace() {
  const { hasPermission, token } = useAuth();
  const canManageAutomation = hasPermission({ module: "automation", action: "manage", scope: "ALL", sensitiveArea: "technical" });
  const [activeFilter, setActiveFilter] = useState(ruleFilters[0]);
  const [jobForm, setJobForm] = useState(emptyJobForm);
  const [jobModalOpen, setJobModalOpen] = useState(false);
  const [jobs, setJobs] = useState(fallbackJobs);
  const [movingId, setMovingId] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [ruleForm, setRuleForm] = useState(emptyRuleForm);
  const [ruleModalOpen, setRuleModalOpen] = useState(false);
  const [rules, setRules] = useState(fallbackRules);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<"fallback" | "loading" | "live" | "error" | "locked">("fallback");

  useEffect(() => {
    if (!token) return;
    if (!canManageAutomation) {
      setStatus("locked");
      return;
    }

    let isCurrent = true;
    const query = new URLSearchParams({ page: "1", page_size: "50" });
    if (activeFilter.status) query.set("status", activeFilter.status);

    setStatus("loading");
    Promise.all([
      apiGet<ListResponse<AutomationRule>>(`/automations/rules?${query.toString()}`, token),
      apiGet<ListResponse<BackgroundJob>>("/jobs?page=1&page_size=50", token),
    ])
      .then(([ruleList, jobList]) => {
        if (!isCurrent) return;
        setRules(ruleList.items);
        setJobs(jobList.items);
        setStatus("live");
      })
      .catch(() => {
        if (isCurrent) setStatus("error");
      });

    return () => {
      isCurrent = false;
    };
  }, [activeFilter, canManageAutomation, refreshKey, token]);

  async function createRule(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || !canManageAutomation || saving) return;

    setSaving(true);
    setSaveError(null);
    try {
      const response = await apiPost<{ data: AutomationRule }>("/automations/rules", token, {
        definition: {
          actions: [{ type: ruleForm.action }],
          guardrails: ["human_approval_when_sensitive"],
        },
        name: ruleForm.name.trim(),
        status: ruleForm.status,
        trigger: ruleForm.trigger.trim(),
      });
      setRules((current) => [response.data, ...current.filter((rule) => rule.id !== response.data.id)]);
      setRuleForm(emptyRuleForm);
      setRuleModalOpen(false);
      setRefreshKey((current) => current + 1);
    } catch {
      setSaveError("Nao foi possivel criar a regra de automacao.");
    } finally {
      setSaving(false);
    }
  }

  async function updateRuleStatus(rule: AutomationRule, nextStatus: RuleStatus) {
    if (!token || !canManageAutomation || movingId || rule.status === nextStatus) return;

    const previous = rule;
    setMovingId(rule.id);
    setRules((current) => current.map((item) => (item.id === rule.id ? { ...item, status: nextStatus } : item)));
    try {
      const response = await apiPost<{ data: AutomationRule }>(`/automations/rules/${rule.id}/status`, token, {
        reason: "Atualizado pela central de automacoes",
        status: nextStatus,
      });
      setRules((current) => current.map((item) => (item.id === rule.id ? response.data : item)));
      setRefreshKey((current) => current + 1);
    } catch {
      setRules((current) => current.map((item) => (item.id === rule.id ? previous : item)));
      setStatus("error");
    } finally {
      setMovingId(null);
    }
  }

  async function runRuleTest(rule: AutomationRule) {
    if (!token || !canManageAutomation || movingId) return;

    setMovingId(rule.id);
    try {
      await apiPost<{ data: { id: string } }>(`/automations/rules/${rule.id}/tests`, token, {
        input: { source: "crm-web", trigger: rule.trigger },
      });
      await apiPost<{ data: { id: string } }>(`/automations/rules/${rule.id}/events`, token, {
        context: { source: "crm-web" },
        entityType: "automation_rule",
        status: "SUCCEEDED",
      });
      setRefreshKey((current) => current + 1);
    } catch {
      setStatus("error");
    } finally {
      setMovingId(null);
    }
  }

  async function enqueueJob(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || !canManageAutomation || saving) return;

    setSaving(true);
    setSaveError(null);
    try {
      const response = await apiPost<{ data: BackgroundJob }>("/jobs/enqueue", token, {
        jobType: jobForm.jobType.trim(),
        maxAttempts: 3,
        payload: parsePayload(jobForm.payload),
      });
      setJobs((current) => [response.data, ...current.filter((job) => job.id !== response.data.id)]);
      setJobForm(emptyJobForm);
      setJobModalOpen(false);
      setRefreshKey((current) => current + 1);
    } catch {
      setSaveError("Nao foi possivel enfileirar o job.");
    } finally {
      setSaving(false);
    }
  }

  async function retryJob(job: BackgroundJob) {
    if (!token || !canManageAutomation || movingId) return;

    setMovingId(job.id);
    try {
      const response = await apiPost<{ data: BackgroundJob }>(`/jobs/${job.id}/retry`, token, {});
      setJobs((current) => current.map((item) => (item.id === job.id ? response.data : item)));
      setRefreshKey((current) => current + 1);
    } catch {
      setStatus("error");
    } finally {
      setMovingId(null);
    }
  }

  const view = useMemo(() => {
    const active = rules.filter((rule) => rule.status === "ACTIVE").length;
    const waiting = jobs.filter((job) => job.status === "QUEUED" || job.status === "RUNNING").length;
    const failed = jobs.filter((job) => job.status === "FAILED").length;
    const succeeded = jobs.filter((job) => job.status === "SUCCEEDED").length;

    return {
      board: (Object.keys(jobStatusLabels) as JobStatus[]).map((jobStatus) => ({
        cards: jobs.filter((job) => job.status === jobStatus).slice(0, 3),
        title: jobStatusLabels[jobStatus],
        total: jobs.filter((job) => job.status === jobStatus).length,
      })),
      metrics: [
        { detail: "regras ativas", label: "Automacoes", tone: "teal", value: String(active) },
        { detail: "fila/processando", label: "Jobs vivos", tone: "blue", value: String(waiting) },
        { detail: "testes/eventos ok", label: "Concluidos", tone: "amber", value: String(succeeded) },
        { detail: "retry ou ajuste", label: "Falhas", tone: "rose", value: String(failed) },
      ],
    };
  }, [jobs, rules]);

  const statusLabel = {
    error: "Usando fallback",
    fallback: "Fallback visual",
    live: "Dados reais",
    loading: "Sincronizando",
    locked: "Sem permissao",
  }[status];

  return (
    <>
      <section className="metric-grid" aria-label="Indicadores de automacoes">
        {view.metrics.map((metric) => (
          <article className={`metric-card ${metric.tone}`} key={metric.label}>
            <div><h3>{metric.label}</h3><strong>{metric.value}</strong><span>{metric.detail}</span></div>
          </article>
        ))}
      </section>

      <section className="leads-toolbar panel" aria-label="Filtros de automacoes">
        <div>
          {ruleFilters.map((filter) => (
            <button className={filter.label === activeFilter.label ? "active" : ""} key={filter.label} onClick={() => setActiveFilter(filter)} type="button">
              {filter.label}
            </button>
          ))}
        </div>
        <button className="primary-action" disabled={!canManageAutomation} onClick={() => { setSaveError(null); setRuleModalOpen(true); }} type="button">
          <Plus aria-hidden="true" size={17} />
          Nova regra
        </button>
        <button className="text-button" disabled={!canManageAutomation} onClick={() => { setSaveError(null); setJobModalOpen(true); }} type="button">
          <Workflow aria-hidden="true" size={16} />
          Enfileirar job
        </button>
      </section>

      {ruleModalOpen ? (
        <div className="dre-modal-backdrop" role="dialog" aria-modal="true" aria-label="Nova regra">
          <section className="dre-modal lead-modal">
            <header className="dre-modal-header">
              <div><p className="eyebrow">Automacao</p><h3>Nova regra</h3></div>
              <button aria-label="Fechar regra" className="icon-button" onClick={() => setRuleModalOpen(false)} type="button"><X aria-hidden="true" size={18} /></button>
            </header>
            <form className="lead-modal-form" onSubmit={createRule}>
              <label className="lead-modal-wide">Nome<input autoFocus required minLength={2} maxLength={160} value={ruleForm.name} onChange={(event) => setRuleForm((current) => ({ ...current, name: event.target.value }))} /></label>
              <label>Trigger<input required value={ruleForm.trigger} onChange={(event) => setRuleForm((current) => ({ ...current, trigger: event.target.value }))} /></label>
              <label>Acao<select value={ruleForm.action} onChange={(event) => setRuleForm((current) => ({ ...current, action: event.target.value }))}><option value="notify">Notificar</option><option value="score">Pontuar</option><option value="create_task">Criar tarefa</option><option value="enqueue_job">Enfileirar job</option></select></label>
              <label>Status<select value={ruleForm.status} onChange={(event) => setRuleForm((current) => ({ ...current, status: event.target.value as RuleStatus }))}>{(Object.keys(ruleStatusLabels) as RuleStatus[]).map((item) => <option key={item} value={item}>{ruleStatusLabels[item]}</option>)}</select></label>
              {saveError ? <p className="lead-modal-error">{saveError}</p> : null}
              <div className="lead-modal-actions">
                <button className="text-button" onClick={() => setRuleModalOpen(false)} type="button">Cancelar</button>
                <button className="primary-action" disabled={saving || ruleForm.name.trim().length < 2} type="submit">{saving ? "Salvando..." : "Criar regra"}</button>
              </div>
            </form>
          </section>
        </div>
      ) : null}

      {jobModalOpen ? (
        <div className="dre-modal-backdrop" role="dialog" aria-modal="true" aria-label="Enfileirar job">
          <section className="dre-modal lead-modal">
            <header className="dre-modal-header">
              <div><p className="eyebrow">Fila</p><h3>Novo job</h3></div>
              <button aria-label="Fechar job" className="icon-button" onClick={() => setJobModalOpen(false)} type="button"><X aria-hidden="true" size={18} /></button>
            </header>
            <form className="lead-modal-form" onSubmit={enqueueJob}>
              <label className="lead-modal-wide">Tipo<input required minLength={2} value={jobForm.jobType} onChange={(event) => setJobForm((current) => ({ ...current, jobType: event.target.value }))} /></label>
              <label className="lead-modal-wide">Payload JSON<textarea value={jobForm.payload} onChange={(event) => setJobForm((current) => ({ ...current, payload: event.target.value }))} /></label>
              {saveError ? <p className="lead-modal-error">{saveError}</p> : null}
              <div className="lead-modal-actions">
                <button className="text-button" onClick={() => setJobModalOpen(false)} type="button">Cancelar</button>
                <button className="primary-action" disabled={saving || jobForm.jobType.trim().length < 2} type="submit">{saving ? "Enfileirando..." : "Enfileirar"}</button>
              </div>
            </form>
          </section>
        </div>
      ) : null}

      <section className="panel module-kanban-panel">
        <div className="section-heading"><div><p className="eyebrow">Fila</p><h3>Jobs por status</h3></div><span className="live-pill">{statusLabel}</span></div>
        <div className="module-kanban">
          {view.board.map((column) => (
            <section className="module-kanban-column" key={column.title}>
              <header><strong>{column.title}</strong><span>{column.total}</span></header>
              {column.cards.map((job) => <article className="module-kanban-card" key={job.id}><strong>{job.jobType}</strong><span>{job.entityType || "sem entidade"} | tentativa {job.attempts}/{job.maxAttempts}</span><em>{relativeDate(job.scheduledAt)}</em></article>)}
              {column.cards.length === 0 ? <article className="module-kanban-card"><strong>Sem jobs</strong><span>Nenhum item nesta etapa</span><em>0</em></article> : null}
            </section>
          ))}
        </div>
      </section>

      <section className="blueprint-grid">
        <article className="panel">
          <div className="section-heading"><div><p className="eyebrow">Regras</p><h3>Automacoes configuradas</h3></div><span className="live-pill">{statusLabel}</span></div>
          <div className="blueprint-list">
            {rules.map((rule) => (
              <article className="blueprint-row" key={rule.id}>
                <div className="blueprint-main"><Bot aria-hidden="true" /><div><strong>{rule.name}</strong><span>{rule.trigger} | v{rule.currentVersion}</span></div></div>
                <div className="blueprint-tags">
                  <span>{ruleStatusLabels[rule.status]}</span>
                  <select className="kanban-stage-select" disabled={movingId === rule.id} onChange={(event) => void updateRuleStatus(rule, event.target.value as RuleStatus)} value={rule.status}>
                    {(Object.keys(ruleStatusLabels) as RuleStatus[]).map((ruleStatus) => <option key={ruleStatus} value={ruleStatus}>{ruleStatusLabels[ruleStatus]}</option>)}
                  </select>
                </div>
                <div className="blueprint-value">
                  <strong>{relativeDate(rule.updatedAt)}</strong>
                  <button className="text-button" disabled={movingId === rule.id} onClick={() => void runRuleTest(rule)} type="button">Testar</button>
                </div>
              </article>
            ))}
          </div>
        </article>

        <aside className="panel">
          <div className="section-heading"><div><p className="eyebrow">Jobs</p><h3>Execucoes recentes</h3></div><Workflow aria-hidden="true" size={20} /></div>
          <div className="blueprint-list">
            {jobs.slice(0, 8).map((job) => (
              <article className="blueprint-row" key={job.id}>
                <div className="blueprint-main"><Braces aria-hidden="true" /><div><strong>{job.jobType}</strong><span>{jobStatusLabels[job.status]} | {job.lastError || "sem erro"}</span></div></div>
                <div className="blueprint-value">
                  <strong>{job.attempts}/{job.maxAttempts}</strong>
                  <button className="text-button" disabled={job.status !== "FAILED" || movingId === job.id} onClick={() => void retryJob(job)} type="button"><RotateCcw aria-hidden="true" size={14} />Retry</button>
                </div>
              </article>
            ))}
          </div>
          <ul className="blueprint-side-list">
            <li><Gauge aria-hidden="true" size={18} /><div><strong>Economia IA</strong><span>Regras podem processar deltas e payloads pequenos.</span></div></li>
            <li><ShieldCheck aria-hidden="true" size={18} /><div><strong>Guardrails</strong><span>Acoes sensiveis ficam marcadas para aprovacao humana.</span></div></li>
            <li><Clock aria-hidden="true" size={18} /><div><strong>Retry</strong><span>Jobs com falha podem ser reenfileirados pelo painel.</span></div></li>
          </ul>
        </aside>
      </section>
    </>
  );
}
