"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import {
  BadgeDollarSign,
  CalendarPlus,
  CheckCircle2,
  ClipboardCheck,
  FileText,
  Plus,
  Repeat2,
  Store,
  Truck,
  UserPlus,
  UsersRound,
  Wrench,
  X,
} from "lucide-react";
import { apiGet, apiPost } from "../auth/auth-client";
import { useAuth } from "../auth/auth-provider";

type Customer = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  origin: string | null;
  status: string;
  createdAt: string;
};

type Appointment = {
  id: string;
  customerId: string | null;
  title: string;
  type: string;
  startsAt: string;
  status: "SCHEDULED" | "CONFIRMED" | "DONE" | "CANCELLED" | "NO_SHOW";
};

type Sale = {
  id: string;
  customerId: string | null;
  sellerUserId: string | null;
  type: "VEHICLE" | "REPASSE" | "SERVICE";
  status: "DRAFT" | "PROPOSAL" | "APPROVED" | "DOCUMENTATION" | "CLOSED" | "CANCELLED";
  salePrice: string | null;
  createdAt: string;
};

type ServiceOrder = {
  id: string;
  providerId: string | null;
  type: string;
  status: "OPEN" | "SCHEDULED" | "RUNNING" | "WAITING_PROVIDER" | "WAITING_INVOICE" | "DONE" | "CANCELLED";
  totalAmount: string | null;
  createdAt: string;
};

type Contract = {
  id: string;
  saleId: string;
  status: string;
  generatedAt: string;
  signedAt: string | null;
};

type AuditLog = {
  id: string;
  module: string;
  action: string;
  entityType: string;
  result: string;
  createdAt: string;
};

type ListResponse<T> = {
  items: T[];
  page: number;
  pageSize: number;
  total?: number;
};

type ModalKind = "appointment" | "customer" | "provider" | "repasse" | "sale" | null;

type CustomerForm = {
  email: string;
  name: string;
  origin: string;
  phone: string;
};

type AppointmentForm = {
  customerId: string;
  startsAt: string;
  title: string;
  type: string;
};

type SaleForm = {
  customerId: string;
  salePrice: string;
  type: "VEHICLE" | "REPASSE" | "SERVICE";
};

type ProviderForm = {
  contactName: string;
  name: string;
  phone: string;
  serviceTypes: string;
};

const fallbackCustomers: Customer[] = [
  { id: "fallback-customer-1", name: "Eduardo N.", phone: "(11) 99990-1000", email: null, origin: "Administrativo", status: "ACTIVE", createdAt: new Date().toISOString() },
  { id: "fallback-customer-2", name: "Auto Giro", phone: "(19) 99888-7777", email: null, origin: "Repasse", status: "ACTIVE", createdAt: new Date().toISOString() },
];

const fallbackAppointments: Appointment[] = [
  { id: "fallback-appointment-1", customerId: "fallback-customer-1", title: "Visita loja", type: "Visita", startsAt: new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString(), status: "SCHEDULED" },
];

const fallbackSales: Sale[] = [
  { id: "fallback-sale-1", customerId: "fallback-customer-1", sellerUserId: null, type: "VEHICLE", status: "DOCUMENTATION", salePrice: "118000.00", createdAt: new Date().toISOString() },
  { id: "fallback-sale-2", customerId: "fallback-customer-2", sellerUserId: null, type: "REPASSE", status: "DRAFT", salePrice: "42000.00", createdAt: new Date().toISOString() },
];

const fallbackOrders: ServiceOrder[] = [
  { id: "fallback-order-1", providerId: null, type: "PPF", status: "WAITING_PROVIDER", totalAmount: "1800.00", createdAt: new Date().toISOString() },
  { id: "fallback-order-2", providerId: "provider", type: "Vistoria", status: "WAITING_INVOICE", totalAmount: "420.00", createdAt: new Date().toISOString() },
];

const fallbackContracts: Contract[] = [
  { id: "fallback-contract-1", saleId: "fallback-sale-1", status: "GENERATED", generatedAt: new Date().toISOString(), signedAt: null },
];

const fallbackLogs: AuditLog[] = [
  { id: "fallback-log-1", module: "customers", action: "create", entityType: "customer", result: "SUCCESS", createdAt: new Date().toISOString() },
  { id: "fallback-log-2", module: "services", action: "service_order_created", entityType: "service_order", result: "SUCCESS", createdAt: new Date().toISOString() },
];

const emptyCustomerForm: CustomerForm = { email: "", name: "", origin: "Administrativo", phone: "" };
const emptyAppointmentForm: AppointmentForm = {
  customerId: "",
  startsAt: new Date(Date.now() + 60 * 60 * 1000).toISOString().slice(0, 16),
  title: "Atendimento administrativo",
  type: "Administrativo",
};
const emptySaleForm: SaleForm = { customerId: "", salePrice: "", type: "VEHICLE" };
const emptyProviderForm: ProviderForm = { contactName: "", name: "", phone: "", serviceTypes: "Preparacao" };

const reviewChecklist = [
  { icon: UsersRound, label: "Responsaveis", detail: "Vendas podem nascer sem vendedor, mas a fila destaca vinculo pendente." },
  { icon: Store, label: "Origem do cadastro", detail: "Cliente, fornecedor e prestador indicam origem ou tipo operacional." },
  { icon: Repeat2, label: "Venda de repasse", detail: "Repasse fica separado por tipo para DRE, comissao e documentos." },
  { icon: FileText, label: "Documentos", detail: "Contratos gerados e nao assinados aparecem na triagem." },
  { icon: ClipboardCheck, label: "Auditoria", detail: "Criacoes manuais usam endpoints que registram log de usuario e horario." },
];

function splitTags(value: string) {
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

function money(value: string | null | undefined) {
  const amount = Number(value ?? 0);
  return amount > 0 ? new Intl.NumberFormat("pt-BR", { currency: "BRL", maximumFractionDigits: 0, style: "currency" }).format(amount) : "A definir";
}

function relativeDate(value: string) {
  return new Date(value).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

export function LiveAdministrativeWorkspace() {
  const { hasPermission, isLoading, token } = useAuth();
  const canCreateCustomers = hasPermission({ module: "customers", action: "create" });
  const canReadCustomers = hasPermission({ module: "customers", action: "read" });
  const canManageAppointments = hasPermission({ module: "appointments", action: "manage" });
  const canReadSales = hasPermission({ module: "sales", action: "read" });
  const canCreateSales = hasPermission({ module: "sales", action: "create" });
  const canManageServices = hasPermission({ module: "services", action: "manage" });
  const canManageDocuments = hasPermission({ module: "documents", action: "manage" });
  const canReadAudit = hasPermission({ module: "audit", action: "read" });
  const [appointments, setAppointments] = useState(fallbackAppointments);
  const [appointmentForm, setAppointmentForm] = useState(emptyAppointmentForm);
  const [contracts, setContracts] = useState(fallbackContracts);
  const [customerForm, setCustomerForm] = useState(emptyCustomerForm);
  const [customers, setCustomers] = useState(fallbackCustomers);
  const [logs, setLogs] = useState(fallbackLogs);
  const [modal, setModal] = useState<ModalKind>(null);
  const [orders, setOrders] = useState(fallbackOrders);
  const [providerForm, setProviderForm] = useState(emptyProviderForm);
  const [saleForm, setSaleForm] = useState(emptySaleForm);
  const [sales, setSales] = useState(fallbackSales);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<"error" | "fallback" | "live" | "loading" | "locked">("fallback");

  const loadAdministrative = useCallback(async () => {
    if (!token) return;
    setStatus("loading");

    const [customersResult, appointmentsResult, salesResult, ordersResult, contractsResult, logsResult] = await Promise.allSettled([
      canReadCustomers ? apiGet<ListResponse<Customer>>("/customers?page=1&page_size=50", token) : Promise.resolve({ items: fallbackCustomers, page: 1, pageSize: 50 }),
      canManageAppointments ? apiGet<ListResponse<Appointment>>("/appointments?page=1&page_size=50", token) : Promise.resolve({ items: fallbackAppointments, page: 1, pageSize: 50 }),
      canReadSales ? apiGet<ListResponse<Sale>>("/sales?page=1&page_size=50", token) : Promise.resolve({ items: fallbackSales, page: 1, pageSize: 50 }),
      canManageServices ? apiGet<ListResponse<ServiceOrder>>("/services/orders?page=1&page_size=50", token) : Promise.resolve({ items: fallbackOrders, page: 1, pageSize: 50 }),
      canManageDocuments ? apiGet<ListResponse<Contract>>("/contracts?page=1&page_size=50", token) : Promise.resolve({ items: fallbackContracts, page: 1, pageSize: 50 }),
      canReadAudit ? apiGet<ListResponse<AuditLog>>("/audit/logs?page=1&page_size=20", token) : Promise.resolve({ items: fallbackLogs, page: 1, pageSize: 20 }),
    ]);

    if (customersResult.status === "fulfilled") setCustomers(customersResult.value.items);
    if (appointmentsResult.status === "fulfilled") setAppointments(appointmentsResult.value.items);
    if (salesResult.status === "fulfilled") setSales(salesResult.value.items);
    if (ordersResult.status === "fulfilled") setOrders(ordersResult.value.items);
    if (contractsResult.status === "fulfilled") setContracts(contractsResult.value.items);
    if (logsResult.status === "fulfilled") setLogs(logsResult.value.items);

    const hasFailure = [customersResult, appointmentsResult, salesResult, ordersResult, contractsResult, logsResult].some((result) => result.status === "rejected");
    const hasAnyPermission = canReadCustomers || canManageAppointments || canReadSales || canManageServices || canManageDocuments || canReadAudit;
    setStatus(!hasAnyPermission ? "locked" : hasFailure ? "error" : "live");
  }, [canManageAppointments, canManageDocuments, canManageServices, canReadAudit, canReadCustomers, canReadSales, token]);

  useEffect(() => {
    if (!isLoading) {
      void loadAdministrative();
    }
  }, [isLoading, loadAdministrative]);

  const customersById = useMemo(() => Object.fromEntries(customers.map((customer) => [customer.id, customer])), [customers]);

  const queue = useMemo(() => {
    const saleRows = sales
      .filter((sale) => sale.status === "DOCUMENTATION" || !sale.sellerUserId || sale.type === "REPASSE")
      .slice(0, 4)
      .map((sale) => ({
        key: `sale-${sale.id}`,
        meta: `${customersById[sale.customerId ?? ""]?.name ?? "Cliente nao vinculado"} | ${money(sale.salePrice)}`,
        status: sale.type === "REPASSE" ? "repasse" : sale.status.toLowerCase(),
        tags: [sale.type.toLowerCase(), sale.sellerUserId ? "responsavel ok" : "sem vendedor", "financeiro"],
        title: sale.type === "REPASSE" ? "Venda de repasse criada" : "Venda em passagem administrativa",
        tone: sale.type === "REPASSE" ? "blue" : "amber",
      }));

    const serviceRows = orders
      .filter((order) => order.status === "WAITING_PROVIDER" || order.status === "WAITING_INVOICE" || !order.providerId)
      .slice(0, 3)
      .map((order) => ({
        key: `service-order-${order.id}`,
        meta: `${order.type} | ${money(order.totalAmount)}`,
        status: order.status === "WAITING_INVOICE" ? "NF" : "validar",
        tags: ["servicos", order.providerId ? "prestador ok" : "sem prestador", "documentos"],
        title: order.status === "WAITING_INVOICE" ? "Nota pendente em OS" : "Prestador para OS",
        tone: "blue",
      }));

    const appointmentRows = appointments
      .filter((appointment) => appointment.status === "SCHEDULED" && !appointment.customerId)
      .slice(0, 2)
      .map((appointment) => ({
        key: `appointment-${appointment.id}`,
        meta: `${appointment.title} | ${relativeDate(appointment.startsAt)}`,
        status: "corrigir",
        tags: ["agenda", "cliente", appointment.type],
        title: "Agendamento sem cliente vinculado",
        tone: "rose",
      }));

    const contractRows = contracts
      .filter((contract) => !contract.signedAt)
      .slice(0, 2)
      .map((contract) => ({
        key: `contract-${contract.id}`,
        meta: `Venda ${contract.saleId.slice(0, 8)} | ${relativeDate(contract.generatedAt)}`,
        status: contract.status.toLowerCase(),
        tags: ["documentos", "assinatura", "venda"],
        title: "Contrato sem assinatura",
        tone: "teal",
      }));

    return [...saleRows, ...serviceRows, ...appointmentRows, ...contractRows].slice(0, 8);
  }, [appointments, contracts, customersById, orders, sales]);

  const metrics = useMemo(() => {
    const newCustomers = customers.filter((customer) => Date.now() - new Date(customer.createdAt).getTime() < 7 * 86400000).length;
    const repasseSales = sales.filter((sale) => sale.type === "REPASSE").length;
    const critical = queue.filter((item) => item.tone === "rose" || item.status === "NF").length;
    return [
      { label: "Acoes abertas", value: String(queue.length), detail: "rotinas aguardando conclusao", tone: "teal" },
      { label: "Cadastros novos", value: String(newCustomers), detail: "clientes da ultima semana", tone: "blue" },
      { label: "Vendas repasse", value: String(repasseSales), detail: "criadas ou em andamento", tone: "amber" },
      { label: "Pendencias criticas", value: String(critical), detail: "docs, agenda ou financeiro", tone: "rose" },
    ];
  }, [customers, queue, sales]);

  const quickCreateActions = [
    { detail: "visita, avaliacao, entrega ou servico", disabled: !canManageAppointments, icon: CalendarPlus, kind: "appointment" as const, label: "Criar agendamento" },
    { detail: "cadastro manual ou complemento", disabled: !canCreateCustomers, icon: UserPlus, kind: "customer" as const, label: "Criar cliente" },
    { detail: "com ou sem vendedor vinculado", disabled: !canCreateSales, icon: BadgeDollarSign, kind: "sale" as const, label: "Gerar venda" },
    { detail: "veiculo de repasse, com ou sem vendedor", disabled: !canCreateSales, icon: Repeat2, kind: "repasse" as const, label: "Venda repasse" },
    { detail: "origem, parceiro ou repasse", disabled: !canManageServices, icon: Truck, kind: "provider" as const, label: "Inserir fornecedor" },
    { detail: "polimento, PPF, insulfilm, vistoria", disabled: !canManageServices, icon: Wrench, kind: "provider" as const, label: "Inserir prestador" },
  ];

  function openModal(kind: Exclude<ModalKind, null>) {
    setSaveError(null);
    setModal(kind);
    if (kind === "repasse") setSaleForm((current) => ({ ...current, type: "REPASSE" }));
    if (kind === "sale") setSaleForm((current) => ({ ...current, type: "VEHICLE" }));
  }

  async function createCustomer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || saving) return;
    setSaving(true);
    setSaveError(null);
    try {
      const response = await apiPost<{ data: Customer }>("/customers", token, {
        email: customerForm.email || undefined,
        name: customerForm.name,
        origin: customerForm.origin || undefined,
        phone: customerForm.phone || undefined,
      });
      setCustomers((current) => [response.data, ...current]);
      setCustomerForm(emptyCustomerForm);
      setModal(null);
    } catch {
      setSaveError("Nao foi possivel criar o cliente.");
    } finally {
      setSaving(false);
    }
  }

  async function createAppointment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || saving) return;
    setSaving(true);
    setSaveError(null);
    try {
      const response = await apiPost<{ data: Appointment }>("/appointments", token, {
        customerId: appointmentForm.customerId || undefined,
        startsAt: new Date(appointmentForm.startsAt).toISOString(),
        title: appointmentForm.title,
        type: appointmentForm.type,
      });
      setAppointments((current) => [response.data, ...current]);
      setAppointmentForm(emptyAppointmentForm);
      setModal(null);
    } catch {
      setSaveError("Nao foi possivel criar o agendamento.");
    } finally {
      setSaving(false);
    }
  }

  async function createSale(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || saving) return;
    setSaving(true);
    setSaveError(null);
    try {
      const response = await apiPost<{ data: Sale }>("/sales", token, {
        customerId: saleForm.customerId || undefined,
        salePrice: saleForm.salePrice ? Number(saleForm.salePrice) : undefined,
        status: "DRAFT",
        type: saleForm.type,
      });
      setSales((current) => [response.data, ...current]);
      setSaleForm(emptySaleForm);
      setModal(null);
    } catch {
      setSaveError("Nao foi possivel criar a venda.");
    } finally {
      setSaving(false);
    }
  }

  async function createProvider(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || saving) return;
    setSaving(true);
    setSaveError(null);
    try {
      await apiPost<{ data: { id: string } }>("/services/providers", token, {
        contactName: providerForm.contactName || undefined,
        name: providerForm.name,
        phone: providerForm.phone || undefined,
        serviceTypes: splitTags(providerForm.serviceTypes),
      });
      setProviderForm(emptyProviderForm);
      setModal(null);
      void loadAdministrative();
    } catch {
      setSaveError("Nao foi possivel criar o fornecedor/prestador.");
    } finally {
      setSaving(false);
    }
  }

  const statusLabel = {
    error: "Dados parciais",
    fallback: "Fallback visual",
    live: "Dados reais",
    loading: "Sincronizando",
    locked: "Sem permissao",
  }[status];

  return (
    <>
      <section className="metric-grid" aria-label="Indicadores administrativos">
        {metrics.map((metric) => (
          <article className={`metric-card ${metric.tone}`} key={metric.label}>
            <div><h3>{metric.label}</h3><strong>{metric.value}</strong><span>{metric.detail}</span></div>
          </article>
        ))}
      </section>

      <section className="panel admin-create-panel" aria-label="Criacao rapida administrativa">
        <div className="section-heading"><div><p className="eyebrow">Criacao rapida</p><h3>Atalhos pequenos para rotina administrativa</h3></div><span className="live-pill">{statusLabel}</span></div>
        <div className="admin-action-grid">
          {quickCreateActions.map((action) => {
            const Icon = action.icon;
            return (
              <button className="admin-action-button" disabled={action.disabled} key={action.label} onClick={() => openModal(action.kind)} type="button">
                <Icon aria-hidden="true" size={17} />
                <span><strong>{action.label}</strong><em>{action.detail}</em></span>
                <Plus aria-hidden="true" size={15} />
              </button>
            );
          })}
        </div>
      </section>

      <section className="blueprint-grid">
        <article className="panel">
          <div className="section-heading"><div><p className="eyebrow">Triagem</p><h3>Itens administrativos para avaliar agora</h3></div><button className="text-button" onClick={() => void loadAdministrative()} type="button">Atualizar</button></div>
          <div className="blueprint-list">
            {queue.map((item) => (
              <article className={`blueprint-row ${item.tone}`} key={item.key}>
                <div className="blueprint-main"><ClipboardCheck aria-hidden="true" /><div><strong>{item.title}</strong><span>{item.meta}</span></div></div>
                <div className="blueprint-tags">{item.tags.map((tag) => <span key={tag}>{tag}</span>)}</div>
                <div className="blueprint-value"><strong>{item.status}</strong><span>revisar fluxo</span></div>
              </article>
            ))}
            {queue.length === 0 ? <article className="blueprint-row teal"><div className="blueprint-main"><CheckCircle2 aria-hidden="true" /><div><strong>Sem pendencias agora</strong><span>A fila administrativa esta limpa.</span></div></div></article> : null}
          </div>
        </article>

        <aside className="panel">
          <div className="section-heading"><div><p className="eyebrow">Avaliacao macro</p><h3>O que conferir nesta etapa</h3></div></div>
          <ul className="blueprint-side-list">
            {reviewChecklist.map((item) => {
              const Icon = item.icon;
              return <li key={item.label}><Icon aria-hidden="true" size={18} /><div><strong>{item.label}</strong><span>{item.detail}</span></div></li>;
            })}
          </ul>
          <div className="automation-status warning">
            <CheckCircle2 aria-hidden="true" size={18} />
            <span>{logs.length} logs recentes disponiveis para rastrear criacoes manuais e mudancas operacionais.</span>
          </div>
        </aside>
      </section>

      {modal ? (
        <div className="dre-modal-backdrop" role="dialog" aria-modal="true" aria-label="Criacao administrativa">
          <section className="dre-modal lead-modal">
            <header className="dre-modal-header">
              <div><p className="eyebrow">Administrativo</p><h3>{modal === "appointment" ? "Novo agendamento" : modal === "customer" ? "Novo cliente" : modal === "provider" ? "Novo fornecedor/prestador" : "Nova venda"}</h3></div>
              <button aria-label="Fechar" className="icon-button" onClick={() => setModal(null)} type="button"><X aria-hidden="true" size={18} /></button>
            </header>

            {modal === "customer" ? (
              <form className="lead-modal-form" onSubmit={createCustomer}>
                <label>Nome<input required value={customerForm.name} onChange={(event) => setCustomerForm((current) => ({ ...current, name: event.target.value }))} /></label>
                <label>Telefone<input value={customerForm.phone} onChange={(event) => setCustomerForm((current) => ({ ...current, phone: event.target.value }))} /></label>
                <label>E-mail<input type="email" value={customerForm.email} onChange={(event) => setCustomerForm((current) => ({ ...current, email: event.target.value }))} /></label>
                <label>Origem<input value={customerForm.origin} onChange={(event) => setCustomerForm((current) => ({ ...current, origin: event.target.value }))} /></label>
                {saveError ? <p className="lead-modal-error">{saveError}</p> : null}
                <div className="lead-modal-actions"><button className="text-button" onClick={() => setModal(null)} type="button">Cancelar</button><button className="primary-action" disabled={saving} type="submit">{saving ? "Salvando..." : "Salvar cliente"}</button></div>
              </form>
            ) : null}

            {modal === "appointment" ? (
              <form className="lead-modal-form" onSubmit={createAppointment}>
                <label className="lead-modal-wide">Cliente<select value={appointmentForm.customerId} onChange={(event) => setAppointmentForm((current) => ({ ...current, customerId: event.target.value }))}><option value="">Sem cliente vinculado</option>{customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}</select></label>
                <label>Titulo<input required value={appointmentForm.title} onChange={(event) => setAppointmentForm((current) => ({ ...current, title: event.target.value }))} /></label>
                <label>Tipo<input required value={appointmentForm.type} onChange={(event) => setAppointmentForm((current) => ({ ...current, type: event.target.value }))} /></label>
                <label>Horario<input required type="datetime-local" value={appointmentForm.startsAt} onChange={(event) => setAppointmentForm((current) => ({ ...current, startsAt: event.target.value }))} /></label>
                {saveError ? <p className="lead-modal-error">{saveError}</p> : null}
                <div className="lead-modal-actions"><button className="text-button" onClick={() => setModal(null)} type="button">Cancelar</button><button className="primary-action" disabled={saving} type="submit">{saving ? "Salvando..." : "Criar agendamento"}</button></div>
              </form>
            ) : null}

            {modal === "sale" || modal === "repasse" ? (
              <form className="lead-modal-form" onSubmit={createSale}>
                <label className="lead-modal-wide">Cliente<select value={saleForm.customerId} onChange={(event) => setSaleForm((current) => ({ ...current, customerId: event.target.value }))}><option value="">Sem cliente vinculado</option>{customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}</select></label>
                <label>Tipo<select value={saleForm.type} onChange={(event) => setSaleForm((current) => ({ ...current, type: event.target.value as SaleForm["type"] }))}><option value="VEHICLE">Veiculo</option><option value="REPASSE">Repasse</option><option value="SERVICE">Servico</option></select></label>
                <label>Valor<input min="0" type="number" value={saleForm.salePrice} onChange={(event) => setSaleForm((current) => ({ ...current, salePrice: event.target.value }))} /></label>
                {saveError ? <p className="lead-modal-error">{saveError}</p> : null}
                <div className="lead-modal-actions"><button className="text-button" onClick={() => setModal(null)} type="button">Cancelar</button><button className="primary-action" disabled={saving} type="submit">{saving ? "Salvando..." : "Criar venda"}</button></div>
              </form>
            ) : null}

            {modal === "provider" ? (
              <form className="lead-modal-form" onSubmit={createProvider}>
                <label>Nome<input required value={providerForm.name} onChange={(event) => setProviderForm((current) => ({ ...current, name: event.target.value }))} /></label>
                <label>Contato<input value={providerForm.contactName} onChange={(event) => setProviderForm((current) => ({ ...current, contactName: event.target.value }))} /></label>
                <label>Telefone<input value={providerForm.phone} onChange={(event) => setProviderForm((current) => ({ ...current, phone: event.target.value }))} /></label>
                <label>Tipos<input value={providerForm.serviceTypes} onChange={(event) => setProviderForm((current) => ({ ...current, serviceTypes: event.target.value }))} /></label>
                {saveError ? <p className="lead-modal-error">{saveError}</p> : null}
                <div className="lead-modal-actions"><button className="text-button" onClick={() => setModal(null)} type="button">Cancelar</button><button className="primary-action" disabled={saving} type="submit">{saving ? "Salvando..." : "Salvar"}</button></div>
              </form>
            ) : null}
          </section>
        </div>
      ) : null}
    </>
  );
}
