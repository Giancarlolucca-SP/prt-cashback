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
  origin: string | null;
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

type ListResponse<T> = {
  items: T[];
  page: number;
  pageSize: number;
  total?: number;
};

type CustomerFormState = {
  document: string;
  email: string;
  name: string;
  notes: string;
  origin: string;
  phone: string;
  type: CustomerType;
};

const emptyCustomerForm: CustomerFormState = {
  document: "",
  email: "",
  name: "",
  notes: "",
  origin: "Loja",
  phone: "",
  type: "PERSON",
};

const fallbackCustomers: Customer[] = [
  {
    id: "fallback-1",
    type: "PERSON",
    name: "Marina Souza",
    document: "123***789",
    email: "marina@exemplo.com",
    phone: "(11) 99999-0001",
    origin: "WhatsApp",
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
    origin: "Loja",
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
    origin: "Marketplace",
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

function customerToForm(customer: Customer): CustomerFormState {
  return {
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
  const canUpdateCustomers = hasPermission({ module: "customers", action: "update" });
  const canMoveCustomers = hasPermission({ module: "customers", action: "update_status" });
  const canDeleteCustomers = hasPermission({ module: "customers", action: "delete" });
  const [activeFilter, setActiveFilter] = useState(filters[0]);
  const [archiveReason, setArchiveReason] = useState("Cadastro duplicado ou inativo por revisao operacional.");
  const [archivingId, setArchivingId] = useState<string | null>(null);
  const [customers, setCustomers] = useState(fallbackCustomers);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [form, setForm] = useState<CustomerFormState>(emptyCustomerForm);
  const [kanbanColumns, setKanbanColumns] = useState<CustomerKanbanColumn[]>(
    kanbanStatusOrder.map((kanbanStatus, index) => ({
      status: kanbanStatus,
      items: index === 0 ? fallbackCustomers.map((customer) => ({ ...customer, operationalStatus: "NEW_LEAD" })) : [],
    })),
  );
  const [kanbanStatus, setKanbanStatus] = useState<"fallback" | "loading" | "live" | "error" | "locked">("fallback");
  const [modalOpen, setModalOpen] = useState(false);
  const [movingId, setMovingId] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"fallback" | "loading" | "live" | "error" | "locked">("fallback");
  const [total, setTotal] = useState(fallbackCustomers.length);

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
    if (activeFilter.status) {
      query.set("status", activeFilter.status);
    }
    if (search.trim()) {
      query.set("search", search.trim());
    }

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
  }, [activeFilter, canReadCustomers, refreshKey, search, token]);

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
    if (activeFilter.status) {
      query.set("status", activeFilter.status);
    }
    if (search.trim()) {
      query.set("search", search.trim());
    }

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
  }, [activeFilter, canReadCustomers, refreshKey, search, token]);

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

  function openCreateModal() {
    setEditingCustomer(null);
    setForm(emptyCustomerForm);
    setSaveError(null);
    setModalOpen(true);
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
        <button className="primary-action" disabled={!canCreateCustomers} onClick={openCreateModal} type="button">
          <Plus aria-hidden="true" size={17} />
          Novo cliente
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
                  <span>{customer.phone || customer.email || "sem contato"} | {customer.origin || "origem nao informada"}</span>
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
                </div>
                <div className="blueprint-value">
                  <strong>{relativeDate(customer.updatedAt)}</strong>
                  <span>{statusLabels[customer.status]}</span>
                  <div className="customer-row-actions">
                    <button disabled={!canUpdateCustomers} onClick={() => openEditModal(customer)} type="button">
                      Editar
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
