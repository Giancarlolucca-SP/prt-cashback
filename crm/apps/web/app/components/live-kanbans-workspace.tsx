"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowRight, ClipboardList, RefreshCw, Sparkles } from "lucide-react";
import { apiGet } from "../auth/auth-client";
import { useAuth } from "../auth/auth-provider";

type LeadStatus = "NEW" | "CONTACTED" | "SCHEDULED" | "NEGOTIATION" | "WON" | "LOST" | "COLD";
type PurchaseStatus = "OPEN" | "EVALUATING" | "APPROVED" | "REJECTED" | "PURCHASED" | "CANCELLED";
type InventoryStatus = "IN_PREPARATION" | "AVAILABLE" | "RESERVED" | "SOLD" | "REPASSE" | "REMOVED";
type ServiceStatus = "OPEN" | "SCHEDULED" | "RUNNING" | "WAITING_PROVIDER" | "WAITING_INVOICE" | "DONE" | "CANCELLED";

type Lead = {
  id: string;
  source: string | null;
  title: string;
  status: LeadStatus;
  interest: string | null;
  temperature: number | null;
  createdAt: string;
  updatedAt: string;
};

type PurchaseLead = {
  id: string;
  source: string | null;
  status: PurchaseStatus;
  askingPrice: string | null;
  createdAt: string;
  updatedAt: string;
};

type InventoryItem = {
  id: string;
  askingPrice: string | null;
  status: InventoryStatus;
  vehicle: {
    brand: string;
    model: string;
    version: string | null;
    yearModel: number | null;
    plate: string | null;
  } | null;
};

type ServiceOrder = {
  id: string;
  type: string;
  status: ServiceStatus;
  totalAmount: string | null;
  vehicleId: string | null;
  createdAt: string;
  updatedAt: string;
};

type ListResponse<T> = {
  items: T[];
  page: number;
  pageSize: number;
  total?: number;
};

type BoardColumn = {
  cards: string[];
  count: number;
  name: string;
};

type Board = {
  accent: "amber" | "blue" | "rose" | "teal";
  columns: BoardColumn[];
  purpose: string;
  title: string;
};

const fallbackLeads: Lead[] = [
  {
    id: "fallback-lead-1",
    source: "WhatsApp",
    title: "Marina Souza",
    status: "NEW",
    interest: "Corolla XEI 2021",
    temperature: 92,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: "fallback-lead-2",
    source: "Marketplace",
    title: "Renata Alves",
    status: "NEGOTIATION",
    interest: "HR-V Touring",
    temperature: 76,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: "fallback-lead-3",
    source: "Site",
    title: "Carlos Mendes",
    status: "COLD",
    interest: "Tracker Premier",
    temperature: 54,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

const fallbackPurchases: PurchaseLead[] = [
  {
    id: "fallback-purchase-1",
    source: "Troca em venda",
    status: "OPEN",
    askingPrice: "72000.00",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: "fallback-purchase-2",
    source: "Fornecedor parceiro",
    status: "EVALUATING",
    askingPrice: "89000.00",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

const fallbackInventory: InventoryItem[] = [
  {
    id: "fallback-inventory-1",
    askingPrice: "118000.00",
    status: "IN_PREPARATION",
    vehicle: { brand: "Jeep", model: "Compass", plate: "ABC1D23", version: "Longitude", yearModel: 2021 },
  },
  {
    id: "fallback-inventory-2",
    askingPrice: "96000.00",
    status: "AVAILABLE",
    vehicle: { brand: "Toyota", model: "Corolla", plate: "XYZ4E56", version: "XEI", yearModel: 2020 },
  },
  {
    id: "fallback-inventory-3",
    askingPrice: "74000.00",
    status: "RESERVED",
    vehicle: { brand: "Chevrolet", model: "Onix", plate: null, version: "LTZ", yearModel: 2022 },
  },
];

const fallbackOrders: ServiceOrder[] = [
  {
    id: "fallback-order-1",
    type: "PPF + higienizacao",
    status: "RUNNING",
    totalAmount: "1800.00",
    vehicleId: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: "fallback-order-2",
    type: "Vistoria cautelar",
    status: "WAITING_PROVIDER",
    totalAmount: "420.00",
    vehicleId: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

const leadStatuses: LeadStatus[] = ["NEW", "CONTACTED", "SCHEDULED", "NEGOTIATION", "COLD", "WON", "LOST"];
const purchaseStatuses: PurchaseStatus[] = ["OPEN", "EVALUATING", "APPROVED", "REJECTED", "PURCHASED", "CANCELLED"];
const commonInventoryStatuses: InventoryStatus[] = ["IN_PREPARATION", "AVAILABLE", "RESERVED", "SOLD", "REMOVED"];
const serviceStatuses: ServiceStatus[] = ["OPEN", "SCHEDULED", "RUNNING", "WAITING_PROVIDER", "WAITING_INVOICE", "DONE", "CANCELLED"];

const leadLabels: Record<LeadStatus, string> = {
  COLD: "Esfriando",
  CONTACTED: "Contato feito",
  LOST: "Perdido",
  NEGOTIATION: "Negociacao",
  NEW: "Novo lead",
  SCHEDULED: "Agendado",
  WON: "Ganho",
};

const purchaseLabels: Record<PurchaseStatus, string> = {
  APPROVED: "Aprovacao gestor",
  CANCELLED: "Cancelado",
  EVALUATING: "Analise",
  OPEN: "Solicitada",
  PURCHASED: "Entrada estoque",
  REJECTED: "Recusado",
};

const inventoryLabels: Record<InventoryStatus, string> = {
  AVAILABLE: "Pronto venda",
  IN_PREPARATION: "Preparacao",
  REMOVED: "Removido",
  REPASSE: "Repasse",
  RESERVED: "Reservado",
  SOLD: "Vendido",
};

const serviceLabels: Record<ServiceStatus, string> = {
  CANCELLED: "Cancelada",
  DONE: "Concluida",
  OPEN: "OS aberta",
  RUNNING: "Em execucao",
  SCHEDULED: "Agendada",
  WAITING_INVOICE: "NF/anexo",
  WAITING_PROVIDER: "Prestador",
};

const currency = new Intl.NumberFormat("pt-BR", { currency: "BRL", maximumFractionDigits: 0, style: "currency" });

function money(value: string | null | undefined) {
  const amount = Number(value ?? 0);
  return amount > 0 ? currency.format(amount) : "A definir";
}

function vehicleLabel(item: InventoryItem) {
  if (!item.vehicle) return `Estoque ${item.id.slice(0, 8)}`;
  return [item.vehicle.brand, item.vehicle.model, item.vehicle.version, item.vehicle.yearModel].filter(Boolean).join(" ");
}

function makeColumns<T extends { status: string }>(
  statuses: string[],
  labels: Record<string, string>,
  items: T[],
  cardLabel: (item: T) => string,
) {
  return statuses.map((status) => {
    const statusItems = items.filter((item) => item.status === status);
    return {
      cards: statusItems.slice(0, 3).map(cardLabel),
      count: statusItems.length,
      name: labels[status] ?? status,
    };
  });
}

function fallbackFetch<T>(items: T[]) {
  return Promise.resolve({ items, page: 1, pageSize: items.length, total: items.length });
}

export function LiveKanbansWorkspace() {
  const { hasPermission, isLoading, token } = useAuth();
  const canReadLeads = hasPermission({ module: "leads", action: "read" });
  const canReadPurchases = hasPermission({ module: "purchases", action: "read" });
  const canReadInventory = hasPermission({ module: "inventory", action: "read" });
  const canManageServices = hasPermission({ module: "services", action: "manage" });
  const [leads, setLeads] = useState(fallbackLeads);
  const [purchases, setPurchases] = useState(fallbackPurchases);
  const [inventory, setInventory] = useState(fallbackInventory);
  const [orders, setOrders] = useState(fallbackOrders);
  const [status, setStatus] = useState<"error" | "idle" | "loading" | "ready">("idle");

  const loadBoards = useCallback(async () => {
    if (!token) return;

    setStatus("loading");

    const [leadResult, purchaseResult, inventoryResult, serviceResult] = await Promise.allSettled([
      canReadLeads ? apiGet<ListResponse<Lead>>("/leads?page=1&page_size=100", token) : fallbackFetch(fallbackLeads),
      canReadPurchases ? apiGet<ListResponse<PurchaseLead>>("/purchases/leads?page=1&page_size=100", token) : fallbackFetch(fallbackPurchases),
      canReadInventory ? apiGet<ListResponse<InventoryItem>>("/inventory?page=1&page_size=100", token) : fallbackFetch(fallbackInventory),
      canManageServices ? apiGet<ListResponse<ServiceOrder>>("/services/orders?page=1&page_size=100", token) : fallbackFetch(fallbackOrders),
    ]);

    if (leadResult.status === "fulfilled") setLeads(leadResult.value.items);
    if (purchaseResult.status === "fulfilled") setPurchases(purchaseResult.value.items);
    if (inventoryResult.status === "fulfilled") setInventory(inventoryResult.value.items);
    if (serviceResult.status === "fulfilled") setOrders(serviceResult.value.items);

    const hasFailure = [leadResult, purchaseResult, inventoryResult, serviceResult].some((result) => result.status === "rejected");
    setStatus(hasFailure ? "error" : "ready");
  }, [canManageServices, canReadInventory, canReadLeads, canReadPurchases, token]);

  useEffect(() => {
    if (!isLoading) {
      void loadBoards();
    }
  }, [isLoading, loadBoards]);

  const commonInventory = useMemo(() => inventory.filter((item) => item.status !== "REPASSE"), [inventory]);

  const boards = useMemo<Board[]>(() => [
    {
      accent: "teal",
      columns: makeColumns(leadStatuses, leadLabels, leads, (lead) => `${lead.title} - ${lead.interest ?? lead.source ?? "sem origem"}`),
      purpose: "Captacao, atendimento e priorizacao comercial.",
      title: "Leads",
    },
    {
      accent: "amber",
      columns: makeColumns(purchaseStatuses, purchaseLabels, purchases, (purchase) => `${purchase.source ?? "Origem nao informada"} - ${money(purchase.askingPrice)}`),
      purpose: "Entrada de veiculo, avaliacao e aprovacao antes de proposta.",
      title: "Avaliacao / Compra",
    },
    {
      accent: "blue",
      columns: makeColumns(commonInventoryStatuses, inventoryLabels, commonInventory, (item) => `${vehicleLabel(item)} - ${money(item.askingPrice)}`),
      purpose: "Transformar veiculo em item pronto para venda e anuncio.",
      title: "Estoque / Preparacao",
    },
    {
      accent: "rose",
      columns: makeColumns(serviceStatuses, serviceLabels, orders, (order) => `${order.type} - ${money(order.totalAmount)}`),
      purpose: "Controlar execucao, prestadores, anexos, NF e checklist final.",
      title: "Servicos / OS",
    },
  ], [commonInventory, leads, orders, purchases]);

  const metrics = useMemo(() => {
    const activeCards =
      leads.filter((lead) => lead.status !== "WON" && lead.status !== "LOST").length +
      purchases.filter((purchase) => !["CANCELLED", "PURCHASED", "REJECTED"].includes(purchase.status)).length +
      commonInventory.filter((item) => item.status !== "REMOVED" && item.status !== "SOLD").length +
      orders.filter((order) => order.status !== "CANCELLED" && order.status !== "DONE").length;

    const bottlenecks =
      leads.filter((lead) => lead.status === "COLD").length +
      commonInventory.filter((item) => item.status === "IN_PREPARATION").length +
      orders.filter((order) => order.status === "WAITING_INVOICE" || order.status === "WAITING_PROVIDER").length;

    const completed =
      leads.filter((lead) => lead.status === "WON").length +
      purchases.filter((purchase) => purchase.status === "PURCHASED").length +
      commonInventory.filter((item) => item.status === "AVAILABLE").length +
      orders.filter((order) => order.status === "DONE").length;

    const columnCount = boards.reduce((total, board) => total + board.columns.length, 0);

    return [
      { label: "Fluxos conectados", value: String(boards.length), detail: "leads, compra, estoque e OS", tone: "teal" },
      { label: "Cards ativos", value: String(activeCards), detail: "itens ainda em movimento", tone: "blue" },
      { label: "Gargalos", value: String(bottlenecks), detail: "risco, preparo ou espera", tone: "amber" },
      { label: "Colunas vivas", value: String(columnCount), detail: `${completed} concluidos/prontos`, tone: "rose" },
    ];
  }, [boards, commonInventory, leads, orders, purchases]);

  const statusText = status === "loading" ? "Atualizando dados" : status === "error" ? "Parcial com fallback" : "Dados conectados";

  return (
    <>
      <section className="metric-grid" aria-label="Indicadores dos kanbans">
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

      <section className="kanban-map" aria-label="Kanbans operacionais">
        {boards.map((board) => (
          <article className={`macro-board ${board.accent}`} key={board.title}>
            <div className="section-heading">
              <div>
                <p className="eyebrow">{board.title}</p>
                <h3>{board.purpose}</h3>
              </div>
              <ClipboardList aria-hidden="true" size={20} />
            </div>

            <div className="macro-columns">
              {board.columns.map((column, index) => (
                <section className="macro-column" key={`${board.title}-${column.name}`}>
                  <header>
                    <strong>{column.name}</strong>
                    <span>{column.count}</span>
                  </header>
                  <div>
                    {column.cards.length > 0 ? column.cards.map((card, cardIndex) => <p key={`${board.title}-${column.name}-${cardIndex}-${card}`}>{card}</p>) : <p>Sem cards agora</p>}
                  </div>
                  {index < board.columns.length - 1 ? <ArrowRight aria-hidden="true" size={15} /> : null}
                </section>
              ))}
            </div>
          </article>
        ))}
      </section>

      <section className="kanban-notes-grid">
        <article className="panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Regras macro</p>
              <h3>O que a operacao ja consegue observar</h3>
            </div>
            <Sparkles aria-hidden="true" size={20} />
          </div>
          <ul className="macro-note-list">
            <li>Cada coluna reflete status reais dos modulos conectados.</li>
            <li>Permissoes controlam quais fluxos sao buscados da API.</li>
            <li>Gargalos destacam leads frios, preparo e OS esperando terceiros ou NF.</li>
            <li>Drag-and-drop pode entrar depois com endpoints especificos de transicao.</li>
          </ul>
        </article>

        <article className="panel kanban-warning">
          <AlertTriangle aria-hidden="true" size={22} />
          <div>
            <strong>{statusText}</strong>
            <span>
              Esta visao consolida dados operacionais. Se algum modulo falhar ou estiver bloqueado por permissao,
              a tela preserva um fallback para manter o mapa legivel.
            </span>
          </div>
          <button className="primary-action" disabled={status === "loading"} onClick={() => void loadBoards()} type="button">
            <RefreshCw aria-hidden="true" size={17} />
            Atualizar
          </button>
        </article>
      </section>
    </>
  );
}
