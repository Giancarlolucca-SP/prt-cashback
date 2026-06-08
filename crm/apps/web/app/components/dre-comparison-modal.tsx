"use client";

import { useState } from "react";
import { BarChart3, Download, X } from "lucide-react";

const months = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun"];

const comparisonRows = [
  { label: "Receita bruta de vendas", values: ["R$ 428k", "R$ 452k", "R$ 489k", "R$ 436k", "R$ 512k", "R$ 544k"], kind: "positive" },
  { label: "Receita de repasses", values: ["R$ 36k", "R$ 28k", "R$ 42k", "R$ 31k", "R$ 47k", "R$ 54k"], kind: "positive" },
  { label: "Deducoes, impostos e taxas", values: ["-R$ 28,6k", "-R$ 31,2k", "-R$ 34,5k", "-R$ 29,8k", "-R$ 36,7k", "-R$ 39,4k"], kind: "negative" },
  { label: "Receita liquida", values: ["R$ 435,4k", "R$ 448,8k", "R$ 496,5k", "R$ 437,2k", "R$ 522,3k", "R$ 558,6k"], kind: "subtotal" },
  { label: "CMV / custo dos veiculos vendidos", values: ["-R$ 308k", "-R$ 326k", "-R$ 354k", "-R$ 312k", "-R$ 371k", "-R$ 392k"], kind: "negative" },
  { label: "Servicos, preparacao e terceiros", values: ["-R$ 28,4k", "-R$ 30,7k", "-R$ 32,1k", "-R$ 29,5k", "-R$ 34,1k", "-R$ 36,8k"], kind: "negative" },
  { label: "Lucro bruto", values: ["R$ 99k", "R$ 92,1k", "R$ 110,4k", "R$ 95,7k", "R$ 117,2k", "R$ 129,8k"], kind: "subtotal" },
  { label: "Despesas comerciais e marketing", values: ["-R$ 12,7k", "-R$ 13,8k", "-R$ 15,2k", "-R$ 12,9k", "-R$ 16,4k", "-R$ 17,1k"], kind: "negative" },
  { label: "Despesas administrativas", values: ["-R$ 21,2k", "-R$ 22,6k", "-R$ 24,8k", "-R$ 22k", "-R$ 25,7k", "-R$ 28,5k"], kind: "negative" },
  { label: "EBITDA", values: ["R$ 65,1k", "R$ 55,7k", "R$ 70,4k", "R$ 60,8k", "R$ 75,1k", "R$ 84,2k"], kind: "highlight" },
  { label: "Despesas financeiras", values: ["-R$ 6,8k", "-R$ 7,1k", "-R$ 7,8k", "-R$ 7,4k", "-R$ 8,2k", "-R$ 8,7k"], kind: "negative" },
  { label: "Depreciacao/amortizacao", values: ["-R$ 2,1k", "-R$ 2,1k", "-R$ 2,1k", "-R$ 2,1k", "-R$ 2,1k", "-R$ 2,1k"], kind: "negative" },
  { label: "Lucro liquido estimado", values: ["R$ 56,2k", "R$ 46,5k", "R$ 60,5k", "R$ 51,3k", "R$ 64,8k", "R$ 73,4k"], kind: "final" }
];

const summary = [
  { label: "Maior receita", value: "Jun | R$ 558,6k" },
  { label: "Melhor EBITDA", value: "Jun | R$ 84,2k" },
  { label: "Maior CMV", value: "Jun | R$ 392k" },
  { label: "Melhor lucro", value: "Jun | R$ 73,4k" }
];

const storeOpeningDate = "2024-01-01";
const today = "2026-06-03";

export function DreComparisonModal() {
  const [open, setOpen] = useState(false);
  const [startDate, setStartDate] = useState(storeOpeningDate);
  const [endDate, setEndDate] = useState(today);
  const [grouping, setGrouping] = useState("Mensal");
  const [allPeriods, setAllPeriods] = useState(false);

  function useAllPeriods() {
    setAllPeriods(true);
    setStartDate(storeOpeningDate);
    setEndDate(today);
  }

  function exportToExcel() {
    const header = ["Campo do DRE", ...months];
    const rows = comparisonRows.map((row) => [row.label, ...row.values]);
    const csv = [header, ...rows]
      .map((row) => row.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(";"))
      .join("\n");
    const blob = new Blob([`\ufeff${csv}`], { type: "application/vnd.ms-excel;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = `comparativo-dre-${startDate}-a-${endDate}-${grouping.toLowerCase()}.xls`;
    link.click();
    URL.revokeObjectURL(url);
  }

  function updateStartDate(value: string) {
    setAllPeriods(false);
    setStartDate(value);
  }

  function updateEndDate(value: string) {
    setAllPeriods(false);
    setEndDate(value);
  }

  return (
    <>
      <button className="dre-compare-button" onClick={() => setOpen(true)} type="button">
        <BarChart3 aria-hidden="true" size={16} />
        Comparar meses
      </button>

      {open ? (
        <div className="dre-modal-backdrop" role="dialog" aria-modal="true" aria-label="Comparativo mensal de DRE">
          <section className="dre-modal">
            <header className="dre-modal-header">
              <div>
                <p className="eyebrow">Comparativo DRE</p>
                <h3>Mes a mes</h3>
              </div>
              <button aria-label="Fechar comparativo" className="icon-button" onClick={() => setOpen(false)} type="button">
                <X aria-hidden="true" size={18} />
              </button>
            </header>

            <div className="dre-comparison-controls" aria-label="Filtros do comparativo DRE">
              <label>
                Inicio
                <input max={endDate} onChange={(event) => updateStartDate(event.target.value)} type="date" value={startDate} />
              </label>
              <label>
                Fim
                <input min={startDate} onChange={(event) => updateEndDate(event.target.value)} type="date" value={endDate} />
              </label>
              <label>
                Agrupamento
                <select onChange={(event) => setGrouping(event.target.value)} value={grouping}>
                  <option>Mensal</option>
                  <option>Trimestral</option>
                  <option>Semestral</option>
                  <option>Anual</option>
                </select>
              </label>
              <button className={allPeriods ? "active" : ""} onClick={useAllPeriods} type="button">
                Todos os periodos
              </button>
              <button className="export" onClick={exportToExcel} type="button">
                <Download aria-hidden="true" size={15} />
                Exportar Excel
              </button>
            </div>

            <div className="dre-comparison-summary">
              {summary.map((item) => (
                <span key={item.label}>
                  <em>{item.label}</em>
                  <strong>{item.value}</strong>
                </span>
              ))}
            </div>

            <div className="dre-comparison-table-wrap">
              <table className="dre-comparison-table">
                <thead>
                  <tr>
                    <th>Campo do DRE</th>
                    {months.map((month) => (
                      <th key={month}>{month}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {comparisonRows.map((row) => (
                    <tr className={row.kind} key={row.label}>
                      <th>{row.label}</th>
                      {row.values.map((value, index) => (
                        <td key={`${row.label}-${months[index]}`}>{value}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}
