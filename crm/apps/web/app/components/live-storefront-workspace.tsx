"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { CalendarDays, CarFront, Globe2, MessageCircle, Plus, Search, Store, X } from "lucide-react";
import { apiGet, apiPost } from "../auth/auth-client";
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

type Lead = {
  id: string;
  title: string;
  status: string;
  source: string | null;
  interest: string | null;
  temperature: number | null;
  createdAt: string;
};

type ListResponse<T> = {
  items: T[];
  page: number;
  pageSize: number;
  total?: number;
};

type LeadFormState = {
  name: string;
  note: string;
  phone: string;
};

const emptyLeadForm: LeadFormState = {
  name: "",
  note: "",
  phone: "",
};

const fallbackListings: Listing[] = [
  {
    id: "fallback-1",
    vehicleId: "vehicle-demo-1",
    title: "Toyota Corolla XEI",
    description: "Detalhe publico alimentado pelo cadastro do estoque.",
    askingPrice: "119900.00",
    status: "PUBLISHED",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

const filters: Array<{ label: string; status?: ListingStatus }> = [
  { label: "Todos" },
  { label: "Vitrine", status: "PUBLISHED" },
  { label: "Rascunhos", status: "DRAFT" },
  { label: "Pausados", status: "PAUSED" },
  { label: "Pendencias", status: "ERROR" },
];

const statusLabels: Record<ListingStatus, string> = {
  DRAFT: "Rascunho",
  ERROR: "Pendencia",
  PAUSED: "Pausado",
  PENDING: "Revisao",
  PUBLISHED: "Publicado",
  SOLD: "Vendido",
};

const currency = new Intl.NumberFormat("pt-BR", { currency: "BRL", maximumFractionDigits: 0, style: "currency" });

function money(value: string | null | undefined) {
  const amount = Number(value ?? 0);
  return amount > 0 ? currency.format(amount) : "A definir";
}

function toneFor(status: ListingStatus) {
  if (status === "PUBLISHED") return "teal";
  if (status === "PENDING" || status === "DRAFT") return "amber";
  if (status === "ERROR") return "rose";
  return "blue";
}

export function LiveStorefrontWorkspace() {
  const { hasPermission, token } = useAuth();
  const canManageAds = hasPermission({ module: "ads", action: "manage" });
  const canCreateLeads = hasPermission({ module: "leads", action: "create" });
  const [activeFilter, setActiveFilter] = useState(filters[0]);
  const [form, setForm] = useState(emptyLeadForm);
  const [leadModalListing, setLeadModalListing] = useState<Listing | null>(null);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [listings, setListings] = useState(fallbackListings);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState(fallbackListings[0].id);
  const [status, setStatus] = useState<"fallback" | "loading" | "live" | "error" | "locked">("fallback");

  useEffect(() => {
    if (!token) return;
    if (!canManageAds) {
      setStatus("locked");
      return;
    }

    let isCurrent = true;
    const query = new URLSearchParams({ page: "1", page_size: "100" });
    if (activeFilter.status) query.set("status", activeFilter.status);

    setStatus("loading");
    Promise.all([
      apiGet<ListResponse<Listing>>(`/listings?${query.toString()}`, token),
      canCreateLeads ? apiGet<ListResponse<Lead>>("/leads?page=1&page_size=50&search=site", token).catch(() => ({ items: [] })) : Promise.resolve({ items: [] }),
    ])
      .then(([listingList, leadList]) => {
        if (!isCurrent) return;
        setListings(listingList.items);
        setLeads(leadList.items);
        setSelectedId((current) => listingList.items.find((listing) => listing.id === current)?.id ?? listingList.items[0]?.id ?? current);
        setStatus("live");
      })
      .catch(() => {
        if (isCurrent) setStatus("error");
      });

    return () => {
      isCurrent = false;
    };
  }, [activeFilter, canCreateLeads, canManageAds, token]);

  async function createLead(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || !canCreateLeads || !leadModalListing || saving) return;

    setSaving(true);
    setSaveError(null);
    try {
      const response = await apiPost<{ data: Lead }>("/leads", token, {
        interest: `${leadModalListing.title} | ${form.phone.trim()} | ${form.note.trim()}`.slice(0, 180),
        source: "Site Loja",
        status: "NEW",
        temperature: 82,
        title: form.name.trim() ? `${form.name.trim()} interessado em ${leadModalListing.title}` : `Interessado site | ${leadModalListing.title}`,
        vehicleId: leadModalListing.vehicleId,
      });
      setLeads((current) => [response.data, ...current.filter((lead) => lead.id !== response.data.id)]);
      setForm(emptyLeadForm);
      setLeadModalListing(null);
    } catch {
      setSaveError("Nao foi possivel criar o lead do site.");
    } finally {
      setSaving(false);
    }
  }

  const filteredListings = useMemo(() => {
    const query = search.trim().toLowerCase();
    return query ? listings.filter((listing) => `${listing.title} ${listing.description ?? ""}`.toLowerCase().includes(query)) : listings;
  }, [listings, search]);

  const selectedListing = filteredListings.find((listing) => listing.id === selectedId) ?? filteredListings[0] ?? fallbackListings[0];
  const view = useMemo(() => {
    const published = listings.filter((listing) => listing.status === "PUBLISHED").length;
    const pending = listings.filter((listing) => listing.status === "DRAFT" || listing.status === "PENDING").length;
    const errors = listings.filter((listing) => listing.status === "ERROR").length;

    return {
      metrics: [
        { detail: "sincronizados de anuncios", label: "Veiculos no site", tone: "teal", value: String(published) },
        { detail: "capturados pelo CRM", label: "Leads site", tone: "blue", value: String(leads.length) },
        { detail: "visita/test drive", label: "Agendamentos", tone: "amber", value: String(leads.filter((lead) => lead.status === "SCHEDULED").length) },
        { detail: "foto, preco ou status", label: "Pendencias", tone: "rose", value: String(pending + errors) },
      ],
    };
  }, [leads, listings]);

  const statusLabel = {
    error: "Usando fallback",
    fallback: "Fallback visual",
    live: "Dados reais",
    loading: "Sincronizando",
    locked: "Sem permissao",
  }[status];

  return (
    <>
      <section className="metric-grid" aria-label="Indicadores do site">
        {view.metrics.map((metric) => (
          <article className={`metric-card ${metric.tone}`} key={metric.label}>
            <div><h3>{metric.label}</h3><strong>{metric.value}</strong><span>{metric.detail}</span></div>
          </article>
        ))}
      </section>

      <section className="leads-toolbar panel" aria-label="Filtros do site">
        <div>
          {filters.map((filter) => (
            <button className={filter.label === activeFilter.label ? "active" : ""} key={filter.label} onClick={() => setActiveFilter(filter)} type="button">
              {filter.label}
            </button>
          ))}
        </div>
        <label className="search-box">
          <Search aria-hidden="true" size={16} />
          <input aria-label="Buscar vitrine" onChange={(event) => setSearch(event.target.value)} placeholder="Buscar modelo ou descricao" value={search} />
        </label>
      </section>

      {leadModalListing ? (
        <div className="dre-modal-backdrop" role="dialog" aria-modal="true" aria-label="Capturar lead do site">
          <section className="dre-modal lead-modal">
            <header className="dre-modal-header">
              <div><p className="eyebrow">Site loja</p><h3>{leadModalListing.title}</h3></div>
              <button aria-label="Fechar lead" className="icon-button" onClick={() => setLeadModalListing(null)} type="button"><X aria-hidden="true" size={18} /></button>
            </header>
            <form className="lead-modal-form" onSubmit={createLead}>
              <label>Nome<input autoFocus value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} /></label>
              <label>Telefone<input value={form.phone} onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))} /></label>
              <label className="lead-modal-wide">Observacao<input value={form.note} onChange={(event) => setForm((current) => ({ ...current, note: event.target.value }))} /></label>
              {saveError ? <p className="lead-modal-error">{saveError}</p> : null}
              <div className="lead-modal-actions">
                <button className="text-button" onClick={() => setLeadModalListing(null)} type="button">Cancelar</button>
                <button className="primary-action" disabled={saving || !canCreateLeads} type="submit">{saving ? "Criando..." : "Criar lead"}</button>
              </div>
            </form>
          </section>
        </div>
      ) : null}

      <section className="repasse-grid">
        <article className="panel repasse-builder">
          <div className="section-heading"><div><p className="eyebrow">Vitrine</p><h3>Veiculos publicados no site</h3></div><span className="live-pill">{statusLabel}</span></div>
          <div className="blueprint-list">
            {filteredListings.map((listing) => (
              <article className={`blueprint-row ${toneFor(listing.status)}`} key={listing.id}>
                <div className="blueprint-main"><CarFront aria-hidden="true" /><div><strong>{listing.title}</strong><span>{listing.description || "Sem descricao publica"}</span></div></div>
                <div className="blueprint-tags"><span>{statusLabels[listing.status]}</span><span>{new Date(listing.updatedAt).toLocaleDateString("pt-BR")}</span></div>
                <div className="blueprint-value">
                  <strong>{money(listing.askingPrice)}</strong>
                  <button className="text-button" onClick={() => setSelectedId(listing.id)} type="button">Preview</button>
                  <button className="text-button" disabled={!canCreateLeads} onClick={() => { setLeadModalListing(listing); setSaveError(null); }} type="button">Lead</button>
                </div>
              </article>
            ))}
          </div>
        </article>

        <aside className="panel repasse-preview">
          <div className="section-heading"><div><p className="eyebrow">Preview publico</p><h3>Como o visitante ve</h3></div><Globe2 aria-hidden="true" size={20} /></div>
          <article className="repasse-ad-card">
            <div className="repasse-ad-image"><CarFront aria-hidden="true" size={42} /></div>
            <div className="repasse-ad-body">
              <strong>{selectedListing.title}</strong>
              <span>{statusLabels[selectedListing.status]} | Vitrine GT3</span>
              <p>{selectedListing.description || "Detalhe publico alimentado pelo cadastro de anuncios e estoque."}</p>
              <div><em>{money(selectedListing.askingPrice)}</em><i>GT3 Veiculos</i></div>
            </div>
          </article>
          <div className="stock-actions">
            <button disabled={!canCreateLeads} onClick={() => { setLeadModalListing(selectedListing); setSaveError(null); }} type="button"><MessageCircle aria-hidden="true" size={17} />Simular lead</button>
            <button type="button"><CalendarDays aria-hidden="true" size={17} />Agendar visita</button>
            <button type="button"><Store aria-hidden="true" size={17} />Ver vitrine</button>
          </div>
          <ul className="blueprint-side-list repasse-safeguards">
            <li><Store aria-hidden="true" size={18} /><div><strong>Escopo publico</strong><span>Cliente final ve somente anuncios publicados e canais permitidos.</span></div></li>
            <li><Search aria-hidden="true" size={18} /><div><strong>Busca</strong><span>Busca interna filtra por titulo e descricao do anuncio.</span></div></li>
            <li><MessageCircle aria-hidden="true" size={18} /><div><strong>Lead</strong><span>Captura cria lead com origem Site Loja e interesse no veiculo.</span></div></li>
            <li><Globe2 aria-hidden="true" size={18} /><div><strong>Sincronia</strong><span>Site usa o mesmo cadastro de anuncios do CRM.</span></div></li>
          </ul>
        </aside>
      </section>

      <section className="panel repasse-history-panel">
        <div className="section-heading"><div><p className="eyebrow">Leads recentes</p><h3>Capturas do site</h3></div><Plus aria-hidden="true" size={20} /></div>
        <div className="repasse-history-list">
          {leads.slice(0, 6).map((lead) => (
            <article className="repasse-history-card" key={lead.id}>
              <MessageCircle aria-hidden="true" size={18} />
              <div><strong>{lead.title}</strong><span>{lead.interest || "sem interesse detalhado"} | {lead.source || "sem origem"}</span></div>
              <em>{lead.status}</em>
              <small>{new Date(lead.createdAt).toLocaleDateString("pt-BR")}</small>
            </article>
          ))}
        </div>
      </section>
    </>
  );
}
