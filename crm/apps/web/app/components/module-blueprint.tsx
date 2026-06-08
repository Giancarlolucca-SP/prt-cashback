import type { LucideIcon } from "lucide-react";
import { AlertTriangle, ArrowUpRight, CheckCircle2 } from "lucide-react";
import { AppShell } from "./app-shell";

type Metric = {
  detail: string;
  label: string;
  tone?: string;
  value: string;
};

type Row = {
  details: string[];
  icon: LucideIcon;
  meta: string;
  status: string;
  title: string;
  tone?: string;
  value: string;
};

type SideItem = {
  detail: string;
  icon: LucideIcon;
  label: string;
};

type BoardColumn = {
  cards: string[];
  title: string;
};

type ModuleBlueprintProps = {
  active: string;
  board: BoardColumn[];
  description: string;
  eyebrow: string;
  filters: string[];
  metrics: Metric[];
  rows: Row[];
  sideItems: SideItem[];
  sideTitle: string;
  title: string;
};

export function ModuleBlueprint({
  active,
  board,
  description,
  eyebrow,
  filters,
  metrics,
  rows,
  sideItems,
  sideTitle,
  title
}: ModuleBlueprintProps) {
  return (
    <AppShell active={active} description={description} eyebrow={eyebrow} title={title}>
      <section className="metric-grid">
        {metrics.map((metric) => (
          <article className={`metric-card ${metric.tone ?? ""}`} key={metric.label}>
            <div>
              <h3>{metric.label}</h3>
              <strong>{metric.value}</strong>
              <span>{metric.detail}</span>
            </div>
            <span className="metric-trend">
              <ArrowUpRight aria-hidden="true" size={14} />
              ativo
            </span>
          </article>
        ))}
      </section>

      <section className="leads-toolbar">
        <div>
          {filters.map((filter, index) => (
            <button className={index === 0 ? "active" : ""} key={filter} type="button">
              {filter}
            </button>
          ))}
        </div>
        <button className="primary-action" type="button">
          <CheckCircle2 aria-hidden="true" size={16} />
          Nova acao
        </button>
      </section>

      <section className="module-kanban-panel panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Fluxo</p>
            <h3>Kanban operacional</h3>
          </div>
        </div>
        <div className="module-kanban">
          {board.map((column) => (
            <article className="module-kanban-column" key={column.title}>
              <header>
                <strong>{column.title}</strong>
                <span>{column.cards.length}</span>
              </header>
              {column.cards.map((card) => (
                <div className="module-kanban-card" key={card}>
                  <strong>{card}</strong>
                  <span>Vinculo, responsavel e prazo rastreados</span>
                  <em>auditavel</em>
                </div>
              ))}
            </article>
          ))}
        </div>
      </section>

      <section className="blueprint-grid">
        <article className="panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Operacao</p>
              <h3>Itens que precisam de acompanhamento</h3>
            </div>
          </div>
          <div className="blueprint-list">
            {rows.map((row) => {
              const Icon = row.icon;
              return (
                <article className={`blueprint-row ${row.tone ?? ""}`} key={`${row.title}-${row.meta}`}>
                  <div className="blueprint-main">
                    <Icon aria-hidden="true" />
                    <div>
                      <strong>{row.title}</strong>
                      <span>{row.meta}</span>
                    </div>
                  </div>
                  <div className="blueprint-tags">
                    {row.details.map((detail) => (
                      <span key={detail}>{detail}</span>
                    ))}
                  </div>
                  <div className="blueprint-value">
                    <strong>{row.value}</strong>
                    <span>{row.status}</span>
                  </div>
                </article>
              );
            })}
          </div>
        </article>

        <aside className="panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Controle</p>
              <h3>{sideTitle}</h3>
            </div>
          </div>
          <ul className="blueprint-side-list">
            {sideItems.map((item) => {
              const Icon = item.icon;
              return (
                <li key={item.label}>
                  <Icon aria-hidden="true" size={18} />
                  <div>
                    <strong>{item.label}</strong>
                    <span>{item.detail}</span>
                  </div>
                </li>
              );
            })}
          </ul>
          <div className="automation-status warning">
            <AlertTriangle aria-hidden="true" size={18} />
            <span>Rascunho visual: dados reais, permissoes e regras de gravacao entram nas historias dev.</span>
          </div>
        </aside>
      </section>
    </AppShell>
  );
}
