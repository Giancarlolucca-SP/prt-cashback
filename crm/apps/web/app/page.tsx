import { AlertTriangle, ClipboardCheck } from "lucide-react";
import { AppShell } from "./components/app-shell";
import { DashboardCharts } from "./components/dashboard-charts";
import { LiveDashboardSummary } from "./components/live-dashboard-summary";

const kanbanColumns = [
  {
    title: "Entrada quente",
    total: 12,
    accent: "teal",
    cards: [
      { name: "Marina Souza", car: "Corolla XEI 2021", meta: "WhatsApp | 8 min sem resposta", score: 92 },
      { name: "Paulo Lima", car: "Onix LTZ 2019 na troca", meta: "Ligacao loja | quer avaliar hoje", score: 88 }
    ]
  },
  {
    title: "Negociacao",
    total: 9,
    accent: "blue",
    cards: [
      { name: "Renata Alves", car: "HR-V Touring 2020", meta: "Proposta enviada | retorno 15:00", score: 76 },
      { name: "Bruno Castro", car: "Compass Longitude", meta: "Financiamento em simulacao", score: 71 }
    ]
  },
  {
    title: "Risco de esfriar",
    total: 5,
    accent: "amber",
    cards: [
      { name: "Carlos Mendes", car: "Tracker Premier", meta: "23h sem atividade | acionar gestor", score: 54 }
    ]
  }
];

const alerts = [
  { label: "Anuncio vendido ainda ativo", owner: "Estoque", severity: "critico" },
  { label: "Consulta judicial pendente antes de proposta", owner: "Compra", severity: "alto" },
  { label: "OCR retornou divergencia em CNH", owner: "Documentos", severity: "medio" },
  { label: "Lead de campanha Meta duplicado", owner: "Automacao", severity: "baixo" }
];

export default function HomePage() {
  return (
    <AppShell
      active="Painel"
      description="Vendas, estoque, alertas e automacoes em uma unica superficie de decisao."
      eyebrow="Gestao GT3 em tempo real"
      title="Painel executivo da loja"
    >
      <LiveDashboardSummary />

      <DashboardCharts />

      <section className="operations-grid">
        <section className="panel kanban-panel" aria-label="Kanban comercial">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Comercial</p>
              <h3>Fila inteligente de oportunidades</h3>
            </div>
            <button type="button" className="text-button">
              Ver todos
            </button>
          </div>

          <div className="kanban">
            {kanbanColumns.map((column) => (
              <section className={`column ${column.accent}`} key={column.title}>
                <header>
                  <h4>{column.title}</h4>
                  <span>{column.total}</span>
                </header>
                {column.cards.map((card) => (
                  <article className="lead-card" key={`${column.title}-${card.name}`}>
                    <div>
                      <strong>{card.name}</strong>
                      <span>{card.car}</span>
                    </div>
                    <p>{card.meta}</p>
                    <div className="score-row">
                      <span>Score</span>
                      <meter min="0" max="100" value={card.score} />
                      <strong>{card.score}</strong>
                    </div>
                  </article>
                ))}
              </section>
            ))}
          </div>
        </section>

        <aside className="panel alert-panel" aria-label="Alertas e automacoes">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Automacoes</p>
              <h3>Alertas que pedem acao</h3>
            </div>
            <AlertTriangle aria-hidden="true" size={20} />
          </div>

          <ul className="alert-list">
            {alerts.map((alert) => (
              <li key={alert.label}>
                <div>
                  <strong>{alert.label}</strong>
                  <span>{alert.owner}</span>
                </div>
                <em className={`severity ${alert.severity}`}>{alert.severity}</em>
              </li>
            ))}
          </ul>

          <div className="automation-status">
            <ClipboardCheck aria-hidden="true" size={18} />
            <span>12 jobs processados hoje, 2 aguardando revisao humana.</span>
          </div>
        </aside>
      </section>
    </AppShell>
  );
}
