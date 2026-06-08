"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Banknote, CalendarClock, CheckCircle2, FileText, Landmark, Plus, ReceiptText, X } from "lucide-react";
import { apiGet, apiPost } from "../auth/auth-client";
import { useAuth } from "../auth/auth-provider";

type TransactionType = "INCOME" | "EXPENSE" | "TRANSFER";
type TransactionStatus = "PENDING" | "SCHEDULED" | "PAID" | "CANCELLED" | "OVERDUE";

type Transaction = {
  id: string;
  type: TransactionType;
  status: TransactionStatus;
  description: string;
  amount: string;
  dueAt: string | null;
  paidAt: string | null;
  entityType: string | null;
  createdAt: string;
  updatedAt: string;
};

type ListResponse<T> = {
  items: T[];
  page: number;
  pageSize: number;
  total?: number;
};

type FinanceSummary = {
  totals: {
    income: number;
    expense: number;
    paid: number;
    open: number;
    net: number;
  };
  count: number;
};

type FinanceFormState = {
  amount: string;
  description: string;
  dueAt: string;
  status: TransactionStatus;
  type: TransactionType;
};

const emptyForm: FinanceFormState = {
  amount: "",
  description: "",
  dueAt: "",
  status: "PENDING",
  type: "EXPENSE",
};

const fallbackTransactions: Transaction[] = [
  {
    id: "fallback-1",
    type: "EXPENSE",
    status: "PENDING",
    description: "NF polimento tecnico",
    amount: "1850.00",
    dueAt: new Date().toISOString(),
    paidAt: null,
    entityType: "vehicle_inventory",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

const fallbackSummary: FinanceSummary = {
  count: 1,
  totals: { income: 0, expense: 1850, paid: 0, open: 1850, net: -1850 },
};

const filters: Array<{ label: string; status?: TransactionStatus; type?: TransactionType }> = [
  { label: "Todos" },
  { label: "A pagar", type: "EXPENSE" },
  { label: "A receber", type: "INCOME" },
  { label: "Pendentes", status: "PENDING" },
  { label: "Programados", status: "SCHEDULED" },
  { label: "Pago", status: "PAID" },
];

const statusLabels: Record<TransactionStatus, string> = {
  CANCELLED: "Cancelado",
  OVERDUE: "Vencido",
  PAID: "Pago",
  PENDING: "Pendente",
  SCHEDULED: "Programado",
};

const typeLabels: Record<TransactionType, string> = {
  EXPENSE: "Despesa",
  INCOME: "Receita",
  TRANSFER: "Transferencia",
};

const currency = new Intl.NumberFormat("pt-BR", { currency: "BRL", maximumFractionDigits: 0, style: "currency" });

function money(value: string | number) {
  return currency.format(Number(value));
}

function dateLabel(dateIso: string | null) {
  if (!dateIso) return "sem vencimento";
  return new Date(dateIso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

function toneFor(transaction: Transaction) {
  if (transaction.status === "OVERDUE" || transaction.status === "CANCELLED") return "risk";
  if (transaction.status === "PENDING" || transaction.status === "SCHEDULED") return "warning";
  return "";
}

function monthRange() {
  const now = new Date();
  return {
    from: new Date(now.getFullYear(), now.getMonth(), 1),
    to: now,
  };
}

export function LiveFinanceWorkspace() {
  const { hasPermission, token } = useAuth();
  const canReadFinance = hasPermission({ module: "finance", action: "read", scope: "ALL", sensitiveArea: "financial" });
  const canManageFinance = hasPermission({ module: "finance", action: "manage", scope: "ALL", sensitiveArea: "financial" });
  const [activeFilter, setActiveFilter] = useState(filters[0]);
  const [form, setForm] = useState<FinanceFormState>(emptyForm);
  const [modalOpen, setModalOpen] = useState(false);
  const [movingId, setMovingId] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<"fallback" | "loading" | "live" | "error" | "locked">("fallback");
  const [summary, setSummary] = useState(fallbackSummary);
  const [transactions, setTransactions] = useState(fallbackTransactions);

  useEffect(() => {
    if (!token) return;
    if (!canReadFinance) {
      setStatus("locked");
      return;
    }

    let isCurrent = true;
    const query = new URLSearchParams({ page: "1", page_size: "50" });
    if (activeFilter.status) query.set("status", activeFilter.status);
    if (activeFilter.type) query.set("type", activeFilter.type);

    const range = monthRange();
    const summaryQuery = new URLSearchParams({ from: range.from.toISOString(), to: range.to.toISOString() });

    setStatus("loading");
    Promise.all([
      apiGet<ListResponse<Transaction>>(`/finance/transactions?${query.toString()}`, token),
      apiGet<FinanceSummary>(`/finance/summary?${summaryQuery.toString()}`, token),
    ])
      .then(([list, nextSummary]) => {
        if (!isCurrent) return;
        setTransactions(list.items);
        setSummary(nextSummary);
        setStatus("live");
      })
      .catch(() => {
        if (isCurrent) setStatus("error");
      });

    return () => {
      isCurrent = false;
    };
  }, [activeFilter, canReadFinance, refreshKey, token]);

  async function handleCreate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || !canManageFinance || saving) return;

    setSaving(true);
    setSaveError(null);
    try {
      const response = await apiPost<{ data: Transaction }>("/finance/transactions", token, {
        amount: Number(form.amount),
        description: form.description.trim(),
        dueAt: form.dueAt ? new Date(form.dueAt).toISOString() : undefined,
        status: form.status,
        type: form.type,
      });

      setTransactions((current) => [response.data, ...current.filter((item) => item.id !== response.data.id)]);
      setForm(emptyForm);
      setModalOpen(false);
      setRefreshKey((current) => current + 1);
    } catch {
      setSaveError("Nao foi possivel criar o lancamento. Confira descricao, valor e vencimento.");
    } finally {
      setSaving(false);
    }
  }

  async function settleTransaction(transaction: Transaction, nextStatus: "PAID" | "CANCELLED" | "OVERDUE" | "SCHEDULED") {
    if (!token || !canManageFinance || movingId) return;

    const previous = transaction;
    setMovingId(transaction.id);
    setTransactions((current) => current.map((item) => (item.id === transaction.id ? { ...item, status: nextStatus, paidAt: nextStatus === "PAID" ? new Date().toISOString() : item.paidAt } : item)));

    try {
      const response = await apiPost<{ data: Transaction }>(`/finance/transactions/${transaction.id}/settle`, token, {
        paidAt: nextStatus === "PAID" ? new Date().toISOString() : undefined,
        reason: "Atualizado pelo financeiro",
        status: nextStatus,
      });

      setTransactions((current) => current.map((item) => (item.id === transaction.id ? response.data : item)));
      setRefreshKey((current) => current + 1);
    } catch {
      setTransactions((current) => current.map((item) => (item.id === transaction.id ? previous : item)));
      setStatus("error");
    } finally {
      setMovingId(null);
    }
  }

  const view = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    const dueToday = transactions.filter((item) => item.dueAt?.slice(0, 10) === today).reduce((sum, item) => sum + Number(item.amount), 0);
    const dueTodayCount = transactions.filter((item) => item.dueAt?.slice(0, 10) === today).length;
    const byType = transactions.reduce<Record<string, number>>((acc, item) => {
      const key = item.type === "EXPENSE" ? "Despesas" : item.type === "INCOME" ? "Receitas" : "Transferencias";
      acc[key] = (acc[key] ?? 0) + Number(item.amount);
      return acc;
    }, {});

    return {
      categories: Object.entries(byType).map(([name, value]) => ({ detail: "lancamentos no filtro atual", name, value })),
      metrics: [
        { label: "A pagar/receber", value: money(summary.totals.open), detail: "pendentes e programados", tone: "amber" },
        { label: "Vence hoje", value: money(dueToday), detail: `${dueTodayCount} lancamentos`, tone: "rose" },
        { label: "Pago no mes", value: money(summary.totals.paid), detail: "baixados no periodo", tone: "teal" },
        { label: "Saldo liquido", value: money(summary.totals.net), detail: "receitas menos despesas", tone: "blue" },
      ],
    };
  }, [summary, transactions]);

  const statusLabel = {
    error: "Usando fallback",
    fallback: "Fallback visual",
    live: "Dados reais",
    loading: "Sincronizando",
    locked: "Sem permissao",
  }[status];

  return (
    <>
      <section className="metric-grid" aria-label="Indicadores financeiros">
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

      <section className="leads-toolbar panel" aria-label="Filtros financeiros">
        <div>
          {filters.map((filter) => (
            <button className={filter.label === activeFilter.label ? "active" : ""} key={filter.label} onClick={() => setActiveFilter(filter)} type="button">
              {filter.label}
            </button>
          ))}
        </div>
        <button className="primary-action" disabled={!canManageFinance} onClick={() => setModalOpen(true)} type="button">
          <Plus aria-hidden="true" size={17} />
          Lancar despesa
        </button>
      </section>

      {modalOpen ? (
        <div className="dre-modal-backdrop" role="dialog" aria-modal="true" aria-label="Novo lancamento financeiro">
          <section className="dre-modal lead-modal">
            <header className="dre-modal-header">
              <div>
                <p className="eyebrow">Financeiro</p>
                <h3>Novo lancamento</h3>
              </div>
              <button aria-label="Fechar lancamento" className="icon-button" onClick={() => setModalOpen(false)} type="button">
                <X aria-hidden="true" size={18} />
              </button>
            </header>
            <form className="lead-modal-form" onSubmit={handleCreate}>
              <label>Descricao<input autoFocus required minLength={2} maxLength={180} value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} /></label>
              <label>Valor<input required min="0.01" step="0.01" type="number" value={form.amount} onChange={(event) => setForm((current) => ({ ...current, amount: event.target.value }))} /></label>
              <label>Tipo<select value={form.type} onChange={(event) => setForm((current) => ({ ...current, type: event.target.value as TransactionType }))}>{(Object.keys(typeLabels) as TransactionType[]).map((item) => <option key={item} value={item}>{typeLabels[item]}</option>)}</select></label>
              <label>Status<select value={form.status} onChange={(event) => setForm((current) => ({ ...current, status: event.target.value as TransactionStatus }))}><option value="PENDING">Pendente</option><option value="SCHEDULED">Programado</option><option value="PAID">Pago</option></select></label>
              <label className="lead-modal-wide">Vencimento<input type="datetime-local" value={form.dueAt} onChange={(event) => setForm((current) => ({ ...current, dueAt: event.target.value }))} /></label>
              {saveError ? <p className="lead-modal-error">{saveError}</p> : null}
              <div className="lead-modal-actions">
                <button className="text-button" onClick={() => setModalOpen(false)} type="button">Cancelar</button>
                <button className="primary-action" disabled={saving || Number(form.amount) <= 0 || form.description.trim().length < 2} type="submit">{saving ? "Salvando..." : "Criar lancamento"}</button>
              </div>
            </form>
          </section>
        </div>
      ) : null}

      <section className="finance-grid">
        <section className="panel finance-board" aria-label="Lancamentos de contas a pagar">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Lancamentos</p>
              <h3>Despesas, receitas e contas</h3>
            </div>
            <span className="live-pill">{statusLabel}</span>
          </div>

          <div className="finance-list">
            {transactions.map((item) => (
              <article className={`finance-row ${toneFor(item)}`} key={item.id}>
                <div className="finance-main">
                  <ReceiptText aria-hidden="true" size={22} />
                  <div>
                    <strong>{item.description}</strong>
                    <span>{typeLabels[item.type]}</span>
                  </div>
                </div>
                <div className="finance-tags">
                  <span>{statusLabels[item.status]}</span>
                  <span>{item.entityType ?? "sem vinculo"}</span>
                  <select
                    className="kanban-stage-select"
                    disabled={!canManageFinance || movingId === item.id}
                    onChange={(event) => void settleTransaction(item, event.target.value as "PAID" | "CANCELLED" | "OVERDUE" | "SCHEDULED")}
                    value={item.status === "PENDING" ? "SCHEDULED" : item.status}
                  >
                    <option value="SCHEDULED">Programado</option>
                    <option value="PAID">Pago</option>
                    <option value="OVERDUE">Vencido</option>
                    <option value="CANCELLED">Cancelado</option>
                  </select>
                </div>
                <div className="finance-value">
                  <strong>{money(item.amount)}</strong>
                  <span>{dateLabel(item.dueAt)}</span>
                </div>
              </article>
            ))}
          </div>
        </section>

        <aside className="panel finance-side" aria-label="Categorias de despesas">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Categorias</p>
              <h3>Despesa por origem</h3>
            </div>
            <Landmark aria-hidden="true" size={20} />
          </div>
          <ul className="finance-category-list">
            {view.categories.map((category) => (
              <li key={category.name}>
                <FileText aria-hidden="true" size={18} />
                <div>
                  <strong>{category.name}</strong>
                  <span>{category.detail}</span>
                </div>
                <em>{money(category.value)}</em>
              </li>
            ))}
          </ul>
          <div className="stock-actions">
            <button type="button"><CheckCircle2 aria-hidden="true" size={17} />Aprovar pagamento</button>
            <button type="button"><Banknote aria-hidden="true" size={17} />Conciliar banco</button>
            <button type="button"><CalendarClock aria-hidden="true" size={17} />Programar vencimento</button>
          </div>
          <div className="automation-status warning">
            <AlertTriangle aria-hidden="true" size={18} />
            <span>Resultados financeiros ficam restritos a Dono/Gestor e permissao financeira.</span>
          </div>
        </aside>
      </section>
    </>
  );
}
