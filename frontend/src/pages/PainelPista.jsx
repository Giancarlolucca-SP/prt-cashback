import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RTooltip, Legend } from 'recharts';
import { pistaAPI, attendantsAPI } from '../services/api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { applyCpfMask, stripCpf } from '../utils/cpfMask.js';
import {
  GasPump, HandCoins, Receipt, Warning, Printer, X, ArrowClockwise, CheckCircle, ClockCounterClockwise,
  ChartPie, Drop, IdentificationCard, Plus, Trash, UserCircle,
} from '@phosphor-icons/react';

// Fuel keys (match each establishment's cashback config)
const FUEL_OPTIONS = [
  { value: '',                   label: 'Sem combustível específico' },
  { value: 'gasolina',           label: 'Gasolina' },
  { value: 'gasolina_aditivada', label: 'Gasolina Aditivada' },
  { value: 'etanol',             label: 'Etanol' },
  { value: 'diesel',             label: 'Diesel' },
  { value: 'diesel_s10',         label: 'Diesel S-10' },
  { value: 'gnv',                label: 'GNV' },
];

const PIE_COLORS = ['#F59E0B', '#3B82F6', '#10B981', '#8B5CF6', '#EF4444', '#06B6D4', '#F97316', '#EC4899', '#84CC16', '#94A3B8'];

const TABS = [
  { id: 'dashboard',    label: 'Dashboard',    icon: <ChartPie size={18} weight="duotone" /> },
  { id: 'acumulo',      label: 'Acúmulo',      icon: <GasPump size={18} weight="duotone" /> },
  { id: 'resgates',     label: 'Resgates',     icon: <HandCoins size={18} weight="duotone" /> },
  { id: 'caixa',        label: 'Caixa',        icon: <Receipt size={18} weight="duotone" /> },
  { id: 'combustiveis', label: 'Combustíveis', icon: <Drop size={18} weight="duotone" />, adminOnly: true },
  { id: 'cartoes',      label: 'Cartões',      icon: <IdentificationCard size={18} weight="duotone" />, adminOnly: true },
];

function fmtL(v) { return `${Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} L`; }

function fmtBRL(v) {
  return Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function printText(text) {
  const w = window.open('', '_blank', 'width=380,height=640');
  if (!w) return;
  const safe = String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;');
  w.document.write(
    `<html><head><title>Comprovante de Cashback</title>` +
    `<style>body{font-family:'Courier New',monospace;white-space:pre;font-size:12px;line-height:1.35;padding:14px;}</style>` +
    `</head><body>${safe}</body></html>`
  );
  w.document.close();
  w.focus();
  setTimeout(() => w.print(), 250);
}

// ── Comprovante modal ─────────────────────────────────────────────────────────

function ComprovanteModal({ text, onClose }) {
  return (
    <div className="fixed inset-0 z-[100] bg-black/40 flex items-center justify-center p-4" onMouseDown={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm flex flex-col" onMouseDown={(e) => e.stopPropagation()}>
        <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
          <p className="text-sm font-bold text-gray-900">Comprovante de cashback</p>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100"><X size={18} /></button>
        </div>
        <pre className="px-5 py-4 text-[12px] leading-snug text-slate-800 font-mono whitespace-pre overflow-x-auto bg-slate-50">{text}</pre>
        <div className="px-5 py-3 border-t border-gray-100 flex gap-2">
          <button onClick={() => printText(text)} className="flex-1 h-9 inline-flex items-center justify-center gap-1.5 bg-amber-400 text-white text-sm font-semibold rounded-lg hover:bg-amber-500">
            <Printer size={16} weight="bold" /> Imprimir
          </button>
          <button onClick={onClose} className="h-9 px-4 text-sm font-semibold text-slate-500 rounded-lg hover:bg-slate-100">Fechar</button>
        </div>
      </div>
    </div>
  );
}

// ── Reminder banner ───────────────────────────────────────────────────────────

function ReminderBanner() {
  return (
    <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded-xl px-4 py-2.5">
      <Warning size={16} weight="fill" className="text-amber-500 shrink-0" />
      <span>PostoCash não acumula com 99/Shell Box — um programa por abastecimento.</span>
    </div>
  );
}

// ── Acúmulo tab ───────────────────────────────────────────────────────────────

function AcumuloTab({ onComprovante }) {
  const [fuelings, setFuelings] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [manual, setManual]     = useState(false);
  const [result, setResult]     = useState(null);

  const load = useCallback(() => {
    pistaAPI.fuelings({ pending: 1 })
      .then((res) => setFuelings(res.data.abastecimentos || []))
      .catch(() => setFuelings([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); const t = setInterval(load, 5000); return () => clearInterval(t); }, [load]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <p className="text-sm text-gray-500">
          {manual ? 'Plano B — digitar manualmente (use quando o feed da pista estiver fora).'
                  : 'Selecione um abastecimento do dia e informe o CPF do cliente.'}
        </p>
        <button onClick={() => { setManual((m) => !m); setResult(null); }}
          className="text-xs font-semibold text-slate-500 hover:text-slate-800 border border-gray-200 rounded-lg px-3 h-8">
          {manual ? '← Voltar à lista de abastecimentos' : 'Plano B: digitar CPF + valor'}
        </button>
      </div>

      {manual
        ? <ManualAccrualForm onResult={setResult} />
        : <FuelingPicker fuelings={fuelings} loading={loading} onRefresh={load} onAccrued={(d) => { setResult(d); load(); }} />}

      {result && <AccrualResult result={result} onComprovante={onComprovante} />}
    </div>
  );
}

function FuelingPicker({ fuelings, loading, onRefresh, onAccrued }) {
  const [selected, setSelected] = useState(null);
  const [cpf, setCpf]   = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function apply() {
    if (!selected) return;
    if (stripCpf(cpf).length !== 11) { setError('Informe um CPF válido.'); return; }
    setBusy(true); setError('');
    try {
      const { data } = await pistaAPI.accrueFromFueling({ abastecimentoId: selected.id, cpf: stripCpf(cpf) });
      setCpf(''); setSelected(null); onAccrued(data);
    } catch (e) {
      setError(e.response?.data?.erro ?? 'Não foi possível aplicar o cashback.');
    } finally { setBusy(false); }
  }

  return (
    <div className="space-y-3">
      {selected && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 max-w-lg">
          <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide mb-2">Aplicar cashback</p>
          <p className="text-sm text-slate-700 mb-3">
            Bico <b>{selected.bico}</b> · {selected.combustivel || 'comb.'} · <b>{fmtL(selected.litros)}</b> · <b>{selected.valorFormatado}</b>
          </p>
          <div className="flex gap-2">
            <input value={cpf} onChange={(e) => setCpf(applyCpfMask(e.target.value))} placeholder="CPF do cliente" inputMode="numeric"
              className="flex-1 h-10 px-3 text-sm rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-amber-300" />
            <button onClick={apply} disabled={busy}
              className="h-10 px-4 bg-amber-400 text-white text-sm font-bold rounded-lg hover:bg-amber-500 disabled:opacity-50">
              {busy ? 'Aplicando…' : 'Aplicar'}
            </button>
            <button onClick={() => { setSelected(null); setCpf(''); setError(''); }}
              className="h-10 px-3 text-sm text-slate-500 rounded-lg hover:bg-slate-100">Cancelar</button>
          </div>
          {error && <p className="text-sm text-red-600 mt-2">{error}</p>}
        </div>
      )}

      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Abastecimentos do dia (sem cashback)</p>
        <button onClick={onRefresh} className="text-xs text-gray-400 hover:text-gray-700 inline-flex items-center gap-1"><ArrowClockwise size={14} /> Atualizar</button>
      </div>

      {loading ? (
        <div className="grid sm:grid-cols-2 gap-2 animate-pulse">{[0,1,2,3].map((i) => <div key={i} className="h-16 bg-gray-100 rounded-xl" />)}</div>
      ) : fuelings.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-10 text-center">
          <GasPump size={40} weight="duotone" className="text-stone-300 mb-2 mx-auto" />
          <p className="text-gray-500 font-semibold">Nenhum abastecimento pendente hoje</p>
          <p className="text-sm text-gray-400 mt-1">Eles aparecem aqui automaticamente conforme o agente da pista envia.</p>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 gap-2">
          {fuelings.map((a) => (
            <button key={a.id} onClick={() => setSelected(a)}
              className={['text-left bg-white rounded-xl border shadow-sm p-3 transition-colors',
                selected?.id === a.id ? 'border-amber-400 ring-1 ring-amber-200' : 'border-gray-200 hover:border-amber-300'].join(' ')}>
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold text-slate-800">Bico {a.bico} · {a.combustivel || 'comb.'}</span>
                <span className="text-sm font-bold text-amber-600">{a.valorFormatado}</span>
              </div>
              <div className="flex items-center justify-between text-xs text-slate-400 mt-0.5">
                <span>{fmtL(a.litros)} · {new Date(a.data).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
                <span className="truncate ml-2">{a.frentista || 'sem frentista'}</span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function ManualAccrualForm({ onResult }) {
  const [cpf, setCpf]       = useState('');
  const [amount, setAmount] = useState('');
  const [fuelType, setFuel] = useState('');
  const [bomba, setBomba]   = useState('');
  const [busy, setBusy]     = useState(false);
  const [error, setError]   = useState('');

  async function submit(e) {
    e.preventDefault();
    setError('');
    const value = parseFloat(String(amount).replace(',', '.'));
    if (stripCpf(cpf).length !== 11) { setError('Informe um CPF válido.'); return; }
    if (!value || value <= 0) { setError('Informe o valor do abastecimento.'); return; }
    setBusy(true);
    try {
      const { data } = await pistaAPI.accrue({ cpf: stripCpf(cpf), amount: value, fuelType: fuelType || undefined, bomba: bomba || undefined });
      onResult(data); setAmount(''); setBomba('');
    } catch (e2) {
      setError(e2.response?.data?.erro ?? 'Não foi possível acumular o cashback.');
    } finally { setBusy(false); }
  }

  return (
    <form onSubmit={submit} className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 space-y-3 max-w-lg">
      <div>
        <label className="block text-xs text-gray-500 mb-1">CPF do cliente</label>
        <input value={cpf} onChange={(e) => setCpf(applyCpfMask(e.target.value))} placeholder="000.000.000-00" inputMode="numeric"
          className="w-full h-10 px-3 text-sm rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-amber-300" />
      </div>
      <div className="flex gap-3">
        <div className="flex-1">
          <label className="block text-xs text-gray-500 mb-1">Valor do abastecimento (R$)</label>
          <input value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0,00" inputMode="decimal"
            className="w-full h-10 px-3 text-sm rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-amber-300" />
        </div>
        <div className="w-28">
          <label className="block text-xs text-gray-500 mb-1">Bomba</label>
          <input value={bomba} onChange={(e) => setBomba(e.target.value)} placeholder="Ex: 3"
            className="w-full h-10 px-3 text-sm rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-amber-300" />
        </div>
      </div>
      <div>
        <label className="block text-xs text-gray-500 mb-1">Combustível</label>
        <select value={fuelType} onChange={(e) => setFuel(e.target.value)}
          className="w-full h-10 px-3 text-sm rounded-lg border border-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-amber-300">
          {FUEL_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button type="submit" disabled={busy}
        className="w-full h-10 inline-flex items-center justify-center gap-2 bg-amber-400 text-white text-sm font-bold rounded-lg hover:bg-amber-500 transition-colors disabled:opacity-50">
        <GasPump size={18} weight="bold" /> {busy ? 'Acumulando…' : 'Acumular cashback'}
      </button>
    </form>
  );
}

function AccrualResult({ result, onComprovante }) {
  return (
    <div className="bg-green-50 border border-green-200 rounded-xl p-5 max-w-lg">
      <div className="flex items-center gap-2 mb-3">
        <CheckCircle size={20} weight="fill" className="text-green-600" />
        <p className="text-sm font-bold text-green-800">Cashback acumulado!</p>
        {result.novoCliente && (
          <span className="text-[10px] font-bold bg-amber-400 text-white rounded-full px-2 py-0.5">novo CPF (não cadastrado)</span>
        )}
      </div>
      <div className="grid grid-cols-2 gap-2 text-sm">
        <Stat label="Abastecimento" value={result.transacao.valorAbastecimento} />
        <Stat label="Cashback" value={result.transacao.cashback} highlight />
        <Stat label="Percentual" value={result.transacao.percentual} />
        <Stat label="Saldo do cliente" value={result.transacao.saldo} />
      </div>
      <button onClick={() => onComprovante(result.comprovante)}
        className="mt-4 h-9 px-4 inline-flex items-center gap-1.5 bg-white border border-green-300 text-green-700 text-sm font-semibold rounded-lg hover:bg-green-100">
        <Printer size={16} weight="bold" /> Comprovante
      </button>
    </div>
  );
}

function Stat({ label, value, highlight }) {
  return (
    <div>
      <p className="text-xs text-gray-500">{label}</p>
      <p className={`font-bold ${highlight ? 'text-green-600' : 'text-gray-800'}`}>{value}</p>
    </div>
  );
}

// ── Resgates tab (live queue) ─────────────────────────────────────────────────

function ResgatesTab({ onComprovante }) {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [selected, setSelected] = useState(null);

  const load = useCallback(() => {
    pistaAPI.listRequests()
      .then((res) => setRequests(res.data.solicitacoes || []))
      .catch(() => setRequests([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 5000); // live queue — poll every 5s
    return () => clearInterval(t);
  }, [load]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">
          {loading ? 'Carregando…' : `${requests.length} solicitaç${requests.length === 1 ? 'ão' : 'ões'} aguardando`}
        </p>
        <button onClick={load} className="text-xs text-gray-400 hover:text-gray-700 inline-flex items-center gap-1">
          <ArrowClockwise size={14} /> Atualizar
        </button>
      </div>

      {!loading && requests.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-12 text-center">
          <HandCoins size={44} weight="duotone" className="text-stone-300 mb-3 mx-auto" />
          <p className="text-gray-500 font-semibold">Nenhuma solicitação de resgate</p>
          <p className="text-sm text-gray-400 mt-1">As solicitações dos clientes aparecem aqui automaticamente.</p>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 gap-3">
          {requests.map((r) => (
            <div key={r.id} className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
              <div className="flex items-center justify-between">
                <div className="min-w-0">
                  <p className="text-sm font-bold text-slate-900 truncate">{r.clienteNome}</p>
                  <p className="text-xs text-slate-400 font-mono">{r.cpf}</p>
                </div>
                {!r.registrado && <span className="text-[10px] font-bold bg-slate-200 text-slate-600 rounded-full px-2 py-0.5">não cadastrado</span>}
              </div>
              <div className="flex items-end justify-between mt-3">
                <div>
                  <p className="text-xs text-slate-400">Quer resgatar</p>
                  <p className="text-xl font-bold text-amber-600">{r.valorFormatado}</p>
                  <p className="text-[11px] text-slate-400">saldo {r.saldoFormatado}</p>
                </div>
                <button onClick={() => setSelected(r)}
                  className="h-9 px-4 bg-amber-400 text-white text-sm font-semibold rounded-lg hover:bg-amber-500">
                  Atender
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {selected && (
        <ConfirmRedemptionModal
          request={selected}
          onClose={() => setSelected(null)}
          onDone={(comprovante) => { setSelected(null); load(); if (comprovante) onComprovante(comprovante); }}
        />
      )}
    </div>
  );
}

function ConfirmRedemptionModal({ request, onClose, onDone }) {
  const [amount, setAmount] = useState(String(request.valorSolicitado));
  const [note, setNote]     = useState('');
  const [busy, setBusy]     = useState(false);
  const [error, setError]   = useState('');

  async function confirm() {
    setBusy(true); setError('');
    try {
      const value = parseFloat(String(amount).replace(',', '.'));
      const { data } = await pistaAPI.confirmRequest(request.id, { amount: value, note: note || undefined });
      onDone(data.comprovante);
    } catch (e) {
      setError(e.response?.data?.erro ?? 'Não foi possível confirmar o resgate.');
    } finally { setBusy(false); }
  }

  async function cancel() {
    setBusy(true); setError('');
    try { await pistaAPI.cancelRequest(request.id); onDone(null); }
    catch (e) { setError(e.response?.data?.erro ?? 'Não foi possível cancelar.'); setBusy(false); }
  }

  return (
    <div className="fixed inset-0 z-[100] bg-black/40 flex items-center justify-center p-4" onMouseDown={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-5" onMouseDown={(e) => e.stopPropagation()}>
        <p className="text-sm font-bold text-gray-900 mb-1">Confirmar resgate</p>
        <p className="text-sm text-slate-600">{request.clienteNome} · <span className="font-mono text-xs">{request.cpf}</span></p>
        <p className="text-xs text-slate-400 mb-4">Saldo disponível: {request.saldoFormatado}</p>

        <label className="block text-xs text-gray-500 mb-1">Valor a resgatar (R$)</label>
        <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal"
          className="w-full h-10 px-3 text-sm rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-amber-300 mb-3" />

        <label className="block text-xs text-gray-500 mb-1">Referência abastecimento (opcional)</label>
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ex: Bomba 3, abastec. R$120"
          className="w-full h-10 px-3 text-sm rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-amber-300 mb-3" />

        {error && <p className="text-sm text-red-600 mb-3">{error}</p>}

        <div className="flex gap-2">
          <button onClick={confirm} disabled={busy}
            className="flex-1 h-10 bg-green-500 text-white text-sm font-bold rounded-lg hover:bg-green-600 disabled:opacity-50">
            {busy ? 'Processando…' : 'Confirmar baixa'}
          </button>
          <button onClick={cancel} disabled={busy}
            className="h-10 px-4 text-sm font-semibold text-red-500 rounded-lg hover:bg-red-50 disabled:opacity-50">
            Recusar
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Caixa tab ─────────────────────────────────────────────────────────────────

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function CaixaTab() {
  const [startDate, setStartDate] = useState(todayISO());
  const [endDate, setEndDate]     = useState(todayISO());
  const [data, setData]           = useState(null);
  const [loading, setLoading]     = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    pistaAPI.caixa({ startDate, endDate })
      .then((res) => setData(res.data))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [startDate, endDate]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3 bg-white rounded-xl border border-gray-200 shadow-sm p-4">
        <div>
          <label className="block text-xs text-gray-500 mb-1">De</label>
          <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)}
            className="h-9 px-3 text-sm rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-amber-300" />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Até</label>
          <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)}
            className="h-9 px-3 text-sm rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-amber-300" />
        </div>
        <button onClick={load} className="h-9 px-4 bg-amber-400 text-white text-sm font-semibold rounded-lg hover:bg-amber-500">Aplicar</button>
      </div>

      {/* Total resgatado — the figure that covers the cash drawer */}
      <div className="bg-[#1e3a5f] rounded-xl p-5 flex items-center gap-4">
        <div className="w-12 h-12 rounded-full bg-white/10 flex items-center justify-center">
          <HandCoins size={22} weight="duotone" className="text-amber-300" />
        </div>
        <div>
          <p className="text-xs text-white/60 uppercase tracking-wide">Total resgatado (cobre o caixa)</p>
          <p className="text-3xl font-bold text-white leading-tight">{loading ? '—' : fmtBRL(data?.totais?.totalResgatado)}</p>
          <p className="text-xs text-white/50 mt-0.5">
            Cashback acumulado: {loading ? '—' : fmtBRL(data?.totais?.totalCashback)}
          </p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
          <ClockCounterClockwise size={16} weight="duotone" className="text-slate-400" />
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Por frentista</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead className="bg-slate-50 border-b border-slate-100 text-[12px] text-slate-500 uppercase">
              <tr>
                <th className="px-4 py-2.5 text-left">Frentista</th>
                <th className="px-3 py-2.5 text-right">Acúmulos</th>
                <th className="px-3 py-2.5 text-right">Cashback</th>
                <th className="px-3 py-2.5 text-right">Resgates</th>
                <th className="px-4 py-2.5 text-right">Total resgatado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-400">Carregando…</td></tr>
              ) : !data?.frentistas?.length ? (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-400">Sem movimentação no período.</td></tr>
              ) : data.frentistas.map((f) => (
                <tr key={f.operatorId}>
                  <td className="px-4 py-2.5 font-semibold text-slate-800">{f.frentista}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-slate-600">{f.acumulos}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-green-600">{fmtBRL(f.totalCashback)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-slate-600">{f.resgates}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums font-bold text-amber-600">{fmtBRL(f.totalResgatado)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ── Dashboard tab (live, today) ───────────────────────────────────────────────

function DashboardTab() {
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [pieMetric, setPie]   = useState('litros');     // 'litros' | 'valor'

  const load = useCallback(() => {
    pistaAPI.dashboard().then((r) => setData(r.data)).catch(() => setData(null)).finally(() => setLoading(false));
  }, []);
  useEffect(() => { load(); const t = setInterval(load, 8000); return () => clearInterval(t); }, [load]);

  const frentistas = data?.frentistas || [];
  const totais = data?.totais || { litrosTotal: 0, litrosAditivada: 0, valorTotal: 0 };

  const pieData = frentistas
    .map((fr, i) => ({ name: fr.nome, value: pieMetric === 'litros' ? fr.litrosTotal : fr.valorTotal, color: PIE_COLORS[i % PIE_COLORS.length] }))
    .filter((d) => d.value > 0);

  return (
    <div className="space-y-4">
      {/* Header — collective board (todos os frentistas) */}
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm font-semibold text-slate-700">Vendas do dia — todos os frentistas</p>
        <span className="text-xs text-gray-400">Hoje · {data?.periodo?.hoje || '—'}</span>
        <button onClick={load} className="ml-auto text-xs text-gray-400 hover:text-gray-700 inline-flex items-center gap-1"><ArrowClockwise size={14} /> Atualizar</button>
      </div>

      {loading && !data ? (
        <div className="h-40 bg-gray-100 rounded-xl animate-pulse" />
      ) : (
        <div className="grid sm:grid-cols-3 gap-3">
          <Metric label="Litros vendidos (dia)" value={fmtL(totais.litrosTotal)} bg="bg-amber-50 border-amber-100" val="text-amber-700" />
          <Metric label="Aditivada (litros)" value={fmtL(totais.litrosAditivada)} bg="bg-blue-50 border-blue-100" val="text-blue-700" />
          <Metric label="Valor vendido (dia)" value={fmtBRL(totais.valorTotal)} bg="bg-green-50 border-green-100" val="text-green-700" />
        </div>
      )}

      {/* Pie por atendente */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Vendas por atendente</p>
          <div className="flex gap-0.5 bg-gray-100 rounded-lg p-0.5">
            {[['litros', 'Litros'], ['valor', 'R$']].map(([k, lbl]) => (
              <button key={k} onClick={() => setPie(k)}
                className={`px-3 py-1 rounded-md text-xs font-medium ${pieMetric === k ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500'}`}>{lbl}</button>
            ))}
          </div>
        </div>
        {pieData.length === 0 ? (
          <div className="py-12 text-center text-gray-400 text-sm">Sem vendas hoje.</div>
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} label={(e) => e.name.length > 14 ? e.name.slice(0, 14) + '…' : e.name}>
                {pieData.map((d, i) => <Cell key={i} fill={d.color} />)}
              </Pie>
              <RTooltip formatter={(v) => pieMetric === 'litros' ? fmtL(v) : fmtBRL(v)} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
            </PieChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Tabela por frentista */}
      {frentistas.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead className="bg-slate-50 border-b border-slate-100 text-[12px] text-slate-500 uppercase">
                <tr>
                  <th className="px-4 py-2.5 text-left">Frentista</th>
                  <th className="px-3 py-2.5 text-right">Litros</th>
                  <th className="px-3 py-2.5 text-right">Aditivada</th>
                  <th className="px-3 py-2.5 text-right">Mix</th>
                  <th className="px-4 py-2.5 text-right">Valor</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {frentistas.map((fr) => (
                  <tr key={fr.key} className={fr.identificado ? '' : 'bg-slate-50/40'}>
                    <td className="px-4 py-2.5 font-semibold text-slate-800">{fr.nome}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-slate-600">{fmtL(fr.litrosTotal)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-blue-600">{fmtL(fr.litrosAditivada)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-purple-600">{fr.mixAditivada != null ? `${fr.mixAditivada.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%` : '—'}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums font-bold text-green-600">{fmtBRL(fr.valorTotal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function Metric({ label, value, bg, val, sub }) {
  return (
    <div className={`rounded-xl border p-4 ${bg}`}>
      <p className="text-xs font-medium text-gray-500 leading-tight">{label}</p>
      <p className={`text-2xl font-bold mt-1 ${val}`}>{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5 truncate">{sub}</p>}
    </div>
  );
}

// ── Combustíveis tab (fuel map config) ────────────────────────────────────────

function CombustiveisTab() {
  const [maps, setMaps]     = useState([]);
  const [loading, setLoad]  = useState(true);
  const [nozzle, setNozzle] = useState('');
  const [fuel, setFuel]     = useState('gasolina');
  const [adit, setAdit]     = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError]   = useState('');

  const load = useCallback(() => {
    pistaAPI.fuelMap().then((r) => setMaps(r.data.maps || [])).catch(() => setMaps([])).finally(() => setLoad(false));
  }, []);
  useEffect(() => { load(); }, [load]);

  async function add(e) {
    e.preventDefault(); setError(''); setNotice('');
    const code = parseInt(nozzle, 10);
    if (!Number.isInteger(code)) { setError('Informe o código do bico.'); return; }
    try {
      await pistaAPI.upsertFuelMap({ nozzleCode: code, fuelName: fuel, isAditivada: adit });
      setNozzle(''); setAdit(false); load();
    } catch (e2) { setError(e2.response?.data?.erro ?? 'Não foi possível salvar.'); }
  }
  async function remove(id) { try { await pistaAPI.deleteFuelMap(id); load(); } catch { /* ignore */ } }
  async function backfill() {
    setNotice('');
    try { const { data } = await pistaAPI.backfillFuel(); setNotice(data.mensagem); }
    catch (e) { setError(e.response?.data?.erro ?? 'Falha ao aplicar.'); }
  }

  return (
    <div className="space-y-4 max-w-2xl">
      <p className="text-sm text-gray-500">Associe cada <b>bico</b> (código do concentrador) ao combustível. <b>Aditivada</b> entra no cálculo do mix.</p>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {notice && <div className="bg-green-50 border border-green-200 text-green-700 text-sm rounded-xl px-4 py-2.5">{notice}</div>}

      <form onSubmit={add} className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 flex flex-wrap items-end gap-3">
        <div className="w-24"><label className="block text-xs text-gray-500 mb-1">Bico</label>
          <input value={nozzle} onChange={(e) => setNozzle(e.target.value)} placeholder="Ex: 4" inputMode="numeric"
            className="w-full h-9 px-3 text-sm rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-amber-300" /></div>
        <div className="flex-1 min-w-[160px]"><label className="block text-xs text-gray-500 mb-1">Combustível</label>
          <select value={fuel} onChange={(e) => setFuel(e.target.value)} className="w-full h-9 px-3 text-sm rounded-lg border border-gray-200 bg-white">
            {FUEL_OPTIONS.filter((o) => o.value).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select></div>
        <label className="flex items-center gap-1.5 text-sm text-gray-600 h-9"><input type="checkbox" checked={adit} onChange={(e) => setAdit(e.target.checked)} className="rounded text-amber-500" /> Aditivada</label>
        <button type="submit" className="h-9 px-4 inline-flex items-center gap-1.5 bg-amber-400 text-white text-sm font-semibold rounded-lg hover:bg-amber-500"><Plus size={16} weight="bold" /> Salvar</button>
      </form>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
        <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Mapa de bicos</p>
          <button onClick={backfill} className="text-xs font-semibold text-slate-500 hover:text-slate-800">Aplicar aos abastecimentos existentes</button>
        </div>
        {loading ? <div className="p-6 text-center text-gray-400 text-sm">Carregando…</div>
          : maps.length === 0 ? <div className="p-6 text-center text-gray-400 text-sm">Nenhum bico mapeado.</div>
          : <ul className="divide-y divide-gray-100">
              {maps.map((m) => (
                <li key={m.id} className="flex items-center gap-3 px-4 py-2.5">
                  <span className="w-10 h-8 rounded-lg bg-slate-100 text-slate-700 text-sm font-bold flex items-center justify-center">{m.nozzleCode}</span>
                  <span className="text-sm font-semibold text-slate-800 flex-1">{FUEL_OPTIONS.find((o) => o.value === m.fuelName)?.label || m.fuelName}</span>
                  {m.isAditivada && <span className="text-[10px] font-bold bg-blue-100 text-blue-700 rounded-full px-2 py-0.5">aditivada</span>}
                  <button onClick={() => remove(m.id)} className="text-red-400 hover:text-red-600"><Trash size={16} weight="bold" /></button>
                </li>
              ))}
            </ul>}
      </div>
    </div>
  );
}

// ── Cartões tab (Identfid → frentista) ────────────────────────────────────────

function CartoesTab() {
  const [maps, setMaps]   = useState([]);
  const [atts, setAtts]   = useState([]);
  const [loading, setLoad] = useState(true);
  const [code, setCode]   = useState('');
  const [attId, setAttId] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(() => {
    Promise.all([pistaAPI.cardMap(), attendantsAPI.list()])
      .then(([c, a]) => { setMaps(c.data.maps || []); setAtts(a.data.attendants || []); })
      .catch(() => {})
      .finally(() => setLoad(false));
  }, []);
  useEffect(() => { load(); }, [load]);

  async function add(e) {
    e.preventDefault(); setError('');
    if (!code.trim()) { setError('Informe o código Identfid.'); return; }
    if (!attId) { setError('Selecione o frentista.'); return; }
    try { await pistaAPI.upsertCardMap({ identfidCode: code.trim(), attendantId: attId }); setCode(''); load(); }
    catch (e2) { setError(e2.response?.data?.erro ?? 'Não foi possível salvar.'); }
  }
  async function remove(id) { try { await pistaAPI.deleteCardMap(id); load(); } catch { /* ignore */ } }

  return (
    <div className="space-y-4 max-w-2xl">
      <p className="text-sm text-gray-500">Vincule o <b>código Identfid</b> (cartão do bico) ao frentista do cadastro de <b>Atendentes</b> (fonte única da identidade — nome e foto).</p>
      {atts.length === 0 && <div className="bg-amber-50 border border-amber-200 text-amber-700 text-sm rounded-xl px-4 py-2.5">Cadastre os frentistas em <b>Atendentes</b> primeiro.</div>}
      {error && <p className="text-sm text-red-600">{error}</p>}

      <form onSubmit={add} className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 flex flex-wrap items-end gap-3">
        <div className="flex-1 min-w-[180px]"><label className="block text-xs text-gray-500 mb-1">Código Identfid</label>
          <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="Ex: B3CF6CCFFF1FD792" className="w-full h-9 px-3 text-sm rounded-lg border border-gray-200 font-mono focus:outline-none focus:ring-2 focus:ring-amber-300" /></div>
        <div className="flex-1 min-w-[160px]"><label className="block text-xs text-gray-500 mb-1">Frentista</label>
          <select value={attId} onChange={(e) => setAttId(e.target.value)} className="w-full h-9 px-3 text-sm rounded-lg border border-gray-200 bg-white">
            <option value="">Selecione…</option>
            {atts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select></div>
        <button type="submit" className="h-9 px-4 inline-flex items-center gap-1.5 bg-amber-400 text-white text-sm font-semibold rounded-lg hover:bg-amber-500"><Plus size={16} weight="bold" /> Vincular</button>
      </form>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
        <div className="px-4 py-3 border-b border-gray-100"><p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Cartões vinculados</p></div>
        {loading ? <div className="p-6 text-center text-gray-400 text-sm">Carregando…</div>
          : maps.length === 0 ? <div className="p-6 text-center text-gray-400 text-sm">Nenhum cartão vinculado.</div>
          : <ul className="divide-y divide-gray-100">
              {maps.map((m) => (
                <li key={m.id} className="flex items-center gap-3 px-4 py-2.5">
                  {m.attendantFoto ? <img src={m.attendantFoto} alt="" className="w-8 h-8 rounded-full object-cover" /> : <UserCircle size={32} weight="duotone" className="text-slate-300" />}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-800 truncate">{m.attendantNome}</p>
                    <p className="text-[11px] text-slate-400 font-mono truncate">{m.identfidCode}</p>
                  </div>
                  <button onClick={() => remove(m.id)} className="text-red-400 hover:text-red-600"><Trash size={16} weight="bold" /></button>
                </li>
              ))}
            </ul>}
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function PainelPista() {
  const { isAdmin, isSuperAdmin } = useAuth();
  const canConfig = isAdmin || isSuperAdmin;
  const visibleTabs = TABS.filter((t) => !t.adminOnly || canConfig);

  const [tab, setTab] = useState('dashboard');
  const [comprovante, setComprovante] = useState(null);

  // Guard: if a hidden tab is somehow selected, fall back to Dashboard.
  const activeTab = visibleTabs.some((t) => t.id === tab) ? tab : 'dashboard';

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Painel da Pista</h1>
        <p className="text-sm text-gray-500 mt-1">Cashback interno — acúmulo e resgate pelo frentista.</p>
      </div>

      <ReminderBanner />

      {/* Sub-tabs */}
      <div className="flex gap-2 flex-wrap">
        {visibleTabs.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={[
              'h-9 px-4 inline-flex items-center gap-1.5 rounded-lg text-sm font-semibold transition-colors',
              activeTab === t.id ? 'bg-amber-400 text-white shadow-sm' : 'bg-gray-100 text-gray-600 hover:bg-gray-200',
            ].join(' ')}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {activeTab === 'dashboard'    && <DashboardTab />}
      {activeTab === 'acumulo'      && <AcumuloTab onComprovante={setComprovante} />}
      {activeTab === 'resgates'     && <ResgatesTab onComprovante={setComprovante} />}
      {activeTab === 'caixa'        && <CaixaTab />}
      {activeTab === 'combustiveis' && <CombustiveisTab />}
      {activeTab === 'cartoes'      && <CartoesTab />}

      {comprovante && <ComprovanteModal text={comprovante} onClose={() => setComprovante(null)} />}
    </div>
  );
}
