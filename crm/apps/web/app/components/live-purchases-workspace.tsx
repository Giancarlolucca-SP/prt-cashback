"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { BadgeCheck, Calculator, CarFront, ClipboardList, CreditCard, Gavel, Plus, Sparkles, X } from "lucide-react";
import { apiGet, apiPost } from "../auth/auth-client";
import { useAuth } from "../auth/auth-provider";

type PurchaseStatus = "OPEN" | "EVALUATING" | "APPROVED" | "REJECTED" | "PURCHASED" | "CANCELLED";
type PaymentStatus = "PENDING" | "SCHEDULED" | "PAID" | "CANCELLED" | "OVERDUE";

type PurchaseLead = {
  id: string;
  customerId: string | null;
  vehicleId: string | null;
  source: string | null;
  status: PurchaseStatus;
  askingPrice: string | null;
  createdAt: string;
  updatedAt: string;
};

type InventoryOption = {
  id: string;
  askingPrice: string | null;
  status: string;
  vehicle: {
    brand: string;
    model: string;
    version: string | null;
    yearModel: number | null;
    plate: string | null;
  } | null;
};

type ListResponse<T> = {
  items: T[];
  page: number;
  pageSize: number;
  total?: number;
};

type LeadFormState = {
  askingPrice: string;
  source: string;
  status: PurchaseStatus;
  vehicleId: string;
};

type PaymentFormState = {
  amount: string;
  status: PaymentStatus;
};

const emptyLeadForm: LeadFormState = {
  askingPrice: "",
  source: "Cliente loja",
  status: "OPEN",
  vehicleId: "",
};

const emptyPaymentForm: PaymentFormState = {
  amount: "",
  status: "PENDING",
};

const fallbackLeads: PurchaseLead[] = [
  {
    id: "fallback-1",
    customerId: null,
    vehicleId: null,
    source: "Fornecedor parceiro",
    status: "EVALUATING",
    askingPrice: "76000.00",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

const filters: Array<{ label: string; status?: PurchaseStatus }> = [
  { label: "Todos" },
  { label: "Oportunidade", status: "OPEN" },
  { label: "Avaliacao", status: "EVALUATING" },
  { label: "Aprovados", status: "APPROVED" },
  { label: "Comprados", status: "PURCHASED" },
  { label: "Recusados", status: "REJECTED" },
];

const statusLabels: Record<PurchaseStatus, string> = {
  APPROVED: "Aprovado",
  CANCELLED: "Cancelado",
  EVALUATING: "Avaliacao",
  OPEN: "Oportunidade",
  PURCHASED: "Comprado",
  REJECTED: "Recusado",
};

const paymentLabels: Record<PaymentStatus, string> = {
  CANCELLED: "Cancelado",
  OVERDUE: "Vencido",
  PAID: "Pago",
  PENDING: "Pendente",
  SCHEDULED: "Agendado",
};

const sources = ["Cliente loja", "Troca em venda", "Fornecedor parceiro", "Repasse recebido", "Sugestao IA", "Grupo lojistas"];
const currency = new Intl.NumberFormat("pt-BR", { currency: "BRL", maximumFractionDigits: 0, style: "currency" });

function money(value: string | null | undefined) {
  const amount = Number(value ?? 0);
  return amount > 0 ? currency.format(amount) : "A definir";
}

function vehicleLabel(option: InventoryOption) {
  if (!option.vehicle) return `Estoque ${option.id.slice(0, 8)}`;
  return [option.vehicle.brand, option.vehicle.model, option.vehicle.version, option.vehicle.yearModel, option.vehicle.plate ? `| ${option.vehicle.plate}` : null]
    .filter(Boolean)
    .join(" ");
}

function toneFor(status: PurchaseStatus) {
  if (status === "PURCHASED" || status === "APPROVED") return "teal";
  if (status === "EVALUATING" || status === "OPEN") return "blue";
  return "rose";
}

export function LivePurchasesWorkspace() {
  const { hasPermission, token } = useAuth();
  const canReadPurchases = hasPermission({ module: "purchases", action: "read" });
  const canManagePurchases = hasPermission({ module: "purchases", action: "manage" });
  const canReadInventory = hasPermission({ module: "inventory", action: "read" });
  const [activeFilter, setActiveFilter] = useState(filters[0]);
  const [form, setForm] = useState(emptyLeadForm);
  const [inventory, setInventory] = useState<InventoryOption[]>([]);
  const [inventoryStatus, setInventoryStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [leads, setLeads] = useState(fallbackLeads);
  const [modalOpen, setModalOpen] = useState(false);
  const [movingId, setMovingId] = useState<string | null>(null);
  const [paymentForm, setPaymentForm] = useState(emptyPaymentForm);
  const [paymentLead, setPaymentLead] = useState<PurchaseLead | null>(null);
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
    if (activeFilter.status) query.set("status", activeFilter.status);

    setStatus("loading");
    apiGet<ListResponse<PurchaseLead>>(`/purchases/leads?${query.toString()}`, token)
      .then((list) => {
        if (!isCurrent) return;
        setLeads(list.items);
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
    if (!modalOpen || !token || !canReadInventory) return;

    let isCurrent = true;
    setInventoryStatus("loading");
    apiGet<ListResponse<InventoryOption>>("/inventory?page=1&page_size=100", token)
      .then((list) => {
        if (!isCurrent) return;
        setInventory(list.items.filter((item) => item.status !== "SOLD" && item.status !== "REMOVED"));
        setInventoryStatus("ready");
      })
      .catch(() => {
        if (isCurrent) setInventoryStatus("error");
      });

    return () => {
      isCurrent = false;
    };
  }, [canReadInventory, modalOpen, token]);

  async function createLead(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || !canManagePurchases || saving) return;

    setSaving(true);
    setSaveError(null);
    try {
      const response = await apiPost<{ data: PurchaseLead }>("/purchases/leads", token, {
        askingPrice: form.askingPrice ? Number(form.askingPrice) : undefined,
        source: form.source.trim() || undefined,
        status: form.status,
        vehicleId: form.vehicleId || undefined,
      });
      setLeads((current) => [response.data, ...current.filter((lead) => lead.id !== response.data.id)]);
      setForm(emptyLeadForm);
      setModalOpen(false);
      setRefreshKey((current) => current + 1);
    } catch {
      setSaveError("Nao foi possivel criar a oportunidade de compra.");
    } finally {
      setSaving(false);
    }
  }

  async function updateLeadStatus(lead: PurchaseLead, nextStatus: PurchaseStatus) {
    if (!token || !canManagePurchases || movingId || lead.status === nextStatus) return;

    const previous = lead;
    setMovingId(lead.id);
    setLeads((current) => current.map((item) => (item.id === lead.id ? { ...item, status: nextStatus } : item)));

    try {
      const response = await apiPost<{ data: PurchaseLead }>(`/purchases/leads/${lead.id}/status`, token, {
        reason: "Atualizado pela central de compras",
        status: nextStatus,
      });
      setLeads((current) => current.map((item) => (item.id === lead.id ? response.data : item)));
      setRefreshKey((current) => current + 1);
    } catch {
      setLeads((current) => current.map((item) => (item.id === lead.id ? previous : item)));
      setStatus("error");
    } finally {
      setMovingId(null);
    }
  }

  async function createPayment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || !canManagePurchases || !paymentLead || saving) return;

    setSaving(true);
    setSaveError(null);
    try {
      await apiPost<{ data: { id: string } }>("/purchases/payments", token, {
        amount: Number(paymentForm.amount),
        purchaseLeadId: paymentLead.id,
        status: paymentForm.status,
      });
      if (paymentForm.status === "PAID") {
        setLeads((current) => current.map((lead) => (lead.id === paymentLead.id ? { ...lead, status: "PURCHASED" } : lead)));
      }
      setPaymentForm(emptyPaymentForm);
      setPaymentLead(null);
      setRefreshKey((current) => current + 1);
    } catch {
      setSaveError("Nao foi possivel registrar o pagamento de compra.");
    } finally {
      setSaving(false);
    }
  }

  const view = useMemo(() => {
    const opportunities = leads.filter((lead) => lead.status === "OPEN").length;
    const evaluating = leads.filter((lead) => lead.status === "EVALUATING").length;
    const approved = leads.filter((lead) => lead.status === "APPROVED").length;
    const rejected = leads.filter((lead) => lead.status === "REJECTED").length;

    return {
      board: (Object.keys(statusLabels) as PurchaseStatus[]).filter((item) => item !== "CANCELLED").map((purchaseStatus) => ({
        cards: leads.filter((lead) => lead.status === purchaseStatus).slice(0, 3),
        title: statusLabels[purchaseStatus],
        total: leads.filter((lead) => lead.status === purchaseStatus).length,
      })),
      metrics: [
        { detail: "compra, troca e repasse", label: "Oportunidades", tone: "teal", value: String(opportunities) },
        { detail: "fotos, laudo e FIPE", label: "Em avaliacao", tone: "blue", value: String(evaluating) },
        { detail: "aguardando pagamento", label: "Aprovados", tone: "amber", value: String(approved) },
        { detail: "margem baixa ou risco", label: "Recusados", tone: "rose", value: String(rejected) },
      ],
    };
  }, [leads]);

  const statusLabel = {
    error: "Usando fallback",
    fallback: "Fallback visual",
    live: "Dados reais",
    loading: "Sincronizando",
    locked: "Sem permissao",
  }[status];

  return (
    <>
      <section className="metric-grid" aria-label="Indicadores de compras">
        {view.metrics.map((metric) => (
          <article className={`metric-card ${metric.tone}`} key={metric.label}>
            <div><h3>{metric.label}</h3><strong>{metric.value}</strong><span>{metric.detail}</span></div>
          </article>
        ))}
      </section>

      <section className="leads-toolbar panel" aria-label="Filtros de compras">
        <div>
          {filters.map((filter) => (
            <button className={filter.label === activeFilter.label ? "active" : ""} key={filter.label} onClick={() => setActiveFilter(filter)} type="button">
              {filter.label}
            </button>
          ))}
        </div>
        <button className="primary-action" disabled={!canManagePurchases} onClick={() => { setSaveError(null); setModalOpen(true); }} type="button">
          <Plus aria-hidden="true" size={17} />
          Nova oportunidade
        </button>
      </section>

      {modalOpen ? (
        <div className="dre-modal-backdrop" role="dialog" aria-modal="true" aria-label="Nova oportunidade de compra">
          <section className="dre-modal lead-modal">
            <header className="dre-modal-header">
              <div><p className="eyebrow">Compras</p><h3>Nova oportunidade</h3></div>
              <button aria-label="Fechar oportunidade" className="icon-button" onClick={() => setModalOpen(false)} type="button"><X aria-hidden="true" size={18} /></button>
            </header>
            <form className="lead-modal-form" onSubmit={createLead}>
              <label className="lead-modal-wide">
                Veiculo ja cadastrado
                <select disabled={!canReadInventory || inventoryStatus === "loading"} onChange={(event) => setForm((current) => ({ ...current, vehicleId: event.target.value }))} value={form.vehicleId}>
                  <option value="">Sem veiculo vinculado</option>
                  {inventory.map((item) => <option key={item.id} value={item.id}>{vehicleLabel(item)} - {money(item.askingPrice)}</option>)}
                </select>
              </label>
              {!canReadInventory ? <p className="lead-modal-error">Sem permissao para listar estoque.</p> : null}
              {inventoryStatus === "error" ? <p className="lead-modal-error">Nao foi possivel carregar estoque.</p> : null}
              <label>Origem<select value={form.source} onChange={(event) => setForm((current) => ({ ...current, source: event.target.value }))}>{sources.map((item) => <option key={item}>{item}</option>)}</select></label>
              <label>Status<select value={form.status} onChange={(event) => setForm((current) => ({ ...current, status: event.target.value as PurchaseStatus }))}>{(Object.keys(statusLabels) as PurchaseStatus[]).map((item) => <option key={item} value={item}>{statusLabels[item]}</option>)}</select></label>
              <label className="lead-modal-wide">Valor pedido<input min="0" type="number" value={form.askingPrice} onChange={(event) => setForm((current) => ({ ...current, askingPrice: event.target.value }))} /></label>
              {saveError ? <p className="lead-modal-error">{saveError}</p> : null}
              <div className="lead-modal-actions">
                <button className="text-button" onClick={() => setModalOpen(false)} type="button">Cancelar</button>
                <button className="primary-action" disabled={saving} type="submit">{saving ? "Salvando..." : "Criar oportunidade"}</button>
              </div>
            </form>
          </section>
        </div>
      ) : null}

      {paymentLead ? (
        <div className="dre-modal-backdrop" role="dialog" aria-modal="true" aria-label="Pagamento de compra">
          <section className="dre-modal lead-modal">
            <header className="dre-modal-header">
              <div><p className="eyebrow">Pagamento</p><h3>Lead {paymentLead.id.slice(0, 8)}</h3></div>
              <button aria-label="Fechar pagamento" className="icon-button" onClick={() => setPaymentLead(null)} type="button"><X aria-hidden="true" size={18} /></button>
            </header>
            <form className="lead-modal-form" onSubmit={createPayment}>
              <label>Valor<input autoFocus min="0.01" required step="0.01" type="number" value={paymentForm.amount} onChange={(event) => setPaymentForm((current) => ({ ...current, amount: event.target.value }))} /></label>
              <label>Status<select value={paymentForm.status} onChange={(event) => setPaymentForm((current) => ({ ...current, status: event.target.value as PaymentStatus }))}>{(Object.keys(paymentLabels) as PaymentStatus[]).map((item) => <option key={item} value={item}>{paymentLabels[item]}</option>)}</select></label>
              {saveError ? <p className="lead-modal-error">{saveError}</p> : null}
              <div className="lead-modal-actions">
                <button className="text-button" onClick={() => setPaymentLead(null)} type="button">Cancelar</button>
                <button className="primary-action" disabled={saving || Number(paymentForm.amount) <= 0} type="submit">{saving ? "Salvando..." : "Registrar pagamento"}</button>
              </div>
            </form>
          </section>
        </div>
      ) : null}

      <section className="panel module-kanban-panel" aria-label="Kanban de compras">
        <div className="section-heading"><div><p className="eyebrow">Fluxo</p><h3>Oportunidade, avaliacao e compra</h3></div><span className="live-pill">{statusLabel}</span></div>
        <div className="module-kanban">
          {view.board.map((column) => (
            <section className="module-kanban-column" key={column.title}>
              <header><strong>{column.title}</strong><span>{column.total}</span></header>
              {column.cards.map((lead) => <article className="module-kanban-card" key={lead.id}><strong>Lead {lead.id.slice(0, 8)}</strong><span>{lead.source || "Origem nao informada"}</span><em>{money(lead.askingPrice)}</em></article>)}
              {column.cards.length === 0 ? <article className="module-kanban-card"><strong>Sem cards</strong><span>Nenhuma compra nesta etapa</span><em>0</em></article> : null}
            </section>
          ))}
        </div>
      </section>

      <section className="blueprint-grid">
        <article className="panel">
          <div className="section-heading"><div><p className="eyebrow">Oportunidades</p><h3>Leads de compra e troca</h3></div><span className="live-pill">{statusLabel}</span></div>
          <div className="blueprint-list">
            {leads.map((lead) => (
              <article className={`blueprint-row ${toneFor(lead.status)}`} key={lead.id}>
                <div className="blueprint-main"><CarFront aria-hidden="true" /><div><strong>Lead {lead.id.slice(0, 8)}</strong><span>{lead.source || "Origem nao informada"} | {lead.vehicleId ? "veiculo vinculado" : "sem veiculo"}</span></div></div>
                <div className="blueprint-tags">
                  <span>{statusLabels[lead.status]}</span>
                  <select className="kanban-stage-select" disabled={movingId === lead.id} onChange={(event) => void updateLeadStatus(lead, event.target.value as PurchaseStatus)} value={lead.status}>
                    {(Object.keys(statusLabels) as PurchaseStatus[]).map((purchaseStatus) => <option key={purchaseStatus} value={purchaseStatus}>{statusLabels[purchaseStatus]}</option>)}
                  </select>
                </div>
                <div className="blueprint-value">
                  <strong>{money(lead.askingPrice)}</strong>
                  <button className="text-button" disabled={!canManagePurchases} onClick={() => { setPaymentLead(lead); setPaymentForm({ amount: lead.askingPrice ? String(Number(lead.askingPrice)) : "", status: "PENDING" }); setSaveError(null); }} type="button">Pagamento</button>
                </div>
              </article>
            ))}
          </div>
        </article>

        <aside className="panel">
          <div className="section-heading"><div><p className="eyebrow">Controles</p><h3>Compra auditavel</h3></div></div>
          <ul className="blueprint-side-list">
            <li><ClipboardList aria-hidden="true" size={18} /><div><strong>Origem</strong><span>Fornecedor, cliente, troca ou sugestao ficam salvos no lead.</span></div></li>
            <li><Calculator aria-hidden="true" size={18} /><div><strong>Margem</strong><span>Avaliacao detalha FIPE, preparo, sugerido e margem prevista.</span></div></li>
            <li><Gavel aria-hidden="true" size={18} /><div><strong>Decisao</strong><span>Aprovacao sensivel acontece no historico de avaliacoes.</span></div></li>
            <li><CreditCard aria-hidden="true" size={18} /><div><strong>Pagamento</strong><span>Pagamento pago move a oportunidade para comprado.</span></div></li>
          </ul>
          <div className="automation-status success">
            <BadgeCheck aria-hidden="true" size={18} />
            <span>Compras, avaliacoes e pagamentos compartilham auditoria e eventos internos.</span>
          </div>
          <div className="automation-status warning">
            <Sparkles aria-hidden="true" size={18} />
            <span>Sugestoes de IA podem entrar como origem e serem avaliadas pelo mesmo fluxo humano.</span>
          </div>
        </aside>
      </section>
    </>
  );
}
