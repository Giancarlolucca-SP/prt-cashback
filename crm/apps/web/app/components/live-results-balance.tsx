"use client";

import { useEffect, useMemo, useState } from "react";
import { Banknote, Gauge, Landmark, Scale } from "lucide-react";
import { apiGet } from "../auth/auth-client";
import { useAuth } from "../auth/auth-provider";

type InventoryPerformance = {
  inventoryValue: {
    askingPrice: string;
    purchaseCost: string;
    capitalizedCosts: string;
  };
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

type BalanceData = {
  finance: FinanceSummary;
  inventory: InventoryPerformance;
};

const fallbackData: BalanceData = {
  finance: {
    count: 18,
    totals: { income: 428000, expense: 74800, net: 353200, open: 31400, paid: 278000 },
  },
  inventory: {
    inventoryValue: {
      askingPrice: "1450000.00",
      capitalizedCosts: "28400.00",
      purchaseCost: "1180000.00",
    },
  },
};

const currency = new Intl.NumberFormat("pt-BR", { currency: "BRL", maximumFractionDigits: 0, style: "currency" });

function toNumber(value: string | number | null | undefined) {
  return typeof value === "number" ? value : Number(value ?? 0);
}

function money(value: string | number) {
  return currency.format(toNumber(value));
}

export function LiveResultsBalance() {
  const { hasPermission, token } = useAuth();
  const canReadDashboard = hasPermission({ module: "dashboard", action: "read" });
  const canReadFinance = hasPermission({ module: "finance", action: "read", scope: "ALL", sensitiveArea: "financial" });
  const [data, setData] = useState(fallbackData);
  const [status, setStatus] = useState<"error" | "fallback" | "live" | "loading" | "locked">("fallback");

  useEffect(() => {
    if (!token) return;
    if (!canReadFinance) {
      setStatus("locked");
      return;
    }

    let isCurrent = true;
    setStatus("loading");

    Promise.all([
      apiGet<FinanceSummary>("/finance/summary", token),
      canReadDashboard ? apiGet<InventoryPerformance>("/analytics/inventory-performance", token) : Promise.resolve(fallbackData.inventory),
    ])
      .then(([finance, inventory]) => {
        if (!isCurrent) return;
        setData({ finance, inventory });
        setStatus("live");
      })
      .catch(() => {
        if (isCurrent) setStatus("error");
      });

    return () => {
      isCurrent = false;
    };
  }, [canReadDashboard, canReadFinance, token]);

  const view = useMemo(() => {
    const cash = data.finance.totals.paid;
    const receivables = Math.max(data.finance.totals.income - data.finance.totals.paid, 0);
    const payables = data.finance.totals.open;
    const inventoryCost = toNumber(data.inventory.inventoryValue.purchaseCost) + toNumber(data.inventory.inventoryValue.capitalizedCosts);
    const inventoryUpside = Math.max(toNumber(data.inventory.inventoryValue.askingPrice) - inventoryCost, 0);
    const prepaid = Math.max(data.finance.totals.expense * 0.06, 0);
    const taxes = Math.max(data.finance.totals.income * 0.067, 0);
    const providers = Math.max(data.finance.totals.expense * 0.18, 0);
    const commissions = Math.max(data.finance.totals.income * 0.035, 0);
    const thirdPartyCapital = Math.max(inventoryCost * 0.28, 0);
    const assetsTotal = cash + receivables + inventoryCost + prepaid;
    const liabilitiesWithoutEquity = payables + taxes + providers + commissions + thirdPartyCapital;
    const equity = Math.max(assetsTotal - liabilitiesWithoutEquity, 0);
    const liabilitiesTotal = liabilitiesWithoutEquity + equity;

    return {
      assets: [
        { label: "Caixa e bancos", value: money(cash), source: "lancamentos pagos", kind: "positive" },
        { label: "Contas a receber", value: money(receivables), source: "receitas ainda nao pagas", kind: "positive" },
        { label: "Estoque proprio a custo", value: money(inventoryCost), source: "custo + gastos capitalizados", kind: "positive" },
        { label: "Despesas antecipadas", value: money(prepaid), source: "estimativa gerencial sobre despesas", kind: "positive" },
        { label: "Total do ativo", value: money(assetsTotal), source: "montado com dados vivos", kind: "final" },
      ],
      liabilities: [
        { label: "Contas a pagar", value: money(payables), source: "financeiro aberto", kind: "negative" },
        { label: "Impostos e taxas a recolher", value: money(taxes), source: "estimativa sobre receitas", kind: "negative" },
        { label: "Fornecedores e prestadores", value: money(providers), source: "estimativa sobre despesas", kind: "negative" },
        { label: "Comissoes a pagar", value: money(commissions), source: "estimativa gerencial", kind: "negative" },
        { label: "Financiamentos e capital de terceiros", value: money(thirdPartyCapital), source: "estimativa sobre estoque", kind: "negative" },
        { label: "Patrimonio e resultado acumulado", value: money(equity), source: "saldo para fechar o balanco", kind: "highlight" },
        { label: "Total passivo + patrimonio", value: money(liabilitiesTotal), source: "deve bater com ativo", kind: "final" },
      ],
      assetsTotal,
      balanced: Math.abs(assetsTotal - liabilitiesTotal) < 1,
      inventoryUpside,
      liabilitiesTotal,
    };
  }, [data]);

  const statusLabel = {
    error: "Dados parciais",
    fallback: "Fallback visual",
    live: "Dados reais",
    loading: "Sincronizando",
    locked: "Sem permissao",
  }[status];

  return (
    <section className="panel balance-sheet-panel" aria-label="Balanco patrimonial gerencial">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Balanco gerencial</p>
          <h3>Ativo, passivo e patrimonio montados automaticamente</h3>
        </div>
        <Scale aria-hidden="true" size={20} />
      </div>

      <div className="balance-summary">
        <span>
          <Landmark aria-hidden="true" size={17} />
          Total ativo <strong>{money(view.assetsTotal)}</strong>
        </span>
        <span>
          <Banknote aria-hidden="true" size={17} />
          Passivo + PL <strong>{money(view.liabilitiesTotal)}</strong>
        </span>
        <span>
          <Gauge aria-hidden="true" size={17} />
          Status <strong>{view.balanced ? "Balanceado" : statusLabel}</strong>
        </span>
      </div>

      <div className="balance-sheet-grid">
        <section className="balance-column" aria-label="Ativo">
          <div className="balance-column-header"><strong>Ativo</strong><span>lado esquerdo</span></div>
          {view.assets.map((row) => (
            <article className={`balance-row ${row.kind}`} key={row.label}>
              <span>{row.label}<small>{row.source}</small></span>
              <strong>{row.value}</strong>
            </article>
          ))}
        </section>

        <section className="balance-column" aria-label="Passivo e patrimonio liquido">
          <div className="balance-column-header"><strong>Passivo + patrimonio liquido</strong><span>lado direito</span></div>
          {view.liabilities.map((row) => (
            <article className={`balance-row ${row.kind}`} key={row.label}>
              <span>{row.label}<small>{row.source}</small></span>
              <strong>{row.value}</strong>
            </article>
          ))}
        </section>
      </div>

      <div className="balance-note-grid">
        <span>Estoque entra pelo custo mais gastos capitalizados; potencial bruto atual: {money(view.inventoryUpside)}.</span>
        <span>Recebiveis, contas a pagar e caixa vêm do resumo financeiro.</span>
        <span>Impostos, prestadores e comissoes ainda usam estimativas gerenciais ate haver classificacao fiscal dedicada.</span>
        <span>O patrimonio fecha automaticamente como diferenca entre ativo e obrigacoes estimadas.</span>
      </div>
    </section>
  );
}
