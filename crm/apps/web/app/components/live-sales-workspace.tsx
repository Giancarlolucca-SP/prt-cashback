"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  BadgeDollarSign,
  Banknote,
  CheckCircle2,
  ClipboardCheck,
  FileText,
  Handshake,
  Plus,
  ShieldCheck,
  X,
} from "lucide-react";
import { apiGet, apiPatch, apiPost } from "../auth/auth-client";
import { useAuth } from "../auth/auth-provider";

type SaleStatus = "DRAFT" | "PROPOSAL" | "APPROVED" | "DOCUMENTATION" | "CLOSED" | "CANCELLED";
type SaleType = "VEHICLE" | "REPASSE" | "SERVICE";

type Sale = {
  id: string;
  customerId: string | null;
  vehicleId: string | null;
  sellerUserId: string | null;
  type: SaleType;
  status: SaleStatus;
  salePrice: string | null;
  grossMargin: string | null;
  closedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type ListResponse<T> = {
  items: T[];
  page: number;
  pageSize: number;
  total?: number;
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

type SaleFormState = {
  inventoryId: string;
  salePrice: string;
  status: SaleStatus;
  type: SaleType;
};

const emptyForm: SaleFormState = {
  inventoryId: "",
  salePrice: "",
  status: "PROPOSAL",
  type: "VEHICLE",
};

const fallbackSales: Sale[] = [
  {
    id: "fallback-1",
    customerId: null,
    vehicleId: null,
    sellerUserId: null,
    type: "VEHICLE",
    status: "PROPOSAL",
    salePrice: "128900.00",
    grossMargin: "21140.00",
    closedAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: "fallback-2",
    customerId: null,
    vehicleId: null,
    sellerUserId: null,
    type: "VEHICLE",
    status: "DOCUMENTATION",
    salePrice: "132900.00",
    grossMargin: "18980.00",
    closedAt: null,
    createdAt: new Date(Date.now() - 3 * 86400000).toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

const filters: Array<{ label: string; status?: SaleStatus }> = [
  { label: "Todos" },
  { label: "Rascunhos", status: "DRAFT" },
  { label: "Propostas", status: "PROPOSAL" },
  { label: "Aprovados", status: "APPROVED" },
  { label: "Documentos", status: "DOCUMENTATION" },
  { label: "Fechados", status: "CLOSED" },
  { label: "Cancelados", status: "CANCELLED" },
];

const statusLabels: Record<SaleStatus, string> = {
  APPROVED: "Aprovado",
  CANCELLED: "Cancelado",
  CLOSED: "Fechado",
  DOCUMENTATION: "Documentacao",
  DRAFT: "Rascunho",
  PROPOSAL: "Proposta",
};

const typeLabels: Record<SaleType, string> = {
  REPASSE: "Repasse",
  SERVICE: "Servico",
  VEHICLE: "Veiculo",
};

const currency = new Intl.NumberFormat("pt-BR", { currency: "BRL", maximumFractionDigits: 0, style: "currency" });

function money(value: string | null) {
  const amount = Number(value ?? 0);
  return amount > 0 ? currency.format(amount) : "A definir";
}

function toneFor(status: SaleStatus) {
  if (status === "PROPOSAL") return "proposal";
  if (status === "APPROVED") return "hot";
  if (status === "DOCUMENTATION" || status === "CLOSED") return "done";
  if (status === "CANCELLED") return "risk";
  return "";
}

function saleTitle(sale: Sale) {
  return sale.customerId ? "Cliente vinculado" : `Proposta ${sale.id.slice(0, 8)}`;
}

export function LiveSalesWorkspace() {
  const { hasPermission, token } = useAuth();
  const canReadSales = hasPermission({ module: "sales", action: "read" });
  const canCreateSales = hasPermission({ module: "sales", action: "create" });
  const canUpdateSales = hasPermission({ module: "sales", action: "update" });
  const canApproveSales = hasPermission({ module: "sales", action: "approve", scope: "ALL", sensitiveArea: "sensitive_approval" });
  const canReadInventory = hasPermission({ module: "inventory", action: "read" });
  const [activeFilter, setActiveFilter] = useState(filters[0]);
  const [form, setForm] = useState<SaleFormState>(emptyForm);
  const [inventoryOptions, setInventoryOptions] = useState<InventoryOption[]>([]);
  const [inventoryStatus, setInventoryStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [modalOpen, setModalOpen] = useState(false);
  const [movingId, setMovingId] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [sales, setSales] = useState(fallbackSales);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<"fallback" | "loading" | "live" | "error" | "locked">("fallback");

  useEffect(() => {
    if (!token) return;
    if (!canReadSales) {
      setStatus("locked");
      return;
    }

    let isCurrent = true;
    const query = new URLSearchParams({ page: "1", page_size: "50" });
    if (activeFilter.status) query.set("status", activeFilter.status);

    setStatus("loading");
    apiGet<ListResponse<Sale>>(`/sales?${query.toString()}`, token)
      .then((list) => {
        if (!isCurrent) return;
        setSales(list.items);
        setStatus("live");
      })
      .catch(() => {
        if (isCurrent) setStatus("error");
      });

    return () => {
      isCurrent = false;
    };
  }, [activeFilter, canReadSales, refreshKey, token]);

  useEffect(() => {
    if (!modalOpen || !token || !canReadInventory) return;

    let isCurrent = true;
    setInventoryStatus("loading");

    apiGet<ListResponse<InventoryOption>>("/inventory?page=1&page_size=100", token)
      .then((list) => {
        if (!isCurrent) return;
        setInventoryOptions(list.items.filter((item) => item.status !== "SOLD" && item.status !== "REMOVED"));
        setInventoryStatus("ready");
      })
      .catch(() => {
        if (isCurrent) setInventoryStatus("error");
      });

    return () => {
      isCurrent = false;
    };
  }, [canReadInventory, modalOpen, token]);

  async function handleCreate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || !canCreateSales || saving) return;

    setSaving(true);
    setSaveError(null);
    try {
      const response = await apiPost<{ data: Sale }>("/sales", token, {
        inventoryId: form.inventoryId || undefined,
        salePrice: form.salePrice ? Number(form.salePrice) : undefined,
        status: form.status,
        type: form.type,
      });

      setSales((current) => [response.data, ...current.filter((sale) => sale.id !== response.data.id)]);
      setForm(emptyForm);
      setModalOpen(false);
      setRefreshKey((current) => current + 1);
    } catch {
      setSaveError("Nao foi possivel criar a proposta. Confira valor e tipo.");
    } finally {
      setSaving(false);
    }
  }

  async function updateSalePrice(sale: Sale, nextPrice: number) {
    if (!token || !canUpdateSales || movingId) return;

    const previous = sale;
    setMovingId(sale.id);
    try {
      const response = await apiPatch<{ data: Sale }>(`/sales/${sale.id}`, token, { salePrice: nextPrice });
      setSales((current) => current.map((item) => (item.id === sale.id ? response.data : item)));
      setRefreshKey((current) => current + 1);
    } catch {
      setSales((current) => current.map((item) => (item.id === sale.id ? previous : item)));
      setStatus("error");
    } finally {
      setMovingId(null);
    }
  }

  async function updateSaleStatus(sale: Sale, nextStatus: SaleStatus) {
    const needsApproval = nextStatus === "APPROVED" || nextStatus === "CLOSED";
    if (!token || movingId || sale.status === nextStatus || (needsApproval ? !canApproveSales : !canUpdateSales)) return;

    const previous = sale;
    setMovingId(sale.id);
    setSales((current) => current.map((item) => (item.id === sale.id ? { ...item, status: nextStatus, updatedAt: new Date().toISOString() } : item)));

    try {
      const response = await apiPost<{ data: Sale }>(`/sales/${sale.id}/status`, token, {
        reason: "Movido pela central de vendas",
        status: nextStatus,
      });
      setSales((current) => current.map((item) => (item.id === sale.id ? response.data : item)));
      setRefreshKey((current) => current + 1);
    } catch {
      setSales((current) => current.map((item) => (item.id === sale.id ? previous : item)));
      setStatus("error");
    } finally {
      setMovingId(null);
    }
  }

  function inventoryLabel(option: InventoryOption) {
    if (!option.vehicle) return `Estoque ${option.id.slice(0, 8)}`;
    return [option.vehicle.brand, option.vehicle.model, option.vehicle.version, option.vehicle.yearModel, option.vehicle.plate ? `| ${option.vehicle.plate}` : null]
      .filter(Boolean)
      .join(" ");
  }

  function selectInventory(inventoryId: string) {
    const selected = inventoryOptions.find((option) => option.id === inventoryId);
    setForm((current) => ({
      ...current,
      inventoryId,
      salePrice: selected?.askingPrice && !current.salePrice ? String(Number(selected.askingPrice)) : current.salePrice,
      type: inventoryId ? "VEHICLE" : current.type,
    }));
  }

  const view = useMemo(() => {
    const open = sales.filter((sale) => ["DRAFT", "PROPOSAL", "APPROVED", "DOCUMENTATION"].includes(sale.status)).length;
    const closed = sales.filter((sale) => sale.status === "CLOSED").length;
    const revenue = sales.filter((sale) => sale.status === "CLOSED").reduce((sum, sale) => sum + Number(sale.salePrice ?? 0), 0);
    const docs = sales.filter((sale) => sale.status === "DOCUMENTATION").length;
    const blocked = sales.filter((sale) => sale.status === "CANCELLED").length;

    return {
      kanban: (Object.keys(statusLabels) as SaleStatus[]).map((saleStatus) => {
        const statusSales = sales.filter((sale) => sale.status === saleStatus).slice(0, 2);
        return {
          cards: statusSales,
          title: statusLabels[saleStatus],
          total: sales.filter((sale) => sale.status === saleStatus).length,
        };
      }),
      metrics: [
        { label: "Propostas abertas", value: String(open), detail: "rascunhos, propostas e docs", tone: "teal" },
        { label: "Vendas do mes", value: String(closed), detail: `${currency.format(revenue)} em vendas fechadas`, tone: "blue" },
        { label: "Docs pendentes", value: String(docs), detail: "passagem administrativa", tone: "amber" },
        { label: "Bloqueios", value: String(blocked), detail: "canceladas ou travadas", tone: "rose" },
      ],
      rows: sales.slice(0, 10),
    };
  }, [sales]);

  const statusLabel = {
    error: "Usando fallback",
    fallback: "Fallback visual",
    live: "Dados reais",
    loading: "Sincronizando",
    locked: "Sem permissao",
  }[status];

  return (
    <>
      <section className="metric-grid" aria-label="Indicadores de vendas">
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

      <section className="leads-toolbar panel" aria-label="Filtros de vendas">
        <div>
          {filters.map((filter) => (
            <button className={filter.label === activeFilter.label ? "active" : ""} key={filter.label} onClick={() => setActiveFilter(filter)} type="button">
              {filter.label}
            </button>
          ))}
        </div>
        <button className="primary-action" disabled={!canCreateSales} onClick={() => setModalOpen(true)} type="button">
          <Plus aria-hidden="true" size={17} />
          Nova proposta
        </button>
      </section>

      {modalOpen ? (
        <div className="dre-modal-backdrop" role="dialog" aria-modal="true" aria-label="Nova proposta">
          <section className="dre-modal lead-modal">
            <header className="dre-modal-header">
              <div>
                <p className="eyebrow">Pipeline comercial</p>
                <h3>Nova proposta</h3>
              </div>
              <button aria-label="Fechar nova proposta" className="icon-button" onClick={() => setModalOpen(false)} type="button">
                <X aria-hidden="true" size={18} />
              </button>
            </header>
            <form className="lead-modal-form" onSubmit={handleCreate}>
              <label className="lead-modal-wide">
                Veiculo do estoque
                <select disabled={!canReadInventory || inventoryStatus === "loading"} value={form.inventoryId} onChange={(event) => selectInventory(event.target.value)}>
                  <option value="">Sem veiculo vinculado</option>
                  {inventoryOptions.map((option) => (
                    <option key={option.id} value={option.id}>
                      {inventoryLabel(option)} - {money(option.askingPrice)}
                    </option>
                  ))}
                </select>
              </label>
              {!canReadInventory ? <p className="lead-modal-error">Sem permissao para listar estoque; a proposta sera criada sem veiculo vinculado.</p> : null}
              {inventoryStatus === "error" ? <p className="lead-modal-error">Nao foi possivel carregar o estoque agora.</p> : null}
              <label>
                Tipo
                <select value={form.type} onChange={(event) => setForm((current) => ({ ...current, type: event.target.value as SaleType }))}>
                  {(Object.keys(typeLabels) as SaleType[]).map((item) => <option key={item} value={item}>{typeLabels[item]}</option>)}
                </select>
              </label>
              <label>
                Status
                <select value={form.status} onChange={(event) => setForm((current) => ({ ...current, status: event.target.value as SaleStatus }))}>
                  <option value="DRAFT">Rascunho</option>
                  <option value="PROPOSAL">Proposta</option>
                </select>
              </label>
              <label className="lead-modal-wide">
                Valor da venda
                <input min="0" type="number" value={form.salePrice} onChange={(event) => setForm((current) => ({ ...current, salePrice: event.target.value }))} />
              </label>
              {saveError ? <p className="lead-modal-error">{saveError}</p> : null}
              <div className="lead-modal-actions">
                <button className="text-button" onClick={() => setModalOpen(false)} type="button">Cancelar</button>
                <button className="primary-action" disabled={saving} type="submit">{saving ? "Salvando..." : "Criar proposta"}</button>
              </div>
            </form>
          </section>
        </div>
      ) : null}

      <section className="panel module-kanban-panel" aria-label="Kanban individual de vendas">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Kanban de vendas</p>
            <h3>Propostas, documentos e passagem</h3>
          </div>
          <span className="live-pill">{statusLabel}</span>
        </div>

        <div className="module-kanban">
          {view.kanban.map((column) => (
            <section className="module-kanban-column" key={column.title}>
              <header><strong>{column.title}</strong><span>{column.total}</span></header>
              {column.cards.length > 0 ? column.cards.map((sale) => (
                <article className="module-kanban-card" key={sale.id}>
                  <strong>{saleTitle(sale)}</strong>
                  <span>{typeLabels[sale.type]} | {money(sale.salePrice)}</span>
                  <em>{sale.grossMargin ? `Margem ${money(sale.grossMargin)}` : "margem pendente"}</em>
                </article>
              )) : (
                <article className="module-kanban-card"><strong>Sem cards</strong><span>Nenhuma venda nesta etapa</span><em>0</em></article>
              )}
            </section>
          ))}
        </div>
      </section>

      <section className="sales-grid">
        <section className="panel sales-board" aria-label="Negociacoes em andamento">
          <div className="section-heading">
            <div><p className="eyebrow">Negociacoes</p><h3>Propostas e passagens em andamento</h3></div>
            <span className="live-pill">{statusLabel}</span>
          </div>

          <div className="deal-list">
            {view.rows.map((sale) => (
              <article className={`deal-card ${toneFor(sale.status)}`} key={sale.id}>
                <div className="deal-main">
                  <Handshake aria-hidden="true" size={22} />
                  <div><strong>{saleTitle(sale)}</strong><span>{sale.vehicleId ? "Veiculo vinculado" : "Sem veiculo vinculado"}</span></div>
                </div>
                <div className="deal-tags">
                  <span>{statusLabels[sale.status]}</span>
                  <span>{typeLabels[sale.type]}</span>
                  <select
                    className="kanban-stage-select"
                    disabled={movingId === sale.id}
                    onChange={(event) => void updateSaleStatus(sale, event.target.value as SaleStatus)}
                    value={sale.status}
                  >
                    {(Object.keys(statusLabels) as SaleStatus[]).map((saleStatus) => (
                      <option key={saleStatus} value={saleStatus}>{statusLabels[saleStatus]}</option>
                    ))}
                  </select>
                </div>
                <div className="deal-value">
                  <strong>{money(sale.salePrice)}</strong>
                  <span>{sale.grossMargin ? `Margem ${money(sale.grossMargin)}` : "margem pendente"}</span>
                  <button disabled={!canUpdateSales || movingId === sale.id} onClick={() => void updateSalePrice(sale, Number(sale.salePrice ?? 0) + 1000)} type="button">+ R$ 1k</button>
                </div>
              </article>
            ))}
          </div>
        </section>

        <aside className="panel sales-side" aria-label="Checklist de passagem de venda">
          <div className="section-heading">
            <div><p className="eyebrow">Passagem</p><h3>Checklist administrativo</h3></div>
            <BadgeDollarSign aria-hidden="true" size={20} />
          </div>
          <ul className="handoff-list">
            {[
              { item: "Conferencia documental", status: `${view.metrics[2].value} pendentes`, icon: FileText },
              { item: "Retorno financeira", status: "registrar no financeiro", icon: Banknote },
              { item: "Consulta judicial", status: "validar antes de fechar", icon: ShieldCheck },
              { item: "Passagem para administrativo", status: `${sales.filter((sale) => sale.status === "APPROVED").length} prontas`, icon: ClipboardCheck },
            ].map((item) => {
              const Icon = item.icon;
              return <li key={item.item}><Icon aria-hidden="true" size={18} /><div><strong>{item.item}</strong><span>{item.status}</span></div></li>;
            })}
          </ul>
          <div className="stock-actions">
            <button type="button"><CheckCircle2 aria-hidden="true" size={17} />Aprovar passagem</button>
            <button type="button"><FileText aria-hidden="true" size={17} />Solicitar documento</button>
            <button type="button"><Banknote aria-hidden="true" size={17} />Registrar retorno financeira</button>
          </div>
          <div className="automation-status warning">
            <AlertTriangle aria-hidden="true" size={18} />
            <span>Fechar venda exige permissao sensivel e move o veiculo vinculado para vendido.</span>
          </div>
        </aside>
      </section>
    </>
  );
}
