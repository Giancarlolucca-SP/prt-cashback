"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { BadgeCheck, CarFront, FileText, Gavel, History, Plus, SearchCheck, ShieldCheck, TrendingUp, X } from "lucide-react";
import { apiGet, apiPost } from "../auth/auth-client";
import { useAuth } from "../auth/auth-provider";

type EvaluationDecision = "PENDING" | "APPROVED_BUY" | "APPROVED_REPASSE" | "REJECTED" | "NEGOTIATING";
type ApprovalStatus = "APPROVED" | "REJECTED" | "NEGOTIATING";

type Evaluation = {
  id: string;
  purchaseLeadId: string | null;
  customerId: string | null;
  vehicleId: string | null;
  appraiserUserId: string | null;
  requestedPrice: string | null;
  fipeValue: string | null;
  suggestedPrice: string | null;
  expectedPrepCost: string | null;
  expectedMargin: string | null;
  decision: EvaluationDecision;
  snapshot: unknown;
  evaluatedAt: string;
  createdAt: string;
  updatedAt: string;
};

type PurchaseLead = {
  id: string;
  customerId: string | null;
  vehicleId: string | null;
  source: string | null;
  status: string;
  askingPrice: string | null;
  createdAt: string;
  updatedAt: string;
};

type ListResponse<T> = {
  items: T[];
  page: number;
  pageSize: number;
  total?: number;
};

type EvaluationFormState = {
  decision: EvaluationDecision;
  expectedPrepCost: string;
  fipeValue: string;
  purchaseLeadId: string;
  requestedPrice: string;
  snapshotNote: string;
  suggestedPrice: string;
};

const emptyForm: EvaluationFormState = {
  decision: "PENDING",
  expectedPrepCost: "",
  fipeValue: "",
  purchaseLeadId: "",
  requestedPrice: "",
  snapshotNote: "",
  suggestedPrice: "",
};

const fallbackEvaluations: Evaluation[] = [
  {
    id: "fallback-1",
    purchaseLeadId: null,
    customerId: null,
    vehicleId: null,
    appraiserUserId: null,
    requestedPrice: "76000.00",
    fipeValue: "89400.00",
    suggestedPrice: "72000.00",
    expectedPrepCost: "4200.00",
    expectedMargin: "13700.00",
    decision: "APPROVED_BUY",
    snapshot: { vehicle: "Honda Civic EXL 2019" },
    evaluatedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

const filters: Array<{ label: string; decision?: EvaluationDecision }> = [
  { label: "Todas" },
  { label: "Pendentes", decision: "PENDING" },
  { label: "Compra", decision: "APPROVED_BUY" },
  { label: "Repasse", decision: "APPROVED_REPASSE" },
  { label: "Negociacao", decision: "NEGOTIATING" },
  { label: "Recusadas", decision: "REJECTED" },
];

const decisionLabels: Record<EvaluationDecision, string> = {
  APPROVED_BUY: "Aprovado compra",
  APPROVED_REPASSE: "Aprovado repasse",
  NEGOTIATING: "Negociando",
  PENDING: "Pendente",
  REJECTED: "Recusado",
};

const currency = new Intl.NumberFormat("pt-BR", { currency: "BRL", maximumFractionDigits: 0, style: "currency" });

function money(value: string | null | undefined) {
  const amount = Number(value ?? 0);
  return amount > 0 ? currency.format(amount) : "A definir";
}

function toneFor(decision: EvaluationDecision) {
  if (decision === "APPROVED_BUY" || decision === "APPROVED_REPASSE") return "teal";
  if (decision === "NEGOTIATING" || decision === "PENDING") return "amber";
  return "rose";
}

function marginFrom(form: EvaluationFormState) {
  const suggested = Number(form.suggestedPrice || 0);
  const fipe = Number(form.fipeValue || 0);
  const prep = Number(form.expectedPrepCost || 0);
  return fipe > 0 || suggested > 0 ? Math.max(0, fipe - suggested - prep) : undefined;
}

export function LiveEvaluationsWorkspace() {
  const { hasPermission, token } = useAuth();
  const canReadPurchases = hasPermission({ module: "purchases", action: "read" });
  const canManagePurchases = hasPermission({ module: "purchases", action: "manage" });
  const canApprovePurchases = hasPermission({ module: "purchases", action: "approve", scope: "ALL", sensitiveArea: "sensitive_approval" });
  const [activeFilter, setActiveFilter] = useState(filters[0]);
  const [checklistEvaluation, setChecklistEvaluation] = useState<Evaluation | null>(null);
  const [checklistValue, setChecklistValue] = useState("");
  const [evaluations, setEvaluations] = useState(fallbackEvaluations);
  const [form, setForm] = useState(emptyForm);
  const [leads, setLeads] = useState<PurchaseLead[]>([]);
  const [leadsStatus, setLeadsStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [modalOpen, setModalOpen] = useState(false);
  const [movingId, setMovingId] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<"fallback" | "loading" | "live" | "error" | "locked">("fallback");

  useEffect(() => {
    if (!token) return;
    if (!canReadPurchases) {
      setStatus("locked");
      return;
    }

    let isCurrent = true;
    const query = new URLSearchParams({ page: "1", page_size: "50" });
    if (activeFilter.decision) query.set("decision", activeFilter.decision);

    setStatus("loading");
    apiGet<ListResponse<Evaluation>>(`/purchases/evaluations?${query.toString()}`, token)
      .then((list) => {
        if (!isCurrent) return;
        setEvaluations(list.items);
        setStatus("live");
      })
      .catch(() => {
        if (isCurrent) setStatus("error");
      });

    return () => {
      isCurrent = false;
    };
  }, [activeFilter, canReadPurchases, refreshKey, token]);

  useEffect(() => {
    if (!modalOpen || !token || !canReadPurchases) return;

    let isCurrent = true;
    setLeadsStatus("loading");
    apiGet<ListResponse<PurchaseLead>>("/purchases/leads?page=1&page_size=100", token)
      .then((list) => {
        if (!isCurrent) return;
        setLeads(list.items.filter((lead) => lead.status !== "CANCELLED" && lead.status !== "PURCHASED"));
        setLeadsStatus("ready");
      })
      .catch(() => {
        if (isCurrent) setLeadsStatus("error");
      });

    return () => {
      isCurrent = false;
    };
  }, [canReadPurchases, modalOpen, token]);

  async function createEvaluation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || !canManagePurchases || saving) return;

    setSaving(true);
    setSaveError(null);
    try {
      const response = await apiPost<{ data: Evaluation }>("/purchases/evaluations", token, {
        decision: form.decision,
        expectedMargin: marginFrom(form),
        expectedPrepCost: form.expectedPrepCost ? Number(form.expectedPrepCost) : undefined,
        fipeValue: form.fipeValue ? Number(form.fipeValue) : undefined,
        purchaseLeadId: form.purchaseLeadId || undefined,
        requestedPrice: form.requestedPrice ? Number(form.requestedPrice) : undefined,
        snapshot: form.snapshotNote.trim() ? { note: form.snapshotNote.trim() } : undefined,
        suggestedPrice: form.suggestedPrice ? Number(form.suggestedPrice) : undefined,
      });
      setEvaluations((current) => [response.data, ...current.filter((evaluation) => evaluation.id !== response.data.id)]);
      setForm(emptyForm);
      setModalOpen(false);
      setRefreshKey((current) => current + 1);
    } catch {
      setSaveError("Nao foi possivel criar a avaliacao. Confira lead e valores.");
    } finally {
      setSaving(false);
    }
  }

  async function approveEvaluation(evaluation: Evaluation, approvalStatus: ApprovalStatus) {
    if (!token || !canApprovePurchases || movingId) return;

    const previous = evaluation;
    const nextDecision: EvaluationDecision = approvalStatus === "APPROVED" ? "APPROVED_BUY" : approvalStatus === "REJECTED" ? "REJECTED" : "NEGOTIATING";
    setMovingId(evaluation.id);
    setEvaluations((current) => current.map((item) => (item.id === evaluation.id ? { ...item, decision: nextDecision } : item)));

    try {
      const response = await apiPost<{ data: Evaluation }>(`/purchases/evaluations/${evaluation.id}/approval`, token, {
        reason: "Decisao registrada pela central de avaliacoes",
        status: approvalStatus,
      });
      setEvaluations((current) => current.map((item) => (item.id === evaluation.id ? response.data : item)));
      setRefreshKey((current) => current + 1);
    } catch {
      setEvaluations((current) => current.map((item) => (item.id === evaluation.id ? previous : item)));
      setStatus("error");
    } finally {
      setMovingId(null);
    }
  }

  async function saveChecklist(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || !canManagePurchases || !checklistEvaluation || saving) return;

    setSaving(true);
    setSaveError(null);
    try {
      await apiPost<{ data: { id: string } }>(`/purchases/evaluations/${checklistEvaluation.id}/checklist`, token, {
        itemKey: "observacao",
        label: "Observacao da avaliacao",
        value: checklistValue.trim(),
      });
      setChecklistEvaluation(null);
      setChecklistValue("");
      setRefreshKey((current) => current + 1);
    } catch {
      setSaveError("Nao foi possivel salvar o checklist.");
    } finally {
      setSaving(false);
    }
  }

  const view = useMemo(() => {
    const bought = evaluations.filter((evaluation) => evaluation.decision === "APPROVED_BUY").length;
    const negotiating = evaluations.filter((evaluation) => evaluation.decision === "NEGOTIATING" || evaluation.decision === "PENDING").length;
    const rejected = evaluations.filter((evaluation) => evaluation.decision === "REJECTED").length;

    return {
      metrics: [
        { detail: "historico carregado", label: "Avaliacoes realizadas", tone: "teal", value: String(evaluations.length) },
        { detail: "viraram compra", label: "Compradas", tone: "blue", value: String(bought) },
        { detail: "aguardando decisao", label: "Em negociacao", tone: "amber", value: String(negotiating) },
        { detail: "margem, risco ou documento", label: "Recusadas", tone: "rose", value: String(rejected) },
      ],
    };
  }, [evaluations]);

  const statusLabel = {
    error: "Usando fallback",
    fallback: "Fallback visual",
    live: "Dados reais",
    loading: "Sincronizando",
    locked: "Sem permissao",
  }[status];

  return (
    <>
      <section className="metric-grid" aria-label="Indicadores de avaliacoes">
        {view.metrics.map((metric) => (
          <article className={`metric-card ${metric.tone}`} key={metric.label}>
            <div><h3>{metric.label}</h3><strong>{metric.value}</strong><span>{metric.detail}</span></div>
          </article>
        ))}
      </section>

      <section className="leads-toolbar panel" aria-label="Filtros de avaliacoes">
        <div>
          {filters.map((filter) => (
            <button className={filter.label === activeFilter.label ? "active" : ""} key={filter.label} onClick={() => setActiveFilter(filter)} type="button">
              {filter.label}
            </button>
          ))}
        </div>
        <button className="primary-action" disabled={!canManagePurchases} onClick={() => { setSaveError(null); setModalOpen(true); }} type="button">
          <Plus aria-hidden="true" size={16} />
          Nova avaliacao
        </button>
      </section>

      {modalOpen ? (
        <div className="dre-modal-backdrop" role="dialog" aria-modal="true" aria-label="Nova avaliacao">
          <section className="dre-modal lead-modal">
            <header className="dre-modal-header">
              <div><p className="eyebrow">Compra e avaliacao</p><h3>Nova avaliacao</h3></div>
              <button aria-label="Fechar nova avaliacao" className="icon-button" onClick={() => setModalOpen(false)} type="button"><X aria-hidden="true" size={18} /></button>
            </header>
            <form className="lead-modal-form" onSubmit={createEvaluation}>
              <label className="lead-modal-wide">
                Lead de compra
                <select disabled={leadsStatus === "loading"} onChange={(event) => setForm((current) => ({ ...current, purchaseLeadId: event.target.value }))} value={form.purchaseLeadId}>
                  <option value="">Avaliacao avulsa</option>
                  {leads.map((lead) => <option key={lead.id} value={lead.id}>Lead {lead.id.slice(0, 8)} | {lead.status} | {money(lead.askingPrice)}</option>)}
                </select>
              </label>
              {leadsStatus === "error" ? <p className="lead-modal-error">Nao foi possivel carregar leads de compra.</p> : null}
              <label>Pedido<input min="0" type="number" value={form.requestedPrice} onChange={(event) => setForm((current) => ({ ...current, requestedPrice: event.target.value }))} /></label>
              <label>FIPE<input min="0" type="number" value={form.fipeValue} onChange={(event) => setForm((current) => ({ ...current, fipeValue: event.target.value }))} /></label>
              <label>Sugerido<input min="0" type="number" value={form.suggestedPrice} onChange={(event) => setForm((current) => ({ ...current, suggestedPrice: event.target.value }))} /></label>
              <label>Preparo<input min="0" type="number" value={form.expectedPrepCost} onChange={(event) => setForm((current) => ({ ...current, expectedPrepCost: event.target.value }))} /></label>
              <label>Decisao<select value={form.decision} onChange={(event) => setForm((current) => ({ ...current, decision: event.target.value as EvaluationDecision }))}>{(Object.keys(decisionLabels) as EvaluationDecision[]).map((decision) => <option key={decision} value={decision}>{decisionLabels[decision]}</option>)}</select></label>
              <label className="lead-modal-wide">Observacao<input maxLength={300} value={form.snapshotNote} onChange={(event) => setForm((current) => ({ ...current, snapshotNote: event.target.value }))} /></label>
              {saveError ? <p className="lead-modal-error">{saveError}</p> : null}
              <div className="lead-modal-actions">
                <button className="text-button" onClick={() => setModalOpen(false)} type="button">Cancelar</button>
                <button className="primary-action" disabled={saving} type="submit">{saving ? "Salvando..." : "Criar avaliacao"}</button>
              </div>
            </form>
          </section>
        </div>
      ) : null}

      {checklistEvaluation ? (
        <div className="dre-modal-backdrop" role="dialog" aria-modal="true" aria-label="Checklist da avaliacao">
          <section className="dre-modal lead-modal">
            <header className="dre-modal-header">
              <div><p className="eyebrow">Checklist</p><h3>Avaliacao {checklistEvaluation.id.slice(0, 8)}</h3></div>
              <button aria-label="Fechar checklist" className="icon-button" onClick={() => setChecklistEvaluation(null)} type="button"><X aria-hidden="true" size={18} /></button>
            </header>
            <form className="lead-modal-form" onSubmit={saveChecklist}>
              <label className="lead-modal-wide">Observacao<input autoFocus required minLength={2} maxLength={300} value={checklistValue} onChange={(event) => setChecklistValue(event.target.value)} /></label>
              {saveError ? <p className="lead-modal-error">{saveError}</p> : null}
              <div className="lead-modal-actions">
                <button className="text-button" onClick={() => setChecklistEvaluation(null)} type="button">Cancelar</button>
                <button className="primary-action" disabled={saving || checklistValue.trim().length < 2} type="submit">{saving ? "Salvando..." : "Salvar checklist"}</button>
              </div>
            </form>
          </section>
        </div>
      ) : null}

      <section className="evaluation-grid">
        <article className="panel">
          <div className="section-heading"><div><p className="eyebrow">Historico</p><h3>Avaliacoes realizadas</h3></div><span className="live-pill">{statusLabel}</span></div>
          <div className="evaluation-list">
            {evaluations.map((evaluation) => (
              <article className={`evaluation-card ${toneFor(evaluation.decision)}`} key={evaluation.id}>
                <div className="evaluation-main"><CarFront aria-hidden="true" /><div><strong>Avaliacao {evaluation.id.slice(0, 8)}</strong><span>{evaluation.vehicleId ? "Veiculo vinculado" : "Sem veiculo vinculado"} | {evaluation.purchaseLeadId ? "lead de compra" : "avulsa"}</span></div></div>
                <div className="evaluation-meta"><span>Avaliador: {evaluation.appraiserUserId ? evaluation.appraiserUserId.slice(0, 8) : "sistema"}</span><span>{new Date(evaluation.evaluatedAt).toLocaleDateString("pt-BR")}</span><span>{decisionLabels[evaluation.decision]}</span></div>
                <div className="evaluation-values">
                  <span>Pedido<strong>{money(evaluation.requestedPrice)}</strong></span>
                  <span>FIPE<strong>{money(evaluation.fipeValue)}</strong></span>
                  <span>Sugerido<strong>{money(evaluation.suggestedPrice)}</strong></span>
                  <span>Preparo<strong>{money(evaluation.expectedPrepCost)}</strong></span>
                  <span>Margem<strong>{money(evaluation.expectedMargin)}</strong></span>
                </div>
                <div className="evaluation-footer">
                  <em>{decisionLabels[evaluation.decision]}</em>
                  <div className="topbar-actions">
                    <button className="text-button" disabled={!canManagePurchases} onClick={() => { setChecklistEvaluation(evaluation); setChecklistValue(""); setSaveError(null); }} type="button">Checklist</button>
                    <button className="text-button" disabled={!canApprovePurchases || movingId === evaluation.id} onClick={() => void approveEvaluation(evaluation, "APPROVED")} type="button">Aprovar</button>
                    <button className="text-button" disabled={!canApprovePurchases || movingId === evaluation.id} onClick={() => void approveEvaluation(evaluation, "NEGOTIATING")} type="button">Negociar</button>
                    <button className="text-button" disabled={!canApprovePurchases || movingId === evaluation.id} onClick={() => void approveEvaluation(evaluation, "REJECTED")} type="button">Recusar</button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </article>

        <aside className="panel">
          <div className="section-heading"><div><p className="eyebrow">Controle</p><h3>Historico da avaliacao</h3></div><History aria-hidden="true" size={20} /></div>
          <div className="evaluation-timeline">
            <article><SearchCheck aria-hidden="true" size={17} /><div><strong>Valores congelados</strong><span>Pedido, FIPE, sugerido, preparo e margem sao persistidos.</span></div><em>API</em></article>
            <article><Gavel aria-hidden="true" size={17} /><div><strong>Decisao sensivel</strong><span>Aprovacao usa permissao de gestor com area sensivel.</span></div><em>RBAC</em></article>
            <article><BadgeCheck aria-hidden="true" size={17} /><div><strong>Lead sincronizado</strong><span>Avaliacao muda lead para avaliacao, aprovacao muda status de compra.</span></div><em>evento</em></article>
          </div>
          <ul className="blueprint-side-list evaluation-control-list">
            <li><FileText aria-hidden="true" size={18} /><div><strong>Anexos</strong><span>Fotos, laudo e proposta podem ser adicionados ao dossie documental.</span></div></li>
            <li><ShieldCheck aria-hidden="true" size={18} /><div><strong>Auditoria</strong><span>Toda aprovacao gera log e evento interno.</span></div></li>
            <li><TrendingUp aria-hidden="true" size={18} /><div><strong>Margem prevista</strong><span>Margem esperada nasce da FIPE, preco sugerido e preparo.</span></div></li>
          </ul>
        </aside>
      </section>
    </>
  );
}
