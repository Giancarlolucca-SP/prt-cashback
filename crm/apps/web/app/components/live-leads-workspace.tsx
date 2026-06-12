"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertCircle, CalendarClock, MessageCircle, PhoneCall, Plus, Sparkles, X } from "lucide-react";
import { apiGet, apiPost } from "../auth/auth-client";
import { useAuth } from "../auth/auth-provider";

type LeadStatus = "NEW" | "CONTACTED" | "SCHEDULED" | "NEGOTIATION" | "WON" | "LOST" | "COLD";

type Lead = {
  id: string;
  source: string | null;
  title: string;
  status: LeadStatus;
  interest: string | null;
  temperature: number | null;
  nextActionAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type ListResponse<T> = {
  items: T[];
  page: number;
  pageSize: number;
  total?: number;
};

type SalesFunnel = {
  leadsBySource?: Record<string, number>;
  leadsByStatus: Record<string, number>;
};

type LeadOutcomeReasonsResponse = {
  items: Array<{
    reasons: string[];
    stage: LeadStatus;
  }>;
  source: "configuration" | "default";
};

type LeadFollowUp = {
  id: string;
  leadId: string | null;
  type: string;
  dueAt: string;
  completedAt: string | null;
  notes: string | null;
  lead: {
    id: string;
    interest: string | null;
    source: string | null;
    status: LeadStatus;
    title: string;
  } | null;
};

type LeadFormState = {
  title: string;
  source: string;
  interest: string;
  temperature: string;
  nextActionAt: string;
};

type LeadOutcomeFormState = {
  details: string;
  reason: string;
};

type LeadFollowUpFormState = {
  dueAt: string;
  notes: string;
  type: string;
};

type FollowUpPeriod = "today" | "overdue" | "next7";

type PendingLeadOutcome = {
  lead: Lead;
  toStage: LeadStatus;
};

const emptyLeadForm: LeadFormState = {
  interest: "",
  nextActionAt: "",
  source: "WhatsApp",
  temperature: "70",
  title: "",
};

const emptyLeadOutcomeForm: LeadOutcomeFormState = {
  details: "",
  reason: "Cliente comprou em outra loja",
};

const emptyLeadFollowUpForm: LeadFollowUpFormState = {
  dueAt: "",
  notes: "",
  type: "Contato comercial",
};

const fallbackLeads: Lead[] = [
  {
    id: "fallback-1",
    source: "WhatsApp",
    title: "Marina Souza",
    status: "NEW",
    interest: "Corolla XEI 2021",
    temperature: 92,
    nextActionAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: "fallback-2",
    source: "Ligacao loja",
    title: "Paulo Lima",
    status: "SCHEDULED",
    interest: "Onix LTZ 2019 na troca",
    temperature: 88,
    nextActionAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: "fallback-3",
    source: "Marketplace",
    title: "Renata Alves",
    status: "NEGOTIATION",
    interest: "HR-V Touring 2020",
    temperature: 76,
    nextActionAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: "fallback-4",
    source: "Site",
    title: "Carlos Mendes",
    status: "COLD",
    interest: "Tracker Premier",
    temperature: 54,
    nextActionAt: null,
    createdAt: new Date(Date.now() - 23 * 60 * 60 * 1000).toISOString(),
    updatedAt: new Date(Date.now() - 23 * 60 * 60 * 1000).toISOString(),
  },
];

const fallbackFunnel: SalesFunnel = {
  leadsBySource: { WhatsApp: 34, Site: 21, Marketplace: 31, Loja: 14 },
  leadsByStatus: { NEW: 18, CONTACTED: 14, SCHEDULED: 8, NEGOTIATION: 9, WON: 7, LOST: 3, COLD: 5 },
};

const fallbackFollowUps: LeadFollowUp[] = [];

const statusLabels: Record<LeadStatus, string> = {
  COLD: "Esfriando",
  CONTACTED: "Contato feito",
  LOST: "Perdido",
  NEGOTIATION: "Negociacao",
  NEW: "Novo lead",
  SCHEDULED: "Agendado",
  WON: "Ganho",
};

const filters: Array<{ label: string; status?: LeadStatus; source?: string }> = [
  { label: "Todos" },
  { label: "WhatsApp", source: "WhatsApp" },
  { label: "Marketplace", source: "Marketplace" },
  { label: "Loja", source: "Loja" },
  { label: "Sem resposta", status: "NEW" },
  { label: "Risco", status: "COLD" },
];

const followUpPeriodFilters: Array<{ key: FollowUpPeriod; label: string }> = [
  { key: "today", label: "Hoje" },
  { key: "overdue", label: "Vencidos" },
  { key: "next7", label: "Proximos 7 dias" },
];

const kanbanStatuses: LeadStatus[] = ["NEW", "CONTACTED", "SCHEDULED", "NEGOTIATION", "COLD", "LOST"];
const terminalLeadStatuses = new Set<LeadStatus>(["WON", "LOST", "COLD"]);
const defaultLeadOutcomeReasons: Record<LeadStatus, string[]> = {
  COLD: ["Sem resposta apos tentativas", "Retorno futuro", "Interesse esfriou"],
  CONTACTED: [],
  LOST: ["Cliente comprou em outra loja", "Preco fora do esperado", "Veiculo indisponivel", "Credito nao aprovado"],
  NEGOTIATION: [],
  NEW: [],
  SCHEDULED: [],
  WON: ["Venda concluida", "Proposta aceita", "Cliente reservou veiculo"],
};

function humanizeSource(source: string | null) {
  return source?.trim() || "Sem origem";
}

function relativeTime(dateIso: string | null) {
  if (!dateIso) {
    return "sem agenda";
  }

  const diffMs = Date.now() - new Date(dateIso).getTime();
  const diffMinutes = Math.max(0, Math.round(diffMs / 60000));

  if (diffMinutes < 60) {
    return `${diffMinutes || 1} min`;
  }

  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) {
    return `${diffHours} h`;
  }

  return `${Math.round(diffHours / 24)} d`;
}

function nextAction(lead: Lead) {
  if (lead.nextActionAt) {
    return `Proxima acao em ${new Date(lead.nextActionAt).toLocaleString("pt-BR", {
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      month: "2-digit",
    })}`;
  }

  if (lead.status === "NEW") {
    return "Fazer primeiro contato";
  }

  if (lead.status === "COLD") {
    return "Reativar ou registrar perda";
  }

  return "Atualizar proximo passo";
}

function dateRangeForFollowUpPeriod(period: FollowUpPeriod) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  if (period === "overdue") {
    return {
      emptyMessage: "Nenhum follow-up vencido.",
      from: new Date("2020-01-01T00:00:00.000Z"),
      heading: "Follow-ups comerciais vencidos",
      to: today,
    };
  }

  if (period === "next7") {
    const nextWeek = new Date(today);
    nextWeek.setDate(nextWeek.getDate() + 7);
    return {
      emptyMessage: "Nenhum follow-up nos proximos 7 dias.",
      from: today,
      heading: "Follow-ups dos proximos 7 dias",
      to: nextWeek,
    };
  }

  return {
    emptyMessage: "A fila comercial do dia esta limpa.",
    from: today,
    heading: "Follow-ups comerciais pendentes",
    to: tomorrow,
  };
}

export function LiveLeadsWorkspace() {
  const { hasPermission, token } = useAuth();
  const canReadLeads = hasPermission({ module: "leads", action: "read" });
  const canCreateLeads = hasPermission({ module: "leads", action: "create" });
  const canUpdateLeads = hasPermission({ module: "leads", action: "update" });
  const canReadDashboard = hasPermission({ module: "dashboard", action: "read" });
  const [activeFilter, setActiveFilter] = useState(filters[0]);
  const [leads, setLeads] = useState(fallbackLeads);
  const [funnel, setFunnel] = useState(fallbackFunnel);
  const [createError, setCreateError] = useState<string | null>(null);
  const [form, setForm] = useState<LeadFormState>(emptyLeadForm);
  const [modalOpen, setModalOpen] = useState(false);
  const [movingLeadId, setMovingLeadId] = useState<string | null>(null);
  const [outcomeError, setOutcomeError] = useState<string | null>(null);
  const [outcomeForm, setOutcomeForm] = useState<LeadOutcomeFormState>(emptyLeadOutcomeForm);
  const [outcomeReasons, setOutcomeReasons] = useState(defaultLeadOutcomeReasons);
  const [followUpError, setFollowUpError] = useState<string | null>(null);
  const [followUpForm, setFollowUpForm] = useState<LeadFollowUpFormState>(emptyLeadFollowUpForm);
  const [followUpLead, setFollowUpLead] = useState<Lead | null>(null);
  const [followUpPeriod, setFollowUpPeriod] = useState<FollowUpPeriod>("today");
  const [followUps, setFollowUps] = useState(fallbackFollowUps);
  const [pendingOutcome, setPendingOutcome] = useState<PendingLeadOutcome | null>(null);
  const [completingFollowUpId, setCompletingFollowUpId] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<"fallback" | "loading" | "live" | "error" | "locked">("fallback");

  useEffect(() => {
    if (!token) {
      return;
    }

    if (!canReadLeads) {
      setStatus("locked");
      return;
    }

    let isCurrent = true;
    const query = new URLSearchParams({ page: "1", page_size: "50" });
    if (activeFilter.status) {
      query.set("status", activeFilter.status);
    }
    if (activeFilter.source) {
      query.set("search", activeFilter.source);
    }
    const followUpRange = dateRangeForFollowUpPeriod(followUpPeriod);
    const followUpQuery = new URLSearchParams({
      from: followUpRange.from.toISOString(),
      page: "1",
      page_size: "20",
      to: followUpRange.to.toISOString(),
    });

    setStatus("loading");

    Promise.all([
      apiGet<ListResponse<Lead>>(`/leads?${query.toString()}`, token),
      canReadDashboard ? apiGet<SalesFunnel>("/analytics/sales-funnel", token) : Promise.resolve(fallbackFunnel),
      apiGet<LeadOutcomeReasonsResponse>("/leads/outcome-reasons", token),
      apiGet<ListResponse<LeadFollowUp>>(`/leads/follow-ups?${followUpQuery.toString()}`, token),
    ])
      .then(([list, nextFunnel, nextOutcomeReasons, nextFollowUps]) => {
        if (!isCurrent) {
          return;
        }

        setLeads(list.items.length > 0 ? list.items : []);
        setFunnel(nextFunnel);
        setFollowUps(nextFollowUps.items);
        setOutcomeReasons((current) => ({
          ...current,
          ...Object.fromEntries(nextOutcomeReasons.items.map((item) => [item.stage, item.reasons.length > 0 ? item.reasons : current[item.stage]])),
        }));
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
  }, [activeFilter, canReadDashboard, canReadLeads, followUpPeriod, refreshKey, token]);

  async function handleCreateLead(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!token || !canCreateLeads || saving) {
      return;
    }

    setCreateError(null);
    setSaving(true);

    try {
      const response = await apiPost<{ data: Lead }>("/leads", token, {
        interest: form.interest.trim() || undefined,
        nextActionAt: form.nextActionAt ? new Date(form.nextActionAt).toISOString() : undefined,
        source: form.source.trim() || undefined,
        temperature: form.temperature ? Number(form.temperature) : undefined,
        title: form.title.trim(),
      });

      setLeads((current) => [response.data, ...current.filter((lead) => lead.id !== response.data.id)]);
      setActiveFilter(filters[0]);
      setForm(emptyLeadForm);
      setModalOpen(false);
      setRefreshKey((current) => current + 1);
    } catch {
      setCreateError("Nao foi possivel criar o lead. Confira os campos e tente novamente.");
    } finally {
      setSaving(false);
    }
  }

  async function moveLeadWithReason(lead: Lead, toStage: LeadStatus, reason: string) {
    if (!token || !canUpdateLeads || movingLeadId) {
      return false;
    }

    if (lead.status === toStage) {
      return false;
    }

    const currentLead = lead;
    setMovingLeadId(lead.id);
    setLeads((current) => current.map((item) => (item.id === lead.id ? { ...item, status: toStage, updatedAt: new Date().toISOString() } : item)));

    try {
      const response = await apiPost<{ data: Lead; unchanged: boolean }>(`/leads/${lead.id}/stage`, token, {
        reason,
        toStage,
      });

      setLeads((current) => current.map((item) => (item.id === lead.id ? response.data : item)));
      setRefreshKey((current) => current + 1);
      return true;
    } catch {
      setLeads((current) => current.map((item) => (item.id === lead.id ? currentLead : item)));
      setStatus("error");
      return false;
    } finally {
      setMovingLeadId(null);
    }
  }

  async function handleMoveLead(leadId: string, toStage: LeadStatus) {
    const currentLead = leads.find((lead) => lead.id === leadId);
    if (!currentLead || currentLead.status === toStage) {
      return;
    }

    if (terminalLeadStatuses.has(toStage)) {
      const defaultReason = outcomeReasons[toStage][0] ?? "";
      setOutcomeError(null);
      setOutcomeForm({ details: "", reason: defaultReason });
      setPendingOutcome({ lead: currentLead, toStage });
      return;
    }

    await moveLeadWithReason(currentLead, toStage, "Movido pelo kanban de leads");
  }

  async function handleConfirmOutcome(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!pendingOutcome || movingLeadId) {
      return;
    }

    const reasonParts = [outcomeForm.reason.trim(), outcomeForm.details.trim()].filter(Boolean);
    const reason = reasonParts.join(" - ").slice(0, 300);

    if (reason.length < 8) {
      setOutcomeError("Informe um motivo com pelo menos 8 caracteres.");
      return;
    }

    setOutcomeError(null);
    const moved = await moveLeadWithReason(pendingOutcome.lead, pendingOutcome.toStage, reason);
    if (moved) {
      setPendingOutcome(null);
      setOutcomeForm(emptyLeadOutcomeForm);
    } else {
      setOutcomeError("Nao foi possivel registrar o desfecho. Tente novamente.");
    }
  }

  function closeOutcomeModal() {
    if (movingLeadId) {
      return;
    }
    setPendingOutcome(null);
    setOutcomeError(null);
    setOutcomeForm(emptyLeadOutcomeForm);
  }

  function openFollowUpModal(lead: Lead) {
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
    tomorrow.setMinutes(0, 0, 0);
    setFollowUpError(null);
    setFollowUpForm({
      dueAt: lead.nextActionAt ? lead.nextActionAt.slice(0, 16) : tomorrow.toISOString().slice(0, 16),
      notes: "",
      type: "Contato comercial",
    });
    setFollowUpLead(lead);
  }

  function closeFollowUpModal() {
    if (saving) {
      return;
    }
    setFollowUpError(null);
    setFollowUpForm(emptyLeadFollowUpForm);
    setFollowUpLead(null);
  }

  async function handleScheduleFollowUp(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || !canUpdateLeads || !followUpLead || saving) {
      return;
    }

    if (!followUpForm.dueAt) {
      setFollowUpError("Informe a data do proximo contato.");
      return;
    }

    setSaving(true);
    setFollowUpError(null);
    try {
      const response = await apiPost<{ data: Lead }>(`/leads/${followUpLead.id}/follow-ups`, token, {
        dueAt: new Date(followUpForm.dueAt).toISOString(),
        notes: followUpForm.notes.trim() || undefined,
        type: followUpForm.type.trim() || "Contato comercial",
      });
      setLeads((current) => current.map((lead) => (lead.id === followUpLead.id ? response.data : lead)));
      setRefreshKey((current) => current + 1);
      setFollowUpError(null);
      setFollowUpForm(emptyLeadFollowUpForm);
      setFollowUpLead(null);
    } catch {
      setFollowUpError("Nao foi possivel agendar o follow-up. Confira os campos e tente novamente.");
    } finally {
      setSaving(false);
    }
  }

  async function completeFollowUp(followUp: LeadFollowUp) {
    if (!token || !canUpdateLeads || completingFollowUpId) {
      return;
    }

    setCompletingFollowUpId(followUp.id);
    try {
      const response = await apiPost<{ data: LeadFollowUp; unchanged: boolean }>(`/leads/follow-ups/${followUp.id}/complete`, token, {});
      setFollowUps((current) => current.filter((item) => item.id !== response.data.id));
      setRefreshKey((current) => current + 1);
    } catch {
      setStatus("error");
    } finally {
      setCompletingFollowUpId(null);
    }
  }

  const view = useMemo(() => {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const newToday = leads.filter((lead) => new Date(lead.createdAt) >= todayStart).length;
    const withoutResponse = (funnel.leadsByStatus.NEW ?? 0) + (funnel.leadsByStatus.CONTACTED ?? 0);
    const cold = funnel.leadsByStatus.COLD ?? 0;
    const topSource = Object.entries(funnel.leadsBySource ?? {}).sort((a, b) => b[1] - a[1])[0];

    return {
      metrics: [
        { label: "Novos hoje", value: String(newToday), detail: topSource ? `${topSource[1]} vieram de ${topSource[0]}` : "origem em apuracao", tone: "teal" },
        { label: "Sem resposta", value: String(withoutResponse), detail: "novo contato ou retorno pendente", tone: "amber" },
        { label: "Follow-ups hoje", value: String(followUps.length), detail: "fila comercial do dia", tone: "teal" },
        { label: "Origem principal", value: topSource?.[0] ?? "--", detail: topSource ? `${topSource[1]} leads no periodo` : "sem dados suficientes", tone: "blue" },
        { label: "Risco de esfriar", value: String(cold), detail: "acionar follow-up", tone: "rose" },
      ],
      kanban: kanbanStatuses.map((leadStatus) => {
        const columnLeads = leads.filter((lead) => lead.status === leadStatus).slice(0, 2);
        return {
          cards: columnLeads.map((lead) => ({
            id: lead.id,
            name: lead.title,
            meta: `${humanizeSource(lead.source)} | ${lead.interest ?? "interesse nao informado"}`,
            status: lead.status,
            tag: lead.temperature ? `${lead.temperature}` : statusLabels[lead.status],
          })),
          title: statusLabels[leadStatus],
          total: funnel.leadsByStatus[leadStatus] ?? columnLeads.length,
        };
      }),
      prioritized: [...leads].sort((a, b) => (b.temperature ?? 0) - (a.temperature ?? 0)).slice(0, 8),
    };
  }, [followUps.length, funnel, leads]);

  const statusLabel = {
    error: "Usando fallback",
    fallback: "Fallback visual",
    live: "Dados reais",
    loading: "Sincronizando",
    locked: "Sem permissao",
  }[status];
  const followUpPeriodDetails = dateRangeForFollowUpPeriod(followUpPeriod);

  return (
    <>
      <section className="metric-grid" aria-label="Indicadores de leads">
        {view.metrics.map((metric) => (
          <article className={`metric-card ${metric.tone}`} key={metric.label}>
            <div>
              <h3>{metric.label}</h3>
              <strong>{metric.value}</strong>
              <span>{metric.detail}</span>
            </div>
          </article>
        ))}
      </section>

      <section className="leads-toolbar panel" aria-label="Filtros de leads">
        <div>
          {filters.map((filter) => (
            <button className={filter.label === activeFilter.label ? "active" : ""} key={filter.label} onClick={() => setActiveFilter(filter)} type="button">
              {filter.label}
            </button>
          ))}
        </div>
        <button className="primary-action" disabled={!canCreateLeads} onClick={() => setModalOpen(true)} type="button">
          <Plus aria-hidden="true" size={17} />
          Novo lead manual
        </button>
      </section>

      {modalOpen ? (
        <div className="dre-modal-backdrop" role="dialog" aria-modal="true" aria-label="Novo lead manual">
          <section className="dre-modal lead-modal">
            <header className="dre-modal-header">
              <div>
                <p className="eyebrow">Cadastro rapido</p>
                <h3>Novo lead manual</h3>
              </div>
              <button aria-label="Fechar novo lead" className="icon-button" onClick={() => setModalOpen(false)} type="button">
                <X aria-hidden="true" size={18} />
              </button>
            </header>

            <form className="lead-modal-form" onSubmit={handleCreateLead}>
              <label>
                Nome ou titulo
                <input
                  autoFocus
                  maxLength={180}
                  minLength={2}
                  onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
                  placeholder="Ex.: Marina Souza"
                  required
                  value={form.title}
                />
              </label>

              <label>
                Interesse
                <input
                  maxLength={180}
                  onChange={(event) => setForm((current) => ({ ...current, interest: event.target.value }))}
                  placeholder="Ex.: Corolla XEI 2021"
                  value={form.interest}
                />
              </label>

              <label>
                Origem
                <select onChange={(event) => setForm((current) => ({ ...current, source: event.target.value }))} value={form.source}>
                  <option>WhatsApp</option>
                  <option>Marketplace</option>
                  <option>Site</option>
                  <option>Loja</option>
                  <option>Ligacao loja</option>
                  <option>Indicacao</option>
                </select>
              </label>

              <label>
                Score
                <input
                  max="100"
                  min="0"
                  onChange={(event) => setForm((current) => ({ ...current, temperature: event.target.value }))}
                  type="number"
                  value={form.temperature}
                />
              </label>

              <label className="lead-modal-wide">
                Proxima acao
                <input
                  onChange={(event) => setForm((current) => ({ ...current, nextActionAt: event.target.value }))}
                  type="datetime-local"
                  value={form.nextActionAt}
                />
              </label>

              {createError ? <p className="lead-modal-error">{createError}</p> : null}

              <div className="lead-modal-actions">
                <button className="text-button" onClick={() => setModalOpen(false)} type="button">
                  Cancelar
                </button>
                <button className="primary-action" disabled={saving || form.title.trim().length < 2} type="submit">
                  {saving ? "Salvando..." : "Criar lead"}
                </button>
              </div>
            </form>
          </section>
        </div>
      ) : null}

      {pendingOutcome ? (
        <div className="dre-modal-backdrop" role="dialog" aria-modal="true" aria-label="Desfecho do lead">
          <section className="dre-modal lead-modal">
            <header className="dre-modal-header">
              <div>
                <p className="eyebrow">Desfecho auditavel</p>
                <h3>{statusLabels[pendingOutcome.toStage]}</h3>
              </div>
              <button aria-label="Fechar desfecho do lead" className="icon-button" onClick={closeOutcomeModal} type="button">
                <X aria-hidden="true" size={18} />
              </button>
            </header>

            <form className="lead-modal-form" onSubmit={handleConfirmOutcome}>
              <div className="lead-modal-wide lead-outcome-summary">
                <strong>{pendingOutcome.lead.title}</strong>
                <span>{pendingOutcome.lead.interest ?? "Interesse nao informado"} | {humanizeSource(pendingOutcome.lead.source)}</span>
              </div>

              <label className="lead-modal-wide">
                Motivo padrao
                <select
                  autoFocus
                  onChange={(event) => setOutcomeForm((current) => ({ ...current, reason: event.target.value }))}
                  value={outcomeForm.reason}
                >
                  {outcomeReasons[pendingOutcome.toStage].map((reason) => (
                    <option key={reason} value={reason}>
                      {reason}
                    </option>
                  ))}
                </select>
              </label>

              <label className="lead-modal-wide">
                Observacao complementar
                <textarea
                  maxLength={220}
                  onChange={(event) => setOutcomeForm((current) => ({ ...current, details: event.target.value }))}
                  placeholder="Ex.: cliente comprou um Corolla em outra loja, retomar em 90 dias."
                  rows={4}
                  value={outcomeForm.details}
                />
              </label>

              {outcomeError ? <p className="lead-modal-error">{outcomeError}</p> : null}

              <div className="lead-modal-actions">
                <button className="text-button" disabled={Boolean(movingLeadId)} onClick={closeOutcomeModal} type="button">
                  Cancelar
                </button>
                <button className="primary-action" disabled={Boolean(movingLeadId)} type="submit">
                  {movingLeadId ? "Salvando..." : "Confirmar desfecho"}
                </button>
              </div>
            </form>
          </section>
        </div>
      ) : null}

      {followUpLead ? (
        <div className="dre-modal-backdrop" role="dialog" aria-modal="true" aria-label="Agendar follow-up do lead">
          <section className="dre-modal lead-modal">
            <header className="dre-modal-header">
              <div>
                <p className="eyebrow">Proxima acao</p>
                <h3>Agendar follow-up</h3>
              </div>
              <button aria-label="Fechar follow-up" className="icon-button" onClick={closeFollowUpModal} type="button">
                <X aria-hidden="true" size={18} />
              </button>
            </header>

            <form className="lead-modal-form" onSubmit={handleScheduleFollowUp}>
              <div className="lead-modal-wide lead-outcome-summary">
                <strong>{followUpLead.title}</strong>
                <span>{followUpLead.interest ?? "Interesse nao informado"} | {humanizeSource(followUpLead.source)}</span>
              </div>
              <label>
                Tipo
                <select onChange={(event) => setFollowUpForm((current) => ({ ...current, type: event.target.value }))} value={followUpForm.type}>
                  <option>Contato comercial</option>
                  <option>Retorno WhatsApp</option>
                  <option>Ligacao</option>
                  <option>Confirmar visita</option>
                  <option>Enviar proposta</option>
                </select>
              </label>
              <label>
                Data e hora
                <input required type="datetime-local" value={followUpForm.dueAt} onChange={(event) => setFollowUpForm((current) => ({ ...current, dueAt: event.target.value }))} />
              </label>
              <label className="lead-modal-wide">
                Observacao
                <textarea maxLength={1000} onChange={(event) => setFollowUpForm((current) => ({ ...current, notes: event.target.value }))} placeholder="Ex.: confirmar se avaliou proposta e oferecer test drive." value={followUpForm.notes} />
              </label>
              {followUpError ? <p className="lead-modal-error">{followUpError}</p> : null}
              <div className="lead-modal-actions">
                <button className="text-button" disabled={saving} onClick={closeFollowUpModal} type="button">Cancelar</button>
                <button className="primary-action" disabled={saving} type="submit">{saving ? "Salvando..." : "Agendar"}</button>
              </div>
            </form>
          </section>
        </div>
      ) : null}

      <section className="panel module-kanban-panel" aria-label="Kanban individual de leads">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Kanban comercial</p>
            <h3>Fluxo individual de leads</h3>
          </div>
          <span className="live-pill">{statusLabel}</span>
        </div>

        <div className="module-kanban">
          {view.kanban.map((column) => (
            <section className="module-kanban-column" key={column.title}>
              <header>
                <strong>{column.title}</strong>
                <span>{column.total}</span>
              </header>
              {column.cards.length > 0 ? (
                column.cards.map((card) => (
                  <article className="module-kanban-card" key={card.id}>
                    <strong>{card.name}</strong>
                    <span>{card.meta}</span>
                    <em>{card.tag}</em>
                    <select
                      aria-label={`Mover ${card.name}`}
                      className="kanban-stage-select"
                      disabled={!canUpdateLeads || movingLeadId === card.id}
                      onChange={(event) => void handleMoveLead(card.id, event.target.value as LeadStatus)}
                      value={card.status}
                    >
                      {(Object.keys(statusLabels) as LeadStatus[]).map((leadStatus) => (
                        <option key={leadStatus} value={leadStatus}>
                          {statusLabels[leadStatus]}
                        </option>
                      ))}
                    </select>
                  </article>
                ))
              ) : (
                <article className="module-kanban-card">
                  <strong>Sem cards</strong>
                  <span>Nenhum lead nesta etapa</span>
                  <em>0</em>
                </article>
              )}
            </section>
          ))}
        </div>
      </section>

      <section className="leads-page-grid">
        <section className="panel leads-board" aria-label="Lista priorizada de leads">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Fila do dia</p>
              <h3>{followUpPeriodDetails.heading}</h3>
            </div>
            <span className="live-pill">{followUps.length}</span>
          </div>
          <div className="follow-up-filter" aria-label="Periodo dos follow-ups">
            {followUpPeriodFilters.map((filter) => (
              <button
                className={filter.key === followUpPeriod ? "active" : ""}
                key={filter.key}
                onClick={() => setFollowUpPeriod(filter.key)}
                type="button"
              >
                {filter.label}
              </button>
            ))}
          </div>

          <div className="lead-list">
            {followUps.slice(0, 6).map((followUp) => (
              <article className="lead-row" key={followUp.id}>
                <div className="lead-identity">
                  <strong>{followUp.lead?.title ?? "Lead sem titulo"}</strong>
                  <span>{followUp.lead?.interest ?? followUp.notes ?? "Sem observacao"}</span>
                </div>
                <div className="lead-meta">
                  <span>{followUp.type}</span>
                  <span>{followUp.lead ? statusLabels[followUp.lead.status] : "sem lead"}</span>
                  <span>{humanizeSource(followUp.lead?.source ?? null)}</span>
                </div>
                <div className="lead-next">
                  <CalendarClock aria-hidden="true" size={16} />
                  <span>{new Date(followUp.dueAt).toLocaleString("pt-BR", { day: "2-digit", hour: "2-digit", minute: "2-digit", month: "2-digit" })}</span>
                </div>
                <div className="lead-score">
                  <span>pendente</span>
                  <strong>{relativeTime(followUp.dueAt)}</strong>
                  <button
                    className="text-button lead-score-action"
                    disabled={!canUpdateLeads || completingFollowUpId === followUp.id}
                    onClick={() => void completeFollowUp(followUp)}
                    type="button"
                  >
                    {completingFollowUpId === followUp.id ? "Salvando..." : "Concluir"}
                  </button>
                </div>
              </article>
            ))}
            {followUps.length === 0 ? (
              <article className="lead-row">
                <div className="lead-identity"><strong>Sem follow-ups</strong><span>{followUpPeriodDetails.emptyMessage}</span></div>
                <div className="lead-meta"><span>ok</span><span>agenda</span><span>0</span></div>
              </article>
            ) : null}
          </div>
        </section>

        <section className="panel leads-board" aria-label="Lista priorizada de leads">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Fila priorizada</p>
              <h3>Leads que precisam de movimento</h3>
            </div>
            <span className="live-pill">Ordenado por score</span>
          </div>

          <div className="lead-list">
            {view.prioritized.map((lead) => (
              <article className="lead-row" key={lead.id}>
                <div className="lead-identity">
                  <strong>{lead.title}</strong>
                  <span>{lead.interest ?? "Interesse nao informado"}</span>
                </div>

                <div className="lead-meta">
                  <span>{humanizeSource(lead.source)}</span>
                  <span>{statusLabels[lead.status]}</span>
                  <span>{relativeTime(lead.updatedAt)}</span>
                </div>

                <div className="lead-next">
                  <CalendarClock aria-hidden="true" size={16} />
                  <span>{nextAction(lead)}</span>
                </div>

                <div className="lead-score">
                  <span>{relativeTime(lead.createdAt)}</span>
                  <strong>{lead.temperature ?? "--"}</strong>
                  <button className="text-button" disabled={!canUpdateLeads} onClick={() => openFollowUpModal(lead)} type="button">Follow-up</button>
                </div>
              </article>
            ))}
          </div>
        </section>

        <aside className="panel lead-assistant" aria-label="Assistente de atendimento">
          <div className="section-heading">
            <div>
              <p className="eyebrow">IA e automacoes</p>
              <h3>Proximas acoes sugeridas</h3>
            </div>
            <Sparkles aria-hidden="true" size={19} />
          </div>

          <ul className="assistant-list">
            <li>
              <MessageCircle aria-hidden="true" size={18} />
              <span>Responder leads novos antes que saiam do SLA comercial.</span>
            </li>
            <li>
              <PhoneCall aria-hidden="true" size={18} />
              <span>Priorizar contatos com score acima de 80 e proxima acao vencida.</span>
            </li>
            <li>
              <AlertCircle aria-hidden="true" size={18} />
              <span>Leads em risco devem ser reativados ou movidos para perda com motivo.</span>
            </li>
          </ul>
        </aside>
      </section>
    </>
  );
}
