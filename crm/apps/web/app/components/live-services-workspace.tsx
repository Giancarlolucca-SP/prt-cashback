"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { AlertTriangle, ClipboardList, FileCheck2, FileText, Hammer, Paperclip, Plus, Wrench, X } from "lucide-react";
import { apiGet, apiPost } from "../auth/auth-client";
import { useAuth } from "../auth/auth-provider";

type ServiceStatus = "OPEN" | "SCHEDULED" | "RUNNING" | "WAITING_PROVIDER" | "WAITING_INVOICE" | "DONE" | "CANCELLED";

type ServiceOrder = {
  id: string;
  customerId: string | null;
  vehicleId: string | null;
  saleId: string | null;
  providerId: string | null;
  type: string;
  status: ServiceStatus;
  totalAmount: string | null;
  startedAt: string | null;
  finishedAt: string | null;
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

type OrderFormState = {
  status: ServiceStatus;
  totalAmount: string;
  type: string;
  vehicleId: string;
};

type ActionFormState = {
  amount: string;
  description: string;
  invoiceNumber: string;
  mode: "item" | "cost" | "invoice";
};

const emptyOrderForm: OrderFormState = {
  status: "OPEN",
  totalAmount: "",
  type: "Preparacao",
  vehicleId: "",
};

const emptyActionForm: ActionFormState = {
  amount: "",
  description: "",
  invoiceNumber: "",
  mode: "item",
};

const fallbackOrders: ServiceOrder[] = [
  {
    id: "fallback-1",
    customerId: null,
    vehicleId: null,
    saleId: null,
    providerId: null,
    type: "PPF + higienizacao",
    status: "RUNNING",
    totalAmount: "1800.00",
    startedAt: new Date().toISOString(),
    finishedAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

const filters: Array<{ label: string; status?: ServiceStatus }> = [
  { label: "Todos" },
  { label: "Abertas", status: "OPEN" },
  { label: "Agendadas", status: "SCHEDULED" },
  { label: "Execucao", status: "RUNNING" },
  { label: "Prestador", status: "WAITING_PROVIDER" },
  { label: "NF pendente", status: "WAITING_INVOICE" },
  { label: "Concluidas", status: "DONE" },
];

const statusLabels: Record<ServiceStatus, string> = {
  CANCELLED: "Cancelada",
  DONE: "Concluida",
  OPEN: "Aberta",
  RUNNING: "Em execucao",
  SCHEDULED: "Agendada",
  WAITING_INVOICE: "NF pendente",
  WAITING_PROVIDER: "Prestador",
};

const serviceTypes = ["Preparacao", "Vistoria cautelar", "Polimento", "Higienizacao", "Revisao", "Garantia", "Pos-venda"];
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

function toneFor(status: ServiceStatus) {
  if (status === "DONE") return "done";
  if (status === "RUNNING" || status === "SCHEDULED") return "running";
  if (status === "WAITING_PROVIDER" || status === "WAITING_INVOICE" || status === "CANCELLED") return "risk";
  return "";
}

export function LiveServicesWorkspace() {
  const { hasPermission, token } = useAuth();
  const canManageServices = hasPermission({ module: "services", action: "manage" });
  const canReadInventory = hasPermission({ module: "inventory", action: "read" });
  const [activeFilter, setActiveFilter] = useState(filters[0]);
  const [actionForm, setActionForm] = useState(emptyActionForm);
  const [actionOrder, setActionOrder] = useState<ServiceOrder | null>(null);
  const [form, setForm] = useState(emptyOrderForm);
  const [inventory, setInventory] = useState<InventoryOption[]>([]);
  const [inventoryStatus, setInventoryStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [modalOpen, setModalOpen] = useState(false);
  const [movingId, setMovingId] = useState<string | null>(null);
  const [orders, setOrders] = useState(fallbackOrders);
  const [refreshKey, setRefreshKey] = useState(0);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<"fallback" | "loading" | "live" | "error" | "locked">("fallback");

  useEffect(() => {
    if (!token) return;
    if (!canManageServices) {
      setStatus("locked");
      return;
    }

    let isCurrent = true;
    const query = new URLSearchParams({ page: "1", page_size: "50" });
    if (activeFilter.status) query.set("status", activeFilter.status);

    setStatus("loading");
    apiGet<ListResponse<ServiceOrder>>(`/services/orders?${query.toString()}`, token)
      .then((list) => {
        if (!isCurrent) return;
        setOrders(list.items);
        setStatus("live");
      })
      .catch(() => {
        if (isCurrent) setStatus("error");
      });

    return () => {
      isCurrent = false;
    };
  }, [activeFilter, canManageServices, refreshKey, token]);

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

  async function createOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || !canManageServices || saving) return;

    setSaving(true);
    setSaveError(null);
    try {
      const response = await apiPost<{ data: ServiceOrder }>("/services/orders", token, {
        status: form.status,
        totalAmount: form.totalAmount ? Number(form.totalAmount) : undefined,
        type: form.type.trim(),
        vehicleId: form.vehicleId || undefined,
      });
      setOrders((current) => [response.data, ...current.filter((order) => order.id !== response.data.id)]);
      setForm(emptyOrderForm);
      setModalOpen(false);
      setRefreshKey((current) => current + 1);
    } catch {
      setSaveError("Nao foi possivel criar a OS. Confira tipo, veiculo e valor.");
    } finally {
      setSaving(false);
    }
  }

  async function updateStatus(order: ServiceOrder, nextStatus: ServiceStatus) {
    if (!token || !canManageServices || movingId || order.status === nextStatus) return;

    const previous = order;
    setMovingId(order.id);
    setOrders((current) => current.map((item) => (item.id === order.id ? { ...item, status: nextStatus } : item)));

    try {
      const response = await apiPost<{ data: ServiceOrder }>(`/services/orders/${order.id}/status`, token, {
        reason: "Atualizado pela central de servicos",
        status: nextStatus,
      });
      setOrders((current) => current.map((item) => (item.id === order.id ? response.data : item)));
      setRefreshKey((current) => current + 1);
    } catch {
      setOrders((current) => current.map((item) => (item.id === order.id ? previous : item)));
      setStatus("error");
    } finally {
      setMovingId(null);
    }
  }

  async function saveAction(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || !canManageServices || !actionOrder || saving) return;

    setSaving(true);
    setSaveError(null);
    try {
      if (actionForm.mode === "item") {
        await apiPost<{ data: { id: string } }>(`/services/orders/${actionOrder.id}/items`, token, {
          costAmount: actionForm.amount ? Number(actionForm.amount) : undefined,
          description: actionForm.description.trim(),
          quantity: 1,
          unitPrice: actionForm.amount ? Number(actionForm.amount) : undefined,
        });
      }
      if (actionForm.mode === "cost") {
        await apiPost<{ data: { id: string } }>(`/services/orders/${actionOrder.id}/costs`, token, {
          amount: Number(actionForm.amount),
          description: actionForm.description.trim(),
        });
      }
      if (actionForm.mode === "invoice") {
        await apiPost<{ data: { id: string } }>(`/services/orders/${actionOrder.id}/invoices`, token, {
          amount: actionForm.amount ? Number(actionForm.amount) : undefined,
          number: actionForm.invoiceNumber.trim() || undefined,
          snapshot: { description: actionForm.description.trim() || undefined },
        });
      }
      setActionForm(emptyActionForm);
      setActionOrder(null);
      setRefreshKey((current) => current + 1);
    } catch {
      setSaveError("Nao foi possivel salvar a movimentacao da OS.");
    } finally {
      setSaving(false);
    }
  }

  const view = useMemo(() => {
    const open = orders.filter((order) => order.status !== "DONE" && order.status !== "CANCELLED").length;
    const waitingProvider = orders.filter((order) => order.status === "WAITING_PROVIDER").length;
    const waitingInvoice = orders.filter((order) => order.status === "WAITING_INVOICE").length;
    const done = orders.filter((order) => order.status === "DONE").length;

    return {
      board: (Object.keys(statusLabels) as ServiceStatus[]).filter((item) => item !== "CANCELLED").map((orderStatus) => ({
        cards: orders.filter((order) => order.status === orderStatus).slice(0, 3),
        title: statusLabels[orderStatus],
        total: orders.filter((order) => order.status === orderStatus).length,
      })),
      metrics: [
        { detail: "em preparacao ou pos-venda", label: "OS abertas", tone: "teal", value: String(open) },
        { detail: "agenda ou terceiro", label: "Prestadores", tone: "amber", value: String(waitingProvider) },
        { detail: "documentos financeiros", label: "Notas a vincular", tone: "blue", value: String(waitingInvoice) },
        { detail: "servicos finalizados", label: "Concluidas", tone: "rose", value: String(done) },
      ],
    };
  }, [orders]);

  const statusLabel = {
    error: "Usando fallback",
    fallback: "Fallback visual",
    live: "Dados reais",
    loading: "Sincronizando",
    locked: "Sem permissao",
  }[status];

  return (
    <>
      <section className="metric-grid" aria-label="Indicadores de servicos">
        {view.metrics.map((metric) => (
          <article className={`metric-card ${metric.tone}`} key={metric.label}>
            <div><h3>{metric.label}</h3><strong>{metric.value}</strong><span>{metric.detail}</span></div>
          </article>
        ))}
      </section>

      <section className="leads-toolbar panel" aria-label="Filtros de servicos">
        <div>
          {filters.map((filter) => (
            <button className={filter.label === activeFilter.label ? "active" : ""} key={filter.label} onClick={() => setActiveFilter(filter)} type="button">
              {filter.label}
            </button>
          ))}
        </div>
        <button className="primary-action" disabled={!canManageServices} onClick={() => { setSaveError(null); setModalOpen(true); }} type="button">
          <Plus aria-hidden="true" size={17} />
          Nova OS
        </button>
      </section>

      {modalOpen ? (
        <div className="dre-modal-backdrop" role="dialog" aria-modal="true" aria-label="Nova ordem de servico">
          <section className="dre-modal lead-modal">
            <header className="dre-modal-header">
              <div><p className="eyebrow">Servicos</p><h3>Nova OS</h3></div>
              <button aria-label="Fechar nova OS" className="icon-button" onClick={() => setModalOpen(false)} type="button"><X aria-hidden="true" size={18} /></button>
            </header>
            <form className="lead-modal-form" onSubmit={createOrder}>
              <label className="lead-modal-wide">
                Veiculo
                <select disabled={!canReadInventory || inventoryStatus === "loading"} onChange={(event) => setForm((current) => ({ ...current, vehicleId: event.target.value }))} value={form.vehicleId}>
                  <option value="">Sem veiculo vinculado</option>
                  {inventory.map((item) => <option key={item.id} value={item.id}>{vehicleLabel(item)}</option>)}
                </select>
              </label>
              {!canReadInventory ? <p className="lead-modal-error">Sem permissao para listar estoque.</p> : null}
              {inventoryStatus === "error" ? <p className="lead-modal-error">Nao foi possivel carregar estoque.</p> : null}
              <label>Tipo<select value={form.type} onChange={(event) => setForm((current) => ({ ...current, type: event.target.value }))}>{serviceTypes.map((item) => <option key={item}>{item}</option>)}</select></label>
              <label>Status<select value={form.status} onChange={(event) => setForm((current) => ({ ...current, status: event.target.value as ServiceStatus }))}>{(Object.keys(statusLabels) as ServiceStatus[]).map((item) => <option key={item} value={item}>{statusLabels[item]}</option>)}</select></label>
              <label className="lead-modal-wide">Valor previsto<input min="0" type="number" value={form.totalAmount} onChange={(event) => setForm((current) => ({ ...current, totalAmount: event.target.value }))} /></label>
              {saveError ? <p className="lead-modal-error">{saveError}</p> : null}
              <div className="lead-modal-actions">
                <button className="text-button" onClick={() => setModalOpen(false)} type="button">Cancelar</button>
                <button className="primary-action" disabled={saving || form.type.trim().length < 2} type="submit">{saving ? "Salvando..." : "Criar OS"}</button>
              </div>
            </form>
          </section>
        </div>
      ) : null}

      {actionOrder ? (
        <div className="dre-modal-backdrop" role="dialog" aria-modal="true" aria-label="Movimentar ordem de servico">
          <section className="dre-modal lead-modal">
            <header className="dre-modal-header">
              <div><p className="eyebrow">OS {actionOrder.id.slice(0, 8)}</p><h3>Movimentacao</h3></div>
              <button aria-label="Fechar movimentacao" className="icon-button" onClick={() => setActionOrder(null)} type="button"><X aria-hidden="true" size={18} /></button>
            </header>
            <form className="lead-modal-form" onSubmit={saveAction}>
              <label>Tipo<select value={actionForm.mode} onChange={(event) => setActionForm((current) => ({ ...current, mode: event.target.value as ActionFormState["mode"] }))}><option value="item">Item da OS</option><option value="cost">Custo</option><option value="invoice">Nota fiscal</option></select></label>
              <label>Valor<input min="0" step="0.01" type="number" value={actionForm.amount} onChange={(event) => setActionForm((current) => ({ ...current, amount: event.target.value }))} /></label>
              {actionForm.mode === "invoice" ? <label>Numero NF<input maxLength={80} value={actionForm.invoiceNumber} onChange={(event) => setActionForm((current) => ({ ...current, invoiceNumber: event.target.value }))} /></label> : null}
              <label className="lead-modal-wide">Descricao<input required minLength={2} maxLength={180} value={actionForm.description} onChange={(event) => setActionForm((current) => ({ ...current, description: event.target.value }))} /></label>
              {saveError ? <p className="lead-modal-error">{saveError}</p> : null}
              <div className="lead-modal-actions">
                <button className="text-button" onClick={() => setActionOrder(null)} type="button">Cancelar</button>
                <button className="primary-action" disabled={saving || actionForm.description.trim().length < 2 || (actionForm.mode === "cost" && Number(actionForm.amount) <= 0)} type="submit">{saving ? "Salvando..." : "Salvar"}</button>
              </div>
            </form>
          </section>
        </div>
      ) : null}

      <section className="panel module-kanban-panel" aria-label="Kanban individual de servicos">
        <div className="section-heading"><div><p className="eyebrow">Kanban de servicos</p><h3>OS, terceiros, anexos e conclusao</h3></div><span className="live-pill">{statusLabel}</span></div>
        <div className="module-kanban">
          {view.board.map((column) => (
            <section className="module-kanban-column" key={column.title}>
              <header><strong>{column.title}</strong><span>{column.total}</span></header>
              {column.cards.map((order) => <article className="module-kanban-card" key={order.id}><strong>OS {order.id.slice(0, 8)}</strong><span>{order.type}</span><em>{money(order.totalAmount)}</em></article>)}
              {column.cards.length === 0 ? <article className="module-kanban-card"><strong>Sem cards</strong><span>Nenhuma OS nesta etapa</span><em>0</em></article> : null}
            </section>
          ))}
        </div>
      </section>

      <section className="services-grid">
        <section className="panel service-board" aria-label="Ordens de servico">
          <div className="section-heading"><div><p className="eyebrow">Execucao</p><h3>Ordens de servico por veiculo</h3></div><span className="live-pill">{statusLabel}</span></div>
          <div className="service-list">
            {orders.map((order) => (
              <article className={`service-card ${toneFor(order.status)}`} key={order.id}>
                <div className="service-main"><Wrench aria-hidden="true" size={22} /><div><strong>OS {order.id.slice(0, 8)}</strong><span>{order.vehicleId ? "Veiculo vinculado" : "Sem veiculo vinculado"}</span></div></div>
                <div className="service-tags">
                  <span>{order.type}</span>
                  <span>{statusLabels[order.status]}</span>
                  <span>{order.providerId ? "prestador vinculado" : "sem prestador"}</span>
                  <select className="kanban-stage-select" disabled={movingId === order.id} onChange={(event) => void updateStatus(order, event.target.value as ServiceStatus)} value={order.status}>
                    {(Object.keys(statusLabels) as ServiceStatus[]).map((item) => <option key={item} value={item}>{statusLabels[item]}</option>)}
                  </select>
                </div>
                <div className="service-deadline">
                  <strong>{money(order.totalAmount)}</strong>
                  <span>{new Date(order.createdAt).toLocaleDateString("pt-BR")}</span>
                  <button className="text-button" onClick={() => { setActionOrder(order); setActionForm(emptyActionForm); setSaveError(null); }} type="button">Movimentar</button>
                </div>
              </article>
            ))}
          </div>
        </section>

        <aside className="panel service-side" aria-label="Pendencias de servicos">
          <div className="section-heading"><div><p className="eyebrow">Pendencias</p><h3>Anexos, notas e aprovacoes</h3></div><Hammer aria-hidden="true" size={20} /></div>
          <ul className="service-task-list">
            <li><FileText aria-hidden="true" size={18} /><div><strong>NF pendente</strong><span>{orders.filter((order) => order.status === "WAITING_INVOICE").length} ordens</span></div></li>
            <li><ClipboardList aria-hidden="true" size={18} /><div><strong>Checklist final</strong><span>{orders.filter((order) => order.status === "RUNNING").length} em execucao</span></div></li>
            <li><Paperclip aria-hidden="true" size={18} /><div><strong>Anexos</strong><span>vincular fotos, laudos e comprovantes</span></div></li>
          </ul>
          <div className="stock-actions">
            <button type="button"><ClipboardList aria-hidden="true" size={17} />Abrir checklist</button>
            <button type="button"><FileCheck2 aria-hidden="true" size={17} />Vincular nota fiscal</button>
            <button type="button"><Paperclip aria-hidden="true" size={17} />Anexar arquivo</button>
          </div>
          <div className="automation-status warning">
            <AlertTriangle aria-hidden="true" size={18} />
            <span>Custos e notas ja entram na OS; prestadores e catalogo podem virar subfluxo dedicado.</span>
          </div>
        </aside>
      </section>
    </>
  );
}
