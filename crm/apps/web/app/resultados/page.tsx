import { BadgeDollarSign, BarChart3, CalendarDays } from "lucide-react";
import { AppShell } from "../components/app-shell";
import { LiveResultsBalance } from "../components/live-results-balance";
import { LiveResultsSummary } from "../components/live-results-summary";
import { ResultPeriodChart } from "../components/result-period-chart";

const resultViews = ["Consolidado", "Vendas", "Caixa", "Repasses", "Estoque", "Balanco"];

export default function ResultadosPage() {
  return (
    <AppShell
      active="Resultados"
      description="Dashboard executivo com metricas financeiras, resultado da loja, previsoes e fluxo de caixa."
      eyebrow="Gestao executiva"
      title="Resultados do negocio"
    >
      <LiveResultsSummary />

      <section className="panel result-period-panel" aria-label="Periodo personalizado dos resultados">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Periodo de apuracao</p>
            <h3>Personalizar leitura de resultado</h3>
          </div>
          <CalendarDays aria-hidden="true" size={20} />
        </div>

        <div className="period-filter-grid">
          <label>
            Inicio
            <input defaultValue="2024-01-01" type="date" />
          </label>
          <label>
            Fim
            <input defaultValue="2026-06-07" type="date" />
          </label>
          <label>
            Visao
            <select defaultValue="Consolidado">
              {resultViews.map((view) => (
                <option key={view}>{view}</option>
              ))}
            </select>
          </label>
          <button className="primary-action" type="button">
            <BarChart3 aria-hidden="true" size={16} />
            Atualizar resultado
          </button>
        </div>

        <p className="period-helper">
          O periodo selecionado pode ser livre, inclusive desde a abertura da loja. A leitura deve recalcular DRE,
          EBITDA, fluxo de caixa, vendas, repasses, margem por veiculo e rentabilidade sobre capital em estoque.
        </p>
      </section>

      <ResultPeriodChart />

      <section className="panel executive-note" aria-label="Nota executiva">
        <BadgeDollarSign aria-hidden="true" size={22} />
        <div>
          <strong>Esta pagina consolida informacoes alimentadas por Vendas, Estoque, Servicos e Financeiro.</strong>
          <span>
            O objetivo e dar ao Dono/Gestor uma leitura de resultado, previsao e caixa sem expor margem, lucro ou custo
            para perfis operacionais. O lucro liquido direto do pos-venda entra especificado no DRE global.
          </span>
        </div>
      </section>

      <LiveResultsBalance />
    </AppShell>
  );
}
