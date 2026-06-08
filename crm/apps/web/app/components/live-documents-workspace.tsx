"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { CheckCircle2, FileSignature, FileText, LockKeyhole, Paperclip, Plus, ShieldCheck, X } from "lucide-react";
import { apiGet, apiPost } from "../auth/auth-client";
import { useAuth } from "../auth/auth-provider";

type ContractStatus = "GENERATED" | "PENDING_SIGNATURE" | "SIGNED" | "CANCELLED";

type Contract = {
  id: string;
  saleId: string;
  templateId: string | null;
  version: number;
  status: string;
  snapshot: {
    customer?: { name?: string | null; document?: string | null } | null;
    vehicle?: { brand?: string | null; model?: string | null; plate?: string | null; version?: string | null } | null;
    sale?: { salePrice?: string | null; status?: string | null; type?: string | null } | null;
  } | null;
  generatedAt: string;
  signedAt: string | null;
};

type SaleOption = {
  id: string;
  salePrice: string | null;
  grossMargin: string | null;
  status: string;
  createdAt: string;
};

type ListResponse<T> = {
  items: T[];
  page: number;
  pageSize: number;
  total?: number;
};

type ContractFormState = {
  note: string;
  saleId: string;
  status: ContractStatus;
};

type DocumentAction = "contract" | "warranty" | "delivery";

const emptyForm: ContractFormState = {
  note: "",
  saleId: "",
  status: "GENERATED",
};

const fallbackContracts: Contract[] = [
  {
    id: "fallback-1",
    saleId: "venda-demo-1",
    templateId: null,
    version: 1,
    status: "GENERATED",
    snapshot: {
      customer: { name: "Cliente demonstracao" },
      sale: { salePrice: "128900.00", status: "DOCUMENTATION", type: "VEHICLE" },
      vehicle: { brand: "Toyota", model: "Corolla", plate: "GT3-2026" },
    },
    generatedAt: new Date().toISOString(),
    signedAt: null,
  },
];

const filters: Array<{ label: string; status?: ContractStatus }> = [
  { label: "Todos" },
  { label: "Gerados", status: "GENERATED" },
  { label: "Assinatura", status: "PENDING_SIGNATURE" },
  { label: "Assinados", status: "SIGNED" },
  { label: "Cancelados", status: "CANCELLED" },
];

const statusLabels: Record<string, string> = {
  CANCELLED: "Cancelado",
  GENERATED: "Gerado",
  PENDING_SIGNATURE: "Assinatura",
  SIGNED: "Assinado",
};

const rules = [
  { detail: "Contrato nasce do snapshot da venda, cliente e veiculo no momento da geracao.", icon: FileText, label: "Snapshot" },
  { detail: "Assinatura grava data, auditoria e evento interno para automacoes.", icon: FileSignature, label: "Assinatura" },
  { detail: "Documentos usam permissao sensivel de area administrativa.", icon: ShieldCheck, label: "Permissao" },
  { detail: "Liberacao operacional pode depender de contrato assinado e dossie completo.", icon: LockKeyhole, label: "Bloqueios" },
];

const currency = new Intl.NumberFormat("pt-BR", { currency: "BRL", maximumFractionDigits: 0, style: "currency" });

function money(value: string | null | undefined) {
  const amount = Number(value ?? 0);
  return amount > 0 ? currency.format(amount) : "A definir";
}

function contractTitle(contract: Contract) {
  const vehicle = contract.snapshot?.vehicle;
  const customer = contract.snapshot?.customer?.name;
  const vehicleName = [vehicle?.brand, vehicle?.model, vehicle?.version].filter(Boolean).join(" ");
  return vehicleName || customer || `Contrato ${contract.id.slice(0, 8)}`;
}

function contractMeta(contract: Contract) {
  const plate = contract.snapshot?.vehicle?.plate;
  const customer = contract.snapshot?.customer?.name;
  return [customer, plate ? `Placa ${plate}` : null, `v${contract.version}`].filter(Boolean).join(" | ");
}

export function LiveDocumentsWorkspace() {
  const { hasPermission, token } = useAuth();
  const canManageDocuments = hasPermission({ module: "documents", action: "manage" });
  const canReadSales = hasPermission({ module: "sales", action: "read" });
  const [activeFilter, setActiveFilter] = useState(filters[0]);
  const [documentAction, setDocumentAction] = useState<DocumentAction>("contract");
  const [contracts, setContracts] = useState(fallbackContracts);
  const [form, setForm] = useState(emptyForm);
  const [modalOpen, setModalOpen] = useState(false);
  const [movingId, setMovingId] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [sales, setSales] = useState<SaleOption[]>([]);
  const [salesStatus, setSalesStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<"fallback" | "loading" | "live" | "error" | "locked">("fallback");

  useEffect(() => {
    if (!token) return;
    if (!canManageDocuments) {
      setStatus("locked");
      return;
    }

    let isCurrent = true;
    const query = new URLSearchParams({ page: "1", page_size: "50" });
    if (activeFilter.status) query.set("status", activeFilter.status);

    setStatus("loading");
    apiGet<ListResponse<Contract>>(`/contracts?${query.toString()}`, token)
      .then((list) => {
        if (!isCurrent) return;
        setContracts(list.items);
        setStatus("live");
      })
      .catch(() => {
        if (isCurrent) setStatus("error");
      });

    return () => {
      isCurrent = false;
    };
  }, [activeFilter, canManageDocuments, refreshKey, token]);

  useEffect(() => {
    if (!modalOpen || !token || !canReadSales) return;

    let isCurrent = true;
    setSalesStatus("loading");
    apiGet<ListResponse<SaleOption>>("/sales?page=1&page_size=100", token)
      .then((list) => {
        if (!isCurrent) return;
        setSales(list.items.filter((sale) => sale.status !== "CANCELLED"));
        setSalesStatus("ready");
      })
      .catch(() => {
        if (isCurrent) setSalesStatus("error");
      });

    return () => {
      isCurrent = false;
    };
  }, [canReadSales, modalOpen, token]);

  async function generateContract(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || !canManageDocuments || saving) return;

    setSaving(true);
    setSaveError(null);
    try {
      if (documentAction === "warranty") {
        await apiPost<{ data: { id: string } }>("/contracts/warranty-terms", token, {
          saleId: form.saleId,
          terms: {
            coverage: "Garantia legal conforme condicoes comerciais registradas.",
            note: form.note.trim() || undefined,
          },
        });
        setForm(emptyForm);
        setModalOpen(false);
        return;
      }

      if (documentAction === "delivery") {
        await apiPost<{ data: { id: string } }>("/contracts/delivery-checklists", token, {
          checklist: {
            accessories: true,
            documents: true,
            inspection: true,
            note: form.note.trim() || undefined,
          },
          saleId: form.saleId,
          status: "PENDING",
        });
        setForm(emptyForm);
        setModalOpen(false);
        return;
      }

      const response = await apiPost<{ data: Contract }>("/contracts/generate", token, {
        saleId: form.saleId,
        snapshot: form.note.trim() ? { note: form.note.trim() } : undefined,
        status: form.status,
      });

      setContracts((current) => [response.data, ...current.filter((contract) => contract.id !== response.data.id)]);
      setForm(emptyForm);
      setModalOpen(false);
      setRefreshKey((current) => current + 1);
    } catch {
      setSaveError("Nao foi possivel gerar o contrato. Confira a venda selecionada.");
    } finally {
      setSaving(false);
    }
  }

  async function signContract(contract: Contract) {
    if (!token || !canManageDocuments || movingId || contract.status === "SIGNED") return;

    const previous = contract;
    setMovingId(contract.id);
    setContracts((current) =>
      current.map((item) => (item.id === contract.id ? { ...item, signedAt: new Date().toISOString(), status: "SIGNED" } : item)),
    );

    try {
      const response = await apiPost<{ data: Contract }>(`/contracts/${contract.id}/sign`, token, {
        reason: "Assinado pela central de documentos",
      });
      setContracts((current) => current.map((item) => (item.id === contract.id ? response.data : item)));
      setRefreshKey((current) => current + 1);
    } catch {
      setContracts((current) => current.map((item) => (item.id === contract.id ? previous : item)));
      setStatus("error");
    } finally {
      setMovingId(null);
    }
  }

  function saleLabel(sale: SaleOption) {
    return `Venda ${sale.id.slice(0, 8)} | ${sale.status} | ${money(sale.salePrice)}`;
  }

  const view = useMemo(() => {
    const signed = contracts.filter((contract) => contract.status === "SIGNED").length;
    const generated = contracts.filter((contract) => contract.status === "GENERATED").length;
    const pending = contracts.filter((contract) => contract.status !== "SIGNED" && contract.status !== "CANCELLED").length;
    const blocked = contracts.filter((contract) => contract.status === "CANCELLED").length;

    return {
      metrics: [
        { detail: "contratos e termos", label: "Dossies ativos", tone: "teal", value: String(contracts.length) },
        { detail: "aguardando assinatura", label: "Pendencias", tone: "amber", value: String(pending) },
        { detail: "contratos assinados", label: "Assinaturas", tone: "blue", value: String(signed) },
        { detail: "cancelados ou travados", label: "Bloqueios", tone: "rose", value: String(blocked) },
      ],
      stageCards: [
        { cards: contracts.filter((contract) => contract.status === "GENERATED"), title: "Gerados", total: generated },
        { cards: contracts.filter((contract) => contract.status === "PENDING_SIGNATURE"), title: "Assinatura", total: contracts.filter((contract) => contract.status === "PENDING_SIGNATURE").length },
        { cards: contracts.filter((contract) => contract.status === "SIGNED"), title: "Assinados", total: signed },
      ],
    };
  }, [contracts]);

  const statusLabel = {
    error: "Usando fallback",
    fallback: "Fallback visual",
    live: "Dados reais",
    loading: "Sincronizando",
    locked: "Sem permissao",
  }[status];

  return (
    <>
      <section className="metric-grid" aria-label="Indicadores documentais">
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

      <section className="leads-toolbar panel" aria-label="Filtros de documentos">
        <div>
          {filters.map((filter) => (
            <button className={filter.label === activeFilter.label ? "active" : ""} key={filter.label} onClick={() => setActiveFilter(filter)} type="button">
              {filter.label}
            </button>
          ))}
        </div>
        <button className="primary-action" disabled={!canManageDocuments} onClick={() => { setSaveError(null); setModalOpen(true); }} type="button">
          <Plus aria-hidden="true" size={17} />
          Novo documento
        </button>
      </section>

      {modalOpen ? (
        <div className="dre-modal-backdrop" role="dialog" aria-modal="true" aria-label="Gerar documento">
          <section className="dre-modal lead-modal">
            <header className="dre-modal-header">
              <div>
                <p className="eyebrow">Documentos</p>
                <h3>Novo documento</h3>
              </div>
              <button aria-label="Fechar novo contrato" className="icon-button" onClick={() => setModalOpen(false)} type="button">
                <X aria-hidden="true" size={18} />
              </button>
            </header>

            <form className="lead-modal-form" onSubmit={generateContract}>
              <label className="lead-modal-wide">
                Venda
                <select disabled={!canReadSales || salesStatus === "loading"} onChange={(event) => setForm((current) => ({ ...current, saleId: event.target.value }))} required value={form.saleId}>
                  <option value="">Selecione uma venda</option>
                  {sales.map((sale) => (
                    <option key={sale.id} value={sale.id}>{saleLabel(sale)}</option>
                  ))}
                </select>
              </label>
              {!canReadSales ? <p className="lead-modal-error">Sem permissao para listar vendas.</p> : null}
              {salesStatus === "error" ? <p className="lead-modal-error">Nao foi possivel carregar vendas.</p> : null}
              <label>
                Tipo
                <select onChange={(event) => setDocumentAction(event.target.value as DocumentAction)} value={documentAction}>
                  <option value="contract">Contrato</option>
                  <option value="warranty">Termo de garantia</option>
                  <option value="delivery">Checklist de entrega</option>
                </select>
              </label>
              {documentAction === "contract" ? (
                <label>
                Status inicial
                <select onChange={(event) => setForm((current) => ({ ...current, status: event.target.value as ContractStatus }))} value={form.status}>
                  <option value="GENERATED">Gerado</option>
                  <option value="PENDING_SIGNATURE">Assinatura</option>
                </select>
              </label>
              ) : null}
              <label className="lead-modal-wide">
                Observacao do snapshot
                <textarea maxLength={300} onChange={(event) => setForm((current) => ({ ...current, note: event.target.value }))} value={form.note} />
              </label>
              {saveError ? <p className="lead-modal-error">{saveError}</p> : null}
              <div className="lead-modal-actions">
                <button className="text-button" onClick={() => setModalOpen(false)} type="button">Cancelar</button>
                <button className="primary-action" disabled={saving || !form.saleId} type="submit">{saving ? "Gerando..." : "Gerar documento"}</button>
              </div>
            </form>
          </section>
        </div>
      ) : null}

      <section className="panel module-kanban-panel" aria-label="Fluxo documental">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Esteira documental</p>
            <h3>Contratos por etapa</h3>
          </div>
          <span className="live-pill">{statusLabel}</span>
        </div>

        <div className="module-kanban">
          {view.stageCards.map((column) => (
            <section className="module-kanban-column" key={column.title}>
              <header><strong>{column.title}</strong><span>{column.total}</span></header>
              {column.cards.slice(0, 3).map((contract) => (
                <article className="module-kanban-card" key={contract.id}>
                  <strong>{contractTitle(contract)}</strong>
                  <span>{contractMeta(contract) || "Venda vinculada"}</span>
                  <em>{money(contract.snapshot?.sale?.salePrice)}</em>
                </article>
              ))}
              {column.cards.length === 0 ? <article className="module-kanban-card"><strong>Sem cards</strong><span>Nenhum contrato nesta etapa</span><em>0</em></article> : null}
            </section>
          ))}
        </div>
      </section>

      <section className="blueprint-grid">
        <article className="panel">
          <div className="section-heading">
            <div><p className="eyebrow">Contratos</p><h3>Dossie administrativo</h3></div>
            <span className="live-pill">{statusLabel}</span>
          </div>
          <div className="blueprint-list">
            {contracts.map((contract) => (
              <article className="blueprint-row" key={contract.id}>
                <FileText aria-hidden="true" size={22} />
                <div>
                  <strong>{contractTitle(contract)}</strong>
                  <span>{contractMeta(contract) || `Venda ${contract.saleId.slice(0, 8)}`}</span>
                </div>
                <div className="finance-tags">
                  <span>{statusLabels[contract.status] ?? contract.status}</span>
                  <span>{new Date(contract.generatedAt).toLocaleDateString("pt-BR")}</span>
                </div>
                <button className="text-button" disabled={!canManageDocuments || movingId === contract.id || contract.status === "SIGNED"} onClick={() => void signContract(contract)} type="button">
                  {contract.status === "SIGNED" ? "Assinado" : "Assinar"}
                </button>
              </article>
            ))}
          </div>
        </article>

        <aside className="panel">
          <div className="section-heading"><div><p className="eyebrow">Regras</p><h3>Governanca documental</h3></div></div>
          <ul className="blueprint-side-list">
            {rules.map((rule) => {
              const Icon = rule.icon;
              return <li key={rule.label}><Icon aria-hidden="true" size={18} /><div><strong>{rule.label}</strong><span>{rule.detail}</span></div></li>;
            })}
          </ul>
          <div className="automation-status warning">
            <Paperclip aria-hidden="true" size={18} />
            <span>Anexos ja possuem preparacao segura na API; a listagem visual entra melhor junto com o dossie por entidade.</span>
          </div>
          <div className="automation-status success">
            <CheckCircle2 aria-hidden="true" size={18} />
            <span>Geracao e assinatura usam auditoria e eventos internos do backend.</span>
          </div>
        </aside>
      </section>
    </>
  );
}
