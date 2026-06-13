"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarClock, CarFront, FileText, History, Phone, Plus, Search, UserRoundCheck, X } from "lucide-react";
import { apiDelete, apiGet, apiPatch, apiPost } from "../auth/auth-client";
import { useAuth } from "../auth/auth-provider";

type CustomerStatus = "ACTIVE" | "INACTIVE" | "ARCHIVED";
type CustomerType = "PERSON" | "COMPANY";
type CustomerKanbanStatus =
  | "NEW_LEAD"
  | "IN_CONTACT"
  | "SCHEDULED"
  | "VISITED_STORE"
  | "TEST_DRIVE_DONE"
  | "NEGOTIATION"
  | "WAITING_RETURN"
  | "WAITING_PURCHASE_CONFIRMATION"
  | "LOST";

type Customer = {
  id: string;
  type: CustomerType;
  name: string;
  document: string | null;
  email: string | null;
  phone: string | null;
  birthDate: string | null;
  origin: string | null;
  primaryInterest: string | null;
  status: CustomerStatus;
  createdAt: string;
  updatedAt: string;
};

type CustomerKanbanItem = Customer & {
  operationalStatus: CustomerKanbanStatus;
};

type CustomerKanbanColumn = {
  status: CustomerKanbanStatus;
  items: CustomerKanbanItem[];
};

type CustomerHistorySale = {
  id: string;
  type: string;
  status: string;
  salePrice: string | null;
  grossMargin: string | null;
  closedAt: string | null;
  createdAt: string;
};

type CustomerHistoryPurchaseLead = {
  id: string;
  source: string | null;
  status: string;
  askingPrice: string | null;
  createdAt: string;
};

type CustomerHistoryEvaluation = {
  id: string;
  purchaseLeadId: string | null;
  requestedPrice: string | null;
  suggestedPrice: string | null;
  decision: string;
  evaluatedAt: string;
};

type CustomerHistoryAppointment = {
  id: string;
  leadId: string | null;
  type: string;
  title: string;
  startsAt: string;
  endsAt: string | null;
  status: string;
  notes: string | null;
  origin: "follow_up" | "manual";
};

type CustomerHistoryEvent = {
  id: string;
  type: string;
  title: string;
  description: string | null;
  occurredAt: string;
};

type CustomerHistoryTimelineItem = {
  id: string;
  entityId: string;
  kind: "sale" | "purchase_lead" | "evaluation" | "appointment" | "event";
  title: string;
  description: string | null;
  occurredAt: string;
};

type CustomerHistoryTimelineFilter = CustomerHistoryTimelineItem["kind"] | "all";

type CustomerHistoryResponse = {
  customer: Customer;
  sales: CustomerHistorySale[];
  purchaseLeads: CustomerHistoryPurchaseLead[];
  evaluations: CustomerHistoryEvaluation[];
  appointments: CustomerHistoryAppointment[];
  events: CustomerHistoryEvent[];
  timeline: CustomerHistoryTimelineItem[];
};

type ListResponse<T> = {
  items: T[];
  page: number;
  pageSize: number;
  total?: number;
};

type CustomerFormState = {
  birthDate: string;
  document: string;
  email: string;
  name: string;
  notes: string;
  origin: string;
  phone: string;
  type: CustomerType;
};

type MinimalLeadFormState = {
  email: string;
  interest: string;
  name: string;
  notes: string;
  origin: string;
  phone: string;
};

const emptyCustomerForm: CustomerFormState = {
  birthDate: "",
  document: "",
  email: "",
  name: "",
  notes: "",
  origin: "Loja",
  phone: "",
  type: "PERSON",
};

const emptyMinimalLeadForm: MinimalLeadFormState = {
  email: "",
  interest: "",
  name: "",
  notes: "",
  origin: "WhatsApp",
  phone: "",
};

const customerHistoryTimelineFilters: Array<{ key: CustomerHistoryTimelineFilter; label: string }> = [
  { key: "all", label: "Todos" },
  { key: "sale", label: "Vendas" },
  { key: "appointment", label: "Agenda" },
  { key: "purchase_lead", label: "Compras" },
  { key: "evaluation", label: "Avaliacoes" },
  { key: "event", label: "Eventos" },
];

const fallbackCustomers: Customer[] = [
  {
    id: "fallback-1",
    type: "PERSON",
    name: "Marina Souza",
    document: "123***789",
    email: "marina@exemplo.com",
    phone: "(11) 99999-0001",
    birthDate: new Date("1990-06-15T00:00:00.000Z").toISOString(),
    origin: "WhatsApp",
    primaryInterest: "Corolla XEI 2021",
    status: "ACTIVE",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: "fallback-2",
    type: "PERSON",
    name: "Roberta Castro",
    document: null,
    email: "roberta@exemplo.com",
    phone: "(11) 99999-0002",
    birthDate: null,
    origin: "Loja",
    primaryInterest: "HR-V Touring consignado",
    status: "ACTIVE",
    createdAt: new Date(Date.now() - 12 * 86400000).toISOString(),
    updatedAt: new Date(Date.now() - 2 * 86400000).toISOString(),
  },
  {
    id: "fallback-3",
    type: "PERSON",
    name: "Paulo Lima",
    document: null,
    email: null,
    phone: "(11) 99999-0003",
    birthDate: null,
    origin: "Marketplace",
    primaryInterest: "Tracker Premier",
    status: "INACTIVE",
    createdAt: new Date(Date.now() - 30 * 86400000).toISOString(),
    updatedAt: new Date(Date.now() - 18 * 86400000).toISOString(),
  },
];

const filters: Array<{ label: string; status?: CustomerStatus }> = [
  { label: "Todos" },
  { label: "Ativos", status: "ACTIVE" },
  { label: "Inativos", status: "INACTIVE" },
  { label: "Arquivados", status: "ARCHIVED" },
];

const statusLabels: Record<CustomerStatus, string> = {
  ACTIVE: "ativo",
  ARCHIVED: "arquivado",
  INACTIVE: "inativo",
};

const kanbanStatusLabels: Record<CustomerKanbanStatus, string> = {
  IN_CONTACT: "Em contato",
  LOST: "Perdido",
  NEGOTIATION: "Em negociacao",
  NEW_LEAD: "Novo lead",
  SCHEDULED: "Agendado",
  TEST_DRIVE_DONE: "Test drive",
  VISITED_STORE: "Visitou loja",
  WAITING_PURCHASE_CONFIRMATION: "Aguardando compra",
  WAITING_RETURN: "Aguardando retorno",
};

const kanbanStatusOrder = Object.keys(kanbanStatusLabels) as CustomerKanbanStatus[];

const birthMonthOptions = [
  "Janeiro",
  "Fevereiro",
  "Marco",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];

function maskDocument(document: string | null) {
  if (!document) {
    return "Documento nao informado";
  }

  const visible = document.replace(/\D/g, "");
  if (visible.length <= 5) {
    return "Documento cadastrado";
  }

  return `${visible.slice(0, 3)}***${visible.slice(-2)}`;
}

function relativeDate(dateIso: string) {
  const diffDays = Math.max(0, Math.round((Date.now() - new Date(dateIso).getTime()) / 86400000));
  if (diffDays === 0) {
    return "hoje";
  }

  if (diffDays === 1) {
    return "ontem";
  }

  return `${diffDays} dias`;
}

function money(value: string | null | undefined) {
  if (!value) {
    return "R$ 0,00";
  }

  return Number(value).toLocaleString("pt-BR", { currency: "BRL", style: "currency" });
}

function dateInputValue(dateIso: string | null) {
  return dateIso ? dateIso.slice(0, 10) : "";
}

function birthMonthLabel(dateIso: string | null) {
  if (!dateIso) {
    return "Aniversario pendente";
  }

  const month = new Date(dateIso).getUTCMonth();
  return `Aniversario: ${birthMonthOptions[month]}`;
}

function applyCustomerFilters(
  query: URLSearchParams,
  filters: {
    activeStatus?: CustomerStatus;
    birthMonth: string;
    purchaseDone: string;
    search: string;
    visitDone: string;
  },
) {
  if (filters.activeStatus) {
    query.set("status", filters.activeStatus);
  }
  if (filters.search.trim()) {
    query.set("search", filters.search.trim());
  }
  if (filters.birthMonth) {
    query.set("birth_month", filters.birthMonth);
  }
  if (filters.purchaseDone) {
    query.set("purchase_done", filters.purchaseDone);
  }
  if (filters.visitDone) {
    query.set("visit_done", filters.visitDone);
  }
}

function customerToForm(customer: Customer): CustomerFormState {
  return {
    birthDate: dateInputValue(customer.birthDate),
    document: customer.document ?? "",
    email: customer.email ?? "",
    name: customer.name,
    notes: "",
    origin: customer.origin ?? "Loja",
    phone: customer.phone ?? "",
    type: customer.type,
  };
}

export function LiveCustomersWorkspace() {
  const { hasPermission, token } = useAuth();
  const canReadCustomers = hasPermission({ module: "customers", action: "read" });
  const canCreateCustomers = hasPermission({ module: "customers", action: "create" });
  const canCreateLeads = hasPermission({ module: "leads", action: "create" });
  const canUpdateCustomers = hasPermission({ module: "customers", action: "update" });
  const canMoveCustomers = hasPermission({ module: "customers", action: "update_status" });
  const canDeleteCustomers = hasPermission({ module: "customers", action: "delete" });
  const [activeFilter, setActiveFilter] = useState(filters[0]);
  const [archiveReason, setArchiveReason] = useState("Cadastro duplicado ou inativo por revisao operacional.");
  const [archivingId, setArchivingId] = useState<string | null>(null);
  const [customers, setCustomers] = useState(fallbackCustomers);
  const [birthMonthFilter, setBirthMonthFilter] = useState("");
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [form, setForm] = useState<CustomerFormState>(emptyCustomerForm);
  const [kanbanColumns, setKanbanColumns] = useState<CustomerKanbanColumn[]>(
    kanbanStatusOrder.map((kanbanStatus, index) => ({
      status: kanbanStatus,
      items: index === 0 ? fallbackCustomers.map((customer) => ({ ...customer, operationalStatus: "NEW_LEAD" })) : [],
    })),
  );
  const [kanbanStatus, setKanbanStatus] = useState<"fallback" | "loading" | "live" | "error" | "locked">("fallback");
  const [leadForm, setLeadForm] = useState<MinimalLeadFormState>(emptyMinimalLeadForm);
  const [leadModalOpen, setLeadModalOpen] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [movingId, setMovingId] = useState<string | null>(null);
  const [purchaseFilter, setPurchaseFilter] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [expandedTimelineItemId, setExpandedTimelineItemId] = useState<string | null>(null);
  const [selectedHistory, setSelectedHistory] = useState<CustomerHistoryResponse | null>(null);
  const [selectedHistoryTimelineFilter, setSelectedHistoryTimelineFilter] = useState<CustomerHistoryTimelineFilter>("all");
  const [selectedHistoryStatus, setSelectedHistoryStatus] = useState<"idle" | "loading" | "loaded" | "error" | "locked">("idle");
  const [status, setStatus] = useState<"fallback" | "loading" | "live" | "error" | "locked">("fallback");
  const [total, setTotal] = useState(fallbackCustomers.length);
  const [visitFilter, setVisitFilter] = useState("");

  useEffect(() => {
    if (!token) {
      return;
    }

    if (!canReadCustomers) {
      setStatus("locked");
      return;
    }

    let isCurrent = true;
    const query = new URLSearchParams({ page: "1", page_size: "50" });
    applyCustomerFilters(query, {
      activeStatus: activeFilter.status,
      birthMonth: birthMonthFilter,
      purchaseDone: purchaseFilter,
      search,
      visitDone: visitFilter,
    });

    setStatus("loading");

    apiGet<ListResponse<Customer>>(`/customers?${query.toString()}`, token)
      .then((list) => {
        if (!isCurrent) {
          return;
        }

        setCustomers(list.items);
        setTotal(list.total ?? list.items.length);
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
  }, [activeFilter, birthMonthFilter, canReadCustomers, purchaseFilter, refreshKey, search, token, visitFilter]);

  useEffect(() => {
    if (!token) {
      return;
    }

    if (!canReadCustomers) {
      setKanbanStatus("locked");
      return;
    }

    let isCurrent = true;
    const query = new URLSearchParams({ page: "1", page_size: "50" });
    applyCustomerFilters(query, {
      activeStatus: activeFilter.status,
      birthMonth: birthMonthFilter,
      purchaseDone: purchaseFilter,
      search,
      visitDone: visitFilter,
    });

    setKanbanStatus("loading");

    apiGet<{ columns: CustomerKanbanColumn[] }>(`/customers/kanban?${query.toString()}`, token)
      .then((response) => {
        if (!isCurrent) {
          return;
        }

        setKanbanColumns(response.columns);
        setKanbanStatus("live");
      })
      .catch(() => {
        if (isCurrent) {
          setKanbanStatus("error");
        }
      });

    return () => {
      isCurrent = false;
    };
  }, [activeFilter, birthMonthFilter, canReadCustomers, purchaseFilter, refreshKey, search, token, visitFilter]);

  async function handleCreateCustomer(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!token || saving || (!editingCustomer && !canCreateCustomers) || (editingCustomer && !canUpdateCustomers)) {
      return;
    }

    setSaveError(null);

    if (!form.phone.trim() && !form.email.trim()) {
      setSaveError("Informe telefone ou e-mail para cadastrar o cliente.");
      return;
    }

    setSaving(true);

    try {
      const payload = {
        birthDate: form.birthDate || undefined,
        document: form.document.trim() || undefined,
        email: form.email.trim() || undefined,
        name: form.name.trim(),
        notes: form.notes.trim() || undefined,
        origin: form.origin.trim() || undefined,
        phone: form.phone.trim() || undefined,
        type: form.type,
      };
      const response = editingCustomer
        ? await apiPatch<{ data: Customer }>(`/customers/${editingCustomer.id}`, token, payload)
        : await apiPost<{ data: Customer }>("/customers", token, payload);

      setCustomers((current) => [response.data, ...current.filter((customer) => customer.id !== response.data.id)]);
      setActiveFilter(filters[0]);
      setEditingCustomer(null);
      setForm(emptyCustomerForm);
      setModalOpen(false);
      setRefreshKey((current) => current + 1);
    } catch {
      setSaveError("Nao foi possivel salvar o cliente. Confira documento, e-mail e campos obrigatorios.");
    } finally {
      setSaving(false);
    }
  }

  async function handleArchiveCustomer(customer: Customer) {
    if (!token || !canDeleteCustomers || archivingId || archiveReason.trim().length < 8) {
      return;
    }

    setArchivingId(customer.id);

    try {
      const response = await apiDelete<{ data: Customer }>(`/customers/${customer.id}`, token, {
        reason: archiveReason.trim(),
      });

      setCustomers((current) => current.map((item) => (item.id === customer.id ? response.data : item)));
      setRefreshKey((current) => current + 1);
    } catch {
      setStatus("error");
    } finally {
      setArchivingId(null);
    }
  }

  async function handleCreateMinimalLead(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!token || saving || !canCreateLeads) {
      return;
    }

    setSaveError(null);

    if (!leadForm.phone.trim() && !leadForm.email.trim()) {
      setSaveError("Informe telefone ou e-mail para cadastrar o lead minimo.");
      return;
    }

    setSaving(true);

    try {
      await apiPost<{ data: { customer: Customer } }>("/customers/minimal-leads", token, {
        email: leadForm.email.trim() || undefined,
        interest: leadForm.interest.trim() || undefined,
        name: leadForm.name.trim(),
        notes: leadForm.notes.trim() || undefined,
        origin: leadForm.origin.trim() || undefined,
        phone: leadForm.phone.trim() || undefined,
      });
      setLeadForm(emptyMinimalLeadForm);
      setLeadModalOpen(false);
      setRefreshKey((current) => current + 1);
    } catch {
      setSaveError("Nao foi possivel criar o lead minimo. Confira nome e contato.");
    } finally {
      setSaving(false);
    }
  }

  async function moveCustomer(customer: CustomerKanbanItem, toStatus: CustomerKanbanStatus) {
    if (!token || !canMoveCustomers || movingId || customer.operationalStatus === toStatus) {
      return;
    }

    setMovingId(customer.id);

    try {
      await apiPost<{ data: CustomerKanbanItem }>(`/customers/${customer.id}/kanban-status`, token, {
        reason: "Movido pela tela de clientes.",
        toStatus,
      });
      setRefreshKey((current) => current + 1);
    } catch {
      setKanbanStatus("error");
    } finally {
      setMovingId(null);
    }
  }

  async function openCustomerHistory(customer: Customer) {
    if (!token || !canReadCustomers) {
      setSelectedHistoryStatus("locked");
      return;
    }

    setSelectedHistoryStatus("loading");
    setExpandedTimelineItemId(null);
    setSelectedHistoryTimelineFilter("all");
    setSelectedHistory({ customer, sales: [], purchaseLeads: [], evaluations: [], appointments: [], events: [], timeline: [] });

    try {
      const response = await apiGet<CustomerHistoryResponse>(`/customers/${customer.id}/history`, token);
      setSelectedHistory(response);
      setSelectedHistoryStatus("loaded");
    } catch {
      setSelectedHistoryStatus("error");
    }
  }

  function openCreateModal() {
    setEditingCustomer(null);
    setForm(emptyCustomerForm);
    setSaveError(null);
    setModalOpen(true);
  }

  function openLeadModal() {
    setLeadForm(emptyMinimalLeadForm);
    setSaveError(null);
    setLeadModalOpen(true);
  }

  function openEditModal(customer: Customer) {
    setEditingCustomer(customer);
    setForm(customerToForm(customer));
    setSaveError(null);
    setModalOpen(true);
  }

  const view = useMemo(() => {
    const active = customers.filter((customer) => customer.status === "ACTIVE").length;
    const withHistory = customers.filter((customer) => customer.phone || customer.email || customer.document).length;
    const companies = customers.filter((customer) => customer.type === "COMPANY").length;
    const recentlyUpdated = customers.filter((customer) => Date.now() - new Date(customer.updatedAt).getTime() <= 7 * 86400000).length;

    return {
      metrics: [
        { label: "Clientes ativos", value: String(active || total), detail: "base consultada da loja", tone: "teal" },
        { label: "Com contato", value: String(withHistory), detail: "telefone, e-mail ou documento", tone: "blue" },
        { label: "Empresas", value: String(companies), detail: "cadastros PJ no filtro atual", tone: "amber" },
        { label: "Atualizados", value: String(recentlyUpdated), detail: "movimento nos ultimos 7 dias", tone: "rose" },
      ],
      rows: customers.slice(0, 10),
    };
  }, [customers, total]);

  const selectedHistoryTimeline = useMemo(() => {
    if (!selectedHistory) {
      return [];
    }

    if (selectedHistoryTimelineFilter === "all") {
      return selectedHistory.timeline;
    }

    return selectedHistory.timeline.filter((item) => item.kind === selectedHistoryTimelineFilter);
  }, [selectedHistory, selectedHistoryTimelineFilter]);

  function timelineItemDetails(item: CustomerHistoryTimelineItem) {
    if (!selectedHistory) {
      return [];
    }

    if (item.kind === "sale") {
      const sale = selectedHistory.sales.find((historyItem) => historyItem.id === item.entityId);
      return sale ? [`Valor: ${money(sale.salePrice)}`, `Margem: ${money(sale.grossMargin)}`, sale.closedAt ? `Fechada em ${relativeDate(sale.closedAt)}` : "Venda em andamento"] : [];
    }

    if (item.kind === "appointment") {
      const appointment = selectedHistory.appointments.find((historyItem) => historyItem.id === item.entityId);
      return appointment
        ? [
            `Status: ${appointment.status}`,
            `Origem: ${appointment.origin === "follow_up" ? "follow-up" : "agenda manual"}`,
            appointment.endsAt ? `Fim: ${relativeDate(appointment.endsAt)}` : "Sem horario final",
            appointment.notes ? `Obs.: ${appointment.notes}` : "Sem observacoes",
          ]
        : [];
    }

    if (item.kind === "purchase_lead") {
      const lead = selectedHistory.purchaseLeads.find((historyItem) => historyItem.id === item.entityId);
      return lead ? [`Origem: ${lead.source ?? "nao informada"}`, `Valor pedido: ${money(lead.askingPrice)}`, `Status: ${lead.status}`] : [];
    }

    if (item.kind === "evaluation") {
      const evaluation = selectedHistory.evaluations.find((historyItem) => historyItem.id === item.entityId);
      return evaluation ? [`Pedido: ${money(evaluation.requestedPrice)}`, `Sugerido: ${money(evaluation.suggestedPrice)}`, `Decisao: ${evaluation.decision}`] : [];
    }

    const event = selectedHistory.events.find((historyItem) => historyItem.id === item.entityId);
    return event ? [`Tipo: ${event.type}`, event.description ?? "Sem descricao complementar"] : [];
  }

  const statusLabel = {
    error: "Usando fallback",
    fallback: "Fallback visual",
    live: "Dados reais",
    loading: "Sincronizando",
    locked: "Sem permissao",
  }[status];
  const kanbanStatusLabel = {
    error: "Kanban com erro",
    fallback: "Kanban visual",
    live: "Kanban real",
    loading: "Sincronizando",
    locked: "Sem permissao",
  }[kanbanStatus];

  return (
    <>
      <section className="metric-grid" aria-label="Indicadores de clientes">
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

      <section className="leads-toolbar panel" aria-label="Filtros de clientes">
        <div>
          {filters.map((filter) => (
            <button className={filter.label === activeFilter.label ? "active" : ""} key={filter.label} onClick={() => setActiveFilter(filter)} type="button">
              {filter.label}
            </button>
          ))}
        </div>
        <label className="search-box">
          <Search aria-hidden="true" size={17} />
          <input aria-label="Buscar clientes" onChange={(event) => setSearch(event.target.value)} placeholder="Buscar nome, telefone, e-mail" value={search} />
        </label>
        <select aria-label="Filtrar por mes de aniversario" onChange={(event) => setBirthMonthFilter(event.target.value)} value={birthMonthFilter}>
          <option value="">Aniversario</option>
          {birthMonthOptions.map((month, index) => (
            <option key={month} value={String(index + 1)}>
              {month}
            </option>
          ))}
        </select>
        <select aria-label="Filtrar compra realizada" onChange={(event) => setPurchaseFilter(event.target.value)} value={purchaseFilter}>
          <option value="">Compra</option>
          <option value="true">Com compra</option>
          <option value="false">Sem compra</option>
        </select>
        <select aria-label="Filtrar visita realizada" onChange={(event) => setVisitFilter(event.target.value)} value={visitFilter}>
          <option value="">Visita</option>
          <option value="true">Com visita</option>
          <option value="false">Sem visita</option>
        </select>
        <button className="primary-action" disabled={!canCreateCustomers} onClick={openCreateModal} type="button">
          <Plus aria-hidden="true" size={17} />
          Novo cliente
        </button>
        <button className="text-button" disabled={!canCreateLeads} onClick={openLeadModal} type="button">
          <Plus aria-hidden="true" size={17} />
          Lead minimo
        </button>
      </section>

      {modalOpen ? (
        <div className="dre-modal-backdrop" role="dialog" aria-modal="true" aria-label={editingCustomer ? "Editar cliente" : "Novo cliente"}>
          <section className="dre-modal lead-modal">
            <header className="dre-modal-header">
              <div>
                <p className="eyebrow">Cadastro central</p>
                <h3>{editingCustomer ? "Editar cliente" : "Novo cliente"}</h3>
              </div>
              <button aria-label="Fechar cliente" className="icon-button" onClick={() => setModalOpen(false)} type="button">
                <X aria-hidden="true" size={18} />
              </button>
            </header>

            <form className="lead-modal-form" onSubmit={handleCreateCustomer}>
              <label>
                Nome
                <input
                  autoFocus
                  maxLength={160}
                  minLength={2}
                  onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                  placeholder="Ex.: Marina Souza"
                  required
                  value={form.name}
                />
              </label>
              <label>
                Tipo
                <select onChange={(event) => setForm((current) => ({ ...current, type: event.target.value as CustomerType }))} value={form.type}>
                  <option value="PERSON">Pessoa fisica</option>
                  <option value="COMPANY">Empresa</option>
                </select>
              </label>
              <label>
                Documento
                <input
                  maxLength={32}
                  onChange={(event) => setForm((current) => ({ ...current, document: event.target.value }))}
                  placeholder="CPF ou CNPJ"
                  value={form.document}
                />
              </label>
              <label>
                Telefone
                <input
                  maxLength={32}
                  onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))}
                  placeholder="(11) 99999-0000"
                  value={form.phone}
                />
              </label>
              <label>
                E-mail
                <input
                  onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
                  placeholder="cliente@exemplo.com"
                  type="email"
                  value={form.email}
                />
              </label>
              <label>
                Nascimento
                <input onChange={(event) => setForm((current) => ({ ...current, birthDate: event.target.value }))} type="date" value={form.birthDate} />
              </label>
              <label>
                Origem
                <select onChange={(event) => setForm((current) => ({ ...current, origin: event.target.value }))} value={form.origin}>
                  <option>Loja</option>
                  <option>WhatsApp</option>
                  <option>Marketplace</option>
                  <option>Site</option>
                  <option>Indicacao</option>
                  <option>Pos-venda</option>
                </select>
              </label>
              <label className="lead-modal-wide">
                Observacoes
                <input
                  maxLength={1000}
                  onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
                  placeholder="Preferencias, historico ou observacoes comerciais"
                  value={form.notes}
                />
              </label>

              {saveError ? <p className="lead-modal-error">{saveError}</p> : null}

              <div className="lead-modal-actions">
                <button className="text-button" onClick={() => setModalOpen(false)} type="button">
                  Cancelar
                </button>
                <button className="primary-action" disabled={saving || form.name.trim().length < 2 || (!form.phone.trim() && !form.email.trim())} type="submit">
                  {saving ? "Salvando..." : editingCustomer ? "Salvar cliente" : "Criar cliente"}
                </button>
              </div>
            </form>
          </section>
        </div>
      ) : null}

      {leadModalOpen ? (
        <div className="dre-modal-backdrop" role="dialog" aria-modal="true" aria-label="Novo lead minimo">
          <section className="dre-modal lead-modal">
            <header className="dre-modal-header">
              <div>
                <p className="eyebrow">Entrada rapida</p>
                <h3>Novo lead minimo</h3>
              </div>
              <button aria-label="Fechar lead minimo" className="icon-button" onClick={() => setLeadModalOpen(false)} type="button">
                <X aria-hidden="true" size={18} />
              </button>
            </header>

            <form className="lead-modal-form" onSubmit={handleCreateMinimalLead}>
              <label>
                Nome ou identificacao
                <input
                  autoFocus
                  maxLength={160}
                  minLength={2}
                  onChange={(event) => setLeadForm((current) => ({ ...current, name: event.target.value }))}
                  placeholder="Ex.: Cliente interessado no Corolla"
                  required
                  value={leadForm.name}
                />
              </label>
              <label>
                Telefone
                <input
                  maxLength={32}
                  onChange={(event) => setLeadForm((current) => ({ ...current, phone: event.target.value }))}
                  placeholder="(11) 99999-0000"
                  value={leadForm.phone}
                />
              </label>
              <label>
                E-mail
                <input
                  onChange={(event) => setLeadForm((current) => ({ ...current, email: event.target.value }))}
                  placeholder="lead@exemplo.com"
                  type="email"
                  value={leadForm.email}
                />
              </label>
              <label>
                Origem
                <select onChange={(event) => setLeadForm((current) => ({ ...current, origin: event.target.value }))} value={leadForm.origin}>
                  <option>WhatsApp</option>
                  <option>Loja</option>
                  <option>Site</option>
                  <option>Marketplace</option>
                  <option>Indicacao</option>
                  <option>Telefone</option>
                </select>
              </label>
              <label className="lead-modal-wide">
                Interesse
                <input
                  maxLength={180}
                  onChange={(event) => setLeadForm((current) => ({ ...current, interest: event.target.value }))}
                  placeholder="Comprar, trocar, financiar, avaliar..."
                  value={leadForm.interest}
                />
              </label>
              <label className="lead-modal-wide">
                Observacao curta
                <input
                  maxLength={500}
                  onChange={(event) => setLeadForm((current) => ({ ...current, notes: event.target.value }))}
                  placeholder="Contexto rapido do atendimento"
                  value={leadForm.notes}
                />
              </label>

              {saveError ? <p className="lead-modal-error">{saveError}</p> : null}

              <div className="lead-modal-actions">
                <button className="text-button" onClick={() => setLeadModalOpen(false)} type="button">
                  Cancelar
                </button>
                <button className="primary-action" disabled={saving || leadForm.name.trim().length < 2 || (!leadForm.phone.trim() && !leadForm.email.trim())} type="submit">
                  {saving ? "Salvando..." : "Criar lead"}
                </button>
              </div>
            </form>
          </section>
        </div>
      ) : null}

      <section className="module-kanban-panel panel" aria-label="Kanban operacional de clientes">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Status operacional</p>
            <h3>Kanban de clientes e leads</h3>
          </div>
          <span className="live-pill">{kanbanStatusLabel}</span>
        </div>

        <div className="module-kanban">
          {kanbanColumns.map((column) => (
            <section className="module-kanban-column" key={column.status}>
              <header>
                <strong>{kanbanStatusLabels[column.status]}</strong>
                <span>{column.items.length} card(s)</span>
              </header>
              {column.items.slice(0, 8).map((customer) => (
                <article className="module-kanban-card" key={customer.id}>
                  <strong>{customer.name}</strong>
                  <span>
                    {customer.phone || customer.email || "sem contato"} | {customer.primaryInterest || customer.origin || "interesse nao informado"}
                  </span>
                  <select
                    className="kanban-stage-select"
                    disabled={!canMoveCustomers || movingId === customer.id}
                    onChange={(event) => void moveCustomer(customer, event.target.value as CustomerKanbanStatus)}
                    value={customer.operationalStatus}
                  >
                    {kanbanStatusOrder.map((kanbanStatusOption) => (
                      <option key={kanbanStatusOption} value={kanbanStatusOption}>
                        {kanbanStatusLabels[kanbanStatusOption]}
                      </option>
                    ))}
                  </select>
                </article>
              ))}
              {column.items.length === 0 ? (
                <article className="module-kanban-card">
                  <strong>Sem cards</strong>
                  <span>Nenhum cliente nesta etapa</span>
                  <em>0</em>
                </article>
              ) : null}
            </section>
          ))}
        </div>
      </section>

      <section className="blueprint-grid">
        <article className="panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Base central</p>
              <h3>Clientes em acompanhamento</h3>
            </div>
            <span className="live-pill">{statusLabel}</span>
          </div>

          <div className="blueprint-list">
            {view.rows.map((customer) => (
              <article className={`blueprint-row ${customer.status === "ARCHIVED" ? "rose" : customer.type === "COMPANY" ? "blue" : ""}`} key={customer.id}>
                <div className="blueprint-main">
                  <UserRoundCheck aria-hidden="true" />
                  <div>
                    <strong>{customer.name}</strong>
                    <span>{maskDocument(customer.document)}</span>
                  </div>
                </div>
                <div className="blueprint-tags">
                  <span>{customer.type === "PERSON" ? "Pessoa fisica" : "Empresa"}</span>
                  <span>{customer.phone ?? "Telefone pendente"}</span>
                  <span>{customer.email ?? "E-mail pendente"}</span>
                  <span>{customer.origin ?? "Origem nao informada"}</span>
                  <span>{customer.primaryInterest ?? "Interesse principal pendente"}</span>
                  <span>{birthMonthLabel(customer.birthDate)}</span>
                </div>
                <div className="blueprint-value">
                  <strong>{relativeDate(customer.updatedAt)}</strong>
                  <span>{statusLabels[customer.status]}</span>
                  <div className="customer-row-actions">
                    <button disabled={!canUpdateCustomers} onClick={() => openEditModal(customer)} type="button">
                      Editar
                    </button>
                    <button disabled={!canReadCustomers} onClick={() => void openCustomerHistory(customer)} type="button">
                      Historico
                    </button>
                    {customer.status !== "ARCHIVED" ? (
                      <button disabled={!canDeleteCustomers || archivingId === customer.id} onClick={() => void handleArchiveCustomer(customer)} type="button">
                        {archivingId === customer.id ? "Arquivando" : "Arquivar"}
                      </button>
                    ) : null}
                  </div>
                </div>
              </article>
            ))}
          </div>
        </article>

        <aside className="panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Controle</p>
              <h3>Regras da base de clientes</h3>
            </div>
          </div>
          <ul className="blueprint-side-list">
            {selectedHistory ? (
              <li className="customer-history-card">
                <History aria-hidden="true" size={18} />
                <div>
                  <strong>{selectedHistory.customer.name}</strong>
                  <span>
                    Historico {selectedHistoryStatus === "loading" ? "carregando" : selectedHistoryStatus === "error" ? "indisponivel" : "carregado"}
                  </span>
                  <div className="customer-history-summary">
                    <span>Vendas<strong>{selectedHistory.sales.length}</strong></span>
                    <span>Compras<strong>{selectedHistory.purchaseLeads.length}</strong></span>
                    <span>Avaliacoes<strong>{selectedHistory.evaluations.length}</strong></span>
                    <span>Agenda<strong>{selectedHistory.appointments.length}</strong></span>
                  </div>
                  <div className="customer-history-filter" aria-label="Filtro do historico do cliente">
                    {customerHistoryTimelineFilters.map((filter) => (
                      <button
                        className={selectedHistoryTimelineFilter === filter.key ? "active" : ""}
                        key={filter.key}
                        onClick={() => {
                          setExpandedTimelineItemId(null);
                          setSelectedHistoryTimelineFilter(filter.key);
                        }}
                        type="button"
                      >
                        {filter.label}
                      </button>
                    ))}
                  </div>
                  {selectedHistoryTimeline.slice(0, 8).map((item) => (
                    <article className="customer-history-entry" key={item.id}>
                      <div className="customer-history-entry-heading">
                        <strong>{item.title}</strong>
                        <button onClick={() => setExpandedTimelineItemId((current) => (current === item.id ? null : item.id))} type="button">
                          {expandedTimelineItemId === item.id ? "Ocultar" : "Detalhes"}
                        </button>
                      </div>
                      <span>{relativeDate(item.occurredAt)} | {item.description ?? item.kind}</span>
                      {expandedTimelineItemId === item.id ? (
                        <div className="customer-history-entry-details">
                          {timelineItemDetails(item).map((detail) => (
                            <span key={detail}>{detail}</span>
                          ))}
                        </div>
                      ) : null}
                    </article>
                  ))}
                  {selectedHistoryTimeline.length === 0 ? (
                    <article className="customer-history-entry">
                      <strong>Sem eventos neste filtro</strong>
                      <span>Escolha outro tipo de historico para revisar este cliente.</span>
                    </article>
                  ) : null}
                </div>
              </li>
            ) : null}
            <li>
              <FileText aria-hidden="true" size={18} />
              <div>
                <strong>Motivo de arquivamento</strong>
                <span>Usado para auditoria quando um cliente e arquivado.</span>
                <input
                  className="customer-archive-reason"
                  minLength={8}
                  onChange={(event) => setArchiveReason(event.target.value)}
                  value={archiveReason}
                />
              </div>
            </li>
            <li>
              <History aria-hidden="true" size={18} />
              <div>
                <strong>Timeline unica</strong>
                <span>Cadastro deve consolidar lead, venda, agendamento e pos-venda.</span>
              </div>
            </li>
            <li>
              <FileText aria-hidden="true" size={18} />
              <div>
                <strong>Dados sensiveis</strong>
                <span>CPF/CNPJ, nascimento e documentos obedecem RBAC.</span>
              </div>
            </li>
            <li>
              <CarFront aria-hidden="true" size={18} />
              <div>
                <strong>Interesses</strong>
                <span>Vincular cliente a veiculos de interesse e negociacoes.</span>
              </div>
            </li>
            <li>
              <CalendarClock aria-hidden="true" size={18} />
              <div>
                <strong>Rotinas futuras</strong>
                <span>Gerar alertas de recompra e aniversario quando autorizado.</span>
              </div>
            </li>
            <li>
              <Phone aria-hidden="true" size={18} />
              <div>
                <strong>Contato comercial</strong>
                <span>Telefone e e-mail alimentam busca, atendimento e relacionamento.</span>
              </div>
            </li>
          </ul>
        </aside>
      </section>
    </>
  );
}
