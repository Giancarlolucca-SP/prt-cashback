import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts';
import { dashboardAPI, campaignsAPI, establishmentsAPI } from '../services/api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';

// ── Constants ─────────────────────────────────────────────────────────────────

const AVG_FUEL_PRICE = 5.50; // mirrors backend constant (for volume chart)

const PERIOD_OPTIONS = [
  { value: '7d',  label: 'Últimos 7 dias'  },
  { value: '15d', label: 'Últimos 15 dias' },
  { value: '30d', label: 'Últimos 30 dias' },
  { value: '60d', label: 'Últimos 60 dias' },
  { value: '90d', label: 'Últimos 90 dias' },
];

const TABS = [
  { id: 'sales',      label: 'Vendas totais',   field: 'totalSales',      chartKey: 'totalSales',    fmt: 'brl'     },
  { id: 'investment', label: 'Investimento',    field: 'totalInvestment', chartKey: 'totalCashback', fmt: 'brl'     },
  { id: 'volume',     label: 'Volume',          field: 'totalVolumeLiters', chartKey: 'totalVolume', fmt: 'liters'  },
  { id: 'fuelings',   label: 'Abastecimentos',  field: 'totalFuelings',   chartKey: 'count',         fmt: 'integer' },
];

const BOTTOM_STATS = [
  { label: 'Média de volume por abastecimento',       field: 'avgVolumePerFueling',      fmt: 'liters'  },
  { label: 'Média de investimento por abastecimento', field: 'avgInvestmentPerFueling',  fmt: 'brl'     },
  { label: 'Média de investimento por litro',         field: 'avgInvestmentPerLiter',    fmt: 'brl'     },
  { label: 'Média de investimento por cliente',       field: 'avgInvestmentPerCustomer', fmt: 'brl'     },
  { label: 'Ticket médio por abastecimento',          field: 'avgTicketPerFueling',      fmt: 'brl'     },
  { label: 'Clientes que abasteceram',                field: 'uniqueCustomersCount',     fmt: 'integer' },
  { label: 'Ticket médio de resgate',                 field: 'avgRedemptionValue',       fmt: 'brl'     },
  { label: 'Clientes com saldo ativo',                field: 'customersWithBalance',     fmt: 'integer' },
];

// ── Date range helpers ────────────────────────────────────────────────────────

const PT_MONTHS = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho',
                   'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
const PT_DAYS_SHORT = ['Do','Se','Te','Qu','Qu','Se','Sá'];

function dateToDDMMYYYY(d) {
  if (!d) return '';
  return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
}
function dateToDDMM(d) {
  if (!d) return '—';
  return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}`;
}
function sameDay(a, b) {
  return a && b && a.getDate()===b.getDate() && a.getMonth()===b.getMonth() && a.getFullYear()===b.getFullYear();
}

// ── DateRangePicker ───────────────────────────────────────────────────────────

function DateRangePicker({ appliedStart, appliedEnd, onApply, onClear }) {
  const [open,      setOpen]      = useState(false);
  const [pickA,     setPickA]     = useState(null);
  const [pickB,     setPickB]     = useState(null);
  const [hover,     setHover]     = useState(null);
  const [viewDate,  setViewDate]  = useState(() => appliedStart || new Date());
  const wrapRef = useRef(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function onDown(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  function openPicker() {
    setPickA(appliedStart || null);
    setPickB(appliedEnd   || null);
    setViewDate(appliedStart || new Date());
    setOpen(true);
  }

  function clickDay(date) {
    if (!pickA || pickB) {
      setPickA(date);
      setPickB(null);
    } else if (sameDay(date, pickA)) {
      setPickA(null);
    } else if (date < pickA) {
      setPickA(date);
      setPickB(null);
    } else {
      setPickB(date);
    }
  }

  function apply() {
    if (!pickA || !pickB) return;
    onApply(pickA, pickB);
    setOpen(false);
  }

  function clear() {
    setPickA(null);
    setPickB(null);
    onClear();
    setOpen(false);
  }

  function isInRange(date) {
    if (!pickA) return false;
    const endD = pickB || hover;
    if (!endD || endD <= pickA) return false;
    return date > pickA && date < endD;
  }

  // Build calendar grid
  const year  = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const cells = [];
  const firstDow    = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));

  const canApply = !!(pickA && pickB);
  const showHint = !!(pickA && !pickB);
  const hasApplied = !!(appliedStart && appliedEnd);

  return (
    <div ref={wrapRef} className="relative">

      {/* ── Trigger button ─────────────────────────────────────────────────── */}
      {hasApplied ? (
        <div className="flex items-center gap-0 h-9 rounded-lg border border-amber-400 bg-amber-50 text-amber-700 text-sm font-medium overflow-hidden">
          <button
            onClick={openPicker}
            className="flex items-center gap-1.5 px-3 h-full hover:bg-amber-100 transition-colors"
          >
            <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <rect x="3" y="4" width="18" height="18" rx="2" />
              <path d="M16 2v4M8 2v4M3 10h18" />
            </svg>
            <span>{dateToDDMM(appliedStart)} → {dateToDDMM(appliedEnd)}</span>
          </button>
          <button
            onClick={clear}
            className="w-8 h-full flex items-center justify-center hover:bg-amber-200 transition-colors border-l border-amber-300 text-amber-500"
            aria-label="Limpar datas"
          >
            ×
          </button>
        </div>
      ) : (
        <button
          onClick={openPicker}
          className="h-9 px-3 rounded-lg border border-gray-200 bg-white text-sm text-gray-600 hover:border-amber-400 hover:text-amber-600 transition-colors flex items-center gap-1.5"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <rect x="3" y="4" width="18" height="18" rx="2" />
            <path d="M16 2v4M8 2v4M3 10h18" />
          </svg>
          Personalizado
        </button>
      )}

      {/* ── Calendar popup ─────────────────────────────────────────────────── */}
      {open && (
        <div className="absolute right-0 top-11 z-50 bg-white rounded-2xl border border-gray-200 shadow-2xl p-5 w-[296px]">

          {/* Month navigation */}
          <div className="flex items-center justify-between mb-4">
            <button
              onClick={() => setViewDate(new Date(year, month - 1, 1))}
              className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-colors text-lg leading-none"
            >
              ‹
            </button>
            <span className="text-sm font-semibold text-gray-800">
              {PT_MONTHS[month]} {year}
            </span>
            <button
              onClick={() => setViewDate(new Date(year, month + 1, 1))}
              className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-colors text-lg leading-none"
            >
              ›
            </button>
          </div>

          {/* Day-of-week headers */}
          <div className="grid grid-cols-7 mb-1">
            {PT_DAYS_SHORT.map((label, i) => (
              <div key={i} className="text-center text-[10px] font-semibold text-gray-400 pb-1">
                {label}
              </div>
            ))}
          </div>

          {/* Day cells */}
          <div className="grid grid-cols-7">
            {cells.map((date, i) => {
              if (!date) return <div key={`e${i}`} className="h-9" />;
              const isStart  = sameDay(date, pickA);
              const isEnd    = sameDay(date, pickB);
              const inRange  = isInRange(date);
              const isToday  = sameDay(date, new Date());
              const isEdge   = isStart || isEnd;
              return (
                <div
                  key={date.toISOString()}
                  className={[
                    'flex items-center justify-center h-9',
                    inRange ? 'bg-amber-50' : '',
                    isStart && pickB ? 'rounded-l-full' : '',
                    isEnd            ? 'rounded-r-full' : '',
                    !isStart && !isEnd && inRange ? '' : '',
                  ].join(' ')}
                  onMouseEnter={() => pickA && !pickB && setHover(date)}
                  onMouseLeave={() => setHover(null)}
                >
                  <button
                    onClick={() => clickDay(date)}
                    className={[
                      'w-8 h-8 rounded-full text-xs font-medium transition-all',
                      isEdge
                        ? 'bg-amber-400 text-white shadow-sm scale-105'
                        : isToday
                        ? 'border-2 border-amber-300 text-amber-700 hover:bg-amber-50'
                        : 'text-gray-700 hover:bg-gray-100',
                    ].join(' ')}
                  >
                    {date.getDate()}
                  </button>
                </div>
              );
            })}
          </div>

          {/* Selected range display */}
          <div className="mt-4 flex items-center justify-center gap-2 text-xs">
            <span className={pickA ? 'font-semibold text-gray-800' : 'text-gray-300'}>
              {pickA ? dateToDDMMYYYY(pickA) : 'DD/MM/AAAA'}
            </span>
            <span className="text-gray-300">→</span>
            <span className={pickB ? 'font-semibold text-gray-800' : 'text-gray-300'}>
              {pickB ? dateToDDMMYYYY(pickB) : 'DD/MM/AAAA'}
            </span>
          </div>

          {/* Hint */}
          {showHint && (
            <p className="text-center text-xs text-amber-600 font-medium mt-2">
              Selecione as duas datas
            </p>
          )}

          {/* Apply button */}
          <button
            onClick={apply}
            disabled={!canApply}
            className={[
              'mt-3 w-full py-2.5 rounded-xl text-sm font-semibold transition-all',
              canApply
                ? 'bg-amber-400 text-white hover:bg-amber-500 shadow-sm'
                : 'bg-gray-100 text-gray-400 cursor-not-allowed',
            ].join(' ')}
          >
            Aplicar filtro
          </button>

          {(appliedStart || pickA) && (
            <button
              onClick={clear}
              className="mt-2 w-full py-1.5 text-xs text-gray-400 hover:text-gray-600 transition-colors"
            >
              Limpar seleção
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ── Formatters ────────────────────────────────────────────────────────────────

function fmtBRL(v) {
  return Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}
function fmtLiters(v) {
  return `${Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} L`;
}
function fmtInt(v) {
  return Number(v || 0).toLocaleString('pt-BR');
}
function fmt(value, type) {
  if (type === 'brl')     return fmtBRL(value);
  if (type === 'liters')  return fmtLiters(value);
  if (type === 'integer') return fmtInt(value);
  return String(value);
}

// YYYY-MM-DD → "01/01"
function fmtDateShort(d) {
  if (!d) return '';
  const [, m, day] = d.split('-');
  return `${day}/${m}`;
}

// YYYY-MM-DD → "01/01/2024"
function fmtDateFull(d) {
  if (!d) return '';
  const [y, m, day] = d.split('-');
  return `${day}/${m}/${y}`;
}

// ── Custom tooltip ────────────────────────────────────────────────────────────

function ChartTooltip({ active, payload, label, activeTab }) {
  if (!active || !payload?.length) return null;
  const tab = TABS.find((t) => t.id === activeTab);
  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-lg px-3 py-2 text-xs">
      <p className="font-semibold text-gray-700 mb-1">{fmtDateFull(label)}</p>
      <p className="text-amber-600 font-bold">{fmt(payload[0]?.value, tab?.fmt)}</p>
    </div>
  );
}

// ── Loading skeleton ──────────────────────────────────────────────────────────

function Pulse({ className }) {
  return <div className={`animate-pulse bg-gray-200 rounded-xl ${className}`} />;
}

function DashboardSkeleton() {
  return (
    <div className="space-y-4">
      <div className="flex gap-2 flex-wrap">
        <Pulse className="h-9 w-44" />
        <Pulse className="h-9 w-36" />
        <Pulse className="h-9 w-40 ml-auto" />
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[0,1,2,3].map((i) => <Pulse key={i} className="h-24" />)}
      </div>
      <Pulse className="h-16" />
      <Pulse className="h-64" />
      <Pulse className="h-48" />
    </div>
  );
}

// ── Chart shared helpers ──────────────────────────────────────────────────────

function ChartSkeleton({ title, height = 240 }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 animate-pulse">
      {title && <div className="h-3 bg-gray-200 rounded w-48 mb-4" />}
      <div className="flex items-end gap-2 px-4" style={{ height }}>
        {[60, 90, 45, 110, 75, 130, 55, 100, 80, 65].map((h, i) => (
          <div
            key={i}
            className="flex-1 bg-gray-100 rounded-t"
            style={{ height: `${h}px` }}
          />
        ))}
      </div>
    </div>
  );
}

function EmptyChart({ title, message }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-8 text-center text-gray-400">
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-6">{title}</p>
      <p className="text-3xl mb-2">📭</p>
      <p className="text-sm">{message}</p>
    </div>
  );
}

// ── Campaign Results Chart ────────────────────────────────────────────────────

function CampaignTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  if (!d) return null;
  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-lg px-3 py-2.5 text-xs max-w-[230px]">
      <p className="font-bold text-gray-800 mb-1 leading-snug">{d.name || d.label}</p>
      {d.message && (
        <p className="text-gray-400 mb-2 italic leading-snug line-clamp-2">"{d.message}"</p>
      )}
      <div className="space-y-0.5">
        <p className="text-gray-500">
          Clientes:{' '}
          <span className="font-bold text-gray-800">
            {(d.customerCount || 0).toLocaleString('pt-BR')}
          </span>
        </p>
        <p className="text-amber-600">
          Cashback:{' '}
          <span className="font-bold">{fmtBRL(d.totalCashbackUsed)}</span>
        </p>
        <p className="text-gray-400 mt-1">
          {d.status === 'SENT' ? '🟢 Ativa' : '⚫ Encerrada'}
        </p>
      </div>
    </div>
  );
}

// Custom bar shape — amber solid for ativa, dashed border for encerrada
function CampaignBar(props) {
  const { x, y, width, height, payload } = props;
  if (!height || height <= 0) return null;
  const r = 4;
  if (payload?.status === 'CLOSED') {
    return (
      <rect
        x={x} y={y} width={width} height={height}
        fill="rgba(226,232,240,0.6)"
        stroke="#94a3b8"
        strokeWidth={1.5}
        strokeDasharray="5 3"
        rx={r} ry={r}
      />
    );
  }
  return <rect x={x} y={y} width={width} height={height} fill="#F59E0B" rx={r} ry={r} />;
}

function CampaignResultsChart({ params }) {
  const [allData,  setAllData]  = useState(null);
  const [loading,  setLoading]  = useState(true);
  const [selected, setSelected] = useState(new Set());

  const paramsKey = JSON.stringify(params);

  useEffect(() => {
    setLoading(true);
    setAllData(null);
    dashboardAPI.getCampaignResults(params)
      .then((res) => {
        const rows = res.data || [];
        setAllData(rows);
        setSelected(new Set(rows.map((r) => r.id)));
      })
      .catch(() => { setAllData([]); setSelected(new Set()); })
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paramsKey]);

  function toggle(id) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        if (next.size === 1) return prev; // manter pelo menos 1
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  if (loading) return <ChartSkeleton title="RESULTADOS DE CAMPANHAS" />;
  if (!allData?.length) return (
    <EmptyChart
      title="Resultados de Campanhas"
      message="Nenhuma campanha enviada no período selecionado."
    />
  );

  const chartData = allData.filter((d) => selected.has(d.id));

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
      {/* Header */}
      <div className="mb-3">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
          Resultados de Campanhas
        </p>
        <p className="text-xs text-gray-400 mt-0.5">
          Cashback creditado por campanha no período
        </p>
      </div>

      {/* Filter buttons */}
      <div className="flex flex-wrap gap-2 mb-4">
        {allData.map((d) => {
          const on       = selected.has(d.id);
          const isActive = d.status === 'SENT';
          return (
            <button
              key={d.id}
              onClick={() => toggle(d.id)}
              className={[
                'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium',
                'border transition-all duration-150',
                on
                  ? isActive
                    ? 'bg-amber-400 text-white border-amber-400 shadow-sm'
                    : 'bg-slate-100 text-slate-600 border-slate-300 border-dashed shadow-sm'
                  : 'bg-white text-gray-400 border-gray-200 hover:border-gray-300 hover:text-gray-600',
              ].join(' ')}
            >
              <span
                className={[
                  'w-2 h-2 rounded-full shrink-0',
                  on ? (isActive ? 'bg-white' : 'bg-slate-400') : 'bg-gray-300',
                ].join(' ')}
              />
              {d.name || d.label}
              {!isActive && (
                <span className="ml-0.5 text-[10px] opacity-60">encerrada</span>
              )}
            </button>
          );
        })}
      </div>

      {/* Chart */}
      {chartData.length === 0 ? (
        <p className="text-center py-8 text-sm text-gray-400">
          Nenhuma campanha selecionada.
        </p>
      ) : (
        <ResponsiveContainer width="100%" height={220}>
          <BarChart
            data={chartData}
            margin={{ top: 4, right: 8, left: 0, bottom: 4 }}
            barCategoryGap="30%"
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 11, fill: '#9ca3af' }}
              axisLine={false}
              tickLine={false}
              angle={0}
              textAnchor="middle"
              interval={0}
              tickFormatter={(v) => (v.length > 14 ? v.slice(0, 14) + '…' : v)}
            />
            <YAxis
              tickFormatter={(v) =>
                `R$${Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 0 })}`
              }
              tick={{ fontSize: 10, fill: '#9ca3af' }}
              axisLine={false}
              tickLine={false}
              width={56}
            />
            <Tooltip
              content={<CampaignTooltip />}
              cursor={{ fill: 'rgba(245,158,11,0.05)' }}
            />
            <Bar
              dataKey="totalCashbackUsed"
              maxBarSize={72}
              isAnimationActive
              animationDuration={400}
              animationEasing="ease-out"
              shape={<CampaignBar />}
            />
          </BarChart>
        </ResponsiveContainer>
      )}

      {/* Legend */}
      <div className="flex items-center gap-4 mt-2 text-xs text-gray-400">
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-sm bg-amber-400 inline-block" />
          Ativa
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-sm bg-slate-100 border border-dashed border-slate-400 inline-block" />
          Encerrada
        </span>
      </div>
    </div>
  );
}

// ── Fuel Type Chart ───────────────────────────────────────────────────────────

const FUEL_METRICS = [
  { id: 'totalTransactions', label: 'Abastecimentos', fmt: 'integer' },
  { id: 'totalValue',        label: 'Valor (R$)',      fmt: 'brl'     },
  { id: 'totalCashback',     label: 'Cashback (R$)',   fmt: 'brl'     },
  { id: 'totalLiters',       label: 'Litros',          fmt: 'liters'  },
];

const FUEL_COLORS = {
  gasolina:           '#F59E0B',
  gasolina_aditivada: '#F97316',
  etanol:             '#10B981',
  diesel:             '#3B82F6',
  diesel_s10:         '#60a5fa',
  gnv:                '#8B5CF6',
};

function FuelTooltip({ active, payload, metricFmt }) {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  if (!d) return null;
  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-lg px-3 py-2.5 text-xs">
      <p className="font-semibold text-gray-700 mb-2">{d.label}</p>
      <p className="text-gray-500">Abastecimentos: <span className="font-bold text-gray-800">{fmtInt(d.totalTransactions)}</span></p>
      <p className="text-amber-600">Valor total: <span className="font-bold">{fmtBRL(d.totalValue)}</span></p>
      <p className="text-green-600">Cashback: <span className="font-bold">{fmtBRL(d.totalCashback)}</span></p>
      <p className="text-purple-500">Litros: <span className="font-bold">{fmtLiters(d.totalLiters)}</span></p>
    </div>
  );
}

function FuelTypeChart({ params }) {
  const [data,         setData]         = useState(null);
  const [loading,      setLoading]      = useState(true);
  const [activeMetric, setActiveMetric] = useState('totalValue');

  const paramsKey = JSON.stringify(params);

  useEffect(() => {
    setLoading(true);
    setData(null);
    dashboardAPI.getFuelTypes(params)
      .then((res) => setData(res.data))
      .catch(() => setData([]))
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paramsKey]);

  const metric = FUEL_METRICS.find((m) => m.id === activeMetric) || FUEL_METRICS[0];

  if (loading) return <ChartSkeleton title="DESEMPENHO POR TIPO DE COMBUSTÍVEL" />;
  if (!data?.length) return (
    <EmptyChart
      title="Desempenho por Tipo de Combustível"
      message="Nenhum abastecimento com tipo de combustível registrado no período."
    />
  );

  function yFmt(v) {
    if (metric.fmt === 'brl')     return `R$${Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 0 })}`;
    if (metric.fmt === 'liters')  return `${Number(v).toFixed(0)}L`;
    return fmtInt(v);
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
            Desempenho por Tipo de Combustível
          </p>
          <p className="text-xs text-gray-400 mt-0.5">Breakdown por tipo no período</p>
        </div>
        <div className="flex gap-0.5 bg-gray-100 rounded-lg p-0.5 flex-wrap">
          {FUEL_METRICS.map((m) => (
            <button
              key={m.id}
              onClick={() => setActiveMetric(m.id)}
              className={[
                'px-2.5 py-1 rounded-md text-xs font-medium transition-colors',
                activeMetric === m.id
                  ? 'bg-white text-gray-800 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700',
              ].join(' ')}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }} barCategoryGap="35%">
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 11, fill: '#9ca3af' }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tickFormatter={yFmt}
            tick={{ fontSize: 10, fill: '#9ca3af' }}
            axisLine={false}
            tickLine={false}
            width={56}
          />
          <Tooltip content={<FuelTooltip metricFmt={metric.fmt} />} cursor={{ fill: 'rgba(59,130,246,0.05)' }} />
          <Bar dataKey={activeMetric} radius={[4, 4, 0, 0]} maxBarSize={60} isAnimationActive>
            {data.map((entry, i) => (
              <Cell key={i} fill={FUEL_COLORS[entry.fuelType] || '#6b7280'} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>

      {/* Color legend */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3">
        {data.map((entry) => (
          <span key={entry.fuelType} className="flex items-center gap-1.5 text-xs text-gray-500">
            <span
              className="w-2.5 h-2.5 rounded-sm inline-block"
              style={{ backgroundColor: FUEL_COLORS[entry.fuelType] || '#6b7280' }}
            />
            {entry.label}
          </span>
        ))}
      </div>
    </div>
  );
}

// ── Establishment Switcher ────────────────────────────────────────────────────

const DOT_PALETTE = ['#F59E0B','#3B82F6','#10B981','#8B5CF6','#EF4444','#F97316'];
function dotColor(id = '') {
  let s = 0; for (let i = 0; i < id.length; i++) s += id.charCodeAt(i);
  return DOT_PALETTE[s % DOT_PALETTE.length];
}

function EstLogo({ logoUrl, name, id, size = 20 }) {
  const [failed, setFailed] = useState(false);
  const style = { width: size, height: size };
  if (logoUrl && !failed) {
    return (
      <img
        src={logoUrl} alt={name}
        onError={() => setFailed(true)}
        style={style}
        className="rounded-full object-contain bg-gray-100 shrink-0 border border-gray-200"
      />
    );
  }
  return (
    <span
      style={{ ...style, backgroundColor: dotColor(id) }}
      className="rounded-full shrink-0 inline-block"
    />
  );
}

function EstablishmentSwitcher({ establishments, selectedId, onSelect, operator, isAdmin }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const current      = establishments.find((e) => e.id === selectedId);
  const displayName  = current?.nome  || operator?.estabelecimento || '—';
  const displayLogo  = current ? current.logoUrl : operator?.logoUrl;
  const displayId    = current?.id    || operator?.estabelecimentoId || '';

  const btnBase = 'flex items-center gap-2 px-3.5 py-2 rounded-lg border border-[#e2e8f0] bg-white text-[#1e293b] text-sm font-semibold transition-colors';

  if (!isAdmin || establishments.length <= 1) {
    return (
      <div className={btnBase}>
        <EstLogo logoUrl={displayLogo} name={displayName} id={displayId} />
        <span>{displayName}</span>
      </div>
    );
  }

  return (
    <div ref={wrapRef} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className={`${btnBase} hover:bg-blue-50 cursor-pointer`}
      >
        <EstLogo logoUrl={displayLogo} name={displayName} id={displayId} />
        <span>{displayName}</span>
        <svg
          className={`w-3.5 h-3.5 text-gray-400 ml-0.5 transition-transform duration-150 ${open ? 'rotate-180' : ''}`}
          fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1.5 z-50 bg-white rounded-xl border border-[#e2e8f0] shadow-xl overflow-hidden min-w-[220px]">
          {establishments.map((est) => {
            const sel = est.id === selectedId;
            return (
              <button
                key={est.id}
                onClick={() => { onSelect(est); setOpen(false); }}
                className={[
                  'w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-left transition-colors',
                  sel ? 'bg-blue-50 text-blue-700 font-semibold' : 'text-[#1e293b] hover:bg-gray-50 font-medium',
                ].join(' ')}
              >
                <EstLogo logoUrl={est.logoUrl} name={est.nome} id={est.id} />
                <span className="flex-1 truncate">{est.nome}</span>
                {sel && (
                  <svg className="w-3.5 h-3.5 text-blue-500 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"/>
                  </svg>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Campaign section ──────────────────────────────────────────────────────────

const STATUS_OPTIONS = [
  { value: 'ativas',     label: 'Campanhas ativas'    },
  { value: 'encerradas', label: 'Encerradas'           },
  { value: 'todas',      label: 'Todas'                },
];

const FILTER_PERIOD_LABEL = {
  ONE_MONTH:    '1 mês',
  TWO_MONTHS:   '2 meses',
  THREE_MONTHS: '3 meses',
  ONE_YEAR:     '1 ano',
};

const REWARD_TYPE_LABEL = {
  FIXED:     'Fixo por cliente',
  PER_LITER: 'Por litro',
};

function CampaignSkeleton() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="bg-white rounded-xl border border-[#e2e8f0] p-5 space-y-3 animate-pulse">
          <div className="h-4 bg-gray-200 rounded w-3/4" />
          <div className="h-3 bg-gray-100 rounded w-1/2" />
          <div className="grid grid-cols-2 gap-3 pt-2">
            {[0,1,2,3].map((j) => (
              <div key={j} className="space-y-1">
                <div className="h-2.5 bg-gray-100 rounded w-2/3" />
                <div className="h-4 bg-gray-200 rounded w-1/2" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function StatusBadge({ status }) {
  if (status === 'CLOSED') {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-[#f1f5f9] text-[#64748b]">
        encerrada
      </span>
    );
  }
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-[#dcfce7] text-[#16a34a]">
      ativa
    </span>
  );
}

function CampaignCard({ campaign, onClose }) {
  const [expanded, setExpanded] = useState(false);
  const [closing, setClosing] = useState(false);

  async function handleClose(e) {
    e.stopPropagation();
    if (!window.confirm('Encerrar esta campanha?')) return;
    setClosing(true);
    try {
      await onClose(campaign.id);
    } finally {
      setClosing(false);
    }
  }

  return (
    <div
      className={[
        'bg-white rounded-xl border shadow-sm p-5 transition-colors',
        'border-[#e2e8f0] hover:border-[#3b82f6]',
      ].join(' ')}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2 mb-1">
        <p className="text-sm font-semibold text-[#1e293b] leading-snug flex-1 line-clamp-2">
          {campaign.message}
        </p>
        <StatusBadge status={campaign.status} />
      </div>

      {/* Date range */}
      <p className="text-xs text-[#64748b] mb-4">
        {campaign.periodStart} até {campaign.periodEnd}
      </p>

      {/* 2×2 info grid */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-3 mb-4">
        <div>
          <p className="text-xs text-[#64748b] mb-0.5">Desconto</p>
          <p className="text-sm font-bold text-[#1e293b]">{campaign.rewardFormatted}</p>
        </div>
        <div>
          <p className="text-xs text-[#64748b] mb-0.5">A partir de</p>
          <p className="text-sm font-bold text-[#1e293b]">—</p>
        </div>
        <div>
          <p className="text-xs text-[#64748b] mb-0.5">Valor máximo</p>
          <p className="text-sm font-bold text-[#1e293b]">{campaign.totalCostFormatted}</p>
        </div>
        <div>
          <p className="text-xs text-[#64748b] mb-0.5">Clientes atingidos</p>
          <p className="text-sm font-bold text-[#1e293b]">{campaign.customerCount.toLocaleString('pt-BR')}</p>
        </div>
      </div>

      {/* Expanded details */}
      {expanded && (
        <div className="border-t border-[#e2e8f0] pt-3 mb-3 space-y-1.5 text-xs text-[#64748b]">
          <p><span className="font-medium text-[#1e293b]">Tipo de recompensa:</span> {REWARD_TYPE_LABEL[campaign.rewardType] || campaign.rewardType}</p>
          <p><span className="font-medium text-[#1e293b]">Período filtrado:</span> {FILTER_PERIOD_LABEL[campaign.filterPeriod] || campaign.filterPeriod}</p>
          <p><span className="font-medium text-[#1e293b]">Operador:</span> {campaign.operatorName}</p>
          <p><span className="font-medium text-[#1e293b]">Criada em:</span> {campaign.createdAtFormatted}</p>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center justify-between">
        {campaign.status !== 'CLOSED' ? (
          <button
            onClick={handleClose}
            disabled={closing}
            className="text-xs font-medium text-red-500 hover:text-red-700 transition-colors disabled:opacity-50"
          >
            {closing ? 'Encerrando…' : 'Encerrar'}
          </button>
        ) : (
          <span />
        )}
        <button
          onClick={() => setExpanded((v) => !v)}
          className="flex items-center gap-1 text-xs font-medium text-[#3b82f6] hover:text-blue-700 transition-colors"
        >
          {expanded ? 'Menos detalhes' : 'Mais detalhes'}
          <svg
            className={`w-3.5 h-3.5 transition-transform ${expanded ? 'rotate-180' : ''}`}
            fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      </div>
    </div>
  );
}

function Pagination({ page, pages, onChange }) {
  if (pages <= 1) return null;

  const items = [];
  for (let i = 1; i <= pages; i++) {
    items.push(i);
  }

  return (
    <div className="flex items-center justify-center gap-1 mt-4">
      <button
        onClick={() => onChange(page - 1)}
        disabled={page === 1}
        className="w-8 h-8 flex items-center justify-center rounded-lg border border-[#e2e8f0] text-[#64748b] hover:bg-[#f8fafc] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        aria-label="Página anterior"
      >
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
      </button>

      {items.map((n) => (
        <button
          key={n}
          onClick={() => onChange(n)}
          className={[
            'w-8 h-8 flex items-center justify-center rounded-lg text-sm font-medium transition-colors',
            n === page
              ? 'bg-[#3b82f6] text-white border border-[#3b82f6]'
              : 'border border-[#e2e8f0] text-[#64748b] hover:bg-[#f8fafc]',
          ].join(' ')}
        >
          {n}
        </button>
      ))}

      <button
        onClick={() => onChange(page + 1)}
        disabled={page === pages}
        className="w-8 h-8 flex items-center justify-center rounded-lg border border-[#e2e8f0] text-[#64748b] hover:bg-[#f8fafc] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        aria-label="Próxima página"
      >
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
      </button>
    </div>
  );
}

// ── Campaign list hook ────────────────────────────────────────────────────────

function useCampaigns() {
  const [statusFilter, setStatusFilter] = useState('ativas');
  const [page, setPage]                 = useState(1);
  const [data, setData]                 = useState(null);
  const [loading, setLoading]           = useState(true);
  const [error, setError]               = useState('');

  const fetch = useCallback(async (status, p) => {
    setLoading(true);
    setError('');
    try {
      const { data: res } = await campaignsAPI.list(status, p);
      setData(res);
    } catch {
      setError('Erro ao carregar campanhas.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetch(statusFilter, page); }, [statusFilter, page, fetch]);

  function handleStatusChange(s) {
    setStatusFilter(s);
    setPage(1);
  }

  async function handleClose(id) {
    try {
      await campaignsAPI.close(id);
      fetch(statusFilter, page);
    } catch {
      // silently refresh
      fetch(statusFilter, page);
    }
  }

  return {
    statusFilter, handleStatusChange,
    page, setPage,
    data, loading, error,
    refresh: () => fetch(statusFilter, page),
    handleClose,
  };
}

// ── Campaign section component ────────────────────────────────────────────────

function CampaignSection() {
  const {
    statusFilter, handleStatusChange,
    page, setPage,
    data, loading, error,
    handleClose,
  } = useCampaigns();

  return (
    <div>
      {/* Section header */}
      <div className="mb-4">
        <h2 className="text-lg font-bold text-[#1e293b]">Campanhas Ativas</h2>
        <p className="text-sm text-[#64748b] mt-0.5">Gerencie suas campanhas em andamento</p>
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap gap-2 items-center bg-[#f8fafc] rounded-xl px-4 py-3 mb-4 border border-[#e2e8f0]">
        <select
          disabled
          className="h-8 pl-3 pr-7 text-sm rounded-lg border border-[#e2e8f0] bg-white text-[#64748b] cursor-not-allowed appearance-none"
        >
          <option>Todos os postos</option>
        </select>

        <select
          value={statusFilter}
          onChange={(e) => handleStatusChange(e.target.value)}
          className="h-8 pl-3 pr-7 text-sm rounded-lg border border-[#e2e8f0] bg-white text-[#1e293b] font-medium cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#3b82f6] appearance-none"
        >
          {STATUS_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>

        {data && (
          <span className="ml-auto text-xs text-[#64748b]">
            {data.total} {data.total === 1 ? 'campanha' : 'campanhas'}
          </span>
        )}
      </div>

      {/* Content */}
      {loading && <CampaignSkeleton />}

      {!loading && error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-600">
          {error}
        </div>
      )}

      {!loading && !error && data?.campaigns?.length === 0 && (
        <div className="bg-white rounded-xl border border-[#e2e8f0] p-10 text-center text-[#64748b]">
          <p className="text-3xl mb-2">📣</p>
          <p className="font-medium text-[#1e293b]">Nenhuma campanha encontrada</p>
          <p className="text-sm mt-1">
            {statusFilter === 'ativas'
              ? 'Crie uma campanha na aba Campanhas.'
              : 'Nenhuma campanha com este filtro.'}
          </p>
        </div>
      )}

      {!loading && !error && data?.campaigns?.length > 0 && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {data.campaigns.map((c) => (
              <CampaignCard key={c.id} campaign={c} onClose={handleClose} />
            ))}
          </div>
          <Pagination
            page={data.page}
            pages={data.pages}
            onChange={(p) => setPage(p)}
          />
        </>
      )}
    </div>
  );
}

// ── Main dashboard ────────────────────────────────────────────────────────────

export default function Dashboard() {
  const { operator, isAdmin } = useAuth();
  const { showToast }         = useToast();

  const [period,        setPeriod]        = useState('30d');
  const [customStart,   setCustomStart]   = useState(null);
  const [customEnd,     setCustomEnd]     = useState(null);
  const [activeTab,     setActiveTab]     = useState('sales');
  const [data,          setData]          = useState(null);
  const [loading,       setLoading]       = useState(true);
  const [error,         setError]         = useState('');
  const [establishments, setEstablishments] = useState([]);
  const [selectedEstId,  setSelectedEstId]  = useState(() => operator?.estabelecimentoId);

  // Load establishment list for admins once
  useEffect(() => {
    if (!isAdmin) return;
    establishmentsAPI.list()
      .then(({ data: res }) => setEstablishments(res.estabelecimentos || []))
      .catch(() => {});
  }, [isAdmin]);

  const hasCustom = !!(customStart && customEnd);
  const isViewingOther = isAdmin && selectedEstId && selectedEstId !== operator?.estabelecimentoId;

  const apiParams = useMemo(() => {
    const p = hasCustom
      ? { startDate: dateToDDMMYYYY(customStart), endDate: dateToDDMMYYYY(customEnd) }
      : { period };
    if (isAdmin && selectedEstId) p.establishmentId = selectedEstId;
    return p;
  }, [period, customStart, customEnd, hasCustom, isAdmin, selectedEstId]);

  function handleSelectEst(est) {
    setSelectedEstId(est.id);
    showToast(`Visualizando dados de ${est.nome}`, 'success');
  }

  const fetchDashboard = useCallback(async (params) => {
    setLoading(true);
    setError('');
    try {
      const { data: res } = await dashboardAPI.getAnalytics(params);
      setData(res);
    } catch (err) {
      setError(err.response?.data?.erro || 'Erro ao carregar dados.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchDashboard(apiParams); }, [JSON.stringify(apiParams), fetchDashboard]); // eslint-disable-line react-hooks/exhaustive-deps

  // Enrich chart data with computed volume per day
  const chartData = data
    ? data.chartData.map((d) => ({
        ...d,
        totalVolume: Math.round((d.totalSales / AVG_FUEL_PRICE) * 10) / 10,
      }))
    : [];

  const currentTab = TABS.find((t) => t.id === activeTab) || TABS[0];

  // Y-axis formatter changes based on active tab
  function yAxisFmt(v) {
    if (currentTab.fmt === 'brl')    return `R$${Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 0 })}`;
    if (currentTab.fmt === 'liters') return `${Number(v).toFixed(0)}L`;
    return String(Math.round(v));
  }

  if (loading) return <DashboardSkeleton />;

  if (error || !data) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-red-700">
        <p className="font-semibold text-sm mb-1">Erro ao carregar dados</p>
        <p className="text-xs text-red-500 mb-3">{error || 'Não foi possível obter os dados do painel.'}</p>
        <button
          onClick={() => fetchDashboard(apiParams)}
          className="text-xs font-medium bg-red-100 hover:bg-red-200 text-red-700 px-4 py-2 rounded-lg transition-colors"
        >
          ↻ Tentar novamente
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">

      {/* ── Filter bar ──────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2">

        {/* Establishment switcher */}
        <EstablishmentSwitcher
          establishments={establishments}
          selectedId={selectedEstId}
          onSelect={handleSelectEst}
          operator={operator}
          isAdmin={isAdmin}
        />

        {/* Period selector — disabled when custom range is active */}
        <select
          value={period}
          onChange={(e) => setPeriod(e.target.value)}
          disabled={hasCustom}
          className={[
            'h-9 pl-3 pr-8 text-sm rounded-lg border bg-white font-medium appearance-none',
            hasCustom
              ? 'border-gray-200 text-gray-400 cursor-not-allowed'
              : 'border-gray-200 text-gray-800 cursor-pointer focus:outline-none focus:ring-2 focus:ring-amber-400',
          ].join(' ')}
        >
          {PERIOD_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>

        {/* Custom date range picker */}
        <div className="ml-auto">
          <DateRangePicker
            appliedStart={customStart}
            appliedEnd={customEnd}
            onApply={(a, b) => { setCustomStart(a); setCustomEnd(b); }}
            onClear={() => { setCustomStart(null); setCustomEnd(null); }}
          />
        </div>

      </div>

      {/* ── Viewing-other-establishment banner ──────────────────────────────── */}
      {isViewingOther && (() => {
        const est = establishments.find((e) => e.id === selectedEstId);
        return (
          <div className="flex items-center gap-3 bg-blue-50 border border-blue-200 rounded-xl px-4 py-3">
            <span className="text-lg shrink-0">👁️</span>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-blue-600">Visualizando dados de outro estabelecimento</p>
              <p className="text-sm font-bold text-blue-900 truncate">{est?.nome}</p>
            </div>
            <button
              onClick={() => setSelectedEstId(operator?.estabelecimentoId)}
              className="shrink-0 text-xs font-semibold text-blue-500 hover:text-blue-700 transition-colors whitespace-nowrap"
            >
              ← Voltar ao meu posto
            </button>
          </div>
        );
      })()}

      {/* ── Metric tabs ─────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {TABS.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={[
                'relative text-left p-4 rounded-xl border-2 transition-all focus:outline-none',
                isActive
                  ? 'border-amber-400 bg-amber-50 shadow-sm'
                  : 'border-gray-200 bg-white hover:border-gray-300',
              ].join(' ')}
            >
              {isActive && (
                <span className="absolute top-3 right-3 w-2 h-2 rounded-full bg-amber-400" />
              )}
              <p className={`text-xs font-medium mb-1.5 ${isActive ? 'text-amber-700' : 'text-gray-500'}`}>
                {tab.label}
              </p>
              <p className={`text-xl font-bold leading-tight ${isActive ? 'text-amber-600' : 'text-gray-900'}`}>
                {fmt(data[tab.field], tab.fmt)}
              </p>
            </button>
          );
        })}
      </div>

      {/* ── Cashback a Resgatar ─────────────────────────────────────────────── */}
      <div className="flex items-center gap-4 bg-purple-50 border border-purple-200 rounded-xl px-5 py-4">
        <div className="shrink-0 w-10 h-10 rounded-full bg-purple-100 flex items-center justify-center text-xl">
          💳
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-purple-600 mb-0.5">Cashback a Resgatar</p>
          <p className="text-2xl font-bold text-purple-700 leading-tight">
            {fmtBRL(data.cashbackToRedeem)}
          </p>
          <p className="text-xs text-purple-500 mt-0.5">Saldo disponível nas carteiras dos clientes</p>
        </div>
      </div>

      {/* ── Line chart ──────────────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 pb-2">
        <p className="text-xs font-semibold text-gray-500 mb-4 uppercase tracking-wide">
          {currentTab.label} —{' '}
          {hasCustom
            ? `${dateToDDMMYYYY(customStart)} → ${dateToDDMMYYYY(customEnd)}`
            : PERIOD_OPTIONS.find((p) => p.value === period)?.label}
        </p>
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
            <XAxis
              dataKey="date"
              tickFormatter={fmtDateShort}
              tick={{ fontSize: 10, fill: '#9ca3af' }}
              axisLine={false}
              tickLine={false}
              interval="preserveStartEnd"
            />
            <YAxis
              tickFormatter={yAxisFmt}
              tick={{ fontSize: 10, fill: '#9ca3af' }}
              axisLine={false}
              tickLine={false}
              width={52}
            />
            <Tooltip
              content={(props) => <ChartTooltip {...props} activeTab={activeTab} />}
              cursor={{ stroke: '#F59E0B', strokeWidth: 1, strokeDasharray: '4 4' }}
            />
            <Line
              type="monotone"
              dataKey={currentTab.chartKey}
              stroke="#F59E0B"
              strokeWidth={2.5}
              dot={false}
              activeDot={{ r: 5, fill: '#F59E0B', stroke: '#fff', strokeWidth: 2 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* ── Campaign Results Chart (3) ───────────────────────────────────────── */}
      <CampaignResultsChart params={apiParams} />

      {/* ── Bottom stats grid (4) ────────────────────────────────────────────── */}
      <div className="bg-[#1e3a5f] rounded-xl p-5">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-5">
          {BOTTOM_STATS.map((stat) => (
            <div key={stat.field}>
              <p className="text-xs text-white/50 font-medium mb-1 leading-snug">{stat.label}</p>
              <p className="text-xl font-bold text-white">
                {fmt(data[stat.field], stat.fmt)}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* ── Fuel Type Chart (5) ──────────────────────────────────────────────── */}
      <FuelTypeChart params={apiParams} />

      {/* Refresh */}
      <button
        onClick={() => fetchDashboard(apiParams)}
        className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
      >
        ↻ Atualizar dados
      </button>

      {/* ── Campaign list ────────────────────────────────────────────────────── */}
      <div className="border-t border-gray-200 pt-6">
        <CampaignSection />
      </div>

    </div>
  );
}
