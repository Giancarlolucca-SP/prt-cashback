import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { adminAPI } from '../services/api.js';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import {
  ChartLineUp, CurrencyDollar, Users, TrendDown, TrendUp, Warning, SignOut,
} from '@phosphor-icons/react';

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtCurrency(val) {
  if (val == null || isNaN(val)) return '—';
  return new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD', maximumFractionDigits: 2,
  }).format(val);
}

function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('pt-BR');
}

// ── Sub-components ────────────────────────────────────────────────────────────

function MetricCard({ title, value, sub, color, icon }) {
  const palette = {
    amber:   { border: 'border-amber-500/30',   icon: 'text-amber-400',   val: 'text-amber-300'   },
    emerald: { border: 'border-emerald-500/30',  icon: 'text-emerald-400', val: 'text-emerald-300' },
    red:     { border: 'border-red-500/30',      icon: 'text-red-400',     val: 'text-red-300'     },
    violet:  { border: 'border-violet-500/30',   icon: 'text-violet-400',  val: 'text-violet-300'  },
    sky:     { border: 'border-sky-500/30',      icon: 'text-sky-400',     val: 'text-sky-300'     },
    orange:  { border: 'border-orange-500/30',   icon: 'text-orange-400',  val: 'text-orange-300'  },
  };
  const c = palette[color] || palette.amber;
  return (
    <div className={`bg-[#1e293b] rounded-xl border ${c.border} p-4 flex flex-col gap-2`}>
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">{title}</span>
        <span className={c.icon}>{icon}</span>
      </div>
      <p className={`text-2xl font-bold ${c.val} leading-none`}>{value}</p>
      {sub && <p className="text-xs text-slate-500">{sub}</p>}
    </div>
  );
}

function StatusBadge({ status }) {
  const map = {
    ACTIVE:     { label: 'Ativo',      cls: 'bg-emerald-500/15 text-emerald-400 ring-emerald-500/20' },
    CANCELLING: { label: 'Cancelando', cls: 'bg-orange-500/15  text-orange-400  ring-orange-500/20'  },
    CANCELLED:  { label: 'Cancelado',  cls: 'bg-red-500/15     text-red-400     ring-red-500/20'     },
    PAST_DUE:   { label: 'Em atraso',  cls: 'bg-yellow-500/15  text-yellow-400  ring-yellow-500/20'  },
    INCOMPLETE: { label: 'Incompleto', cls: 'bg-slate-500/15   text-slate-400   ring-slate-500/20'   },
    UNPAID:     { label: 'Não pago',   cls: 'bg-red-500/15     text-red-400     ring-red-500/20'     },
  };
  const s = map[status] || { label: status, cls: 'bg-slate-500/15 text-slate-400 ring-slate-500/20' };
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${s.cls}`}>
      {s.label}
    </span>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function SaasDashboard() {
  const { logout } = useAuth();
  const navigate   = useNavigate();

  const [data,     setData]     = useState(null);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState(null);
  const [cac,      setCac]      = useState(() => parseFloat(localStorage.getItem('postocash_cac') || '0'));
  const [cacDraft, setCacDraft] = useState('');

  useEffect(() => {
    adminAPI.getSaasMetrics()
      .then(res => setData(res.data))
      .catch(err => setError(err.response?.data?.erro || err.message || 'Erro ao carregar métricas'))
      .finally(() => setLoading(false));
  }, []);

  function handleLogout() {
    logout();
    navigate('/login');
  }

  function saveCac(e) {
    e.preventDefault();
    const val = parseFloat(cacDraft);
    if (!isNaN(val) && val >= 0) {
      setCac(val);
      localStorage.setItem('postocash_cac', String(val));
      setCacDraft('');
    }
  }

  // ── Loading ────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen bg-[#0f172a] flex items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-slate-400">
          <svg className="animate-spin h-8 w-8 text-amber-400" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
          </svg>
          <span className="text-sm">Carregando métricas...</span>
        </div>
      </div>
    );
  }

  // ── Error ──────────────────────────────────────────────────────────────────
  if (error) {
    return (
      <div className="min-h-screen bg-[#0f172a] flex items-center justify-center">
        <div className="text-center flex flex-col items-center gap-3">
          <Warning size={40} weight="duotone" className="text-red-400" />
          <p className="text-red-400 text-lg font-semibold">Erro ao carregar métricas</p>
          <p className="text-slate-500 text-sm">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="mt-2 px-4 py-2 rounded-lg bg-slate-700 text-slate-200 text-sm hover:bg-slate-600 transition-colors"
          >
            Tentar novamente
          </button>
        </div>
      </div>
    );
  }

  const ltv      = data.ltv || 0;
  const cacRatio = cac > 0 ? parseFloat((ltv / cac).toFixed(2)) : 0;

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#0f172a] text-slate-100">

      {/* Top bar */}
      <header className="bg-[#1e293b] border-b border-slate-700 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <ChartLineUp size={22} weight="duotone" className="text-amber-400" />
          <span className="font-bold text-white text-sm tracking-wide">PostoCash — SaaS Admin</span>
          <span className="text-xs bg-amber-500/20 text-amber-300 ring-1 ring-amber-500/30 rounded-full px-2 py-0.5 font-semibold">
            SUPERADMIN
          </span>
        </div>
        <button
          onClick={handleLogout}
          className="flex items-center gap-2 text-slate-400 hover:text-white text-xs font-medium transition-colors"
        >
          <SignOut size={16} weight="duotone" />
          Sair
        </button>
      </header>

      <div className="px-4 sm:px-6 py-6">

        {/* Page heading */}
        <div className="mb-8">
          <h1 className="text-xl font-bold text-white">Painel SaaS</h1>
          <p className="text-slate-400 text-sm mt-0.5">Métricas de receita e assinaturas em tempo real</p>
        </div>

        {/* Metric cards */}
        <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4 mb-8">
          <MetricCard
            title="MRR"
            value={fmtCurrency(data.mrr)}
            sub={`ARR: ${fmtCurrency(data.arr)}`}
            color="amber"
            icon={<CurrencyDollar size={20} weight="duotone" />}
          />
          <MetricCard
            title="Assinaturas"
            value={data.activeSubscriptions}
            sub={`+${data.newThisMonth} este mês`}
            color="emerald"
            icon={<Users size={20} weight="duotone" />}
          />
          <MetricCard
            title="Churn Rate"
            value={`${data.churnRate}%`}
            sub={`${data.cancelledThisMonth} cancelamento(s) este mês`}
            color={data.churnRate > 5 ? 'red' : 'emerald'}
            icon={<TrendDown size={20} weight="duotone" />}
          />
          <MetricCard
            title="LTV"
            value={fmtCurrency(ltv)}
            sub="Ticket médio / Churn rate"
            color="violet"
            icon={<TrendUp size={20} weight="duotone" />}
          />
          <MetricCard
            title="CAC"
            value={fmtCurrency(cac)}
            sub="Input manual"
            color="sky"
            icon={<CurrencyDollar size={20} weight="duotone" />}
          />
          <MetricCard
            title="LTV / CAC"
            value={cac > 0 ? `${cacRatio}x` : '—'}
            sub={cac > 0 ? (cacRatio >= 3 ? 'Saudável ✓' : 'Abaixo do ideal') : 'Defina o CAC abaixo'}
            color={cacRatio >= 3 ? 'emerald' : 'orange'}
            icon={<ChartLineUp size={20} weight="duotone" />}
          />
        </div>

        {/* Revenue chart */}
        <div className="bg-[#1e293b] rounded-xl border border-slate-700 p-6 mb-8">
          <h2 className="text-base font-semibold text-white mb-6">
            Receita por Mês — últimos 12 meses
          </h2>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={data.revenueByMonth} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
              <XAxis
                dataKey="month"
                tick={{ fill: '#94a3b8', fontSize: 11 }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fill: '#94a3b8', fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                tickFormatter={v => `$${v}`}
              />
              <Tooltip
                cursor={{ fill: 'rgba(255,255,255,0.04)' }}
                contentStyle={{
                  backgroundColor: '#0f172a',
                  border: '1px solid #334155',
                  borderRadius: 8,
                  color: '#f1f5f9',
                }}
                formatter={v => [fmtCurrency(v), 'Receita']}
              />
              <Bar dataKey="revenue" fill="#f59e0b" radius={[4, 4, 0, 0]} maxBarSize={48} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Bottom row: CAC input + table */}
        <div className="grid grid-cols-1 xl:grid-cols-[280px_1fr] gap-6 mb-8">

          {/* CAC manual input */}
          <div className="bg-[#1e293b] rounded-xl border border-slate-700 p-6 self-start">
            <h2 className="text-base font-semibold text-white mb-1">CAC — Custo de Aquisição</h2>
            <p className="text-slate-500 text-xs mb-4">
              Custo médio para adquirir um cliente (publicidade, vendas, etc.)
            </p>
            <form onSubmit={saveCac} className="flex gap-2">
              <input
                type="number"
                min="0"
                step="0.01"
                placeholder="Ex: 150.00"
                value={cacDraft}
                onChange={e => setCacDraft(e.target.value)}
                className="flex-1 bg-[#0f172a] border border-slate-600 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-amber-500 transition-colors"
              />
              <button
                type="submit"
                className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-gray-900 font-semibold text-sm rounded-lg transition-colors"
              >
                Salvar
              </button>
            </form>
            {cac > 0 && (
              <p className="mt-3 text-xs text-slate-400">
                CAC atual: <span className="text-amber-400 font-semibold">{fmtCurrency(cac)}</span>
              </p>
            )}
          </div>

          {/* Establishments table */}
          <div className="bg-[#1e293b] rounded-xl border border-slate-700 overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-700">
              <h2 className="text-base font-semibold text-white">Estabelecimentos</h2>
              <p className="text-slate-500 text-xs mt-0.5">{data.establishments.length} cadastrados</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-700/50">
                    {['Nome', 'Email', 'Status', 'Início', 'Próximo Pgto', 'Valor'].map((h, i) => (
                      <th
                        key={h}
                        className={`px-6 py-3 text-xs font-semibold uppercase tracking-wider text-slate-400 ${i === 5 ? 'text-right' : 'text-left'}`}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700/40">
                  {data.establishments.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-6 py-10 text-center text-slate-500">
                        Nenhum estabelecimento cadastrado
                      </td>
                    </tr>
                  )}
                  {data.establishments.map((est, i) => (
                    <tr key={i} className="hover:bg-slate-700/20 transition-colors">
                      <td className="px-6 py-3 font-medium text-white whitespace-nowrap">{est.name}</td>
                      <td className="px-6 py-3 text-slate-400 whitespace-nowrap">{est.email}</td>
                      <td className="px-6 py-3"><StatusBadge status={est.status} /></td>
                      <td className="px-6 py-3 text-slate-400 whitespace-nowrap">{fmtDate(est.startDate)}</td>
                      <td className="px-6 py-3 text-slate-400 whitespace-nowrap">{fmtDate(est.nextPayment)}</td>
                      <td className="px-6 py-3 text-right font-semibold text-amber-400 whitespace-nowrap">
                        {fmtCurrency(est.amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
