"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, BadgeCheck, Camera, CarFront, ClipboardList, FileText, Megaphone, Plus, Wrench, X } from "lucide-react";
import { apiGet, apiPatch, apiPost } from "../auth/auth-client";
import { useAuth } from "../auth/auth-provider";

type OwnershipType = "OWN" | "CONSIGNED" | "REPASSE" | "TRADE_IN";
type InventoryStatus = "IN_PREPARATION" | "AVAILABLE" | "RESERVED" | "SOLD" | "REPASSE" | "REMOVED";

type Vehicle = {
  brand: string;
  model: string;
  version: string | null;
  yearModel: number | null;
  plate: string | null;
  color: string | null;
  mileage: number | null;
  relevantOptions: string | null;
};

type InventoryItem = {
  id: string;
  vehicle: Vehicle | null;
  ownershipType: OwnershipType;
  status: InventoryStatus;
  ownerCustomerId: string | null;
  purchaseCost: string | null;
  askingPrice: string | null;
  entryDate: string;
  activeListingsCount?: number;
  daysInStock?: number;
  hasActiveListing?: boolean;
  hasRelevantPending?: boolean;
  notes: string | null;
  pendingSummary?: string | null;
};

type ListResponse<T> = {
  items: T[];
  page: number;
  pageSize: number;
  summary?: InventoryOperationalSummary;
  total?: number;
};

type InventoryOperationalSummary = {
  total: number;
  own: number;
  consigned: number;
  ownPercent: number;
  consignedPercent: number;
  byStatus: Partial<Record<InventoryStatus, number>>;
};

type InventoryFormState = {
  askingPrice: string;
  brand: string;
  color: string;
  entryDate: string;
  mileage: string;
  model: string;
  notes: string;
  ownershipType: OwnershipType;
  ownerCustomerId: string;
  plate: string;
  purchaseCost: string;
  relevantOptions: string;
  status: InventoryStatus;
  version: string;
  yearModel: string;
};

type CostFormState = {
  amount: string;
  capitalized: boolean;
  category: string;
  description: string;
};

type CustomerOption = {
  id: string;
  name: string;
  phone: string | null;
};

type InventoryDetailDocument = {
  id: string;
  originalName: string;
  classification: string | null;
  status: string;
  purpose: string | null;
  createdAt: string;
};

type InventoryDetailListing = {
  id: string;
  title: string;
  askingPrice: string | null;
  status: string;
  updatedAt: string;
};

type InventoryDetailResponse = {
  data: InventoryItem;
  documents: InventoryDetailDocument[];
  activeListings: InventoryDetailListing[];
};

const emptyForm: InventoryFormState = {
  askingPrice: "",
  brand: "",
  color: "",
  entryDate: new Date().toISOString().slice(0, 10),
  mileage: "",
  model: "",
  notes: "",
  ownershipType: "OWN",
  ownerCustomerId: "",
  plate: "",
  purchaseCost: "",
  relevantOptions: "",
  status: "IN_PREPARATION",
  version: "",
  yearModel: "",
};

const emptyCostForm: CostFormState = {
  amount: "",
  capitalized: true,
  category: "Preparacao",
  description: "",
};

const fallbackItems: InventoryItem[] = [
  {
    id: "fallback-1",
    vehicle: { brand: "Toyota", model: "Corolla", version: "XEI", yearModel: 2021, plate: "GTC-2A91", color: "Prata", mileage: 45000, relevantOptions: "Couro, multimidia, camera de re" },
    ownershipType: "OWN",
    status: "AVAILABLE",
    ownerCustomerId: null,
    purchaseCost: "94000.00",
    askingPrice: "119900.00",
    entryDate: new Date(Date.now() - 47 * 86400000).toISOString(),
    notes: "Ativo em canais principais",
  },
  {
    id: "fallback-2",
    vehicle: { brand: "Jeep", model: "Compass", version: "Longitude", yearModel: 2020, plate: "FJN-8D22", color: "Branco", mileage: 69000, relevantOptions: "Automatica, sensor de estacionamento" },
    ownershipType: "OWN",
    status: "IN_PREPARATION",
    ownerCustomerId: null,
    purchaseCost: "108500.00",
    askingPrice: "132900.00",
    entryDate: new Date(Date.now() - 31 * 86400000).toISOString(),
    notes: "PPF + higienizacao",
  },
];

const filters: Array<{ hasActiveListing?: boolean; hasRelevantPending?: boolean; label: string; ownershipType?: OwnershipType; status?: InventoryStatus }> = [
  { label: "Todos" },
  { label: "Proprios", ownershipType: "OWN" },
  { label: "Consignados", ownershipType: "CONSIGNED" },
  { label: "Prontos", status: "AVAILABLE" },
  { label: "Preparacao", status: "IN_PREPARATION" },
  { label: "Reservados", status: "RESERVED" },
  { hasActiveListing: true, label: "Com anuncio" },
  { hasRelevantPending: true, label: "Com pendencia" },
];

const statusLabels: Record<InventoryStatus, string> = {
  AVAILABLE: "Pronto venda",
  IN_PREPARATION: "Preparacao",
  REMOVED: "Removido",
  REPASSE: "Repasse",
  RESERVED: "Reservado",
  SOLD: "Vendido",
};

const ownershipLabels: Record<OwnershipType, string> = {
  CONSIGNED: "Consignado",
  OWN: "Proprio",
  REPASSE: "Repasse",
  TRADE_IN: "Troca",
};
const stockOwnershipOptions: OwnershipType[] = ["OWN", "CONSIGNED", "TRADE_IN"];
const stockStatusOptions: InventoryStatus[] = ["IN_PREPARATION", "AVAILABLE", "RESERVED", "SOLD", "REMOVED"];

const currency = new Intl.NumberFormat("pt-BR", { currency: "BRL", maximumFractionDigits: 0, style: "currency" });
const percent = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1, style: "percent" });

function money(value: string | null) {
  const amount = Number(value ?? 0);
  return amount > 0 ? currency.format(amount) : "A definir";
}

function daysInStock(entryDate: string) {
  return Math.max(0, Math.round((Date.now() - new Date(entryDate).getTime()) / 86400000));
}

function operationalDaysInStock(item: InventoryItem) {
  return item.daysInStock ?? daysInStock(item.entryDate);
}

function vehicleTitle(item: InventoryItem) {
  const vehicle = item.vehicle;
  if (!vehicle) return "Veiculo sem dados";
  return [vehicle.brand, vehicle.model, vehicle.version].filter(Boolean).join(" ");
}

function toneFor(item: InventoryItem) {
  if (item.ownershipType === "CONSIGNED") return "consigned";
  if (item.status === "AVAILABLE") return "ready";
  if (item.status === "IN_PREPARATION") return "prep";
  if (item.status === "RESERVED" || item.status === "SOLD") return "sold";
  return "risk";
}

function isCommonStockItem(item: InventoryItem) {
  return item.ownershipType !== "REPASSE" && item.status !== "REPASSE";
}

export function LiveInventoryWorkspace() {
  const { hasPermission, token } = useAuth();
  const canReadCustomers = hasPermission({ module: "customers", action: "read" });
  const canReadInventory = hasPermission({ module: "inventory", action: "read" });
  const canReadInventoryCosts = hasPermission({ module: "inventory", action: "read_costs" });
  const canManageInventory = hasPermission({ module: "inventory", action: "manage" });
  const canCreateInventory = canManageInventory || hasPermission({ module: "inventory", action: "create" });
  const [activeFilter, setActiveFilter] = useState(filters[0]);
  const [costForm, setCostForm] = useState<CostFormState>(emptyCostForm);
  const [costItem, setCostItem] = useState<InventoryItem | null>(null);
  const [customerOptions, setCustomerOptions] = useState<CustomerOption[]>([]);
  const [customerOptionsStatus, setCustomerOptionsStatus] = useState<"idle" | "loading" | "ready" | "error" | "locked">("idle");
  const [form, setForm] = useState<InventoryFormState>(emptyForm);
  const [inventoryDetail, setInventoryDetail] = useState<InventoryDetailResponse | null>(null);
  const [inventoryDetailStatus, setInventoryDetailStatus] = useState<"idle" | "loading" | "loaded" | "error">("idle");
  const [items, setItems] = useState(fallbackItems);
  const [modalOpen, setModalOpen] = useState(false);
  const [movingId, setMovingId] = useState<string | null>(null);
  const [operationalSummary, setOperationalSummary] = useState<InventoryOperationalSummary | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"fallback" | "loading" | "live" | "error" | "locked">("fallback");

  useEffect(() => {
    if (!token) return;
    if (!canReadInventory) {
      setStatus("locked");
      return;
    }

    let isCurrent = true;
    const query = new URLSearchParams({ page: "1", page_size: "50", sort: "days_in_stock_desc" });
    if (activeFilter.hasActiveListing !== undefined) query.set("has_active_listing", String(activeFilter.hasActiveListing));
    if (activeFilter.hasRelevantPending !== undefined) query.set("has_pending", String(activeFilter.hasRelevantPending));
    if (activeFilter.status) query.set("status", activeFilter.status);
    if (activeFilter.ownershipType) query.set("ownership_type", activeFilter.ownershipType);
    if (search.trim()) query.set("search", search.trim());

    setStatus("loading");
    apiGet<ListResponse<InventoryItem>>(`/inventory?${query.toString()}`, token)
      .then((list) => {
        if (!isCurrent) return;
        setItems(list.items.filter(isCommonStockItem));
        setOperationalSummary(list.summary ?? null);
        setStatus("live");
      })
      .catch(() => {
        if (isCurrent) setStatus("error");
      });

    return () => {
      isCurrent = false;
    };
  }, [activeFilter, canReadInventory, refreshKey, search, token]);

  useEffect(() => {
    if (!modalOpen || form.ownershipType !== "CONSIGNED") {
      return;
    }

    if (!token || !canReadCustomers) {
      setCustomerOptionsStatus("locked");
      return;
    }

    let isCurrent = true;
    setCustomerOptionsStatus("loading");

    apiGet<ListResponse<CustomerOption>>("/customers?page=1&page_size=100&status=ACTIVE", token)
      .then((list) => {
        if (!isCurrent) return;
        setCustomerOptions(list.items);
        setCustomerOptionsStatus("ready");
      })
      .catch(() => {
        if (isCurrent) setCustomerOptionsStatus("error");
      });

    return () => {
      isCurrent = false;
    };
  }, [canReadCustomers, form.ownershipType, modalOpen, token]);

  async function handleCreate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || !canCreateInventory || saving) return;

    setSaving(true);
    setSaveError(null);
    try {
      const response = await apiPost<{ data: InventoryItem }>("/inventory", token, {
        askingPrice: form.askingPrice ? Number(form.askingPrice) : undefined,
        entryDate: form.entryDate ? new Date(`${form.entryDate}T12:00:00.000Z`).toISOString() : undefined,
        notes: form.notes.trim() || undefined,
        ownershipType: form.ownershipType,
        ownerCustomerId: form.ownershipType === "CONSIGNED" && form.ownerCustomerId ? form.ownerCustomerId : undefined,
        purchaseCost: canReadInventoryCosts && form.purchaseCost ? Number(form.purchaseCost) : undefined,
        status: form.status,
        vehicle: {
          brand: form.brand.trim(),
          color: form.color.trim() || undefined,
          mileage: form.mileage ? Number(form.mileage) : undefined,
          model: form.model.trim(),
          plate: form.plate.trim() || undefined,
          relevantOptions: form.relevantOptions.trim() || undefined,
          version: form.version.trim() || undefined,
          yearModel: form.yearModel ? Number(form.yearModel) : undefined,
        },
      });

      setItems((current) => {
        const withoutCurrent = current.filter((item) => item.id !== response.data.id);
        return isCommonStockItem(response.data) ? [response.data, ...withoutCurrent] : withoutCurrent;
      });
      setForm(emptyForm);
      setModalOpen(false);
      setRefreshKey((current) => current + 1);
    } catch {
      setSaveError("Nao foi possivel criar a entrada. Confira marca, modelo, placa e valores.");
    } finally {
      setSaving(false);
    }
  }

  async function updateItem(item: InventoryItem, patch: Partial<Pick<InventoryItem, "status">> & { askingPrice?: number }) {
    if (!token || !canManageInventory || movingId) return;

    const previous = item;
    setMovingId(item.id);
    if (patch.status) {
      setItems((current) => current.map((entry) => (entry.id === item.id ? { ...entry, status: patch.status ?? entry.status } : entry)));
    }

    try {
      const response = await apiPatch<{ data: InventoryItem }>(`/inventory/${item.id}`, token, patch);
      setItems((current) => current.map((entry) => (entry.id === item.id ? response.data : entry)).filter(isCommonStockItem));
      setRefreshKey((current) => current + 1);
    } catch {
      setItems((current) => current.map((entry) => (entry.id === item.id ? previous : entry)));
      setStatus("error");
    } finally {
      setMovingId(null);
    }
  }

  async function handleAddCost(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || !canManageInventory || !costItem || saving) return;

    setSaving(true);
    setSaveError(null);
    try {
      await apiPost<{ data: { id: string } }>(`/inventory/${costItem.id}/costs`, token, {
        amount: Number(costForm.amount),
        capitalized: costForm.capitalized,
        category: costForm.category.trim(),
        description: costForm.description.trim(),
      });

      setCostForm(emptyCostForm);
      setCostItem(null);
      setRefreshKey((current) => current + 1);
    } catch {
      setSaveError("Nao foi possivel lancar o custo. Confira categoria, descricao e valor.");
    } finally {
      setSaving(false);
    }
  }

  async function openInventoryDetail(item: InventoryItem) {
    if (!token || !canReadInventory) return;

    setInventoryDetail({ data: item, documents: [], activeListings: [] });
    setInventoryDetailStatus("loading");

    try {
      const detail = await apiGet<InventoryDetailResponse>(`/inventory/${item.id}/detail`, token);
      setInventoryDetail(detail);
      setInventoryDetailStatus("loaded");
    } catch {
      setInventoryDetailStatus("error");
    }
  }

  const view = useMemo(() => {
    const stockItems = items.filter(isCommonStockItem);
    const own = operationalSummary?.own ?? stockItems.filter((item) => item.ownershipType === "OWN").length;
    const consigned = operationalSummary?.consigned ?? stockItems.filter((item) => item.ownershipType === "CONSIGNED").length;
    const totalStockValue = stockItems.reduce((sum, item) => sum + Number(item.askingPrice ?? 0), 0);
    const projectedMargin = canReadInventoryCosts ? stockItems.reduce((sum, item) => sum + Math.max(0, Number(item.askingPrice ?? 0) - Number(item.purchaseCost ?? 0)), 0) : null;
    const avgMargin = projectedMargin !== null && totalStockValue > 0 ? projectedMargin / totalStockValue : null;
    const pending = operationalSummary?.byStatus.IN_PREPARATION ?? stockItems.filter((item) => item.status === "IN_PREPARATION").length;

    return {
      consignedItems: stockItems.filter((item) => item.ownershipType === "CONSIGNED").sort((a, b) => operationalDaysInStock(b) - operationalDaysInStock(a)),
      metrics: [
        { label: "Proprios", value: String(own), detail: operationalSummary ? percent.format(operationalSummary.ownPercent) : "capital da loja em estoque", tone: "teal" },
        { label: "Consignados", value: String(consigned), detail: operationalSummary ? percent.format(operationalSummary.consignedPercent) : "terceiros sob contrato", tone: "blue" },
        {
          label: "Margem media",
          value: avgMargin === null ? "Restrito" : percent.format(avgMargin),
          detail: projectedMargin === null ? "requer permissao de margem" : `${currency.format(projectedMargin)} sobre ${currency.format(totalStockValue)}`,
          tone: "amber",
        },
        { label: "Pendencias criticas", value: String(pending), detail: "preparacao ou remocao", tone: "rose" },
      ],
      ownItems: stockItems.filter((item) => item.ownershipType !== "CONSIGNED").sort((a, b) => operationalDaysInStock(b) - operationalDaysInStock(a)),
      prepQueue: stockItems.filter((item) => item.status === "IN_PREPARATION").slice(0, 4),
    };
  }, [canReadInventoryCosts, items, operationalSummary]);

  const ownershipOptions = canReadInventoryCosts ? stockOwnershipOptions : stockOwnershipOptions.filter((item) => item !== "CONSIGNED");

  const statusLabel = {
    error: "Usando fallback",
    fallback: "Fallback visual",
    live: "Dados reais",
    loading: "Sincronizando",
    locked: "Sem permissao",
  }[status];

  const renderVehicleCard = (item: InventoryItem) => {
    const price = Number(item.askingPrice ?? 0);
    const cost = item.purchaseCost === null ? null : Number(item.purchaseCost);
    const margin = cost !== null && price > 0 && cost > 0 ? price - cost : null;

    return (
      <article className={`stock-card ${toneFor(item)}`} key={item.id}>
        <div className="vehicle-summary">
          <div className="vehicle-main">
            <div className="vehicle-thumb">
              <CarFront aria-hidden="true" size={24} />
            </div>
            <div>
              <strong>{vehicleTitle(item)}</strong>
            <span>
                {item.vehicle?.yearModel ?? "Ano n/d"} | {item.vehicle?.plate ?? "Sem placa"} | {item.vehicle?.mileage != null ? `${item.vehicle.mileage.toLocaleString("pt-BR")} km` : "Km n/d"}
              </span>
            </div>
          </div>
          <div className="vehicle-tags">
            <span className={item.ownershipType === "CONSIGNED" ? "ownership-chip consigned" : "ownership-chip"}>{ownershipLabels[item.ownershipType]}</span>
            <span>{statusLabels[item.status]}</span>
            <span>{item.notes ?? "Sem observacoes"}</span>
            <span>{item.vehicle?.relevantOptions ?? "Opcionais n/d"}</span>
            <span>{item.hasActiveListing ? `${item.activeListingsCount ?? 1} anuncio ativo` : "Sem anuncio ativo"}</span>
            <span>{item.hasRelevantPending ? item.pendingSummary ?? "Pendencia relevante" : "Sem pendencia relevante"}</span>
            <span>{operationalDaysInStock(item)} dias</span>
          </div>
          <div className="vehicle-price">
            <strong>{money(item.askingPrice)}</strong>
            <span>{item.status === "AVAILABLE" ? "disponivel para oferta" : "conferir operacao"}</span>
          </div>
        </div>

        <div className="vehicle-owner-row">
          <span>{item.ownershipType === "CONSIGNED" ? "Consignante" : "Proprietario"}</span>
          <strong>{item.ownerCustomerId ? "Cliente vinculado" : item.ownershipType === "OWN" ? "GT3 Veiculos" : "Terceiro nao vinculado"}</strong>
        </div>

        <div className="vehicle-costs">
          <span>
            <em>Compra</em>
            <strong>{canReadInventoryCosts ? money(item.purchaseCost) : "Restrito"}</strong>
          </span>
          <span>
            <em>Margem R$</em>
            <strong>{margin === null ? "Restrito" : margin > 0 ? currency.format(margin) : "A definir"}</strong>
          </span>
          <span>
            <em>Status</em>
            <select
              className="kanban-stage-select"
              disabled={!canManageInventory || movingId === item.id}
              onChange={(event) => void updateItem(item, { status: event.target.value as InventoryStatus })}
              value={item.status}
            >
              {stockStatusOptions.map((inventoryStatus) => (
                <option key={inventoryStatus} value={inventoryStatus}>
                  {statusLabels[inventoryStatus]}
                </option>
              ))}
            </select>
          </span>
          <span>
            <em>Preco</em>
            <button disabled={!canManageInventory || movingId === item.id} onClick={() => void updateItem(item, { askingPrice: price + 1000 })} type="button">
              + R$ 1k
            </button>
          </span>
          <span>
            <em>Custos</em>
            <button disabled={!canManageInventory} onClick={() => { setCostItem(item); setCostForm(emptyCostForm); setSaveError(null); }} type="button">
              Lancar
            </button>
          </span>
          <span>
            <em>Detalhe</em>
            <button disabled={!canReadInventory || inventoryDetailStatus === "loading"} onClick={() => void openInventoryDetail(item)} type="button">
              Abrir
            </button>
          </span>
        </div>
      </article>
    );
  };

  return (
    <>
      <section className="metric-grid" aria-label="Indicadores de estoque">
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

      <section className="leads-toolbar panel" aria-label="Filtros de estoque">
        <div>
          {filters.map((filter) => (
            <button className={filter.label === activeFilter.label ? "active" : ""} key={filter.label} onClick={() => setActiveFilter(filter)} type="button">
              {filter.label}
            </button>
          ))}
        </div>
        <label className="search-box">
          <input aria-label="Buscar estoque" onChange={(event) => setSearch(event.target.value)} placeholder="Buscar modelo, placa, ano ou cor" value={search} />
        </label>
        <button className="primary-action" disabled={!canCreateInventory} onClick={() => setModalOpen(true)} type="button">
          <Plus aria-hidden="true" size={17} />
          Nova entrada
        </button>
      </section>

      {modalOpen ? (
        <div className="dre-modal-backdrop" role="dialog" aria-modal="true" aria-label="Nova entrada de estoque">
          <section className="dre-modal lead-modal">
            <header className="dre-modal-header">
              <div>
                <p className="eyebrow">Estoque</p>
                <h3>Nova entrada</h3>
              </div>
              <button aria-label="Fechar nova entrada" className="icon-button" onClick={() => setModalOpen(false)} type="button">
                <X aria-hidden="true" size={18} />
              </button>
            </header>
            <form className="lead-modal-form" onSubmit={handleCreate}>
              <label>Marca<input autoFocus required value={form.brand} onChange={(event) => setForm((current) => ({ ...current, brand: event.target.value }))} /></label>
              <label>Modelo<input required value={form.model} onChange={(event) => setForm((current) => ({ ...current, model: event.target.value }))} /></label>
              <label>Versao<input value={form.version} onChange={(event) => setForm((current) => ({ ...current, version: event.target.value }))} /></label>
              <label>Ano modelo<input required type="number" value={form.yearModel} onChange={(event) => setForm((current) => ({ ...current, yearModel: event.target.value }))} /></label>
              <label>Entrada<input required type="date" value={form.entryDate} onChange={(event) => setForm((current) => ({ ...current, entryDate: event.target.value }))} /></label>
              <label>Placa<input value={form.plate} onChange={(event) => setForm((current) => ({ ...current, plate: event.target.value }))} /></label>
              <label>Cor<input value={form.color} onChange={(event) => setForm((current) => ({ ...current, color: event.target.value }))} /></label>
              <label>Km<input min="0" type="number" value={form.mileage} onChange={(event) => setForm((current) => ({ ...current, mileage: event.target.value }))} /></label>
              <label>Tipo<select value={form.ownershipType} onChange={(event) => setForm((current) => ({ ...current, ownershipType: event.target.value as OwnershipType, ownerCustomerId: event.target.value === "CONSIGNED" ? current.ownerCustomerId : "" }))}>{ownershipOptions.map((item) => <option key={item} value={item}>{ownershipLabels[item]}</option>)}</select></label>
              {form.ownershipType === "CONSIGNED" ? (
                <label>
                  Consignante
                  <select disabled={customerOptionsStatus === "loading" || customerOptionsStatus === "locked"} required value={form.ownerCustomerId} onChange={(event) => setForm((current) => ({ ...current, ownerCustomerId: event.target.value }))}>
                    <option value="">Selecione o cliente</option>
                    {customerOptions.map((customer) => (
                      <option key={customer.id} value={customer.id}>{customer.name}{customer.phone ? ` | ${customer.phone}` : ""}</option>
                    ))}
                  </select>
                </label>
              ) : null}
              <label>Status<select value={form.status} onChange={(event) => setForm((current) => ({ ...current, status: event.target.value as InventoryStatus }))}>{stockStatusOptions.map((item) => <option key={item} value={item}>{statusLabels[item]}</option>)}</select></label>
              {canReadInventoryCosts ? <label>Custo compra<input min="0" type="number" value={form.purchaseCost} onChange={(event) => setForm((current) => ({ ...current, purchaseCost: event.target.value }))} /></label> : null}
              <label>Preco venda<input min="0" type="number" value={form.askingPrice} onChange={(event) => setForm((current) => ({ ...current, askingPrice: event.target.value }))} /></label>
              <label className="lead-modal-wide">Opcionais relevantes<input value={form.relevantOptions} onChange={(event) => setForm((current) => ({ ...current, relevantOptions: event.target.value }))} /></label>
              <label className="lead-modal-wide">Observacoes<input value={form.notes} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} /></label>
              {saveError ? <p className="lead-modal-error">{saveError}</p> : null}
              <div className="lead-modal-actions">
                <button className="text-button" onClick={() => setModalOpen(false)} type="button">Cancelar</button>
                <button className="primary-action" disabled={saving || form.brand.trim().length < 2 || form.model.trim().length < 1 || !form.yearModel || !form.entryDate || (form.ownershipType === "CONSIGNED" && (!form.ownerCustomerId || Number(form.purchaseCost) <= 0))} type="submit">{saving ? "Salvando..." : "Criar entrada"}</button>
              </div>
            </form>
          </section>
        </div>
      ) : null}

      {inventoryDetail ? (
        <div className="dre-modal-backdrop" role="dialog" aria-modal="true" aria-label="Detalhe do veiculo">
          <section className="dre-modal lead-modal inventory-detail-modal">
            <header className="dre-modal-header">
              <div>
                <p className="eyebrow">Detalhe do veiculo</p>
                <h3>{vehicleTitle(inventoryDetail.data)}</h3>
              </div>
              <button aria-label="Fechar detalhe" className="icon-button" onClick={() => { setInventoryDetail(null); setInventoryDetailStatus("idle"); }} type="button">
                <X aria-hidden="true" size={18} />
              </button>
            </header>
            <div className="inventory-detail-grid">
              <section>
                <strong>Pasta documental</strong>
                {inventoryDetailStatus === "loading" ? <p>Carregando documentos...</p> : null}
                {inventoryDetailStatus === "error" ? <p>Nao foi possivel carregar o detalhe.</p> : null}
                {inventoryDetailStatus !== "loading" && inventoryDetail.documents.length === 0 ? (
                  <p>Nenhum documento vinculado a este veiculo ainda.</p>
                ) : (
                  <ul>
                    {inventoryDetail.documents.map((document) => (
                      <li key={document.id}>
                        <FileText aria-hidden="true" size={17} />
                        <span>
                          <strong>{document.originalName}</strong>
                          <em>{document.classification ?? document.purpose ?? "Documento"} | {document.status}</em>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
              <section>
                <strong>Anuncios ativos</strong>
                {inventoryDetailStatus !== "loading" && inventoryDetail.activeListings.length === 0 ? (
                  <p>Nenhum anuncio ativo para este veiculo.</p>
                ) : (
                  <ul>
                    {inventoryDetail.activeListings.map((listing) => (
                      <li key={listing.id}>
                        <Megaphone aria-hidden="true" size={17} />
                        <span>
                          <strong>{listing.title}</strong>
                          <em>{listing.status} | {money(listing.askingPrice)}</em>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>
          </section>
        </div>
      ) : null}

      {costItem ? (
        <div className="dre-modal-backdrop" role="dialog" aria-modal="true" aria-label="Lancar custo do veiculo">
          <section className="dre-modal lead-modal">
            <header className="dre-modal-header">
              <div>
                <p className="eyebrow">Custo do veiculo</p>
                <h3>{vehicleTitle(costItem)}</h3>
              </div>
              <button aria-label="Fechar custo" className="icon-button" onClick={() => setCostItem(null)} type="button">
                <X aria-hidden="true" size={18} />
              </button>
            </header>
            <form className="lead-modal-form" onSubmit={handleAddCost}>
              <label>
                Categoria
                <select value={costForm.category} onChange={(event) => setCostForm((current) => ({ ...current, category: event.target.value }))}>
                  <option>Preparacao</option>
                  <option>Vistoria</option>
                  <option>Documentacao</option>
                  <option>Terceiros</option>
                  <option>Marketing</option>
                </select>
              </label>
              <label>
                Valor
                <input min="0.01" required step="0.01" type="number" value={costForm.amount} onChange={(event) => setCostForm((current) => ({ ...current, amount: event.target.value }))} />
              </label>
              <label className="lead-modal-wide">
                Descricao
                <input required minLength={2} maxLength={180} value={costForm.description} onChange={(event) => setCostForm((current) => ({ ...current, description: event.target.value }))} />
              </label>
              <label className="lead-modal-wide inventory-checkbox">
                <input checked={costForm.capitalized} type="checkbox" onChange={(event) => setCostForm((current) => ({ ...current, capitalized: event.target.checked }))} />
                Capitalizar no custo do veiculo
              </label>
              {saveError ? <p className="lead-modal-error">{saveError}</p> : null}
              <div className="lead-modal-actions">
                <button className="text-button" onClick={() => setCostItem(null)} type="button">Cancelar</button>
                <button className="primary-action" disabled={saving || Number(costForm.amount) <= 0 || costForm.description.trim().length < 2} type="submit">
                  {saving ? "Salvando..." : "Lancar custo"}
                </button>
              </div>
            </form>
          </section>
        </div>
      ) : null}

      <section className="stock-grid">
        <section className="panel stock-board" aria-label="Veiculos em estoque">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Veiculos</p>
              <h3>Proprios e consignados</h3>
            </div>
            <span className="live-pill">{statusLabel}</span>
          </div>
          <div className="stock-ownership-summary" aria-label="Resumo por propriedade">
            <span><strong>{view.ownItems.length}</strong>Proprios</span>
            <span className="consigned"><strong>{view.consignedItems.length}</strong>Consignados</span>
          </div>
          <div className="stock-section-block">
            <header><div><p className="eyebrow">Estoque proprio</p><h4>Capital da loja em veiculos</h4></div><span>{view.ownItems.length} unidades</span></header>
            <div className="stock-list">{view.ownItems.map(renderVehicleCard)}</div>
          </div>
          <div className="stock-section-block consigned">
            <header><div><p className="eyebrow">Estoque consignado</p><h4>Veiculos de terceiros sob contrato</h4></div><span>{view.consignedItems.length} unidades</span></header>
            <div className="stock-list">{view.consignedItems.map(renderVehicleCard)}</div>
          </div>
        </section>

        <aside className="panel stock-side" aria-label="Preparacao e alertas">
          <div className="section-heading">
            <div><p className="eyebrow">Preparacao</p><h3>Fila de acoes</h3></div>
            <Wrench aria-hidden="true" size={20} />
          </div>
          <ul className="prep-list">
            {view.prepQueue.map((item) => (
              <li key={item.id}>
                <ClipboardList aria-hidden="true" size={18} />
                <div><strong>{statusLabels[item.status]}</strong><span>{vehicleTitle(item)}</span><em>Estoque | {daysInStock(item.entryDate)} dias</em></div>
              </li>
            ))}
          </ul>
          <div className="stock-actions">
            <button type="button"><Camera aria-hidden="true" size={17} />Fotos pendentes</button>
            <button type="button"><Megaphone aria-hidden="true" size={17} />Anuncios ativos</button>
            <button type="button"><BadgeCheck aria-hidden="true" size={17} />Liberar venda</button>
          </div>
          <div className="automation-status warning">
            <AlertTriangle aria-hidden="true" size={18} />
            <span>Itens em preparacao devem ser conferidos antes de proposta comercial.</span>
          </div>
        </aside>
      </section>
    </>
  );
}
