"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import {
  BadgeDollarSign,
  BarChart3,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  LineChart,
  Percent,
  Plus,
  Repeat2,
  Scissors,
  Sparkles,
  Trophy,
  UserRoundCheck,
  Wrench,
  X,
} from "lucide-react";
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { apiGet, apiPost } from "../auth/auth-client";
import { useAuth } from "../auth/auth-provider";

type RecordStatus = "ACTIVE" | "ARCHIVED" | "INACTIVE";
type ServiceOrderStatus = "OPEN" | "SCHEDULED" | "RUNNING" | "WAITING_PROVIDER" | "WAITING_INVOICE" | "DONE" | "CANCELLED";

type PostSaleCustomer = {
  id: string;
  customerId: string | null;
  name: string;
  phone: string | null;
  email: string | null;
  vehicleInfo: string | null;
  recurrenceStatus: string | null;
  totalRevenue: string | null;
  lastServiceAt: string | null;
  nextActionAt: string | null;
  status: RecordStatus;
  createdAt: string;
  updatedAt: string;
};

type ServiceOrder = {
  id: string;
  customerId: string | null;
  postSaleCustomerId: string | null;
  vehicleId: string | null;
  providerId: string | null;
  type: string;
  status: ServiceOrderStatus;
  totalAmount: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type CatalogItem = {
  id: string;
  name: string;
  category: string;
  basePrice: string | null;
  slaHours: number | null;
  status: RecordStatus;
};

type ListResponse<T> = {
  items: T[];
  page: number;
  pageSize: number;
  total?: number;
};

type CustomerForm = {
  email: string;
  name: string;
  phone: string;
  recurrenceStatus: string;
  totalRevenue: string;
  vehicleInfo: string;
};

type OrderForm = {
  postSaleCustomerId: string;
  status: ServiceOrderStatus;
  totalAmount: string;
  type: string;
};

const currency = new Intl.NumberFormat("pt-BR", { currency: "BRL", maximumFractionDigits: 0, style: "currency" });
const colors = ["#7c5cff", "#00a884", "#ff8a3d", "#ff4d6d", "#2dd4bf", "#a78bfa", "#2563eb"];

const emptyCustomerForm: CustomerForm = {
  email: "",
  name: "",
  phone: "",
  recurrenceStatus: "Primeiro retorno",
  totalRevenue: "",
  vehicleInfo: "",
};

const emptyOrderForm: OrderForm = {
  postSaleCustomerId: "",
  status: "SCHEDULED",
  totalAmount: "",
  type: "PPF",
};

const fallbackCustomers: PostSaleCustomer[] = [
  {
    id: "fallback-post-sale-1",
    customerId: null,
    name: "Mariana Lopes",
    phone: "(11) 98822-1212",
    email: null,
    vehicleInfo: "Jeep Compass 2020",
    recurrenceStatus: "Plano lavagem mensal",
    totalRevenue: "5240.00",
    lastServiceAt: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString(),
    nextActionAt: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
    status: "ACTIVE",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: "fallback-post-sale-2",
    customerId: null,
    name: "Roberto Alves",
    phone: "(19) 99744-3200",
    email: null,
    vehicleInfo: "Honda HR-V",
    recurrenceStatus: "Manutencao vitrificacao",
    totalRevenue: "2180.00",
    lastServiceAt: new Date(Date.now() - 38 * 24 * 60 * 60 * 1000).toISOString(),
    nextActionAt: new Date(Date.now() + 12 * 24 * 60 * 60 * 1000).toISOString(),
    status: "ACTIVE",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

const fallbackOrders: ServiceOrder[] = [
  {
    id: "fallback-post-sale-order-1",
    customerId: null,
    postSaleCustomerId: "fallback-post-sale-1",
    vehicleId: null,
    providerId: null,
    type: "PPF",
    status: "SCHEDULED",
    totalAmount: "3800.00",
    startedAt: new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString(),
    finishedAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: "fallback-post-sale-order-2",
    customerId: null,
    postSaleCustomerId: "fallback-post-sale-2",
    vehicleId: null,
    providerId: null,
    type: "Polimento",
    status: "DONE",
    totalAmount: "2450.00",
    startedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
    finishedAt: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

const fallbackCatalog: CatalogItem[] = [
  { id: "fallback-catalog-1", name: "PPF", category: "Protecao", basePrice: "3800.00", slaHours: 8, status: "ACTIVE" },
  { id: "fallback-catalog-2", name: "Insulfilme", category: "Pelicula", basePrice: "1200.00", slaHours: 3, status: "ACTIVE" },
  { id: "fallback-catalog-3", name: "Polimento", category: "Estetica", basePrice: "1450.00", slaHours: 6, status: "ACTIVE" },
  { id: "fallback-catalog-4", name: "Higienizacao", category: "Estetica", basePrice: "480.00", slaHours: 4, status: "ACTIVE" },
];

const filters = ["Todos", "PPF", "Insulfilme", "Polimento", "Higienizacao", "Recorrencia"];
const recurringActions = ["Plano lavagem mensal", "Retorno vitrificacao", "Manutencao de PPF", "Campanha insulfilme", "Recompra estetica"];

function money(value: string | null | undefined) {
  const amount = Number(value ?? 0);
  return currency.format(amount);
}

function sumMoney(items: Array<string | null | undefined>) {
  return items.reduce((total, value) => total + Number(value ?? 0), 0);
}

function orderTone(status: ServiceOrderStatus) {
  if (status === "DONE") return "done";
  if (status === "SCHEDULED" || status === "RUNNING") return "running";
  if (status === "WAITING_PROVIDER" || status === "WAITING_INVOICE") return "risk";
  return "";
}

function dateLabel(value: string | null | undefined) {
  if (!value) return "Sem data";
  return new Date(value).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

export function LivePostSaleWorkspace() {
  const { hasPermission, isLoading, token } = useAuth();
  const canManageServices = hasPermission({ module: "services", action: "manage" });
  const [activeFilter, setActiveFilter] = useState("Todos");
  const [catalog, setCatalog] = useState(fallbackCatalog);
  const [customers, setCustomers] = useState(fallbackCustomers);
  const [customerForm, setCustomerForm] = useState(emptyCustomerForm);
  const [customerModalOpen, setCustomerModalOpen] = useState(false);
  const [orderForm, setOrderForm] = useState(emptyOrderForm);
  const [orderModalOpen, setOrderModalOpen] = useState(false);
  const [orders, setOrders] = useState(fallbackOrders);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<"error" | "fallback" | "live" | "loading" | "locked">("fallback");

  const loadPostSale = useCallback(async () => {
    if (!token) return;
    if (!canManageServices) {
      setStatus("locked");
      return;
    }

    setStatus("loading");
    const [customerResult, orderResult, catalogResult] = await Promise.allSettled([
      apiGet<ListResponse<PostSaleCustomer>>("/services/post-sale/customers?page=1&page_size=100", token),
      apiGet<ListResponse<ServiceOrder>>("/services/orders?page=1&page_size=100", token),
      apiGet<ListResponse<CatalogItem>>("/services/catalog?page=1&page_size=100", token),
    ]);

    if (customerResult.status === "fulfilled") setCustomers(customerResult.value.items);
    if (orderResult.status === "fulfilled") setOrders(orderResult.value.items.filter((order) => order.postSaleCustomerId || fallbackCustomers.some((customer) => customer.id === order.postSaleCustomerId)));
    if (catalogResult.status === "fulfilled") setCatalog(catalogResult.value.items);

    setStatus([customerResult, orderResult, catalogResult].some((result) => result.status === "rejected") ? "error" : "live");
  }, [canManageServices, token]);

  useEffect(() => {
    if (!isLoading) {
      void loadPostSale();
    }
  }, [isLoading, loadPostSale]);

  const visibleOrders = useMemo(() => {
    if (activeFilter === "Todos") return orders;
    if (activeFilter === "Recorrencia") return orders.filter((order) => customers.some((customer) => customer.id === order.postSaleCustomerId && customer.recurrenceStatus));
    return orders.filter((order) => order.type.toLowerCase().includes(activeFilter.toLowerCase()));
  }, [activeFilter, customers, orders]);

  const categories = useMemo(() => {
    const grouped = visibleOrders.reduce<Record<string, { amount: number; services: number }>>((accumulator, order) => {
      const key = order.type || "Outros";
      accumulator[key] = accumulator[key] ?? { amount: 0, services: 0 };
      accumulator[key].amount += Number(order.totalAmount ?? 0);
      accumulator[key].services += 1;
      return accumulator;
    }, {});
    const fromOrders = Object.entries(grouped).map(([name, data], index) => ({ color: colors[index % colors.length], name, ...data }));
    if (fromOrders.length > 0) return fromOrders;
    return catalog.slice(0, 6).map((item, index) => ({ amount: Number(item.basePrice ?? 0), color: colors[index % colors.length], name: item.name, services: 0 }));
  }, [catalog, visibleOrders]);

  const metrics = useMemo(() => {
    const revenue = sumMoney(orders.map((order) => order.totalAmount));
    const done = orders.filter((order) => order.status === "DONE").length;
    const recurring = customers.filter((customer) => customer.recurrenceStatus).length;
    const netProfit = revenue * 0.31;
    return [
      { label: "Faturamento mes", value: money(String(revenue)), detail: "servicos pos-venda", tone: "teal" },
      { label: "Lucro estimado", value: money(String(netProfit)), detail: "baseado em margem direta", tone: "blue" },
      { label: "Servicos feitos", value: String(done), detail: "OS concluidas", tone: "amber" },
      { label: "Recorrencia", value: `${customers.length ? Math.round((recurring / customers.length) * 100) : 0}%`, detail: "clientes com retorno", tone: "rose" },
    ];
  }, [customers, orders]);

  const customersById = useMemo(() => Object.fromEntries(customers.map((customer) => [customer.id, customer])), [customers]);
  const revenue = sumMoney(orders.map((order) => order.totalAmount));
  const directCosts = revenue * 0.39;
  const labor = revenue * 0.2;
  const commissions = revenue * 0.09;
  const expenses = revenue * 0.07;
  const profit = revenue - directCosts - labor - commissions - expenses;

  const dreRows = [
    { label: "Receita bruta pos-venda", value: money(String(revenue)), kind: "positive" },
    { label: "Insumos, filmes e produtos", value: `- ${money(String(directCosts))}`, kind: "negative" },
    { label: "Mao de obra direta", value: `- ${money(String(labor))}`, kind: "negative" },
    { label: "Comissoes profissionais", value: `- ${money(String(commissions))}`, kind: "negative" },
    { label: "Despesas operacionais", value: `- ${money(String(expenses))}`, kind: "negative" },
    { label: "Lucro liquido direto", value: money(String(profit)), kind: "final" },
  ];

  async function createCustomer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || !canManageServices || saving) return;
    setSaving(true);
    setSaveError(null);
    try {
      const response = await apiPost<{ data: PostSaleCustomer }>("/services/post-sale/customers", token, {
        email: customerForm.email || undefined,
        name: customerForm.name,
        phone: customerForm.phone || undefined,
        recurrenceStatus: customerForm.recurrenceStatus || undefined,
        totalRevenue: customerForm.totalRevenue ? Number(customerForm.totalRevenue) : undefined,
        vehicleInfo: customerForm.vehicleInfo || undefined,
      });
      setCustomers((current) => [response.data, ...current]);
      setCustomerForm(emptyCustomerForm);
      setCustomerModalOpen(false);
      setOrderForm((current) => ({ ...current, postSaleCustomerId: response.data.id }));
    } catch {
      setSaveError("Nao foi possivel salvar o cliente de pos-venda.");
    } finally {
      setSaving(false);
    }
  }

  async function createOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || !canManageServices || saving) return;
    setSaving(true);
    setSaveError(null);
    try {
      const response = await apiPost<{ data: ServiceOrder }>("/services/orders", token, {
        postSaleCustomerId: orderForm.postSaleCustomerId,
        status: orderForm.status,
        totalAmount: orderForm.totalAmount ? Number(orderForm.totalAmount) : undefined,
        type: orderForm.type,
      });
      setOrders((current) => [response.data, ...current]);
      setOrderForm(emptyOrderForm);
      setOrderModalOpen(false);
    } catch {
      setSaveError("Nao foi possivel criar o servico de pos-venda.");
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
      <section className="metric-grid" aria-label="Indicadores de pos-venda">
        {metrics.map((metric) => (
          <article className={`metric-card ${metric.tone}`} key={metric.label}>
            <div><h3>{metric.label}</h3><strong>{metric.value}</strong><span>{metric.detail}</span></div>
          </article>
        ))}
      </section>

      <section className="leads-toolbar panel" aria-label="Acoes de pos-venda">
        <div>
          {filters.map((filter) => (
            <button className={activeFilter === filter ? "active" : ""} key={filter} onClick={() => setActiveFilter(filter)} type="button">
              {filter}
            </button>
          ))}
        </div>
        <button className="primary-action" disabled={!canManageServices} onClick={() => { setSaveError(null); setOrderModalOpen(true); }} type="button">
          <CalendarDays aria-hidden="true" size={16} />
          Novo agendamento
        </button>
      </section>

      <section className="post-sale-grid">
        <article className="panel chart-panel wide">
          <div className="section-heading"><div><p className="eyebrow">Resultado por categoria</p><h3>Faturamento e volume de servicos</h3></div><BarChart3 aria-hidden="true" size={20} /></div>
          <div className="chart-box">
            <ResponsiveContainer height={240} width="100%">
              <BarChart data={categories} margin={{ left: -8, right: 6, top: 8 }}>
                <CartesianGrid stroke="#ebe7f4" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} tickLine={false} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(value) => `R$ ${Number(value) / 1000}k`} tickLine={false} width={48} />
                <Tooltip contentStyle={{ borderColor: "#e6e1ef", borderRadius: 8, fontSize: 12 }} formatter={(value) => currency.format(Number(value))} />
                <Bar barSize={22} dataKey="amount" name="Faturamento" radius={[6, 6, 0, 0]}>
                  {categories.map((item) => <Cell fill={item.color} key={item.name} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </article>

        <article className="panel chart-panel">
          <div className="section-heading"><div><p className="eyebrow">Mix</p><h3>Servicos por categoria</h3></div><LineChart aria-hidden="true" size={20} /></div>
          <div className="chart-box">
            <ResponsiveContainer height={240} width="100%">
              <PieChart>
                <Pie data={categories} dataKey="services" innerRadius={54} nameKey="name" outerRadius={82} paddingAngle={3}>
                  {categories.map((item) => <Cell fill={item.color} key={item.name} />)}
                </Pie>
                <Tooltip contentStyle={{ borderColor: "#e6e1ef", borderRadius: 8, fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="legend-grid">
            {categories.slice(0, 4).map((item) => <span key={item.name}><i style={{ background: item.color }} />{item.name} {item.services}</span>)}
          </div>
        </article>
      </section>

      <section className="post-sale-grid">
        <section className="panel service-board" aria-label="Agenda de pos-venda">
          <div className="section-heading"><div><p className="eyebrow">Agenda</p><h3>Instalacoes e servicos agendados</h3></div><span className="live-pill">{statusLabel}</span></div>
          <div className="service-list">
            {visibleOrders.slice(0, 6).map((order) => {
              const customer = order.postSaleCustomerId ? customersById[order.postSaleCustomerId] : null;
              return (
                <article className={`service-card ${orderTone(order.status)}`} key={order.id}>
                  <div className="service-main"><Wrench aria-hidden="true" size={22} /><div><strong>{order.type}</strong><span>{customer?.name ?? "Cliente nao vinculado"} | {customer?.vehicleInfo ?? "veiculo nao informado"}</span></div></div>
                  <div className="service-tags"><span>{dateLabel(order.startedAt ?? order.createdAt)}</span><span>{order.providerId ? "prestador vinculado" : "sem prestador"}</span><span>{order.status}</span></div>
                  <div className="service-deadline"><strong>{money(order.totalAmount)}</strong><span>valor</span></div>
                </article>
              );
            })}
          </div>
        </section>

        <aside className="panel">
          <div className="section-heading"><div><p className="eyebrow">Banco separado</p><h3>Clientes de pos-venda</h3></div><UserRoundCheck aria-hidden="true" size={20} /></div>
          <div className="post-sale-client-list">
            {customers.slice(0, 4).map((client) => (
              <article className="post-sale-client-card" key={client.id}>
                <strong>{client.name}</strong>
                <span>{client.lastServiceAt ? `Ultimo servico em ${dateLabel(client.lastServiceAt)}` : "Sem historico ainda"}</span>
                <em>{client.recurrenceStatus ?? "Sem recorrencia"}</em>
                <small>{client.vehicleInfo ?? "Sem veiculo"} | {money(client.totalRevenue)}</small>
              </article>
            ))}
          </div>
          <div className="post-sale-actions">
            <button onClick={() => { setSaveError(null); setCustomerModalOpen(true); }} type="button"><Plus aria-hidden="true" size={15} />Novo cliente</button>
            {recurringActions.slice(0, 4).map((action) => <button type="button" key={action}><Repeat2 aria-hidden="true" size={15} />{action}</button>)}
          </div>
        </aside>
      </section>

      <section className="dre-grid">
        <section className="panel dre-panel" aria-label="DRE pos-venda">
          <div className="section-heading"><div><p className="eyebrow">DRE pos-venda</p><h3>Resultado financeiro da operacao</h3></div><Percent aria-hidden="true" size={20} /></div>
          <div className="dre-table">
            {dreRows.map((row) => <article className={`dre-row ${row.kind}`} key={row.label}><span>{row.label}</span><strong>{row.value}</strong></article>)}
          </div>
        </section>

        <aside className="panel executive-metrics" aria-label="Comissoes pos-venda">
          <div className="section-heading"><div><p className="eyebrow">Comissoes</p><h3>Profissionais da operacao</h3></div><Trophy aria-hidden="true" size={20} /></div>
          <div className="post-sale-professional-list">
            {categories.slice(0, 3).map((category, index) => (
              <article className="executive-metric-card" key={category.name}>
                <BadgeDollarSign aria-hidden="true" size={18} />
                <div><span>{category.name}</span><strong>{["Equipe tecnica", "Equipe estetica", "Parceiro externo"][index] ?? "Operacao"}</strong><em>{category.services} servicos | {money(String(category.amount * 0.09))} comissao estimada</em></div>
              </article>
            ))}
          </div>
          <div className="automation-status"><CheckCircle2 aria-hidden="true" size={18} /><span>Comissoes de pos-venda ficam separadas da venda de veiculos.</span></div>
        </aside>
      </section>

      <section className="panel executive-note">
        <Sparkles aria-hidden="true" size={22} />
        <div><strong>O lucro liquido direto do pos-venda alimenta o DRE global da loja.</strong><span>A operacao agora usa clientes, OS, recorrencia e catalogo reais para dar visibilidade ao gestor.</span></div>
      </section>

      <section className="panel module-kanban-panel">
        <div className="section-heading"><div><p className="eyebrow">Servicos configuraveis</p><h3>Catalogo inicial</h3></div><ClipboardList aria-hidden="true" size={20} /></div>
        <div className="post-sale-category-grid">
          {catalog.map((service) => (
            <article className="post-sale-category-card" key={service.id}>
              <Scissors aria-hidden="true" size={18} />
              <strong>{service.name}</strong>
              <span>{service.category} | {money(service.basePrice)} | SLA {service.slaHours ?? "-"}h</span>
            </article>
          ))}
        </div>
      </section>

      {customerModalOpen ? (
        <div className="dre-modal-backdrop" role="dialog" aria-modal="true" aria-label="Novo cliente de pos-venda">
          <section className="dre-modal lead-modal">
            <header className="dre-modal-header"><div><p className="eyebrow">Pos-venda</p><h3>Novo cliente</h3></div><button aria-label="Fechar" className="icon-button" onClick={() => setCustomerModalOpen(false)} type="button"><X aria-hidden="true" size={18} /></button></header>
            <form className="lead-modal-form" onSubmit={createCustomer}>
              <label>Nome<input required value={customerForm.name} onChange={(event) => setCustomerForm((current) => ({ ...current, name: event.target.value }))} /></label>
              <label>Telefone<input value={customerForm.phone} onChange={(event) => setCustomerForm((current) => ({ ...current, phone: event.target.value }))} /></label>
              <label>E-mail<input type="email" value={customerForm.email} onChange={(event) => setCustomerForm((current) => ({ ...current, email: event.target.value }))} /></label>
              <label>Veiculo<input value={customerForm.vehicleInfo} onChange={(event) => setCustomerForm((current) => ({ ...current, vehicleInfo: event.target.value }))} /></label>
              <label>Recorrencia<input value={customerForm.recurrenceStatus} onChange={(event) => setCustomerForm((current) => ({ ...current, recurrenceStatus: event.target.value }))} /></label>
              <label>Receita historica<input min="0" type="number" value={customerForm.totalRevenue} onChange={(event) => setCustomerForm((current) => ({ ...current, totalRevenue: event.target.value }))} /></label>
              {saveError ? <p className="lead-modal-error">{saveError}</p> : null}
              <div className="lead-modal-actions"><button className="text-button" onClick={() => setCustomerModalOpen(false)} type="button">Cancelar</button><button className="primary-action" disabled={saving} type="submit">{saving ? "Salvando..." : "Salvar cliente"}</button></div>
            </form>
          </section>
        </div>
      ) : null}

      {orderModalOpen ? (
        <div className="dre-modal-backdrop" role="dialog" aria-modal="true" aria-label="Novo servico de pos-venda">
          <section className="dre-modal lead-modal">
            <header className="dre-modal-header"><div><p className="eyebrow">Pos-venda</p><h3>Novo agendamento</h3></div><button aria-label="Fechar" className="icon-button" onClick={() => setOrderModalOpen(false)} type="button"><X aria-hidden="true" size={18} /></button></header>
            <form className="lead-modal-form" onSubmit={createOrder}>
              <label className="lead-modal-wide">Cliente<select required value={orderForm.postSaleCustomerId} onChange={(event) => setOrderForm((current) => ({ ...current, postSaleCustomerId: event.target.value }))}><option value="">Selecione</option>{customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name} - {customer.vehicleInfo ?? "sem veiculo"}</option>)}</select></label>
              <label>Servico<select value={orderForm.type} onChange={(event) => setOrderForm((current) => ({ ...current, type: event.target.value }))}>{catalog.map((item) => <option key={item.id} value={item.name}>{item.name}</option>)}</select></label>
              <label>Status<select value={orderForm.status} onChange={(event) => setOrderForm((current) => ({ ...current, status: event.target.value as ServiceOrderStatus }))}>{["OPEN", "SCHEDULED", "RUNNING", "WAITING_PROVIDER", "WAITING_INVOICE", "DONE"].map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
              <label>Valor<input min="0" type="number" value={orderForm.totalAmount} onChange={(event) => setOrderForm((current) => ({ ...current, totalAmount: event.target.value }))} /></label>
              {saveError ? <p className="lead-modal-error">{saveError}</p> : null}
              <div className="lead-modal-actions"><button className="text-button" onClick={() => setOrderModalOpen(false)} type="button">Cancelar</button><button className="primary-action" disabled={saving || !orderForm.postSaleCustomerId} type="submit">{saving ? "Salvando..." : "Criar agendamento"}</button></div>
            </form>
          </section>
        </div>
      ) : null}
    </>
  );
}
