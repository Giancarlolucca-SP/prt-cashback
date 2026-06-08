"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { Building2, Copy, Eye, EyeOff, KeyRound, MapPin, MessageCircle, Phone, Plus, ShieldCheck, Truck, UsersRound, X } from "lucide-react";
import { apiGet, apiPost } from "../auth/auth-client";
import { useAuth } from "../auth/auth-provider";

type RecordStatus = "ACTIVE" | "ARCHIVED" | "INACTIVE";
type ServiceOrderStatus = "OPEN" | "SCHEDULED" | "RUNNING" | "WAITING_PROVIDER" | "WAITING_INVOICE" | "DONE" | "CANCELLED";

type ServiceProvider = {
  id: string;
  name: string;
  serviceTypes: string[];
  document: string | null;
  contactName: string | null;
  phone: string | null;
  email: string | null;
  accessUrl: string | null;
  accessLogin: string | null;
  hasSecret: boolean;
  status: RecordStatus;
  createdAt: string;
  updatedAt: string;
};

type ServiceOrder = {
  id: string;
  providerId: string | null;
  status: ServiceOrderStatus;
  type: string;
  createdAt: string;
  updatedAt: string;
};

type ExternalJob = {
  id: string;
  provider: string;
  purpose: string;
  status: string;
  requiresHumanAction: boolean;
  createdAt: string;
};

type ListResponse<T> = {
  items: T[];
  page: number;
  pageSize: number;
  total?: number;
};

type ProviderForm = {
  accessLogin: string;
  accessUrl: string;
  contactName: string;
  email: string;
  name: string;
  phone: string;
  serviceTypes: string;
};

const emptyForm: ProviderForm = {
  accessLogin: "",
  accessUrl: "",
  contactName: "",
  email: "",
  name: "",
  phone: "",
  serviceTypes: "Preparacao",
};

const fallbackProviders: ServiceProvider[] = [
  {
    id: "fallback-provider-1",
    name: "Locadora Alfa",
    serviceTypes: ["Frota", "Compra", "Preparacao"],
    document: null,
    contactName: "Marcos Andrade",
    phone: "(11) 98822-1140",
    email: null,
    accessUrl: "portal.locadoraalfa.com.br",
    accessLogin: "gt3.compras",
    hasSecret: true,
    status: "ACTIVE",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: "fallback-provider-2",
    name: "Rede Repasse Premium",
    serviceTypes: ["Repasse", "Grupo WhatsApp"],
    document: null,
    contactName: "Renato",
    phone: "(19) 99180-7781",
    email: null,
    accessUrl: "Convite interno do grupo",
    accessLogin: null,
    hasSecret: false,
    status: "ACTIVE",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: "fallback-provider-3",
    name: "Grupo Veneto",
    serviceTypes: ["Concessionaria", "Seminovos"],
    document: null,
    contactName: "Juliana Veneto",
    phone: "(19) 99744-3200",
    email: "parceiros@veneto.example",
    accessUrl: "veneto.parceiros.com.br",
    accessLogin: "gt3.parceiro",
    hasSecret: true,
    status: "INACTIVE",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

const fallbackOrders: ServiceOrder[] = [
  { id: "fallback-order-1", providerId: "fallback-provider-1", status: "RUNNING", type: "Preparacao", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { id: "fallback-order-2", providerId: "fallback-provider-1", status: "WAITING_INVOICE", type: "Vistoria", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { id: "fallback-order-3", providerId: "fallback-provider-3", status: "DONE", type: "Documentacao", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
];

const fallbackJobs: ExternalJob[] = [
  { id: "fallback-job-1", provider: "Detran", purpose: "Consulta restricao", status: "SUCCEEDED", requiresHumanAction: false, createdAt: new Date().toISOString() },
  { id: "fallback-job-2", provider: "Serpro", purpose: "Documento veicular", status: "PENDING", requiresHumanAction: true, createdAt: new Date().toISOString() },
];

const filters = ["Todos", "Preparacao", "Repasse", "Documentacao", "Com acesso", "Inativos"];
const sideRules = [
  { detail: "Fornecedor nao deve misturar com cliente final.", icon: UsersRound, label: "Base separada" },
  { detail: "Tipos de servico ajudam a encontrar origem e prestador certo.", icon: MapPin, label: "Segmentacao" },
  { detail: "Telefone e e-mail centralizam acionamento operacional.", icon: Phone, label: "Contato" },
  { detail: "Login e segredo aparecem apenas como referencia protegida.", icon: ShieldCheck, label: "Acessos" },
];

const statusLabels: Record<RecordStatus, string> = {
  ACTIVE: "ativo",
  ARCHIVED: "arquivado",
  INACTIVE: "inativo",
};

function providerTone(provider: ServiceProvider) {
  if (provider.status !== "ACTIVE") return "amber";
  if (provider.serviceTypes.some((type) => type.toLowerCase().includes("repasse"))) return "blue";
  return "teal";
}

function providerIcon(provider: ServiceProvider) {
  const types = provider.serviceTypes.join(" ").toLowerCase();
  if (types.includes("whatsapp") || types.includes("grupo")) return MessageCircle;
  if (types.includes("frota") || types.includes("transport")) return Truck;
  return Building2;
}

function matchesFilter(provider: ServiceProvider, filter: string) {
  const serviceTypes = provider.serviceTypes.join(" ").toLowerCase();
  if (filter === "Todos") return true;
  if (filter === "Com acesso") return Boolean(provider.accessUrl || provider.accessLogin || provider.hasSecret);
  if (filter === "Inativos") return provider.status !== "ACTIVE";
  return serviceTypes.includes(filter.toLowerCase());
}

function splitServiceTypes(value: string) {
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

export function LiveSuppliersWorkspace() {
  const { hasPermission, isLoading, token } = useAuth();
  const canManageServices = hasPermission({ module: "services", action: "manage", scope: "STORE", sensitiveArea: "general" });
  const canManageCredentials = hasPermission({ module: "suppliers", action: "manage", scope: "ALL", sensitiveArea: "credentials" });
  const [providers, setProviders] = useState(fallbackProviders);
  const [orders, setOrders] = useState(fallbackOrders);
  const [externalJobs, setExternalJobs] = useState(fallbackJobs);
  const [selectedId, setSelectedId] = useState(fallbackProviders[0]?.id ?? "");
  const [activeFilter, setActiveFilter] = useState("Todos");
  const [showSecret, setShowSecret] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [status, setStatus] = useState<"error" | "idle" | "loading" | "ready">("idle");
  const [formError, setFormError] = useState<string | null>(null);

  const loadSuppliers = useCallback(async () => {
    if (!token) return;
    setStatus("loading");

    const [providersResult, ordersResult, jobsResult] = await Promise.allSettled([
      canManageServices ? apiGet<ListResponse<ServiceProvider>>("/services/providers?page=1&page_size=100", token) : Promise.resolve({ items: fallbackProviders, page: 1, pageSize: 100 }),
      canManageServices ? apiGet<ListResponse<ServiceOrder>>("/services/orders?page=1&page_size=100", token) : Promise.resolve({ items: fallbackOrders, page: 1, pageSize: 100 }),
      canManageCredentials ? apiGet<ListResponse<ExternalJob>>("/compliance/external-jobs?page=1&page_size=100", token) : Promise.resolve({ items: fallbackJobs, page: 1, pageSize: 100 }),
    ]);

    if (providersResult.status === "fulfilled") {
      setProviders(providersResult.value.items);
      setSelectedId((current) => current || providersResult.value.items[0]?.id || "");
    }
    if (ordersResult.status === "fulfilled") setOrders(ordersResult.value.items);
    if (jobsResult.status === "fulfilled") setExternalJobs(jobsResult.value.items);

    setStatus([providersResult, ordersResult, jobsResult].some((result) => result.status === "rejected") ? "error" : "ready");
  }, [canManageCredentials, canManageServices, token]);

  useEffect(() => {
    if (!isLoading) {
      void loadSuppliers();
    }
  }, [isLoading, loadSuppliers]);

  const visibleProviders = useMemo(() => providers.filter((provider) => matchesFilter(provider, activeFilter)), [activeFilter, providers]);
  const selectedProvider = providers.find((provider) => provider.id === selectedId) ?? visibleProviders[0] ?? providers[0] ?? fallbackProviders[0];
  const SelectedIcon = providerIcon(selectedProvider);

  const orderCountByProvider = useMemo(() => {
    return orders.reduce<Record<string, number>>((accumulator, order) => {
      if (!order.providerId) return accumulator;
      accumulator[order.providerId] = (accumulator[order.providerId] ?? 0) + 1;
      return accumulator;
    }, {});
  }, [orders]);

  const metrics = useMemo(() => {
    const active = providers.filter((provider) => provider.status === "ACTIVE").length;
    const withAccess = providers.filter((provider) => provider.accessUrl || provider.accessLogin || provider.hasSecret).length;
    const waiting = orders.filter((order) => order.status === "WAITING_INVOICE" || order.status === "WAITING_PROVIDER").length;
    return [
      { label: "Fornecedores", value: String(providers.length), detail: "prestadores e origens", tone: "teal" },
      { label: "Ativos", value: String(active), detail: "disponiveis para operacao", tone: "blue" },
      { label: "Acessos salvos", value: String(withAccess), detail: "URL, login ou segredo", tone: "amber" },
      { label: "Pendencias", value: String(waiting), detail: "OS aguardando fornecedor/NF", tone: "rose" },
    ];
  }, [orders, providers]);

  async function handleCreateProvider(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || !canManageServices) return;
    setFormError(null);

    try {
      const response = await apiPost<{ data: ServiceProvider }>("/services/providers", token, {
        accessLogin: form.accessLogin || undefined,
        accessUrl: form.accessUrl || undefined,
        contactName: form.contactName || undefined,
        email: form.email || undefined,
        name: form.name,
        phone: form.phone || undefined,
        serviceTypes: splitServiceTypes(form.serviceTypes),
      });
      setProviders((current) => [response.data, ...current]);
      setSelectedId(response.data.id);
      setForm(emptyForm);
      setIsCreating(false);
    } catch {
      setFormError("Nao foi possivel salvar o fornecedor agora.");
    }
  }

  function copyText(value: string | null | undefined) {
    if (!value || typeof navigator === "undefined") return;
    void navigator.clipboard?.writeText(value);
  }

  return (
    <>
      <section className="metric-grid" aria-label="Indicadores de fornecedores">
        {metrics.map((metric) => (
          <article className={`metric-card ${metric.tone}`} key={metric.label}>
            <div>
              <h3>{metric.label}</h3>
              <strong>{metric.value}</strong>
              <span>{metric.detail}</span>
            </div>
          </article>
        ))}
      </section>

      <section className="leads-toolbar panel" aria-label="Filtros de fornecedores">
        <div>
          {filters.map((filter) => (
            <button className={activeFilter === filter ? "active" : ""} key={filter} onClick={() => setActiveFilter(filter)} type="button">
              {filter}
            </button>
          ))}
        </div>
        <button className="primary-action" disabled={!canManageServices} onClick={() => setIsCreating(true)} type="button">
          <Plus aria-hidden="true" size={17} />
          Novo fornecedor
        </button>
      </section>

      <section className="supplier-grid">
        <article className="panel supplier-list-panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Fornecedores</p>
              <h3>Fontes, grupos e prestadores</h3>
            </div>
            <KeyRound aria-hidden="true" size={20} />
          </div>

          <div className="supplier-list">
            {visibleProviders.map((provider) => {
              const Icon = providerIcon(provider);
              const active = selectedProvider.id === provider.id;
              return (
                <button
                  className={`supplier-card ${providerTone(provider)} ${active ? "active" : ""}`}
                  key={provider.id}
                  onClick={() => {
                    setSelectedId(provider.id);
                    setShowSecret(false);
                  }}
                  type="button"
                >
                  <Icon aria-hidden="true" size={20} />
                  <span>
                    <strong>{provider.name}</strong>
                    <em>{provider.serviceTypes.join(", ") || "Sem tipo"} | {statusLabels[provider.status]}</em>
                  </span>
                  <i>{orderCountByProvider[provider.id] ?? 0} OS</i>
                </button>
              );
            })}
          </div>
        </article>

        <aside className="panel supplier-access-panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Dados de acesso</p>
              <h3>{selectedProvider.name}</h3>
            </div>
            <SelectedIcon aria-hidden="true" size={20} />
          </div>

          <div className="supplier-detail-grid">
            <span>
              <em>Status</em>
              <strong>{statusLabels[selectedProvider.status]}</strong>
            </span>
            <span>
              <em>Contato</em>
              <strong>{selectedProvider.contactName ?? "Nao informado"}</strong>
            </span>
            <span>
              <em>Telefone</em>
              <strong>{selectedProvider.phone ?? "Nao informado"}</strong>
            </span>
            <span>
              <em>Consultas externas</em>
              <strong>{externalJobs.filter((job) => job.provider.toLowerCase().includes(selectedProvider.name.toLowerCase())).length || externalJobs.length}</strong>
            </span>
          </div>

          <div className="credential-box">
            <div>
              <em>Acesso / URL</em>
              <strong>{selectedProvider.accessUrl ?? "Nao cadastrado"}</strong>
            </div>
            <button aria-label="Copiar acesso" onClick={() => copyText(selectedProvider.accessUrl)} type="button">
              <Copy aria-hidden="true" size={15} />
            </button>
          </div>

          <div className="credential-box">
            <div>
              <em>Login</em>
              <strong>{selectedProvider.accessLogin ?? "Nao cadastrado"}</strong>
            </div>
            <button aria-label="Copiar login" onClick={() => copyText(selectedProvider.accessLogin)} type="button">
              <Copy aria-hidden="true" size={15} />
            </button>
          </div>

          <div className="credential-box sensitive">
            <div>
              <em>Segredo</em>
              <strong>{selectedProvider.hasSecret ? showSecret ? "Referencia segura cadastrada" : "**********" : "Nao cadastrado"}</strong>
            </div>
            <button aria-label={showSecret ? "Ocultar segredo" : "Mostrar referencia"} onClick={() => setShowSecret((current) => !current)} type="button">
              {showSecret ? <EyeOff aria-hidden="true" size={15} /> : <Eye aria-hidden="true" size={15} />}
            </button>
          </div>

          <div className={`automation-status ${status === "error" ? "warning" : "success"}`}>
            <ShieldCheck aria-hidden="true" size={18} />
            <span>{status === "error" ? "Dados parciais: algum endpoint ficou indisponivel." : "Credenciais aparecem sem expor senha em claro."}</span>
          </div>

          <ul className="blueprint-side-list supplier-rules">
            {sideRules.map((rule) => {
              const Icon = rule.icon;
              return (
                <li key={rule.label}>
                  <Icon aria-hidden="true" size={18} />
                  <div>
                    <strong>{rule.label}</strong>
                    <span>{rule.detail}</span>
                  </div>
                </li>
              );
            })}
          </ul>
        </aside>
      </section>

      {isCreating ? (
        <div className="lead-modal-backdrop" role="presentation">
          <form className="lead-modal" onSubmit={handleCreateProvider}>
            <header>
              <div>
                <p className="eyebrow">Novo fornecedor</p>
                <h3>Cadastrar prestador ou origem</h3>
              </div>
              <button aria-label="Fechar" onClick={() => setIsCreating(false)} type="button">
                <X aria-hidden="true" size={18} />
              </button>
            </header>
            <label>
              Nome
              <input onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} required value={form.name} />
            </label>
            <label>
              Tipos de servico
              <input onChange={(event) => setForm((current) => ({ ...current, serviceTypes: event.target.value }))} value={form.serviceTypes} />
            </label>
            <label>
              Contato
              <input onChange={(event) => setForm((current) => ({ ...current, contactName: event.target.value }))} value={form.contactName} />
            </label>
            <label>
              Telefone
              <input onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))} value={form.phone} />
            </label>
            <label>
              E-mail
              <input onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))} type="email" value={form.email} />
            </label>
            <label>
              URL de acesso
              <input onChange={(event) => setForm((current) => ({ ...current, accessUrl: event.target.value }))} value={form.accessUrl} />
            </label>
            <label>
              Login
              <input onChange={(event) => setForm((current) => ({ ...current, accessLogin: event.target.value }))} value={form.accessLogin} />
            </label>
            {formError ? <p className="lead-modal-error">{formError}</p> : null}
            <button className="primary-action" type="submit">Salvar fornecedor</button>
          </form>
        </div>
      ) : null}
    </>
  );
}
