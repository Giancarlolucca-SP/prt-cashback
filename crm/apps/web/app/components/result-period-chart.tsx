"use client";

import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";

const monthlyData = [
  { label: "Jan", receita: 428000, lucro: 56200, margem: 16.8, despesas: 74800 },
  { label: "Fev", receita: 452000, lucro: 62100, margem: 17.4, despesas: 81600 },
  { label: "Mar", receita: 489000, lucro: 70400, margem: 18.1, despesas: 84200 },
  { label: "Abr", receita: 436000, lucro: 54800, margem: 15.9, despesas: 79200 },
  { label: "Mai", receita: 512000, lucro: 78300, margem: 18.6, despesas: 88700 },
  { label: "Jun", receita: 544000, lucro: 84200, margem: 19.2, despesas: 91400 }
];

const quarterlyData = [
  { label: "1T", receita: 1369000, lucro: 188700, margem: 17.5, despesas: 240600 },
  { label: "2T", receita: 1492000, lucro: 217300, margem: 17.9, despesas: 259300 },
  { label: "3T", receita: 1568000, lucro: 232500, margem: 18.4, despesas: 271000 },
  { label: "4T", receita: 1712000, lucro: 268900, margem: 19.1, despesas: 286400 }
];

const modes = ["Mensal", "Trimestral"] as const;
type Mode = (typeof modes)[number];

const currency = new Intl.NumberFormat("pt-BR", {
  currency: "BRL",
  maximumFractionDigits: 0,
  style: "currency"
});

const percent = new Intl.NumberFormat("pt-BR", {
  maximumFractionDigits: 1,
  style: "percent"
});

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

export function ResultPeriodChart() {
  const [mode, setMode] = useState<Mode>("Mensal");
  const [startDate, setStartDate] = useState("2026-01-01");
  const [endDate, setEndDate] = useState(todayIsoDate);
  const data = mode === "Mensal" ? monthlyData : quarterlyData;

  function updateStartDate(value: string) {
    setStartDate(value);
  }

  function updateEndDate(value: string) {
    setEndDate(value);
  }

  const totals = useMemo(() => {
    const receita = data.reduce((sum, item) => sum + item.receita, 0);
    const lucro = data.reduce((sum, item) => sum + item.lucro, 0);
    const despesas = data.reduce((sum, item) => sum + item.despesas, 0);
    const margem = receita > 0 ? lucro / receita : 0;

    return [
      { label: "Receita total", value: currency.format(receita), tone: "teal" },
      { label: "Lucro liquido", value: currency.format(lucro), tone: "blue" },
      { label: "Margem media", value: percent.format(margem), tone: "amber" },
      { label: "Despesas totais", value: currency.format(despesas), tone: "rose" }
    ];
  }, [data]);

  return (
    <section className="panel result-chart-panel" aria-label="Grafico ajustavel de resultado por periodo">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Analise por data</p>
          <h3>Receita, lucro, margem e despesas</h3>
        </div>
        <div className="segmented-control" aria-label="Agrupamento do grafico">
          {modes.map((item) => (
            <button
              className={item === mode ? "active" : ""}
              key={item}
              onClick={() => setMode(item)}
              type="button"
            >
              {item}
            </button>
          ))}
        </div>
      </div>

      <div className="result-chart-controls" aria-label="Periodo do grafico de resultados">
        <label>
          Inicio
          <input max={endDate} onChange={(event) => updateStartDate(event.target.value)} type="date" value={startDate} />
        </label>
        <label>
          Fim
          <input min={startDate} onChange={(event) => updateEndDate(event.target.value)} type="date" value={endDate} />
        </label>
      </div>

      <div className="result-summary-bar">
        {totals.map((item) => (
          <span className={item.tone} key={item.label}>
            <em>{item.label}</em>
            <strong>{item.value}</strong>
          </span>
        ))}
      </div>

      <div className="result-chart-grid compact">
        <div className="chart-box">
          <ResponsiveContainer height={176} width="100%">
            <ComposedChart data={data} margin={{ bottom: 0, left: -18, right: -12, top: 4 }}>
              <CartesianGrid stroke="#ebe7f4" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 10 }} tickLine={false} />
              <YAxis
                tick={{ fontSize: 10 }}
                tickFormatter={(value) => `R$ ${Number(value) / 1000}k`}
                tickLine={false}
                width={48}
                yAxisId="money"
              />
              <YAxis
                domain={[0, 25]}
                orientation="right"
                tick={{ fontSize: 10 }}
                tickFormatter={(value) => `${value}%`}
                tickLine={false}
                width={30}
                yAxisId="margin"
              />
              <Tooltip
                contentStyle={{ borderColor: "#e6e1ef", borderRadius: 8, fontSize: 12 }}
                formatter={(value, name) => {
                  if (name === "margem") {
                    return [`${Number(value).toFixed(1)}%`, "Margem media"];
                  }

                  return [currency.format(Number(value)), String(name)];
                }}
              />
              <Bar barSize={11} dataKey="receita" fill="#00a884" name="Receita total" radius={[5, 5, 0, 0]} yAxisId="money" />
              <Bar barSize={11} dataKey="lucro" fill="#7c5cff" name="Lucro liquido" radius={[5, 5, 0, 0]} yAxisId="money" />
              <Bar barSize={11} dataKey="despesas" fill="#ff4d6d" name="Despesas totais" radius={[5, 5, 0, 0]} yAxisId="money" />
              <Line
                dataKey="margem"
                dot={{ r: 2 }}
                name="margem"
                stroke="#ff8a3d"
                strokeWidth={2}
                type="monotone"
                yAxisId="margin"
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>

        <div className="result-chart-side">
          <strong>{mode === "Mensal" ? "Leitura mensal" : "Leitura trimestral"}</strong>
          <span>
            Periodo: {startDate} ate {endDate}. Agrupamento aplicado ao grafico e aos totais.
          </span>
          <div className="mini-chart-box">
            <ResponsiveContainer height={56} width="100%">
              <BarChart data={data}>
                <XAxis dataKey="label" hide />
                <YAxis hide />
                <Tooltip contentStyle={{ borderColor: "#e6e1ef", borderRadius: 8, fontSize: 12 }} formatter={(value) => currency.format(Number(value))} />
                <Bar barSize={9} dataKey="lucro" fill="#7c5cff" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <em>Mini leitura: lucro liquido por {mode === "Mensal" ? "mes" : "trimestre"}.</em>
        </div>
      </div>
    </section>
  );
}
