"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { AlertTriangle, Camera, CheckCircle2, Eye, Megaphone, MousePointerClick, Plus, Store, Trophy, X } from "lucide-react";
import { apiGet, apiPatch, apiPost } from "../auth/auth-client";
import { useAuth } from "../auth/auth-provider";

type ListingStatus = "DRAFT" | "PENDING" | "PUBLISHED" | "PAUSED" | "SOLD" | "ERROR";

type Listing = {
  id: string;
  vehicleId: string;
  title: string;
  description: string | null;
  askingPrice: string | null;
  status: ListingStatus;
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

type ListingFormState = {
  askingPrice: string;
  description: string;
  status: ListingStatus;
  title: string;
  vehicleId: string;
};

const emptyForm: ListingFormState = {
  askingPrice: "",
  description: "",
  status: "DRAFT",
  title: "",
  vehicleId: "",
};

const fallbackListings: Listing[] = [
  {
    id: "fallback-1",
    vehicleId: "vehicle-demo-1",
    title: "Toyota Corolla XEI",
    description: "Cadastro demonstrativo para site e marketplaces.",
    askingPrice: "119900.00",
    status: "PUBLISHED",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: "fallback-2",
    vehicleId: "vehicle-demo-2",
    title: "Jeep Compass Longitude",
    description: "Anuncio em revisao de fotos e descricao.",
    askingPrice: "132900.00",
    status: "PENDING",
    createdAt: new Date(Date.now() - 2 * 86400000).toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

const filters: Array<{ label: string; status?: ListingStatus }> = [
  { label: "Todos" },
  { label: "Rascunhos", status: "DRAFT" },
  { label: "Pendentes", status: "PENDING" },
  { label: "Publicados", status: "PUBLISHED" },
  { label: "Pausados", status: "PAUSED" },
  { label: "Vendidos", status: "SOLD" },
  { label: "Erro", status: "ERROR" },
];

const statusLabels: Record<ListingStatus, string> = {
  DRAFT: "Rascunho",
  ERROR: "Erro",
  PAUSED: "Pausado",
  PENDING: "Pendente",
  PUBLISHED: "Publicado",
  SOLD: "Vendido",
};

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

function toneFor(status: ListingStatus) {
  if (status === "PUBLISHED") return "ready";
  if (status === "PENDING") return "prep";
  if (status === "ERROR") return "risk";
  if (status === "SOLD") return "sold";
  return "";
}

export function LiveListingsWorkspace() {
  const { hasPermission, token } = useAuth();
  const canManageAds = hasPermission({ module: "ads", action: "manage" });
  const canReadInventory = hasPermission({ module: "inventory", action: "read" });
  const [activeFilter, setActiveFilter] = useState(filters[0]);
  const [form, setForm] = useState(emptyForm);
  const [inventory, setInventory] = useState<InventoryOption[]>([]);
  const [inventoryStatus, setInventoryStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [listings, setListings] = useState(fallbackListings);
  const [modalOpen, setModalOpen] = useState(false);
  const [movingId, setMovingId] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<"fallback" | "loading" | "live" | "error" | "locked">("fallback");

  useEffect(() => {
    if (!token) return;
    if (!canManageAds) {
      setStatus("locked");
      return;
    }

    let isCurrent = true;
    const query = new URLSearchParams({ page: "1", page_size: "50" });
    if (activeFilter.status) query.set("status", activeFilter.status);

    setStatus("loading");
    apiGet<ListResponse<Listing>>(`/listings?${query.toString()}`, token)
      .then((list) => {
        if (!isCurrent) return;
        setListings(list.items);
        setStatus("live");
      })
      .catch(() => {
        if (isCurrent) setStatus("error");
      });

    return () => {
      isCurrent = false;
    };
  }, [activeFilter, canManageAds, refreshKey, token]);

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

  function selectVehicle(vehicleId: string) {
    const selected = inventory.find((item) => item.id === vehicleId);
    setForm((current) => ({
      ...current,
      askingPrice: selected?.askingPrice ? String(Number(selected.askingPrice)) : current.askingPrice,
      title: selected ? vehicleLabel(selected).replace(" | ", " ") : current.title,
      vehicleId,
    }));
  }

  async function createListing(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || !canManageAds || saving) return;

    setSaving(true);
    setSaveError(null);
    try {
      const response = await apiPost<{ data: Listing }>("/listings", token, {
        askingPrice: form.askingPrice ? Number(form.askingPrice) : undefined,
        description: form.description.trim() || undefined,
        status: form.status,
        title: form.title.trim(),
        vehicleId: form.vehicleId,
      });

      setListings((current) => [response.data, ...current.filter((listing) => listing.id !== response.data.id)]);
      setForm(emptyForm);
      setModalOpen(false);
      setRefreshKey((current) => current + 1);
    } catch {
      setSaveError("Nao foi possivel criar o anuncio. Confira veiculo, titulo e preco.");
    } finally {
      setSaving(false);
    }
  }

  async function updateListingStatus(listing: Listing, nextStatus: ListingStatus) {
    if (!token || !canManageAds || movingId || listing.status === nextStatus) return;

    const previous = listing;
    setMovingId(listing.id);
    setListings((current) => current.map((item) => (item.id === listing.id ? { ...item, status: nextStatus } : item)));

    try {
      const response = await apiPost<{ data: Listing }>(`/listings/${listing.id}/status`, token, {
        reason: "Atualizado pela central de anuncios",
        status: nextStatus,
      });
      setListings((current) => current.map((item) => (item.id === listing.id ? response.data : item)));
      setRefreshKey((current) => current + 1);
    } catch {
      setListings((current) => current.map((item) => (item.id === listing.id ? previous : item)));
      setStatus("error");
    } finally {
      setMovingId(null);
    }
  }

  async function publishListing(listing: Listing) {
    if (!token || !canManageAds || movingId) return;

    const previous = listing;
    setMovingId(listing.id);
    setListings((current) => current.map((item) => (item.id === listing.id ? { ...item, status: "PUBLISHED" } : item)));
    try {
      const channel = await apiPost<{ data: { id: string } }>("/listings/channels", token, {
        name: "Site loja",
        settings: { source: "crm-web" },
        type: "OWN_SITE",
      });
      await apiPost<{ data: { id: string } }>(`/listings/${listing.id}/publications`, token, {
        channelId: channel.data.id,
        metadata: { source: "crm-web" },
        status: "PUBLISHED",
      });
      setRefreshKey((current) => current + 1);
    } catch {
      setListings((current) => current.map((item) => (item.id === listing.id ? previous : item)));
      setStatus("error");
    } finally {
      setMovingId(null);
    }
  }

  async function bumpPrice(listing: Listing) {
    if (!token || !canManageAds || movingId) return;

    setMovingId(listing.id);
    try {
      const response = await apiPatch<{ data: Listing }>(`/listings/${listing.id}`, token, {
        askingPrice: Number(listing.askingPrice ?? 0) + 1000,
      });
      setListings((current) => current.map((item) => (item.id === listing.id ? response.data : item)));
      setRefreshKey((current) => current + 1);
    } catch {
      setStatus("error");
    } finally {
      setMovingId(null);
    }
  }

  const view = useMemo(() => {
    const published = listings.filter((listing) => listing.status === "PUBLISHED").length;
    const pending = listings.filter((listing) => listing.status === "PENDING" || listing.status === "DRAFT").length;
    const paused = listings.filter((listing) => listing.status === "PAUSED").length;
    const errors = listings.filter((listing) => listing.status === "ERROR").length;

    return {
      board: (Object.keys(statusLabels) as ListingStatus[]).map((listingStatus) => ({
        cards: listings.filter((listing) => listing.status === listingStatus).slice(0, 3),
        title: statusLabels[listingStatus],
        total: listings.filter((listing) => listing.status === listingStatus).length,
      })),
      metrics: [
        { detail: "site e canais ativos", label: "Anuncios ativos", tone: "teal", value: String(published) },
        { detail: "rascunho ou revisao", label: "Pendentes", tone: "amber", value: String(pending) },
        { detail: "fora de exibicao", label: "Pausados", tone: "blue", value: String(paused) },
        { detail: "inconsistencias", label: "Erros", tone: "rose", value: String(errors) },
      ],
      ranking: listings.slice().sort((a, b) => Number(b.askingPrice ?? 0) - Number(a.askingPrice ?? 0)).slice(0, 4),
    };
  }, [listings]);

  const statusLabel = {
    error: "Usando fallback",
    fallback: "Fallback visual",
    live: "Dados reais",
    loading: "Sincronizando",
    locked: "Sem permissao",
  }[status];

  return (
    <>
      <section className="metric-grid" aria-label="Indicadores de anuncios">
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

      <section className="ad-ranking-panel panel">
        <div className="section-heading">
          <div><p className="eyebrow">Melhores anuncios</p><h3>Ranking por valor anunciado</h3></div>
          <span className="live-pill">{statusLabel}</span>
        </div>
        <div className="ad-ranking-list">
          {view.ranking.map((listing, index) => (
            <article className="ad-ranking-card" key={listing.id}>
              <span className="ad-rank"><Trophy aria-hidden="true" size={17} />#{index + 1}</span>
              <div className="ad-ranking-main">
                <strong>{listing.title}</strong>
                <span>{listing.description || "Sem descricao comercial"}</span>
                <div className="ad-ranking-tags"><em>{statusLabels[listing.status]}</em><em>Site loja</em></div>
              </div>
              <div className="ad-ranking-stats">
                <span><Eye aria-hidden="true" size={14} />{index === 0 ? "12.840" : "4.120"}<small>views</small></span>
                <span><MousePointerClick aria-hidden="true" size={14} />{index === 0 ? "86" : "28"}<small>leads</small></span>
                <span>{money(listing.askingPrice)}<small>preco</small></span>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="leads-toolbar panel" aria-label="Filtros de anuncios">
        <div>
          {filters.map((filter) => (
            <button className={filter.label === activeFilter.label ? "active" : ""} key={filter.label} onClick={() => setActiveFilter(filter)} type="button">
              {filter.label}
            </button>
          ))}
        </div>
        <button className="primary-action" disabled={!canManageAds} onClick={() => { setSaveError(null); setModalOpen(true); }} type="button">
          <Plus aria-hidden="true" size={17} />
          Novo anuncio
        </button>
      </section>

      {modalOpen ? (
        <div className="dre-modal-backdrop" role="dialog" aria-modal="true" aria-label="Novo anuncio">
          <section className="dre-modal lead-modal">
            <header className="dre-modal-header">
              <div><p className="eyebrow">Anuncios</p><h3>Novo anuncio</h3></div>
              <button aria-label="Fechar novo anuncio" className="icon-button" onClick={() => setModalOpen(false)} type="button">
                <X aria-hidden="true" size={18} />
              </button>
            </header>
            <form className="lead-modal-form" onSubmit={createListing}>
              <label className="lead-modal-wide">
                Veiculo do estoque
                <select disabled={!canReadInventory || inventoryStatus === "loading"} onChange={(event) => selectVehicle(event.target.value)} required value={form.vehicleId}>
                  <option value="">Selecione um veiculo</option>
                  {inventory.map((item) => <option key={item.id} value={item.id}>{vehicleLabel(item)} - {money(item.askingPrice)}</option>)}
                </select>
              </label>
              {!canReadInventory ? <p className="lead-modal-error">Sem permissao para listar estoque.</p> : null}
              {inventoryStatus === "error" ? <p className="lead-modal-error">Nao foi possivel carregar estoque.</p> : null}
              <label className="lead-modal-wide">Titulo<input required minLength={2} maxLength={180} value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} /></label>
              <label>Preco<input min="0" type="number" value={form.askingPrice} onChange={(event) => setForm((current) => ({ ...current, askingPrice: event.target.value }))} /></label>
              <label>Status<select value={form.status} onChange={(event) => setForm((current) => ({ ...current, status: event.target.value as ListingStatus }))}>{(Object.keys(statusLabels) as ListingStatus[]).map((item) => <option key={item} value={item}>{statusLabels[item]}</option>)}</select></label>
              <label className="lead-modal-wide">Descricao<textarea maxLength={4000} value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} /></label>
              {saveError ? <p className="lead-modal-error">{saveError}</p> : null}
              <div className="lead-modal-actions">
                <button className="text-button" onClick={() => setModalOpen(false)} type="button">Cancelar</button>
                <button className="primary-action" disabled={saving || !form.vehicleId || form.title.trim().length < 2} type="submit">{saving ? "Salvando..." : "Criar anuncio"}</button>
              </div>
            </form>
          </section>
        </div>
      ) : null}

      <section className="module-kanban-panel panel">
        <div className="section-heading"><div><p className="eyebrow">Fluxo</p><h3>Kanban operacional</h3></div></div>
        <div className="module-kanban">
          {view.board.map((column) => (
            <article className="module-kanban-column" key={column.title}>
              <header><strong>{column.title}</strong><span>{column.total}</span></header>
              {column.cards.map((listing) => (
                <div className="module-kanban-card" key={listing.id}>
                  <strong>{listing.title}</strong>
                  <span>{money(listing.askingPrice)}</span>
                  <em>{new Date(listing.updatedAt).toLocaleDateString("pt-BR")}</em>
                </div>
              ))}
              {column.cards.length === 0 ? <div className="module-kanban-card"><strong>Sem cards</strong><span>Nenhum anuncio nesta etapa</span><em>0</em></div> : null}
            </article>
          ))}
        </div>
      </section>

      <section className="blueprint-grid">
        <article className="panel">
          <div className="section-heading"><div><p className="eyebrow">Operacao</p><h3>Anuncios em acompanhamento</h3></div></div>
          <div className="blueprint-list">
            {listings.map((listing) => (
              <article className={`blueprint-row ${toneFor(listing.status)}`} key={listing.id}>
                <div className="blueprint-main"><Store aria-hidden="true" /><div><strong>{listing.title}</strong><span>{listing.description || "Cadastro unico do veiculo"}</span></div></div>
                <div className="blueprint-tags">
                  <span>{statusLabels[listing.status]}</span>
                  <select className="kanban-stage-select" disabled={movingId === listing.id} onChange={(event) => void updateListingStatus(listing, event.target.value as ListingStatus)} value={listing.status}>
                    {(Object.keys(statusLabels) as ListingStatus[]).map((listingStatus) => <option key={listingStatus} value={listingStatus}>{statusLabels[listingStatus]}</option>)}
                  </select>
                </div>
                <div className="blueprint-value">
                  <strong>{money(listing.askingPrice)}</strong>
                  <button className="text-button" disabled={movingId === listing.id || listing.status === "PUBLISHED"} onClick={() => void publishListing(listing)} type="button">Publicar</button>
                  <button className="text-button" disabled={movingId === listing.id} onClick={() => void bumpPrice(listing)} type="button">+ R$ 1k</button>
                </div>
              </article>
            ))}
          </div>
        </article>

        <aside className="panel">
          <div className="section-heading"><div><p className="eyebrow">Controle</p><h3>Governanca de anuncios</h3></div></div>
          <ul className="blueprint-side-list">
            <li><Camera aria-hidden="true" size={18} /><div><strong>Midia</strong><span>Fotos e capa ficam ligadas ao dossie do veiculo.</span></div></li>
            <li><Megaphone aria-hidden="true" size={18} /><div><strong>Canais</strong><span>Publicacao cria ou atualiza canal Site loja automaticamente.</span></div></li>
            <li><CheckCircle2 aria-hidden="true" size={18} /><div><strong>Aprovacao</strong><span>Status publicado, pausado, vendido e erro sao auditaveis.</span></div></li>
          </ul>
          <div className="automation-status warning">
            <AlertTriangle aria-hidden="true" size={18} />
            <span>Metricas de views/leads ainda usam leitura visual; a API ja aceita ingestao por canal.</span>
          </div>
        </aside>
      </section>
    </>
  );
}
