"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { CalendarClock, CarFront, CheckCircle2, Clock, FileText, Image, Megaphone, Plus, Repeat2, Send, ShieldCheck, WalletCards, X } from "lucide-react";
import { apiGet, apiPatch, apiPost } from "../auth/auth-client";
import { useAuth } from "../auth/auth-provider";

type RepasseStatus = "DRAFT" | "READY" | "SENT" | "INTEREST" | "SOLD" | "REVENUE_RECOGNIZED" | "CANCELLED";

type RepasseProcess = {
  id: string;
  vehicleId: string;
  status: string;
  price: string | null;
  channelPlan: unknown;
  createdAt: string;
  updatedAt: string;
};

type InventoryOption = {
  id: string;
  askingPrice: string | null;
  status: string;
  vehicleId: string;
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

type RepasseFormState = {
  channels: string[];
  message: string;
  price: string;
  status: RepasseStatus;
  vehicleId: string;
};

type RevenueFormState = {
  amount: string;
  note: string;
};

const emptyForm: RepasseFormState = {
  channels: ["Site loja", "Lista Repasse SP"],
  message: "",
  price: "",
  status: "DRAFT",
  vehicleId: "",
};

const emptyRevenueForm: RevenueFormState = {
  amount: "",
  note: "",
};

const fallbackProcesses: RepasseProcess[] = [
  {
    id: "fallback-1",
    vehicleId: "vehicle-demo-1",
    status: "SENT",
    price: "38000.00",
    channelPlan: { channels: ["Lista Repasse SP", "Instagram loja"], message: "Repasse rapido para lojista parceiro." },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

const filters: Array<{ label: string; status?: RepasseStatus }> = [
  { label: "Todos" },
  { label: "Rascunhos", status: "DRAFT" },
  { label: "A anunciar", status: "READY" },
  { label: "Enviados", status: "SENT" },
  { label: "Interesse", status: "INTEREST" },
  { label: "Vendidos", status: "SOLD" },
  { label: "Receita", status: "REVENUE_RECOGNIZED" },
  { label: "Cancelados", status: "CANCELLED" },
];

const statusLabels: Record<RepasseStatus, string> = {
  CANCELLED: "Cancelado",
  DRAFT: "Rascunho",
  INTEREST: "Interesse",
  READY: "A anunciar",
  REVENUE_RECOGNIZED: "Receita reconhecida",
  SENT: "Enviado",
  SOLD: "Vendido",
};

const initialRepasseStatuses: RepasseStatus[] = ["DRAFT", "READY", "SENT", "INTEREST", "SOLD"];
const terminalRepasseStatuses = new Set(["CANCELLED", "REVENUE_RECOGNIZED"]);
const channelOptions = ["Site loja", "Lista Repasse SP", "Grupo Lojistas Premium", "Compradores SUV Campinas", "Lista Interior", "Instagram loja"];
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

function channelsFrom(plan: unknown) {
  if (!plan || typeof plan !== "object" || !("channels" in plan)) return [];
  const channels = (plan as { channels?: unknown }).channels;
  return Array.isArray(channels) ? channels.filter((item): item is string => typeof item === "string") : [];
}

function messageFrom(plan: unknown) {
  if (!plan || typeof plan !== "object" || !("message" in plan)) return "";
  const message = (plan as { message?: unknown }).message;
  return typeof message === "string" ? message : "";
}

function isTerminalRepasse(status: string) {
  return terminalRepasseStatuses.has(status);
}

export function LiveRepasseWorkspace() {
  const { hasPermission, token } = useAuth();
  const canManageRepasse = hasPermission({ module: "repasse", action: "manage" });
  const canReadInventory = hasPermission({ module: "inventory", action: "read" });
  const [activeFilter, setActiveFilter] = useState(filters[0]);
  const [form, setForm] = useState(emptyForm);
  const [inventory, setInventory] = useState<InventoryOption[]>([]);
  const [inventoryStatus, setInventoryStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [modalOpen, setModalOpen] = useState(false);
  const [movingId, setMovingId] = useState<string | null>(null);
  const [processes, setProcesses] = useState(fallbackProcesses);
  const [refreshKey, setRefreshKey] = useState(0);
  const [revenueForm, setRevenueForm] = useState(emptyRevenueForm);
  const [revenueProcess, setRevenueProcess] = useState<RepasseProcess | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<"fallback" | "loading" | "live" | "error" | "locked">("fallback");

  useEffect(() => {
    if (!token) return;
    if (!canManageRepasse) {
      setStatus("locked");
      return;
    }

    let isCurrent = true;
    const query = new URLSearchParams({ page: "1", page_size: "50" });
    if (activeFilter.status) query.set("status", activeFilter.status);

    setStatus("loading");
    apiGet<ListResponse<RepasseProcess>>(`/repasse?${query.toString()}`, token)
      .then((list) => {
        if (!isCurrent) return;
        setProcesses(list.items);
        setStatus("live");
      })
      .catch(() => {
        if (isCurrent) setStatus("error");
      });

    return () => {
      isCurrent = false;
    };
  }, [activeFilter, canManageRepasse, refreshKey, token]);

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

  function toggleChannel(channel: string) {
    setForm((current) => ({
      ...current,
      channels: current.channels.includes(channel) ? current.channels.filter((item) => item !== channel) : [...current.channels, channel],
    }));
  }

  function selectVehicle(vehicleId: string) {
    const selected = inventory.find((item) => item.vehicleId === vehicleId);
    setForm((current) => ({
      ...current,
      price: selected?.askingPrice ? String(Number(selected.askingPrice)) : current.price,
      vehicleId,
    }));
  }

  async function createProcess(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || !canManageRepasse || saving) return;

    setSaving(true);
    setSaveError(null);
    try {
      const response = await apiPost<{ data: RepasseProcess }>("/repasse", token, {
        channelPlan: { channels: form.channels, message: form.message.trim() || undefined },
        price: form.price ? Number(form.price) : undefined,
        status: form.status,
        vehicleId: form.vehicleId,
      });
      setProcesses((current) => [response.data, ...current.filter((item) => item.id !== response.data.id)]);
      setForm(emptyForm);
      setModalOpen(false);
      setRefreshKey((current) => current + 1);
    } catch {
      setSaveError("Nao foi possivel criar o repasse. Confira veiculo, preco e canais.");
    } finally {
      setSaving(false);
    }
  }

  async function updateProcess(process: RepasseProcess, patch: { status?: RepasseStatus; price?: number | null; channelPlan?: unknown }) {
    if (!token || !canManageRepasse || movingId || isTerminalRepasse(process.status)) return;

    const previous = process;
    setMovingId(process.id);
    setProcesses((current) => current.map((item) => (item.id === process.id ? { ...item, ...patch, price: patch.price === undefined ? item.price : patch.price === null ? null : String(patch.price) } : item)));

    try {
      const response = await apiPatch<{ data: RepasseProcess }>(`/repasse/${process.id}`, token, patch);
      setProcesses((current) => current.map((item) => (item.id === process.id ? response.data : item)));
      setRefreshKey((current) => current + 1);
    } catch {
      setProcesses((current) => current.map((item) => (item.id === process.id ? previous : item)));
      setStatus("error");
    } finally {
      setMovingId(null);
    }
  }

  async function recognizeRevenue(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || !canManageRepasse || !revenueProcess || saving) return;

    setSaving(true);
    setSaveError(null);
    try {
      await apiPost<{ data: { id: string } }>(`/repasse/${revenueProcess.id}/revenues`, token, {
        amount: Number(revenueForm.amount),
        snapshot: { note: revenueForm.note.trim() || undefined },
      });
      setProcesses((current) => current.map((item) => (item.id === revenueProcess.id ? { ...item, status: "REVENUE_RECOGNIZED" } : item)));
      setRevenueForm(emptyRevenueForm);
      setRevenueProcess(null);
      setRefreshKey((current) => current + 1);
    } catch {
      setSaveError("Nao foi possivel reconhecer a receita de repasse.");
    } finally {
      setSaving(false);
    }
  }

  const view = useMemo(() => {
    const active = processes.filter((item) => !isTerminalRepasse(item.status)).length;
    const cancelled = processes.filter((item) => item.status === "CANCELLED").length;
    const ready = processes.filter((item) => item.status === "READY" || item.status === "DRAFT").length;
    const sent = processes.filter((item) => item.status === "SENT").length;
    const interest = processes.filter((item) => item.status === "INTEREST").length;
    const revenue = processes.filter((item) => item.status === "REVENUE_RECOGNIZED").reduce((sum, item) => sum + Number(item.price ?? 0), 0);

    return {
      metrics: [
        { detail: `${cancelled} cancelados no historico`, label: "Repasses ativos", tone: "teal", value: String(active) },
        { detail: "rascunho ou pronto", label: "A anunciar", tone: "blue", value: String(ready) },
        { detail: "listas e grupos", label: "Enviados", tone: "amber", value: String(sent) },
        { detail: `${money(String(revenue))} em preco base`, label: "Receita", tone: "rose", value: String(interest) },
      ],
      selected: processes[0],
    };
  }, [processes]);

  const selectedChannels = view.selected ? channelsFrom(view.selected.channelPlan) : [];
  const selectedMessage = view.selected ? messageFrom(view.selected.channelPlan) : "";
  const selectedVehicle = inventory.find((item) => item.vehicleId === view.selected?.vehicleId);
  const statusLabel = {
    error: "Usando fallback",
    fallback: "Fallback visual",
    live: "Dados reais",
    loading: "Sincronizando",
    locked: "Sem permissao",
  }[status];

  return (
    <>
      <section className="metric-grid" aria-label="Indicadores de repasse">
        {view.metrics.map((metric) => (
          <article className={`metric-card ${metric.tone}`} key={metric.label}>
            <div><h3>{metric.label}</h3><strong>{metric.value}</strong><span>{metric.detail}</span></div>
          </article>
        ))}
      </section>

      <section className="leads-toolbar panel" aria-label="Filtros de repasse">
        <div>
          {filters.map((filter) => (
            <button className={filter.label === activeFilter.label ? "active" : ""} key={filter.label} onClick={() => setActiveFilter(filter)} type="button">
              {filter.label}
            </button>
          ))}
        </div>
        <button className="primary-action" disabled={!canManageRepasse} onClick={() => { setSaveError(null); setModalOpen(true); }} type="button">
          <Plus aria-hidden="true" size={16} />
          Criar anuncio
        </button>
      </section>

      {modalOpen ? (
        <div className="dre-modal-backdrop" role="dialog" aria-modal="true" aria-label="Criar repasse">
          <section className="dre-modal lead-modal">
            <header className="dre-modal-header">
              <div><p className="eyebrow">Repasse</p><h3>Novo anuncio</h3></div>
              <button aria-label="Fechar repasse" className="icon-button" onClick={() => setModalOpen(false)} type="button"><X aria-hidden="true" size={18} /></button>
            </header>
            <form className="lead-modal-form" onSubmit={createProcess}>
              <label className="lead-modal-wide">
                Veiculo
                <select disabled={!canReadInventory || inventoryStatus === "loading"} onChange={(event) => selectVehicle(event.target.value)} required value={form.vehicleId}>
                  <option value="">Selecione um veiculo</option>
                  {inventory.map((item) => <option key={item.id} value={item.vehicleId}>{vehicleLabel(item)} - {money(item.askingPrice)}</option>)}
                </select>
              </label>
              {!canReadInventory ? <p className="lead-modal-error">Sem permissao para listar estoque.</p> : null}
              {inventoryStatus === "error" ? <p className="lead-modal-error">Nao foi possivel carregar estoque.</p> : null}
              <label>Preco<input min="0" type="number" value={form.price} onChange={(event) => setForm((current) => ({ ...current, price: event.target.value }))} /></label>
              <label>Status<select value={form.status} onChange={(event) => setForm((current) => ({ ...current, status: event.target.value as RepasseStatus }))}>{initialRepasseStatuses.map((item) => <option key={item} value={item}>{statusLabels[item]}</option>)}</select></label>
              <label className="lead-modal-wide">Mensagem base<textarea maxLength={400} value={form.message} onChange={(event) => setForm((current) => ({ ...current, message: event.target.value }))} /></label>
              <div className="lead-modal-wide repasse-target-grid">
                {channelOptions.map((channel) => (
                  <button className={`repasse-target-card ${form.channels.includes(channel) ? "selected" : ""}`} key={channel} onClick={() => toggleChannel(channel)} type="button">
                    <Send aria-hidden="true" size={18} />
                    <span><strong>{channel}</strong><em>{form.channels.includes(channel) ? "selecionado" : "disponivel"}</em></span>
                    {form.channels.includes(channel) ? <CheckCircle2 aria-label="Selecionado" size={17} /> : <span className="fake-check" />}
                  </button>
                ))}
              </div>
              {saveError ? <p className="lead-modal-error">{saveError}</p> : null}
              <div className="lead-modal-actions">
                <button className="text-button" onClick={() => setModalOpen(false)} type="button">Cancelar</button>
                <button className="primary-action" disabled={saving || !form.vehicleId} type="submit">{saving ? "Salvando..." : "Criar repasse"}</button>
              </div>
            </form>
          </section>
        </div>
      ) : null}

      {revenueProcess ? (
        <div className="dre-modal-backdrop" role="dialog" aria-modal="true" aria-label="Reconhecer receita">
          <section className="dre-modal lead-modal">
            <header className="dre-modal-header">
              <div><p className="eyebrow">Receita</p><h3>Repasse {revenueProcess.id.slice(0, 8)}</h3></div>
              <button aria-label="Fechar receita" className="icon-button" onClick={() => setRevenueProcess(null)} type="button"><X aria-hidden="true" size={18} /></button>
            </header>
            <form className="lead-modal-form" onSubmit={recognizeRevenue}>
              <label>Valor<input autoFocus min="0.01" required step="0.01" type="number" value={revenueForm.amount} onChange={(event) => setRevenueForm((current) => ({ ...current, amount: event.target.value }))} /></label>
              <label className="lead-modal-wide">Observacao<input maxLength={300} value={revenueForm.note} onChange={(event) => setRevenueForm((current) => ({ ...current, note: event.target.value }))} /></label>
              {saveError ? <p className="lead-modal-error">{saveError}</p> : null}
              <div className="lead-modal-actions">
                <button className="text-button" onClick={() => setRevenueProcess(null)} type="button">Cancelar</button>
                <button className="primary-action" disabled={saving || Number(revenueForm.amount) <= 0} type="submit">{saving ? "Salvando..." : "Reconhecer receita"}</button>
              </div>
            </form>
          </section>
        </div>
      ) : null}

      <section className="repasse-grid">
        <article className="panel repasse-builder">
          <div className="section-heading">
            <div><p className="eyebrow">Anuncio</p><h3>Processos de repasse</h3></div>
            <span className="live-pill">{statusLabel}</span>
          </div>

          <div className="blueprint-list">
            {processes.map((process) => {
              const isTerminal = isTerminalRepasse(process.status);
              return (
                <article className="blueprint-row" key={process.id}>
                  <div className="blueprint-main"><CarFront aria-hidden="true" /><div><strong>Repasse {process.id.slice(0, 8)}</strong><span>{process.vehicleId.slice(0, 8)} | {channelsFrom(process.channelPlan).join(", ") || "sem canais"}</span></div></div>
                  <div className="blueprint-tags">
                    <span>{statusLabels[process.status as RepasseStatus] ?? process.status}</span>
                    <select className="kanban-stage-select" disabled={isTerminal || movingId === process.id} onChange={(event) => void updateProcess(process, { status: event.target.value as RepasseStatus })} value={process.status}>
                      {(Object.keys(statusLabels) as RepasseStatus[]).map((item) => <option key={item} value={item}>{statusLabels[item]}</option>)}
                    </select>
                  </div>
                  <div className="blueprint-value">
                    <strong>{money(process.price)}</strong>
                    <button className="text-button" disabled={isTerminal || movingId === process.id} onClick={() => void updateProcess(process, { status: "SENT" })} type="button">Enviar</button>
                    <button className="text-button" disabled={isTerminal || movingId === process.id} onClick={() => { setRevenueProcess(process); setRevenueForm({ amount: process.price ? String(Number(process.price)) : "", note: "" }); setSaveError(null); }} type="button">Receita</button>
                  </div>
                </article>
              );
            })}
          </div>

          <div className="repasse-send-row">
            <button className="primary-action" disabled={!view.selected || isTerminalRepasse(view.selected.status)} onClick={() => view.selected ? void updateProcess(view.selected, { status: "SENT" }) : undefined} type="button">
              <Send aria-hidden="true" size={16} />
              Revisar e disparar
            </button>
            <button className="text-button" disabled={!view.selected || isTerminalRepasse(view.selected.status)} onClick={() => view.selected ? void updateProcess(view.selected, { status: "READY" }) : undefined} type="button">
              <CalendarClock aria-hidden="true" size={16} />
              Marcar pronto
            </button>
          </div>
        </article>

        <aside className="panel repasse-preview">
          <div className="section-heading"><div><p className="eyebrow">Preview</p><h3>Como o comprador vera</h3></div><Image aria-hidden="true" size={20} /></div>
          <article className="repasse-ad-card">
            <div className="repasse-ad-image"><CarFront aria-hidden="true" size={42} /></div>
            <div className="repasse-ad-body">
              <strong>{selectedVehicle ? vehicleLabel(selectedVehicle).replace(" | ", " ") : view.selected ? `Repasse ${view.selected.id.slice(0, 8)}` : "Nenhum repasse selecionado"}</strong>
              <span>Repasse lojista | Canais: {selectedChannels.join(", ") || "a definir"}</span>
              <p>{selectedMessage || "Texto editavel antes de enviar para listas, grupos ou Instagram."}</p>
              <div><em>{money(view.selected?.price)}</em><i>GT3 Veiculos</i></div>
            </div>
          </article>
          <ul className="blueprint-side-list repasse-safeguards">
            <li><ShieldCheck aria-hidden="true" size={18} /><div><strong>Revisao humana</strong><span>Nenhum disparo em massa deve sair sem aprovacao do responsavel.</span></div></li>
            <li><FileText aria-hidden="true" size={18} /><div><strong>Texto padrao</strong><span>O plano salva canais e mensagem base por processo.</span></div></li>
            <li><WalletCards aria-hidden="true" size={18} /><div><strong>Financeiro</strong><span>Receita reconhecida alimenta o historico de repasse.</span></div></li>
            <li><Clock aria-hidden="true" size={18} /><div><strong>Historico</strong><span>Status, receita e usuario ficam auditados no backend.</span></div></li>
          </ul>
        </aside>
      </section>

      <section className="panel repasse-history-panel">
        <div className="section-heading"><div><p className="eyebrow">Historico</p><h3>Envios e publicacoes recentes</h3></div><Repeat2 aria-hidden="true" size={20} /></div>
        <div className="repasse-history-list">
          {processes.slice(0, 6).map((process) => (
            <article className="repasse-history-card" key={process.id}>
              <Megaphone aria-hidden="true" size={18} />
              <div><strong>Repasse {process.id.slice(0, 8)}</strong><span>{channelsFrom(process.channelPlan).join(", ") || "sem canais"} | {messageFrom(process.channelPlan) || "mensagem nao informada"}</span></div>
              <em>{statusLabels[process.status as RepasseStatus] ?? process.status}</em>
              <small>{new Date(process.updatedAt).toLocaleDateString("pt-BR")}</small>
            </article>
          ))}
        </div>
      </section>
    </>
  );
}
