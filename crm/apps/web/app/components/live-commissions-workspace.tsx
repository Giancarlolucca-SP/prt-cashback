"use client";

import { useEffect, useMemo, useState } from "react";
import { BadgeDollarSign, CheckCircle2, Clock, Plus, ShieldCheck, Trophy, UsersRound, X } from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { apiGet, apiPost } from "../auth/auth-client";
import { useAuth } from "../auth/auth-provider";

type CommissionStatus = "PENDING" | "APPROVED" | "BLOCKED" | "PAID" | "CANCELLED";
type CommissionBasis = "GROSS_MARGIN_PERCENT" | "SALE_PRICE_PERCENT" | "FIXED_AMOUNT";

type Commission = {
  id: string;
  userId: string | null;
  saleId: string | null;
  amount: string;
  status: CommissionStatus;
  approvedAt: string | null;
  paidAt: string | null;
  createdAt: string;
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

type CommissionFormState = {
  basis: CommissionBasis;
  ruleName: string;
  saleId: string;
  value: string;
};

const emptyCommissionForm: CommissionFormState = {
  basis: "GROSS_MARGIN_PERCENT",
  ruleName: "Comissao venda",
  saleId: "",
  value: "5",
};

const fallbackCommissions: Commission[] = [
  {
    id: "fallback-1",
    userId: "rafael",
    saleId: null,
    amount: "6400.00",
    status: "APPROVED",
    approvedAt: new Date().toISOString(),
    paidAt: null,
    createdAt: new Date().toISOString(),
  },
  {
    id: "fallback-2",
    userId: "bruno",
    saleId: null,
    amount: "1800.00",
    status: "PENDING",
    approvedAt: null,
    paidAt: null,
    createdAt: new Date().toISOString(),
  },
];

const statusLabels: Record<CommissionStatus, string> = {
  APPROVED: "Aprovado",
  BLOCKED: "Bloqueado",
  CANCELLED: "Cancelado",
  PAID: "Pago",
  PENDING: "A validar",
};

const statusColors: Record<CommissionStatus, string> = {
  APPROVED: "#00a884",
  BLOCKED: "#ff4d6d",
  CANCELLED: "#64748b",
  PAID: "#ff8a3d",
  PENDING: "#7c5cff",
};

const basisLabels: Record<CommissionBasis, string> = {
  FIXED_AMOUNT: "Valor fixo",
  GROSS_MARGIN_PERCENT: "% da margem",
  SALE_PRICE_PERCENT: "% da venda",
};

const rules = [
  { icon: CheckCircle2, title: "Aprovacao", detail: "Comissao libera apos venda, pagamento e margem aprovados." },
  { icon: Clock, title: "Saldo", detail: "Saldo separa aprovado, pago, bloqueado e a pagar." },
  { icon: ShieldCheck, title: "RBAC", detail: "Vendedor ve o proprio espelho; gestor ve consolidado." },
  { icon: Trophy, title: "Premios", detail: "Premios e campanhas entram como regras configuraveis." },
];

const currency = new Intl.NumberFormat("pt-BR", { currency: "BRL", maximumFractionDigits: 0, style: "currency" });

function money(value: string | number) {
  return currency.format(Number(value));
}

function sellerName(userId: string | null) {
  return userId ? `Usuario ${userId.slice(0, 6)}` : "Sem vendedor";
}

function monthLabel(dateIso: string) {
  return new Date(dateIso).toLocaleDateString("pt-BR", { month: "short" }).replace(".", "");
}

export function LiveCommissionsWorkspace() {
  const { hasPermission, token } = useAuth();
  const canReadAll = hasPermission({ module: "commissions", action: "read_all", scope: "ALL", sensitiveArea: "financial" });
  const canReadOwn = hasPermission({ module: "commissions", action: "read_own" });
  const canManage = hasPermission({ module: "commissions", action: "manage", scope: "ALL", sensitiveArea: "financial" });
  const canReadSales = hasPermission({ module: "sales", action: "read" });
  const [commissionForm, setCommissionForm] = useState(emptyCommissionForm);
  const [commissions, setCommissions] = useState(fallbackCommissions);
  const [modalOpen, setModalOpen] = useState(false);
  const [movingId, setMovingId] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [sales, setSales] = useState<SaleOption[]>([]);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [salesStatus, setSalesStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [status, setStatus] = useState<"fallback" | "loading" | "live" | "error" | "locked">("fallback");

  useEffect(() => {
    if (!token) return;
    if (!canReadAll && !canReadOwn) {
      setStatus("locked");
      return;
    }

    let isCurrent = true;
    setStatus("loading");
    apiGet<ListResponse<Commission>>(`${canReadAll ? "/commissions" : "/commissions/mine"}?page=1&page_size=100`, token)
      .then((list) => {
        if (!isCurrent) return;
        setCommissions(list.items);
        setStatus("live");
      })
      .catch(() => {
        if (isCurrent) setStatus("error");
      });

    return () => {
      isCurrent = false;
    };
  }, [canReadAll, canReadOwn, refreshKey, token]);

  useEffect(() => {
    if (!modalOpen || !token || !canReadSales) return;

    let isCurrent = true;
    setSalesStatus("loading");

    apiGet<ListResponse<SaleOption>>("/sales?page=1&page_size=100", token)
      .then((list) => {
        if (!isCurrent) return;
        setSales(list.items.filter((sale) => sale.status === "APPROVED" || sale.status === "CLOSED"));
        setSalesStatus("ready");
      })
      .catch(() => {
        if (isCurrent) setSalesStatus("error");
      });

    return () => {
      isCurrent = false;
    };
  }, [canReadSales, modalOpen, token]);

  async function updateStatus(commission: Commission, nextStatus: Exclude<CommissionStatus, "PENDING">) {
    if (!token || !canManage || movingId || commission.status === nextStatus) return;

    const previous = commission;
    setMovingId(commission.id);
    setCommissions((current) => current.map((item) => (item.id === commission.id ? { ...item, status: nextStatus } : item)));

    try {
      const response = await apiPost<{ data: Commission }>(`/commissions/${commission.id}/status`, token, {
        reason: "Atualizado pela tela de comissoes",
        status: nextStatus,
      });
      setCommissions((current) => current.map((item) => (item.id === commission.id ? response.data : item)));
      setRefreshKey((current) => current + 1);
    } catch {
      setCommissions((current) => current.map((item) => (item.id === commission.id ? previous : item)));
      setStatus("error");
    } finally {
      setMovingId(null);
    }
  }

  async function calculateCommission(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || !canManage || saving) return;

    setSaving(true);
    setSaveError(null);

    try {
      const response = await apiPost<{ data: Commission }>("/commissions/calculate", token, {
        basis: commissionForm.basis,
        ruleName: commissionForm.ruleName.trim() || undefined,
        saleId: commissionForm.saleId,
        value: Number(commissionForm.value),
      });

      setCommissions((current) => [response.data, ...current.filter((commission) => commission.id !== response.data.id)]);
      setCommissionForm(emptyCommissionForm);
      setModalOpen(false);
      setRefreshKey((current) => current + 1);
    } catch {
      setSaveError("Nao foi possivel calcular a comissao. Confira venda, vendedor responsavel e regra.");
    } finally {
      setSaving(false);
    }
  }

  function saleLabel(sale: SaleOption) {
    return `Venda ${sale.id.slice(0, 8)} | ${money(sale.salePrice ?? 0)} | margem ${money(sale.grossMargin ?? 0)}`;
  }

  const view = useMemo(() => {
    const totals = commissions.reduce(
      (acc, commission) => {
        const amount = Number(commission.amount);
        acc.forecast += amount;
        if (commission.status === "APPROVED") acc.approved += amount;
        if (commission.status === "PAID") acc.paid += amount;
        if (commission.status === "BLOCKED" || commission.status === "CANCELLED") acc.blocked += amount;
        return acc;
      },
      { approved: 0, blocked: 0, forecast: 0, paid: 0 },
    );
    const balance = totals.approved - totals.paid;

    const bySeller = new Map<string, { name: string; approved: number; balance: number; blocked: number; paid: number; sales: number }>();
    for (const commission of commissions) {
      const key = commission.userId ?? "none";
      const row = bySeller.get(key) ?? { approved: 0, balance: 0, blocked: 0, name: sellerName(commission.userId), paid: 0, sales: 0 };
      const amount = Number(commission.amount);
      row.sales += commission.saleId ? 1 : 0;
      if (commission.status === "APPROVED") {
        row.approved += amount;
        row.balance += amount;
      }
      if (commission.status === "PAID") row.paid += amount;
      if (commission.status === "BLOCKED" || commission.status === "CANCELLED") row.blocked += amount;
      bySeller.set(key, row);
    }

    const byStatus = (Object.keys(statusLabels) as CommissionStatus[]).map((commissionStatus) => ({
      color: statusColors[commissionStatus],
      name: statusLabels[commissionStatus],
      value: commissions.filter((commission) => commission.status === commissionStatus).reduce((sum, commission) => sum + Number(commission.amount), 0),
    }));

    const monthly = Array.from(
      commissions.reduce<Map<string, { month: string; previsto: number; aprovado: number; pago: number }>>((acc, commission) => {
        const key = monthLabel(commission.createdAt);
        const row = acc.get(key) ?? { aprovado: 0, month: key, pago: 0, previsto: 0 };
        const amount = Number(commission.amount);
        row.previsto += amount;
        if (commission.status === "APPROVED") row.aprovado += amount;
        if (commission.status === "PAID") row.pago += amount;
        acc.set(key, row);
        return acc;
      }, new Map()).values(),
    );

    return {
      bySeller: Array.from(bySeller.values()),
      byStatus,
      metrics: { ...totals, balance },
      monthly,
    };
  }, [commissions]);

  const statusLabel = {
    error: "Usando fallback",
    fallback: "Fallback visual",
    live: "Dados reais",
    loading: "Sincronizando",
    locked: "Sem permissao",
  }[status];

  return (
    <>
      <section className="metric-grid">
        <article className="metric-card teal"><div><h3>Previsto mes</h3><strong>{money(view.metrics.forecast)}</strong><span>vendas e premios</span></div></article>
        <article className="metric-card blue"><div><h3>Aprovado</h3><strong>{money(view.metrics.approved)}</strong><span>gestor validou</span></div></article>
        <article className="metric-card amber"><div><h3>Saldo a pagar</h3><strong>{money(view.metrics.balance)}</strong><span>proxima folha</span></div></article>
        <article className="metric-card rose"><div><h3>Bloqueado</h3><strong>{money(view.metrics.blocked)}</strong><span>margem, docs ou cancelamento</span></div></article>
      </section>

      <section className="commission-chart-grid">
        <article className="panel chart-panel wide">
          <div className="section-heading">
            <div><p className="eyebrow">Vendedores</p><h3>Saldo e comissao aprovada por vendedor</h3></div>
            <div className="topbar-actions">
              <span className="live-pill">{statusLabel}</span>
              <button className="primary-action" disabled={!canManage} onClick={() => { setSaveError(null); setModalOpen(true); }} type="button">
                <Plus aria-hidden="true" size={16} />
                Calcular
              </button>
            </div>
          </div>
          <div className="chart-box">
            <ResponsiveContainer height={220} width="100%">
              <BarChart data={view.bySeller} margin={{ left: -8, right: 4, top: 8 }}>
                <CartesianGrid stroke="#ebe7f4" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} tickLine={false} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(value) => `R$ ${Number(value) / 1000}k`} tickLine={false} width={48} />
                <Tooltip contentStyle={{ borderColor: "#e6e1ef", borderRadius: 8, fontSize: 12 }} formatter={(value) => money(Number(value))} />
                <Bar barSize={18} dataKey="approved" fill="#7c5cff" name="Aprovado" radius={[6, 6, 0, 0]} />
                <Bar barSize={18} dataKey="balance" fill="#ff8a3d" name="Saldo" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </article>

        <article className="panel chart-panel">
          <div className="section-heading"><div><p className="eyebrow">Status</p><h3>Distribuicao das comissoes</h3></div></div>
          <div className="chart-box">
            <ResponsiveContainer height={220} width="100%">
              <PieChart>
                <Pie cx="50%" cy="50%" data={view.byStatus} dataKey="value" innerRadius={48} nameKey="name" outerRadius={76} paddingAngle={3}>
                  {view.byStatus.map((item) => <Cell fill={item.color} key={item.name} />)}
                </Pie>
                <Tooltip contentStyle={{ borderColor: "#e6e1ef", borderRadius: 8, fontSize: 12 }} formatter={(value) => money(Number(value))} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="legend-grid">{view.byStatus.map((item) => <span key={item.name}><i style={{ background: item.color }} />{item.name} {money(item.value)}</span>)}</div>
        </article>

        <article className="panel chart-panel wide">
          <div className="section-heading"><div><p className="eyebrow">Periodo</p><h3>Evolucao de previsto, aprovado e pago</h3></div></div>
          <div className="chart-box">
            <ResponsiveContainer height={220} width="100%">
              <AreaChart data={view.monthly} margin={{ left: -8, right: 6, top: 8 }}>
                <CartesianGrid stroke="#ebe7f4" vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} tickLine={false} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(value) => `R$ ${Number(value) / 1000}k`} tickLine={false} width={48} />
                <Tooltip contentStyle={{ borderColor: "#e6e1ef", borderRadius: 8, fontSize: 12 }} formatter={(value) => money(Number(value))} />
                <Area dataKey="previsto" fill="#f1edff" name="Previsto" stroke="#7c5cff" strokeWidth={2.5} />
                <Area dataKey="aprovado" fill="#e6fbf4" name="Aprovado" stroke="#00a884" strokeWidth={2.5} />
                <Area dataKey="pago" fill="#fff3ea" name="Pago" stroke="#ff8a3d" strokeWidth={2.5} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </article>
      </section>

      {modalOpen ? (
        <div className="dre-modal-backdrop" role="dialog" aria-modal="true" aria-label="Calcular comissao">
          <section className="dre-modal lead-modal">
            <header className="dre-modal-header">
              <div>
                <p className="eyebrow">Comissao</p>
                <h3>Calcular por venda</h3>
              </div>
              <button aria-label="Fechar calculo de comissao" className="icon-button" onClick={() => setModalOpen(false)} type="button">
                <X aria-hidden="true" size={18} />
              </button>
            </header>

            <form className="lead-modal-form" onSubmit={calculateCommission}>
              <label className="lead-modal-wide">
                Venda
                <select
                  disabled={!canReadSales || salesStatus === "loading"}
                  onChange={(event) => setCommissionForm((current) => ({ ...current, saleId: event.target.value }))}
                  required
                  value={commissionForm.saleId}
                >
                  <option value="">Selecione uma venda aprovada/fechada</option>
                  {sales.map((sale) => (
                    <option key={sale.id} value={sale.id}>
                      {saleLabel(sale)}
                    </option>
                  ))}
                </select>
              </label>
              {!canReadSales ? <p className="lead-modal-error">Sem permissao para listar vendas.</p> : null}
              {salesStatus === "error" ? <p className="lead-modal-error">Nao foi possivel carregar vendas.</p> : null}
              <label>
                Base
                <select onChange={(event) => setCommissionForm((current) => ({ ...current, basis: event.target.value as CommissionBasis }))} value={commissionForm.basis}>
                  {(Object.keys(basisLabels) as CommissionBasis[]).map((basis) => (
                    <option key={basis} value={basis}>{basisLabels[basis]}</option>
                  ))}
                </select>
              </label>
              <label>
                Valor
                <input min="0.01" required step="0.01" type="number" value={commissionForm.value} onChange={(event) => setCommissionForm((current) => ({ ...current, value: event.target.value }))} />
              </label>
              <label className="lead-modal-wide">
                Nome da regra
                <input maxLength={120} minLength={2} value={commissionForm.ruleName} onChange={(event) => setCommissionForm((current) => ({ ...current, ruleName: event.target.value }))} />
              </label>
              {saveError ? <p className="lead-modal-error">{saveError}</p> : null}
              <div className="lead-modal-actions">
                <button className="text-button" onClick={() => setModalOpen(false)} type="button">Cancelar</button>
                <button className="primary-action" disabled={saving || !commissionForm.saleId || Number(commissionForm.value) <= 0} type="submit">
                  {saving ? "Calculando..." : "Calcular comissao"}
                </button>
              </div>
            </form>
          </section>
        </div>
      ) : null}

      <section className="commission-grid">
        <article className="panel">
          <div className="section-heading"><div><p className="eyebrow">Equipe</p><h3>Metricas por vendedor</h3></div><span className="live-pill">{canReadAll ? "Visao gestor" : "Meu espelho"}</span></div>
          <div className="seller-list">
            {view.bySeller.map((seller, index) => (
              <article className="seller-card" key={seller.name}>
                <div className="seller-rank"><Trophy aria-hidden="true" size={18} /><strong>#{index + 1}</strong></div>
                <div className="seller-main"><strong>{seller.name}</strong><span>{seller.sales} vendas vinculadas</span></div>
                <div className="seller-kpis">
                  <span>Saldo<strong>{money(seller.balance)}</strong></span>
                  <span>Aprovado<strong>{money(seller.approved)}</strong></span>
                  <span>Pago<strong>{money(seller.paid)}</strong></span>
                  <span>Bloqueado<strong>{money(seller.blocked)}</strong></span>
                </div>
              </article>
            ))}
          </div>
          <div className="finance-list" style={{ marginTop: 14 }}>
            {commissions.slice(0, 8).map((commission) => (
              <article className="finance-row" key={commission.id}>
                <div className="finance-main"><BadgeDollarSign aria-hidden="true" size={22} /><div><strong>{sellerName(commission.userId)}</strong><span>{commission.saleId ? "venda vinculada" : "sem venda vinculada"}</span></div></div>
                <div className="finance-tags">
                  <span>{statusLabels[commission.status]}</span>
                  <select className="kanban-stage-select" disabled={!canManage || movingId === commission.id} onChange={(event) => void updateStatus(commission, event.target.value as Exclude<CommissionStatus, "PENDING">)} value={commission.status === "PENDING" ? "APPROVED" : commission.status}>
                    <option value="APPROVED">Aprovar</option>
                    <option value="BLOCKED">Bloquear</option>
                    <option value="PAID">Pagar</option>
                    <option value="CANCELLED">Cancelar</option>
                  </select>
                </div>
                <div className="finance-value"><strong>{money(commission.amount)}</strong><span>{new Date(commission.createdAt).toLocaleDateString("pt-BR")}</span></div>
              </article>
            ))}
          </div>
        </article>

        <aside className="panel">
          <div className="section-heading"><div><p className="eyebrow">Regras</p><h3>Controles de liberacao</h3></div></div>
          <ul className="blueprint-side-list">{rules.map((rule) => { const Icon = rule.icon; return <li key={rule.title}><Icon aria-hidden="true" size={18} /><div><strong>{rule.title}</strong><span>{rule.detail}</span></div></li>; })}</ul>
          <div className="automation-status warning"><UsersRound aria-hidden="true" size={18} /><span>Vendedor ve seu espelho; Dono/Gestor ve consolidado, saldo e bloqueios da equipe.</span></div>
        </aside>
      </section>
    </>
  );
}
