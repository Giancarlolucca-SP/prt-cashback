import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import { rankingAPI } from '../services/api.js';
import { GasPump, Trophy, ChartBar, TrendingUp, Warning, Mailbox } from '@phosphor-icons/react';

// ── Constants ─────────────────────────────────────────────────────────────────

const PERIOD_PILLS = [
  { value: '7d',  label: '7 dias'  },
  { value: '30d', label: '30 dias' },
  { value: '90d', label: '90 dias' },
];

const CHART_METRICS = [
  { id: 'transactions', label: 'Abastecimentos' },
  { id: 'liters',       label: 'Litros'         },
  { id: 'value',        label: 'Valor R$'        },
];

const LINE_COLORS = [
  '#F59E0B', '#3B82F6', '#10B981', '#8B5CF6',
  '#EF4444', '#F97316', '#06B6D4', '#84CC16',
  '#EC4899', '#14B8A6',
];

const MEDALS = ['1°', '2°', '3°'];

// ── Date helpers ──────────────────────────────────────────────────────────────

const PT_MONTHS    = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho',
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
function fmtDate(isoDate) {
  if (!isoDate) return '—';
  const [, m, d] = isoDate.split('-');
  return `${d}/${m}`;
}

// ── DateRangePicker ───────────────────────────────────────────────────────────

function DateRangePicker({ appliedStart, appliedEnd, onApply, onClear }) {
  const [open,     setOpen]     = useState(false);
  const [pickA,    setPickA]    = useState(null);
  const [pickB,    setPickB]    = useState(null);
  const [hover,    setHover]    = useState(null);
  const [viewDate, setViewDate] = useState(() => appliedStart || new Date());
  const wrapRef = useRef(null);

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
    if (!pickA || pickB) { setPickA(date); setPickB(null); }
    else if (sameDay(date, pickA)) { setPickA(null); }
    else if (date < pickA)         { setPickA(date); setPickB(null); }
    else                           { setPickB(date); }
  }

  function apply() {
    if (!pickA || !pickB) return;
    onApply(pickA, pickB);
    setOpen(false);
  }

  function clear() {
    setPickA(null); setPickB(null);
    onClear();
    setOpen(false);
  }

  function isInRange(date) {
    if (!pickA) return false;
    const endD = pickB || hover;
    if (!endD || endD <= pickA) return false;
    return date > pickA && date < endD;
  }

  const year  = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const cells = [];
  const firstDow    = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));

  const canApply  = !!(pickA && pickB);
  const showHint  = !!(pickA && !pickB);
  const hasApplied = !!(appliedStart && appliedEnd);

  return (
    <div ref={wrapRef} className="relative">
      {hasApplied ? (
        <div className="flex items-center gap-0 h-8 rounded-lg border border-amber-400 bg-amber-50 text-amber-700 text-sm font-medium overflow-hidden">
          <button
            onClick={openPicker}
            className="flex items-center gap-1.5 px-3 h-full hover:bg-amber-100 transition-colors"
          >
            <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" />
            </svg>
            <span>{dateToDDMM(appliedStart)} → {dateToDDMM(appliedEnd)}</span>
          </button>
          <button
            onClick={clear}
            className="w-7 h-full flex items-center justify-center hover:bg-amber-200 transition-colors border-l border-amber-300 text-amber-500"
            aria-label="Limpar datas"
          >×</button>
        </div>
      ) : (
        <button
          onClick={openPicker}
          className="h-8 px-3 rounded-lg border border-gray-200 bg-white text-sm text-gray-600 hover:border-amber-400 hover:text-amber-600 transition-colors flex items-center gap-1.5"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" />
          </svg>
          Personalizado
        </button>
      )}

      {open && (
        <div className="absolute left-0 top-10 z-50 bg-white rounded-2xl border border-gray-200 shadow-2xl p-5 w-[296px]">
          <div className="flex items-center justify-between mb-4">
            <button
              onClick={() => setViewDate(new Date(year, month - 1, 1))}
              className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-colors text-lg"
            >‹</button>
            <span className="text-sm font-semibold text-gray-800">{PT_MONTHS[month]} {year}</span>
            <button
              onClick={() => setViewDate(new Date(year, month + 1, 1))}
              className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-colors text-lg"
            >›</button>
          </div>

          <div className="grid grid-cols-7 mb-1">
            {PT_DAYS_SHORT.map((label, i) => (
              <div key={i} className="text-center text-[10px] font-semibold text-gray-400 pb-1">{label}</div>
            ))}
          </div>

          <div className="grid grid-cols-7">
            {cells.map((date, i) => {
              if (!date) return <div key={`e${i}`} className="h-9" />;
              const isStart = sameDay(date, pickA);
              const isEnd   = sameDay(date, pickB);
              const inRange = isInRange(date);
              const isToday = sameDay(date, new Date());
              const isEdge  = isStart || isEnd;
              return (
                <div
                  key={date.toISOString()}
                  className={['flex items-center justify-center h-9', inRange ? 'bg-amber-50' : '',
                    isStart && pickB ? 'rounded-l-full' : '', isEnd ? 'rounded-r-full' : ''].join(' ')}
                  onMouseEnter={() => pickA && !pickB && setHover(date)}
                  onMouseLeave={() => setHover(null)}
                >
                  <button
                    onClick={() => clickDay(date)}
                    className={['w-8 h-8 rounded-full text-xs font-medium transition-all',
                      isEdge  ? 'bg-amber-400 text-white shadow-sm scale-105' :
                      isToday ? 'border-2 border-amber-300 text-amber-700 hover:bg-amber-50' :
                                'text-gray-700 hover:bg-gray-100'].join(' ')}
                  >{date.getDate()}</button>
                </div>
              );
            })}
          </div>

          <div className="mt-4 flex items-center justify-center gap-2 text-xs">
            <span className={pickA ? 'font-semibold text-gray-800' : 'text-gray-300'}>
              {pickA ? dateToDDMMYYYY(pickA) : 'DD/MM/AAAA'}
            </span>
            <span className="text-gray-300">→</span>
            <span className={pickB ? 'font-semibold text-gray-800' : 'text-gray-300'}>
              {pickB ? dateToDDMMYYYY(pickB) : 'DD/MM/AAAA'}
            </span>
          </div>

          {showHint && (
            <p className="text-center text-xs text-amber-600 font-medium mt-2">Selecione as duas datas</p>
          )}

          <button
            onClick={apply}
            disabled={!canApply}
            className={['mt-3 w-full py-2.5 rounded-xl text-sm font-semibold transition-all',
              canApply ? 'bg-amber-400 text-white hover:bg-amber-500 shadow-sm' : 'bg-gray-100 text-gray-400 cursor-not-allowed'].join(' ')}
          >Aplicar filtro</button>

          {(appliedStart || pickA) && (
            <button
              onClick={clear}
              className="mt-2 w-full py-1.5 text-xs text-gray-400 hover:text-gray-600 transition-colors"
            >Limpar seleção</button>
          )}
        </div>
      )}
    </div>
  );
}

// ── AttendantAvatar ───────────────────────────────────────────────────────────

function AttendantAvatar({ name, size = 40, color = '#F59E0B' }) {
  const initials = name
    ? name.split(/[\s-]+/).map((w) => w[0] || '').join('').slice(0, 2).toUpperCase()
    : '?';
  return (
    <div
      style={{ width: size, height: size, backgroundColor: color, fontSize: size * 0.36 }}
      className="rounded-full flex items-center justify-center font-bold text-white shrink-0 select-none"
    >
      {initials}
    </div>
  );
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

function RankingSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[0,1,2,3].map((i) => <div key={i} className="h-24 bg-gray-200 rounded-xl" />)}
      </div>
      <div className="h-64 bg-gray-200 rounded-xl" />
      <div className="h-56 bg-gray-200 rounded-xl" />
      <div className="h-80 bg-gray-200 rounded-xl" />
    </div>
  );
}

// ── Metric cards ──────────────────────────────────────────────────────────────

function MetricCards({ attendants }) {
  const total       = attendants.reduce((s, a) => s + a.totalTransactions, 0);
  const topAtt      = attendants[0];
  const avg         = attendants.length > 0 ? Math.round(total / attendants.length) : 0;
  const growing     = attendants.find((a) => a.trend === 'up');

  const cards = [
    {
      label: 'Total de Abastecimentos',
      value: fmtInt(total),
      sub:   'no período',
      icon:  <GasPump size={16} weight="duotone" />,
      bg:    'bg-amber-50 border-amber-100',
      val:   'text-amber-700',
    },
    {
      label: 'Atendente Mais Ativo',
      value: topAtt?.name || '—',
      sub:   topAtt ? `${fmtInt(topAtt.totalTransactions)} abastec.` : '',
      icon:  <Trophy size={16} weight="duotone" />,
      bg:    'bg-blue-50 border-blue-100',
      val:   'text-blue-700',
    },
    {
      label: 'Média por Atendente',
      value: fmtInt(avg),
      sub:   'abastecimentos',
      icon:  <ChartBar size={16} weight="duotone" />,
      bg:    'bg-green-50 border-green-100',
      val:   'text-green-700',
    },
    {
      label: 'Maior Crescimento',
      value: growing?.name || '—',
      sub:   growing ? '↑ tendência crescente' : 'sem dados de crescimento',
      icon:  <TrendingUp size={16} weight="duotone" />,
      bg:    'bg-purple-50 border-purple-100',
      val:   'text-purple-700',
    },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {cards.map((card, i) => (
        <div key={i} className={`rounded-xl border p-4 ${card.bg}`}>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-lg">{card.icon}</span>
            <p className="text-xs font-medium text-gray-500 leading-tight">{card.label}</p>
          </div>
          <p className={`text-xl font-bold truncate ${card.val}`}>{card.value}</p>
          {card.sub && <p className="text-xs text-gray-400 mt-0.5">{card.sub}</p>}
        </div>
      ))}
    </div>
  );
}

// ── Podium ────────────────────────────────────────────────────────────────────

const PODIUM_CFG = [
  { medal: '1°', stepH: 'h-16', stepColor: 'bg-amber-400', cardBorder: 'border-amber-200', cardBg: 'bg-amber-50', color: '#F59E0B' },
  { medal: '2°', stepH: 'h-10', stepColor: 'bg-slate-300', cardBorder: 'border-slate-200', cardBg: 'bg-slate-50',  color: '#94A3B8' },
  { medal: '3°', stepH: 'h-7',  stepColor: 'bg-orange-300', cardBorder: 'border-orange-200', cardBg: 'bg-orange-50', color: '#F97316' },
];

function PodiumCard({ attendant, posIdx }) {
  const cfg = PODIUM_CFG[posIdx];
  return (
    <div className="flex flex-col items-center w-[118px]">
      <div className={`w-full rounded-xl border ${cfg.cardBg} ${cfg.cardBorder} p-3 text-center`}>
        <div className="text-2xl mb-2">{cfg.medal}</div>
        <div className="flex justify-center mb-2">
          <AttendantAvatar name={attendant.name} size={40} color={cfg.color} />
        </div>
        <p className="text-sm font-bold text-gray-900 truncate" title={attendant.name}>
          {attendant.name}
        </p>
        {attendant.code && (
          <p className="text-[10px] text-gray-400 mb-1">#{attendant.code}</p>
        )}
        <p className="text-base font-bold text-amber-600">{fmtInt(attendant.totalTransactions)}</p>
        <p className="text-[10px] text-gray-400">abastec.</p>
        <div className="mt-2 pt-2 border-t border-white/60 space-y-0.5">
          <p className="text-xs text-gray-500">{fmtLiters(attendant.totalLiters)}</p>
          <p className="text-xs font-semibold text-gray-700">{fmtBRL(attendant.totalValue)}</p>
        </div>
      </div>
      <div className={`w-full ${cfg.stepH} mt-1.5 ${cfg.stepColor} rounded-t-lg`} />
    </div>
  );
}

function Podium({ top3 }) {
  // Display order: 2nd → 1st → 3rd  (1st elevated in center)
  const displayOrder = [1, 0, 2].filter((i) => i < top3.length);

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-6">
        Pódio — Top 3
      </p>
      <div className="flex items-end justify-center gap-3">
        {displayOrder.map((posIdx) => (
          <PodiumCard key={top3[posIdx].name} attendant={top3[posIdx]} posIdx={posIdx} />
        ))}
      </div>
    </div>
  );
}

// ── Ranking table ─────────────────────────────────────────────────────────────

function TrendIcon({ trend }) {
  if (trend === 'up')     return <span className="text-green-500 font-bold text-base leading-none">↑</span>;
  if (trend === 'down')   return <span className="text-red-500 font-bold text-base leading-none">↓</span>;
  return <span className="text-gray-400 text-base leading-none">→</span>;
}

function RankingTable({ attendants, selectedAttendant, onSelect }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
          Ranking Completo
        </p>
        <span className="text-xs text-gray-400">{attendants.length} atendente{attendants.length !== 1 ? 's' : ''}</span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[680px]">
          <thead>
            <tr className="text-xs text-gray-400 bg-gray-50 border-b border-gray-100">
              <th className="text-left py-3 px-4 font-medium w-10">#</th>
              <th className="text-left py-3 px-3 font-medium">Atendente</th>
              <th className="text-right py-3 px-3 font-medium">Abastecimentos</th>
              <th className="text-right py-3 px-3 font-medium">Litros</th>
              <th className="text-right py-3 px-3 font-medium">Valor Total</th>
              <th className="text-right py-3 px-3 font-medium">Cashback</th>
              <th className="text-right py-3 px-3 font-medium">Ticket Médio</th>
              <th className="text-right py-3 px-3 font-medium">Última Atividade</th>
              <th className="text-center py-3 px-4 font-medium">Tendência</th>
            </tr>
          </thead>
          <tbody>
            {attendants.map((att, idx) => {
              const isSelected = selectedAttendant === att.name;
              const isWarning  = att.belowAverage;
              return (
                <tr
                  key={att.name}
                  onClick={() => onSelect(att.name)}
                  title={isWarning ? 'Abaixo da média do período' : undefined}
                  className={[
                    'border-b border-gray-50 last:border-0 cursor-pointer transition-colors',
                    isSelected
                      ? 'bg-amber-50 ring-1 ring-inset ring-amber-200'
                      : isWarning
                      ? 'bg-red-50 hover:bg-red-100'
                      : 'hover:bg-gray-50',
                  ].join(' ')}
                >
                  {/* Rank */}
                  <td className="py-3 px-4 text-xs text-gray-400 font-medium">
                    {idx < 3 ? MEDALS[idx] : att.rank}
                  </td>

                  {/* Name */}
                  <td className="py-3 px-3">
                    <div className="flex items-center gap-2">
                      <AttendantAvatar
                        name={att.name}
                        size={30}
                        color={LINE_COLORS[idx % LINE_COLORS.length]}
                      />
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="font-semibold text-gray-900 truncate">{att.name}</span>
                          {att.code && (
                            <span className="text-[10px] text-gray-400 shrink-0">#{att.code}</span>
                          )}
                          {isWarning && (
                            <Warning size={16} weight="bold" className="text-yellow-500 shrink-0 inline" title="Abaixo da média do período" />
                          )}
                        </div>
                      </div>
                    </div>
                  </td>

                  {/* Transactions */}
                  <td className={[
                    'py-3 px-3 text-right font-bold tabular-nums',
                    idx < 3 ? 'text-amber-600' : 'text-gray-700',
                  ].join(' ')}>
                    {fmtInt(att.totalTransactions)}
                  </td>

                  {/* Liters */}
                  <td className="py-3 px-3 text-right text-gray-600 tabular-nums">
                    {att.totalLiters > 0 ? fmtLiters(att.totalLiters) : '—'}
                  </td>

                  {/* Value */}
                  <td className="py-3 px-3 text-right font-medium text-gray-700 tabular-nums">
                    {fmtBRL(att.totalValue)}
                  </td>

                  {/* Cashback */}
                  <td className="py-3 px-3 text-right text-green-600 font-semibold tabular-nums">
                    {fmtBRL(att.totalCashback)}
                  </td>

                  {/* Avg ticket */}
                  <td className="py-3 px-3 text-right text-gray-600 tabular-nums">
                    {fmtBRL(att.avgTicket)}
                  </td>

                  {/* Last activity */}
                  <td className="py-3 px-3 text-right text-xs text-gray-400 tabular-nums">
                    {fmtDate(att.lastTransaction)}
                  </td>

                  {/* Trend */}
                  <td className="py-3 px-4 text-center">
                    <TrendIcon trend={att.trend} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Legend */}
      <div className="px-4 py-3 border-t border-gray-100 bg-gray-50 flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-gray-400">
        <span>Clique em uma linha para destacar no gráfico</span>
        <span>Abaixo de 50% da média</span>
        <span>Top 3</span>
        <span className="ml-auto flex items-center gap-3">
          <span className="flex items-center gap-1"><span className="text-green-500 font-bold">↑</span> crescimento</span>
          <span className="flex items-center gap-1"><span className="text-red-500 font-bold">↓</span> queda</span>
          <span className="flex items-center gap-1"><span className="text-gray-400">→</span> estável</span>
        </span>
      </div>
    </div>
  );
}

// ── Chart ─────────────────────────────────────────────────────────────────────

function ChartTooltip({ active, payload, label, metric }) {
  if (!active || !payload?.length) return null;
  const visible = payload.filter((p) => p.value != null && p.value !== 0);
  if (!visible.length) return null;
  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-xl px-3 py-2.5 text-xs">
      <p className="font-semibold text-gray-700 mb-2">{label}</p>
      {visible.map((p, i) => (
        <div key={i} className="flex items-center gap-2 mb-0.5">
          <span style={{ color: p.color }}>●</span>
          <span className="text-gray-500">{p.dataKey}:</span>
          <span className="font-bold text-gray-800">
            {metric === 'value'  ? fmtBRL(p.value) :
             metric === 'liters' ? fmtLiters(p.value) :
             fmtInt(p.value)}
          </span>
        </div>
      ))}
    </div>
  );
}

function AttendantChart({ charts, attendantNames, selectedAttendant, chartMetric, setChartMetric }) {
  const chartData = charts?.[chartMetric] || [];
  const hasData   = chartData.some((d) => attendantNames.some((n) => d[n] != null && d[n] > 0));

  function yFmt(v) {
    if (chartMetric === 'value')  return `R$${Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 0 })}`;
    if (chartMetric === 'liters') return `${Number(v).toFixed(0)}L`;
    return String(Math.round(v));
  }

  const yWidth = chartMetric === 'value' ? 68 : 44;

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
            Evolução por Período
          </p>
          <p className="text-xs text-gray-400 mt-0.5">
            {selectedAttendant
              ? `Destaque: ${selectedAttendant} — clique novamente para remover`
              : 'Clique em um atendente na tabela para destacar'}
          </p>
        </div>
        {/* Metric toggle */}
        <div className="flex gap-0.5 bg-gray-100 rounded-lg p-0.5">
          {CHART_METRICS.map((m) => (
            <button
              key={m.id}
              onClick={() => setChartMetric(m.id)}
              className={[
                'px-3 py-1 rounded-md text-xs font-medium transition-colors',
                chartMetric === m.id
                  ? 'bg-white text-gray-800 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700',
              ].join(' ')}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      {!hasData ? (
        <div className="flex flex-col items-center justify-center py-14 text-gray-400">
          <ChartBar size={40} weight="duotone" className="text-stone-300 mb-3 mx-auto" />
          <p className="text-sm">Nenhum dado para o período selecionado</p>
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={chartData} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 10, fill: '#9ca3af' }}
              axisLine={false}
              tickLine={false}
              interval="preserveStartEnd"
            />
            <YAxis
              tickFormatter={yFmt}
              tick={{ fontSize: 10, fill: '#9ca3af' }}
              axisLine={false}
              tickLine={false}
              width={yWidth}
            />
            <Tooltip
              content={(props) => <ChartTooltip {...props} metric={chartMetric} />}
              cursor={{ stroke: '#e5e7eb', strokeWidth: 1 }}
            />
            <Legend
              wrapperStyle={{ paddingTop: 12 }}
              formatter={(value) => (
                <span style={{ fontSize: 11, color: '#6b7280' }}>{value}</span>
              )}
            />
            {attendantNames.map((name, idx) => {
              const color       = LINE_COLORS[idx % LINE_COLORS.length];
              const isSelected  = selectedAttendant === name;
              const isDeemphasized = selectedAttendant && !isSelected;
              return (
                <Line
                  key={name}
                  type="monotone"
                  dataKey={name}
                  stroke={color}
                  strokeWidth={isSelected ? 3 : isDeemphasized ? 1 : 2}
                  strokeOpacity={isDeemphasized ? 0.25 : 1}
                  dot={false}
                  activeDot={{ r: 4, strokeWidth: 0 }}
                  connectNulls={false}
                />
              );
            })}
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function Ranking() {
  const [period,      setPeriod]      = useState('30d');
  const [customStart, setCustomStart] = useState(null);
  const [customEnd,   setCustomEnd]   = useState(null);
  const [attendant,   setAttendant]   = useState('todos');

  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);

  const [chartMetric,       setChartMetric]       = useState('transactions');
  const [selectedAttendant, setSelectedAttendant] = useState(null);
  const [knownAttendants,   setKnownAttendants]   = useState([]);

  const hasCustom = !!(customStart && customEnd);

  const apiParams = useMemo(() => {
    const p = hasCustom
      ? { startDate: dateToDDMMYYYY(customStart), endDate: dateToDDMMYYYY(customEnd) }
      : { period };
    if (attendant !== 'todos') p.attendant = attendant;
    return p;
  }, [period, customStart, customEnd, hasCustom, attendant]);

  const fetchData = useCallback((params) => {
    setLoading(true);
    rankingAPI.get(params)
      .then((res) => {
        const d = res.data;
        setData(d);
        if (!params.attendant && d.attendants?.length) {
          setKnownAttendants(d.attendants.map((a) => a.name));
        }
      })
      .catch(() => setData({ attendants: [], charts: { transactions: [], liters: [], value: [] }, period: null }))
      .finally(() => setLoading(false));
  }, []);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchData(apiParams); }, [JSON.stringify(apiParams)]);

  function handlePillClick(val) {
    setPeriod(val);
    setCustomStart(null);
    setCustomEnd(null);
  }

  function handleSelectAttendant(name) {
    setSelectedAttendant((prev) => (prev === name ? null : name));
  }

  function handleAttendantFilter(val) {
    setAttendant(val);
    setSelectedAttendant(null);
  }

  const attendants     = data?.attendants || [];
  const attendantNames = attendants.map((a) => a.name);
  const top3           = attendants.slice(0, 3);
  const isEmpty        = !loading && attendants.length === 0;

  return (
    <div className="space-y-5">

      {/* ── Header ────────────────────────────────────────────────────────────── */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Ranking de Atendentes</h1>
        <p className="text-sm text-gray-500 mt-1">Performance por período</p>
      </div>

      {/* ── Filter bar ────────────────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm px-4 py-3">
        <div className="flex flex-wrap items-center gap-2">

          {/* Period pills */}
          <div className="flex gap-1.5 flex-wrap">
            {PERIOD_PILLS.map((p) => (
              <button
                key={p.value}
                onClick={() => handlePillClick(p.value)}
                className={[
                  'h-8 px-3.5 rounded-lg text-sm font-medium transition-colors',
                  period === p.value && !hasCustom
                    ? 'bg-amber-400 text-white shadow-sm'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200',
                ].join(' ')}
              >
                {p.label}
              </button>
            ))}

            {/* Custom date range */}
            <DateRangePicker
              appliedStart={customStart}
              appliedEnd={customEnd}
              onApply={(a, b) => { setCustomStart(a); setCustomEnd(b); }}
              onClear={() => { setCustomStart(null); setCustomEnd(null); }}
            />
          </div>

          {/* Divider */}
          <div className="w-px h-6 bg-gray-200 hidden sm:block" />

          {/* Attendant dropdown */}
          <select
            value={attendant}
            onChange={(e) => handleAttendantFilter(e.target.value)}
            className="h-8 pl-3 pr-7 text-sm rounded-lg border border-gray-200 bg-white text-gray-700 font-medium appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-amber-300"
          >
            <option value="todos">Todos os atendentes</option>
            {knownAttendants.map((name) => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>

          {/* Apply / refresh button */}
          <button
            onClick={() => fetchData(apiParams)}
            className="h-8 px-4 bg-amber-400 text-white text-sm font-semibold rounded-lg hover:bg-amber-500 transition-colors"
          >
            Aplicar filtro
          </button>

        </div>
      </div>

      {/* ── Loading ───────────────────────────────────────────────────────────── */}
      {loading && <RankingSkeleton />}

      {/* ── Empty state ───────────────────────────────────────────────────────── */}
      {isEmpty && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-16 text-center">
          <Mailbox size={48} weight="duotone" className="text-stone-300 mb-4 mx-auto" />
          <p className="text-lg font-semibold text-gray-700">Nenhum dado encontrado</p>
          <p className="text-sm text-gray-400 mt-1">
            Nenhum dado encontrado para o período selecionado
          </p>
          <p className="text-xs text-gray-300 mt-3">
            Os atendentes aparecem aqui após cupons NF-e serem validados no app.
          </p>
        </div>
      )}

      {/* ── Content ───────────────────────────────────────────────────────────── */}
      {!loading && attendants.length > 0 && (
        <>
          {/* Metric cards */}
          <MetricCards attendants={attendants} />

          {/* Podium — only when ≥ 2 attendants */}
          {top3.length >= 2 && <Podium top3={top3} />}

          {/* Full ranking table */}
          <RankingTable
            attendants={attendants}
            selectedAttendant={selectedAttendant}
            onSelect={handleSelectAttendant}
          />

          {/* Evolution chart */}
          <AttendantChart
            charts={data.charts}
            attendantNames={attendantNames}
            selectedAttendant={selectedAttendant}
            chartMetric={chartMetric}
            setChartMetric={setChartMetric}
          />

          {/* Period info footer */}
          {data.period && (
            <p className="text-xs text-gray-400 text-center pb-2">
              Período:{' '}
              {data.period.startDate.split('-').reverse().join('/')}
              {' '}→{' '}
              {data.period.endDate.split('-').reverse().join('/')}
              {' '}({data.period.totalDays} dias)
            </p>
          )}
        </>
      )}

    </div>
  );
}
