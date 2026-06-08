"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Cake, CalendarClock, HeartHandshake, History, MessageCircle, Plus, Trophy, X } from "lucide-react";
import { apiGet, apiPost } from "../auth/auth-client";
import { useAuth } from "../auth/auth-provider";

type Customer = {
  id: string;
  type: string;
  name: string;
  document: string | null;
  email: string | null;
  phone: string | null;
  origin: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
};

type Channel = {
  id: string;
  type: string;
  name: string;
  status: string;
  createdAt: string;
  updatedAt: string;
};

type Thread = {
  id: string;
  customerId: string | null;
  leadId: string | null;
  channelId: string | null;
  subject: string | null;
  status: string;
  lastMessageAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type ListResponse<T> = {
  items: T[];
  page: number;
  pageSize: number;
  total?: number;
};

type ContactFormState = {
  channel: string;
  channelId: string;
  subject: string;
};

const emptyContactForm: ContactFormState = {
  channel: "WHATSAPP",
  channelId: "",
  subject: "",
};

const fallbackCustomers: Customer[] = [
  {
    id: "fallback-1",
    type: "PERSON",
    name: "Marina Souza",
    document: null,
    email: "marina@example.com",
    phone: "11999999999",
    origin: "Loja",
    status: "ACTIVE",
    createdAt: new Date(Date.now() - 540 * 86400000).toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: "fallback-2",
    type: "PERSON",
    name: "Ana Beatriz",
    document: null,
    email: null,
    phone: "11888888888",
    origin: "Indicacao",
    status: "ACTIVE",
    createdAt: new Date(Date.now() - 20 * 86400000).toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

const filters = ["Todos", "Aniversario", "2 anos", "Feedback", "Recompra", "Ranking"];
const channelOptions = ["WHATSAPP", "EMAIL", "SMS", "INSTAGRAM"];

function daysSince(dateIso: string) {
  return Math.max(0, Math.round((Date.now() - new Date(dateIso).getTime()) / 86400000));
}

function relationshipTag(customer: Customer) {
  const days = daysSince(customer.createdAt);
  if (days > 640) return "2 anos";
  if (!customer.phone && !customer.email) return "sem canal";
  if (days < 30) return "pos-venda";
  return "relacionamento";
}

export function LiveRelationshipWorkspace() {
  const { hasPermission, token } = useAuth();
  const canReadCustomers = hasPermission({ module: "customers", action: "read" });
  const canManageCommunications = hasPermission({ module: "communications", action: "manage" });
  const [activeFilter, setActiveFilter] = useState(filters[0]);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [contactCustomer, setContactCustomer] = useState<Customer | null>(null);
  const [contactForm, setContactForm] = useState(emptyContactForm);
  const [customers, setCustomers] = useState(fallbackCustomers);
  const [preferenceCustomer, setPreferenceCustomer] = useState<Customer | null>(null);
  const [preferenceAllowed, setPreferenceAllowed] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"fallback" | "loading" | "live" | "error" | "locked">("fallback");

  useEffect(() => {
    if (!token) return;
    if (!canReadCustomers) {
      setStatus("locked");
      return;
    }

    let isCurrent = true;
    const query = new URLSearchParams({ page: "1", page_size: "100" });
    if (search.trim()) query.set("search", search.trim());

    setStatus("loading");
    const requests: [Promise<ListResponse<Customer>>, Promise<ListResponse<Channel>> | Promise<{ items: Channel[] }>] = [
      apiGet<ListResponse<Customer>>(`/customers?${query.toString()}`, token),
      canManageCommunications ? apiGet<ListResponse<Channel>>("/communications/channels?page=1&page_size=100", token) : Promise.resolve({ items: [] }),
    ];

    Promise.all(requests)
      .then(([customerList, channelList]) => {
        if (!isCurrent) return;
        setCustomers(customerList.items);
        setChannels(channelList.items);
        setStatus("live");
      })
      .catch(() => {
        if (isCurrent) setStatus("error");
      });

    return () => {
      isCurrent = false;
    };
  }, [canManageCommunications, canReadCustomers, refreshKey, search, token]);

  async function createContactThread(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || !canManageCommunications || !contactCustomer || saving) return;

    setSaving(true);
    setSaveError(null);
    try {
      let channelId = contactForm.channelId;
      if (!channelId) {
        const channel = await apiPost<{ data: Channel }>("/communications/channels", token, {
          name: `${contactForm.channel} relacionamento`,
          status: "ACTIVE",
          type: contactForm.channel,
        });
        channelId = channel.data.id;
        setChannels((current) => [channel.data, ...current.filter((item) => item.id !== channel.data.id)]);
      }

      await apiPost<{ data: Thread }>("/communications/threads", token, {
        channelId,
        customerId: contactCustomer.id,
        status: "OPEN",
        subject: contactForm.subject.trim() || `Relacionamento | ${contactCustomer.name}`,
      });
      setContactCustomer(null);
      setContactForm(emptyContactForm);
      setRefreshKey((current) => current + 1);
    } catch {
      setSaveError("Nao foi possivel criar o contato de relacionamento.");
    } finally {
      setSaving(false);
    }
  }

  async function savePreference(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || !canManageCommunications || !preferenceCustomer || saving) return;

    setSaving(true);
    setSaveError(null);
    try {
      await apiPost<{ data: { id: string } }>("/communications/preferences", token, {
        allowed: preferenceAllowed,
        channel: contactForm.channel,
        customerId: preferenceCustomer.id,
      });
      setPreferenceCustomer(null);
    } catch {
      setSaveError("Nao foi possivel salvar a preferencia de canal.");
    } finally {
      setSaving(false);
    }
  }

  const filteredCustomers = useMemo(() => {
    if (activeFilter === "Todos") return customers;
    if (activeFilter === "2 anos") return customers.filter((customer) => daysSince(customer.createdAt) > 640);
    if (activeFilter === "Feedback") return customers.filter((customer) => daysSince(customer.createdAt) < 30);
    if (activeFilter === "Recompra") return customers.filter((customer) => daysSince(customer.createdAt) > 540);
    if (activeFilter === "Ranking") return customers.slice().sort((a, b) => daysSince(b.createdAt) - daysSince(a.createdAt));
    return customers;
  }, [activeFilter, customers]);

  const view = useMemo(() => {
    const postSale = customers.filter((customer) => daysSince(customer.createdAt) < 30).length;
    const birthdays = customers.filter((customer) => Boolean(customer.document)).length;
    const repurchase = customers.filter((customer) => daysSince(customer.createdAt) > 540).length;
    const delayed = customers.filter((customer) => !customer.phone && !customer.email).length;

    return {
      metrics: [
        { detail: "pos-venda e recompra", label: "Alertas ativos", tone: "teal", value: String(postSale + repurchase) },
        { detail: "com documento cadastrado", label: "Aniversarios mes", tone: "blue", value: String(birthdays) },
        { detail: "janela 60 dias", label: "Recompras provaveis", tone: "amber", value: String(repurchase) },
        { detail: "sem canal valido", label: "Atrasados", tone: "rose", value: String(delayed) },
      ],
      vip: customers.slice().sort((a, b) => daysSince(b.createdAt) - daysSince(a.createdAt)).slice(0, 5),
    };
  }, [customers]);

  const statusLabel = {
    error: "Usando fallback",
    fallback: "Fallback visual",
    live: "Dados reais",
    loading: "Sincronizando",
    locked: "Sem permissao",
  }[status];

  return (
    <>
      <section className="metric-grid" aria-label="Indicadores de relacionamento">
        {view.metrics.map((metric) => (
          <article className={`metric-card ${metric.tone}`} key={metric.label}>
            <div><h3>{metric.label}</h3><strong>{metric.value}</strong><span>{metric.detail}</span></div>
          </article>
        ))}
      </section>

      <section className="leads-toolbar panel" aria-label="Filtros de relacionamento">
        <div>
          {filters.map((filter) => (
            <button className={filter === activeFilter ? "active" : ""} key={filter} onClick={() => setActiveFilter(filter)} type="button">
              {filter}
            </button>
          ))}
        </div>
        <label className="search-box">
          <input aria-label="Buscar cliente" onChange={(event) => setSearch(event.target.value)} placeholder="Buscar cliente, telefone, email" value={search} />
        </label>
      </section>

      {contactCustomer ? (
        <div className="dre-modal-backdrop" role="dialog" aria-modal="true" aria-label="Contato de relacionamento">
          <section className="dre-modal lead-modal">
            <header className="dre-modal-header">
              <div><p className="eyebrow">Relacionamento</p><h3>{contactCustomer.name}</h3></div>
              <button aria-label="Fechar contato" className="icon-button" onClick={() => setContactCustomer(null)} type="button"><X aria-hidden="true" size={18} /></button>
            </header>
            <form className="lead-modal-form" onSubmit={createContactThread}>
              <label className="lead-modal-wide">
                Canal existente
                <select onChange={(event) => setContactForm((current) => ({ ...current, channelId: event.target.value }))} value={contactForm.channelId}>
                  <option value="">Criar canal rapido</option>
                  {channels.map((channel) => <option key={channel.id} value={channel.id}>{channel.type} | {channel.name}</option>)}
                </select>
              </label>
              {!contactForm.channelId ? <label>Tipo<select value={contactForm.channel} onChange={(event) => setContactForm((current) => ({ ...current, channel: event.target.value }))}>{channelOptions.map((channel) => <option key={channel}>{channel}</option>)}</select></label> : null}
              <label className="lead-modal-wide">Assunto<input maxLength={180} value={contactForm.subject} onChange={(event) => setContactForm((current) => ({ ...current, subject: event.target.value }))} /></label>
              {saveError ? <p className="lead-modal-error">{saveError}</p> : null}
              <div className="lead-modal-actions">
                <button className="text-button" onClick={() => setContactCustomer(null)} type="button">Cancelar</button>
                <button className="primary-action" disabled={saving || !canManageCommunications} type="submit">{saving ? "Criando..." : "Criar conversa"}</button>
              </div>
            </form>
          </section>
        </div>
      ) : null}

      {preferenceCustomer ? (
        <div className="dre-modal-backdrop" role="dialog" aria-modal="true" aria-label="Preferencia de canal">
          <section className="dre-modal lead-modal">
            <header className="dre-modal-header">
              <div><p className="eyebrow">Preferencia</p><h3>{preferenceCustomer.name}</h3></div>
              <button aria-label="Fechar preferencia" className="icon-button" onClick={() => setPreferenceCustomer(null)} type="button"><X aria-hidden="true" size={18} /></button>
            </header>
            <form className="lead-modal-form" onSubmit={savePreference}>
              <label>Canal<select value={contactForm.channel} onChange={(event) => setContactForm((current) => ({ ...current, channel: event.target.value }))}>{channelOptions.map((channel) => <option key={channel}>{channel}</option>)}</select></label>
              <label>Permitido<select value={preferenceAllowed ? "yes" : "no"} onChange={(event) => setPreferenceAllowed(event.target.value === "yes")}><option value="yes">Permitido</option><option value="no">Bloqueado</option></select></label>
              {saveError ? <p className="lead-modal-error">{saveError}</p> : null}
              <div className="lead-modal-actions">
                <button className="text-button" onClick={() => setPreferenceCustomer(null)} type="button">Cancelar</button>
                <button className="primary-action" disabled={saving || !canManageCommunications} type="submit">{saving ? "Salvando..." : "Salvar preferencia"}</button>
              </div>
            </form>
          </section>
        </div>
      ) : null}

      <section className="panel module-kanban-panel">
        <div className="section-heading"><div><p className="eyebrow">Fluxo</p><h3>Rotinas de relacionamento</h3></div><span className="live-pill">{statusLabel}</span></div>
        <div className="module-kanban">
          {[
            { title: "Pos-venda", cards: customers.filter((customer) => daysSince(customer.createdAt) < 30) },
            { title: "Alerta 2 anos", cards: customers.filter((customer) => daysSince(customer.createdAt) > 640) },
            { title: "Contato", cards: customers.filter((customer) => customer.phone || customer.email) },
            { title: "Atrasados", cards: customers.filter((customer) => !customer.phone && !customer.email) },
          ].map((column) => (
            <section className="module-kanban-column" key={column.title}>
              <header><strong>{column.title}</strong><span>{column.cards.length}</span></header>
              {column.cards.slice(0, 3).map((customer) => <article className="module-kanban-card" key={customer.id}><strong>{customer.name}</strong><span>{relationshipTag(customer)}</span><em>{daysSince(customer.updatedAt)} dias</em></article>)}
              {column.cards.length === 0 ? <article className="module-kanban-card"><strong>Sem cards</strong><span>Nenhum cliente nesta etapa</span><em>0</em></article> : null}
            </section>
          ))}
        </div>
      </section>

      <section className="blueprint-grid">
        <article className="panel">
          <div className="section-heading"><div><p className="eyebrow">Carteira</p><h3>Clientes e rotinas ativas</h3></div><span className="live-pill">{statusLabel}</span></div>
          <div className="blueprint-list">
            {filteredCustomers.map((customer) => (
              <article className="blueprint-row" key={customer.id}>
                <div className="blueprint-main"><HeartHandshake aria-hidden="true" /><div><strong>{customer.name}</strong><span>{customer.phone || customer.email || "sem canal"} | {customer.origin || "origem nao informada"}</span></div></div>
                <div className="blueprint-tags"><span>{relationshipTag(customer)}</span><span>{customer.status}</span><span>{daysSince(customer.createdAt)} dias</span></div>
                <div className="blueprint-value">
                  <strong>{customer.type}</strong>
                  <button className="text-button" disabled={!canManageCommunications} onClick={() => { setContactCustomer(customer); setContactForm({ ...emptyContactForm, subject: `Relacionamento | ${customer.name}` }); setSaveError(null); }} type="button">Contato</button>
                  <button className="text-button" disabled={!canManageCommunications} onClick={() => { setPreferenceCustomer(customer); setPreferenceAllowed(true); setSaveError(null); }} type="button">Preferencia</button>
                </div>
              </article>
            ))}
          </div>
        </article>

        <aside className="panel">
          <div className="section-heading"><div><p className="eyebrow">Ranking</p><h3>Clientes historicos</h3></div><Trophy aria-hidden="true" size={20} /></div>
          <ul className="blueprint-side-list">
            {view.vip.map((customer, index) => (
              <li key={customer.id}><History aria-hidden="true" size={18} /><div><strong>#{index + 1} {customer.name}</strong><span>{daysSince(customer.createdAt)} dias de historico | {customer.origin || "sem origem"}</span></div></li>
            ))}
          </ul>
          <div className="automation-status success"><MessageCircle aria-hidden="true" size={18} /><span>Contatos de relacionamento viram conversas reais no inbox omnichannel.</span></div>
          <div className="automation-status warning"><Cake aria-hidden="true" size={18} /><span>Aniversarios dependem de data estruturada ou OCR documental na proxima evolucao.</span></div>
          <div className="automation-status"><CalendarClock aria-hidden="true" size={18} /><span>Recompra usa idade do relacionamento como sinal inicial ate termos venda historica consolidada.</span></div>
        </aside>
      </section>
    </>
  );
}
