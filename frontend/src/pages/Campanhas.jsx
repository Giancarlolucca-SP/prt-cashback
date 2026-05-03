import { useState, useEffect, useCallback, useRef } from 'react';
import { campaignsAPI } from '../services/api.js';
import { useToast } from '../context/ToastContext.jsx';

// ── Constants ─────────────────────────────────────────────────────────────────

const PERIOD_LABELS = {
  ONE_MONTH:    'Último 1 mês',
  TWO_MONTHS:   'Últimos 2 meses',
  THREE_MONTHS: 'Últimos 3 meses',
  ONE_YEAR:     'Último 1 ano',
};

const ACTIVE_PERIODS  = ['ONE_MONTH', 'TWO_MONTHS', 'THREE_MONTHS'];
const INACTIVE_PERIODS = ['ONE_MONTH', 'TWO_MONTHS', 'THREE_MONTHS', 'ONE_YEAR'];

const TEMPLATES = [
  { value: 'Sentimos sua falta! Volte e ganhe cashback especial.',    label: 'Sentimos sua falta' },
  { value: 'Você é um dos nossos melhores clientes! Obrigado.',       label: 'Melhores clientes' },
  { value: 'Promoção exclusiva para você!',                           label: 'Promoção exclusiva' },
  { value: 'custom',                                                   label: 'Mensagem personalizada' },
];

const STEPS = [
  'Filtro',
  'Clientes',
  'Recompensa',
  'Mensagem',
  'Confirmar',
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatBRL(value) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value || 0);
}

function parseBRLInput(raw) {
  const clean = raw.replace(/[^\d,]/g, '').replace(',', '.');
  const num = parseFloat(clean);
  return isNaN(num) ? '' : num;
}

// ── Step indicator ────────────────────────────────────────────────────────────

function StepBar({ current }) {
  return (
    <div className="flex items-center justify-between mb-8 px-1">
      {STEPS.map((label, i) => {
        const idx = i + 1;
        const done    = idx < current;
        const active  = idx === current;
        return (
          <div key={label} className="flex-1 flex flex-col items-center gap-1">
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-colors
                ${done   ? 'bg-green-500 text-white'
                : active ? 'bg-primary-600 text-white ring-4 ring-primary-200'
                :          'bg-gray-200 text-gray-500'}`}
            >
              {done ? '✓' : idx}
            </div>
            <span className={`text-xs text-center hidden sm:block ${active ? 'text-primary-600 font-semibold' : 'text-gray-400'}`}>
              {label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

const STATUS_TABS = [
  { value: 'todas',      label: 'Todas' },
  { value: 'ativas',     label: 'Ativas' },
  { value: 'encerradas', label: 'Encerradas' },
];

const FILTER_TYPE_LABELS = {
  ACTIVE:   'Melhores clientes',
  INACTIVE: 'Clientes inativos',
};

// ── Return rate color ─────────────────────────────────────────────────────────

function returnRateColor(rate) {
  if (rate >= 30) return 'text-green-700 bg-green-50 border-green-200';
  if (rate >= 10) return 'text-yellow-700 bg-yellow-50 border-yellow-200';
  return 'text-red-600 bg-red-50 border-red-200';
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

function CampaignSkeleton() {
  return (
    <div className="bg-white rounded-xl border border-gray-100 p-5 animate-pulse space-y-4">
      <div className="flex items-start justify-between">
        <div className="space-y-2 flex-1">
          <div className="h-4 bg-gray-200 rounded w-3/4" />
          <div className="h-3 bg-gray-100 rounded w-1/2" />
        </div>
        <div className="h-6 w-16 bg-gray-200 rounded-full ml-4" />
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="bg-gray-50 rounded-lg p-3 space-y-1.5">
            <div className="h-3 bg-gray-200 rounded w-2/3" />
            <div className="h-5 bg-gray-200 rounded w-1/2" />
          </div>
        ))}
      </div>
      <div className="h-10 bg-gray-50 rounded-lg border border-gray-100" />
    </div>
  );
}

// ── Returnees expandable section ──────────────────────────────────────────────

function ReturneesSection({ campaignId }) {
  const [open,    setOpen]    = useState(false);
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState(false);
  const fetchedRef = useRef(false);

  async function fetchAndOpen() {
    if (fetchedRef.current) { setOpen(true); return; }
    setLoading(true);
    setError(false);
    try {
      const res = await campaignsAPI.getReturnees(campaignId);
      setData(res.data);
      fetchedRef.current = true;
      setOpen(true);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }

  function toggle() {
    if (open) { setOpen(false); return; }
    fetchAndOpen();
  }

  return (
    <div className="border-t border-gray-50 pt-3">
      <button
        onClick={toggle}
        disabled={loading}
        className="flex items-center gap-2 text-sm text-primary-600 hover:text-primary-800 font-medium transition-colors disabled:opacity-60 select-none"
      >
        <span className={`transition-transform duration-200 ${open ? 'rotate-90' : ''}`}>▶</span>
        Ver clientes que retornaram
        {loading && (
          <span className="w-3.5 h-3.5 border-2 border-primary-300 border-t-primary-600 rounded-full animate-spin ml-1" />
        )}
      </button>

      {error && (
        <p className="text-xs text-red-500 mt-1.5">Erro ao carregar. Tente novamente.</p>
      )}

      {open && data && (
        <div className="mt-3 space-y-1">
          {data.returnees.length === 0 ? (
            <p className="text-sm text-gray-400 italic py-2">Nenhum cliente retornou ainda após esta campanha.</p>
          ) : (
            <>
              <div className="hidden sm:grid grid-cols-5 gap-2 px-3 py-1.5 text-xs font-semibold text-gray-400 uppercase tracking-wide">
                <span className="col-span-2">Cliente</span>
                <span className="text-center">Retornou em</span>
                <span className="text-center">Dias após</span>
                <span className="text-right">Valor / Cashback</span>
              </div>
              <div className="divide-y divide-gray-50 border border-gray-100 rounded-lg overflow-hidden max-h-64 overflow-y-auto">
                {data.returnees.map((r, i) => (
                  <div key={i} className="grid grid-cols-2 sm:grid-cols-5 gap-2 px-3 py-2.5 bg-white hover:bg-gray-50 text-sm">
                    <div className="col-span-2">
                      <p className="font-medium text-gray-800">{r.name}</p>
                      <p className="text-xs font-mono text-gray-400">{r.cpf}</p>
                    </div>
                    <p className="text-gray-600 text-xs sm:text-sm text-center self-center">
                      {new Date(r.returnDate).toLocaleDateString('pt-BR')}
                    </p>
                    <p className="text-center self-center">
                      <span className="inline-block bg-blue-50 text-blue-700 text-xs font-semibold px-2 py-0.5 rounded-full">
                        {r.daysToReturn === 0 ? 'mesmo dia' : `${r.daysToReturn}d`}
                      </span>
                    </p>
                    <div className="text-right self-center">
                      <p className="text-gray-800 font-semibold text-xs sm:text-sm">
                        {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(r.transactionValue)}
                      </p>
                      <p className="text-green-600 text-xs">
                        +{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(r.cashbackEarned)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ── Campaign card ─────────────────────────────────────────────────────────────

function CampaignCard({ c, onClose }) {
  const [closing, setClosing] = useState(false);

  async function handleClose() {
    setClosing(true);
    try { await onClose(c.id); } finally { setClosing(false); }
  }

  const statusColor = c.status === 'SENT'
    ? 'bg-green-100 text-green-700'
    : c.status === 'DRAFT'
    ? 'bg-yellow-100 text-yellow-700'
    : 'bg-gray-100 text-gray-500';

  const statusText = c.status === 'SENT' ? 'Ativa' : c.status === 'DRAFT' ? 'Rascunho' : 'Encerrada';

  const returnLabel = `${c.returnedCustomers} cliente${c.returnedCustomers !== 1 ? 's' : ''} (${c.returnRate}%)`;
  const returnColor = returnRateColor(c.returnRate);

  const avgText = c.avgDayToReturn > 0
    ? `Média de retorno: ${c.avgDayToReturn} dia${c.avgDayToReturn !== 1 ? 's' : ''}`
    : null;

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-gray-800 leading-snug">{c.name || '—'}</p>
          <p className="text-xs text-gray-500 mt-0.5 line-clamp-1 italic">"{c.message}"</p>
          <p className="text-xs text-gray-400 mt-1">
            {FILTER_TYPE_LABELS[c.filterType] || c.filterType} · {c.periodStart} – {c.periodEnd} · por {c.operatorName}
          </p>
        </div>
        <span className={`shrink-0 text-xs font-semibold px-2.5 py-1 rounded-full ${statusColor}`}>
          {statusText}
        </span>
      </div>

      {/* Métricas principais */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <MetricBox label="Litros abastecidos" value={c.totalLiters}          icon="⛽" />
        <MetricBox label="Cashback creditado" value={c.totalCashbackUsed}    icon="💰" />
        <MetricBox label="Clientes alcançados" value={String(c.uniqueCustomers)} icon="👥" />
        <MetricBox label="Taxa de resgate"    value={c.redemptionRate}       icon="🎯" />
      </div>

      {/* Métrica de retorno */}
      <div className={`flex items-center justify-between px-3 py-2.5 rounded-lg border ${returnColor}`}>
        <div className="flex items-center gap-2">
          <span className="text-base">🔄</span>
          <div>
            <p className="text-xs font-semibold">Retornaram após a campanha</p>
            {avgText && <p className="text-xs opacity-70 mt-0.5">{avgText}</p>}
          </div>
        </div>
        <span className="text-sm font-bold tabular-nums">{returnLabel}</span>
      </div>

      {/* Seção expansível de clientes que retornaram */}
      <ReturneesSection campaignId={c.id} />

      {/* Footer */}
      <div className="flex items-center justify-between pt-1 border-t border-gray-50">
        <div className="flex items-center gap-3 text-xs text-gray-400">
          <span>Recompensa: <span className="font-semibold text-gray-600">{c.rewardFormatted}</span></span>
          <span>·</span>
          <span>Custo total: <span className="font-semibold text-primary-700">{c.totalCostFormatted}</span></span>
        </div>
        {c.status !== 'CLOSED' && (
          <button
            onClick={handleClose}
            disabled={closing}
            className="text-xs text-red-500 hover:text-red-700 font-medium transition-colors disabled:opacity-50"
          >
            {closing ? 'Encerrando…' : 'Encerrar'}
          </button>
        )}
      </div>
    </div>
  );
}

function MetricBox({ label, value, icon }) {
  return (
    <div className="bg-gray-50 rounded-lg p-3">
      <p className="text-xs text-gray-400 mb-1">{icon} {label}</p>
      <p className="text-sm font-bold text-gray-800">{value}</p>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function Campanhas() {
  const { showToast } = useToast();

  // Step 1 state
  const [campaignName, setCampaignName] = useState('');
  const [filterType,   setFilterType]   = useState('ACTIVE');
  const [filterPeriod, setFilterPeriod] = useState('ONE_MONTH');

  // Step 2 state (loaded from API)
  const [previewData, setPreviewData] = useState(null);

  // Step 3 state
  const [rewardType,  setRewardType]  = useState('FIXED');
  const [rewardValue, setRewardValue] = useState('');

  // Step 4 state
  const [templateKey, setTemplateKey] = useState(TEMPLATES[0].value);
  const [message,     setMessage]     = useState(TEMPLATES[0].value);

  // Navigation
  const [step,    setStep]    = useState(1);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);

  // History
  const [historyTab,    setHistoryTab]    = useState('todas');
  const [historyData,   setHistoryData]   = useState(null);
  const [historyPage,   setHistoryPage]   = useState(1);
  const [historyLoading, setHistoryLoading] = useState(true);

  const loadHistory = useCallback(async (tab, page) => {
    setHistoryLoading(true);
    try {
      const res = await campaignsAPI.list(tab, page);
      setHistoryData(res.data);
    } catch {
      showToast('Erro ao carregar histórico de campanhas.', 'error');
    } finally {
      setHistoryLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    loadHistory(historyTab, historyPage);
  }, [historyTab, historyPage, loadHistory]);

  function handleTabChange(tab) {
    setHistoryTab(tab);
    setHistoryPage(1);
  }

  async function handleCloseCampaign(id) {
    try {
      await campaignsAPI.close(id);
      showToast('Campanha encerrada com sucesso.', 'success');
      loadHistory(historyTab, historyPage);
    } catch (err) {
      showToast(err.response?.data?.erro || 'Erro ao encerrar campanha.', 'error');
    }
  }

  // ── Handlers ────────────────────────────────────────────────────────────────

  function handleFilterTypeChange(type) {
    setFilterType(type);
    // Reset period to first valid option for this type
    setFilterPeriod(type === 'ACTIVE' ? 'ONE_MONTH' : 'ONE_MONTH');
  }

  async function handleLoadCustomers() {
    if (!campaignName.trim()) {
      showToast('Informe o nome da campanha.', 'error');
      return;
    }
    setLoading(true);
    try {
      const res = await campaignsAPI.preview({
        filterType,
        filterPeriod,
        rewardType: rewardType || 'FIXED',
        rewardValue: rewardValue || '1',
      });
      setPreviewData(res.data);
      setStep(2);
    } catch (err) {
      showToast(err.response?.data?.erro || 'Erro ao carregar clientes.', 'error');
    } finally {
      setLoading(false);
    }
  }

  async function handleLoadPreview() {
    const val = parseBRLInput(rewardValue);
    if (!val || val <= 0) {
      showToast('Informe um valor de recompensa válido.', 'error');
      return;
    }
    setLoading(true);
    try {
      const res = await campaignsAPI.preview({
        filterType,
        filterPeriod,
        rewardType,
        rewardValue: val,
      });
      setPreviewData(res.data);
      setStep(5);
    } catch (err) {
      showToast(err.response?.data?.erro || 'Erro ao gerar prévia.', 'error');
    } finally {
      setLoading(false);
    }
  }

  function handleTemplateChange(val) {
    setTemplateKey(val);
    if (val !== 'custom') setMessage(val);
    else setMessage('');
  }

  async function handleSend() {
    const val = parseBRLInput(rewardValue);
    if (!message.trim()) {
      showToast('A mensagem não pode estar vazia.', 'error');
      return;
    }
    setSending(true);
    try {
      const res = await campaignsAPI.create({
        name: campaignName.trim(),
        filterType,
        filterPeriod,
        rewardType,
        rewardValue: val,
        message: message.trim(),
      });
      showToast(res.data.mensagem, 'success');
      loadHistory(historyTab, 1);
      setHistoryPage(1);
      // Reset to start
      setStep(1);
      setPreviewData(null);
      setCampaignName('');
      setRewardValue('');
      setMessage(TEMPLATES[0].value);
      setTemplateKey(TEMPLATES[0].value);
      setFilterType('ACTIVE');
      setFilterPeriod('ONE_MONTH');
      setRewardType('FIXED');
    } catch (err) {
      showToast(err.response?.data?.erro || 'Erro ao enviar campanha.', 'error');
    } finally {
      setSending(false);
    }
  }

  // ── Render steps ────────────────────────────────────────────────────────────

  const periods = filterType === 'ACTIVE' ? ACTIVE_PERIODS : INACTIVE_PERIODS;

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Campanhas</h1>
        <p className="text-gray-500 text-sm mt-1">Envie cashback e mensagens para grupos de clientes.</p>
      </div>

      <StepBar current={step} />

      {/* ── STEP 1: Filter ── */}
      {step === 1 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 space-y-6">
          <div>
            <h2 className="text-lg font-semibold text-gray-800 mb-4">Selecionar clientes</h2>

            {/* Campaign name */}
            <div className="mb-5">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Nome da campanha
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={campaignName}
                  onChange={(e) => setCampaignName(e.target.value.slice(0, 50))}
                  placeholder="Ex: Promoção de abril, Clientes inativos Q1…"
                  maxLength={50}
                  className={[
                    'w-full px-4 py-3 rounded-xl border text-sm focus:outline-none focus:ring-2 focus:ring-primary-400 pr-14',
                    campaignName.length === 50
                      ? 'border-amber-400 bg-amber-50'
                      : 'border-gray-200',
                  ].join(' ')}
                />
                <span className={[
                  'absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium tabular-nums',
                  campaignName.length === 50 ? 'text-amber-600' : 'text-gray-400',
                ].join(' ')}>
                  {campaignName.length}/50
                </span>
              </div>
            </div>

            {/* Filter type */}
            <div className="mb-5">
              <p className="text-sm font-medium text-gray-700 mb-2">Tipo de cliente</p>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { val: 'ACTIVE',   label: 'Melhores clientes', desc: 'Quem mais comprou no período', icon: '⭐' },
                  { val: 'INACTIVE', label: 'Clientes inativos',  desc: 'Sem compras no período',      icon: '😴' },
                ].map(({ val, label, desc, icon }) => (
                  <button
                    key={val}
                    onClick={() => handleFilterTypeChange(val)}
                    className={`text-left p-4 rounded-xl border-2 transition-all ${
                      filterType === val
                        ? 'border-primary-500 bg-primary-50'
                        : 'border-gray-200 hover:border-gray-300 bg-white'
                    }`}
                  >
                    <div className="text-2xl mb-1">{icon}</div>
                    <div className="font-semibold text-sm text-gray-800">{label}</div>
                    <div className="text-xs text-gray-500 mt-0.5">{desc}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Period */}
            <div>
              <p className="text-sm font-medium text-gray-700 mb-2">Período de referência</p>
              <div className="grid grid-cols-2 gap-2">
                {periods.map((p) => (
                  <button
                    key={p}
                    onClick={() => setFilterPeriod(p)}
                    className={`py-2.5 px-4 rounded-lg border text-sm font-medium transition-all ${
                      filterPeriod === p
                        ? 'border-primary-500 bg-primary-50 text-primary-700'
                        : 'border-gray-200 text-gray-600 hover:border-gray-300'
                    }`}
                  >
                    {PERIOD_LABELS[p]}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <button
            onClick={handleLoadCustomers}
            disabled={loading}
            className="w-full py-3 rounded-xl bg-primary-600 text-white font-semibold hover:bg-primary-700 transition-colors disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {loading ? (
              <><span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> Carregando...</>
            ) : (
              'Ver clientes →'
            )}
          </button>
        </div>
      )}

      {/* ── STEP 2: Customer list ── */}
      {step === 2 && previewData && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 space-y-5">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-800">Clientes encontrados</h2>
            <span className="bg-primary-100 text-primary-700 text-sm font-semibold px-3 py-1 rounded-full">
              {previewData.totalClientes} {previewData.totalClientes === 1 ? 'cliente' : 'clientes'}
            </span>
          </div>

          {previewData.totalClientes === 0 ? (
            <div className="text-center py-10 text-gray-400">
              <div className="text-4xl mb-2">🔍</div>
              <p className="font-medium">Nenhum cliente encontrado</p>
              <p className="text-sm mt-1">Tente ajustar o filtro ou período.</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100 max-h-72 overflow-y-auto rounded-lg border border-gray-100">
              {previewData.clientes.map((c) => (
                <div key={c.id} className="flex items-center justify-between px-4 py-3">
                  <div>
                    <p className="font-medium text-sm text-gray-800">{c.nome}</p>
                    <p className="text-xs text-gray-400">{c.cpf}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-gray-700">{c.saldo}</p>
                    {c.totalGasto && (
                      <p className="text-xs text-gray-400">gasto: {c.totalGasto}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="flex gap-3">
            <button
              onClick={() => setStep(1)}
              className="flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-600 text-sm font-medium hover:bg-gray-50 transition-colors"
            >
              ← Voltar
            </button>
            <button
              onClick={() => setStep(3)}
              disabled={previewData.totalClientes === 0}
              className="flex-1 py-2.5 rounded-xl bg-primary-600 text-white text-sm font-semibold hover:bg-primary-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Continuar →
            </button>
          </div>
        </div>
      )}

      {/* ── STEP 3: Reward ── */}
      {step === 3 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 space-y-6">
          <h2 className="text-lg font-semibold text-gray-800">Configurar recompensa</h2>

          {/* Reward type */}
          <div className="space-y-3">
            {[
              {
                val:   'FIXED',
                label: 'Cashback em R$',
                desc:  'Valor fixo creditado diretamente no saldo',
                icon:  '💰',
                hint:  'ex: R$ 10,00 de cashback',
              },
              {
                val:   'PER_LITER',
                label: 'Cashback por litro',
                desc:  'Valor por litro abastecido',
                icon:  '⛽',
                hint:  'ex: R$ 0,05 por litro',
              },
            ].map(({ val, label, desc, icon, hint }) => (
              <label
                key={val}
                className={`flex items-start gap-4 p-4 rounded-xl border-2 cursor-pointer transition-all ${
                  rewardType === val
                    ? 'border-primary-500 bg-primary-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <input
                  type="radio"
                  name="rewardType"
                  value={val}
                  checked={rewardType === val}
                  onChange={() => setRewardType(val)}
                  className="mt-1 accent-primary-600"
                />
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{icon}</span>
                    <span className="font-semibold text-sm text-gray-800">{label}</span>
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5">{desc}</p>
                  <p className="text-xs text-gray-400 mt-1 italic">{hint}</p>
                </div>
              </label>
            ))}
          </div>

          {/* Value input */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {rewardType === 'FIXED' ? 'Valor do cashback (R$)' : 'Cashback por litro (R$)'}
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">R$</span>
              <input
                type="number"
                min="0.01"
                step="0.01"
                value={rewardValue}
                onChange={(e) => setRewardValue(e.target.value)}
                placeholder={rewardType === 'FIXED' ? '10,00' : '0,05'}
                className="w-full pl-10 pr-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-primary-400 text-sm"
              />
            </div>
            {rewardType === 'FIXED' && rewardValue && previewData && (
              <p className="text-xs text-gray-500 mt-1.5">
                Custo estimado:{' '}
                <span className="font-semibold text-primary-700">
                  {formatBRL((parseBRLInput(rewardValue) || 0) * previewData.totalClientes)}
                </span>
                {' '}para {previewData.totalClientes} clientes
              </p>
            )}
          </div>

          <div className="flex gap-3">
            <button
              onClick={() => setStep(2)}
              className="flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-600 text-sm font-medium hover:bg-gray-50 transition-colors"
            >
              ← Voltar
            </button>
            <button
              onClick={() => {
                const val = parseBRLInput(rewardValue);
                if (!val || val <= 0) { showToast('Informe um valor válido.', 'error'); return; }
                setStep(4);
              }}
              className="flex-1 py-2.5 rounded-xl bg-primary-600 text-white text-sm font-semibold hover:bg-primary-700 transition-colors"
            >
              Continuar →
            </button>
          </div>
        </div>
      )}

      {/* ── STEP 4: Message ── */}
      {step === 4 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 space-y-5">
          <h2 className="text-lg font-semibold text-gray-800">Mensagem da campanha</h2>

          {/* Template selector */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Modelo de mensagem
            </label>
            <select
              value={templateKey}
              onChange={(e) => handleTemplateChange(e.target.value)}
              className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-primary-400 text-sm bg-white"
            >
              {TEMPLATES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>

          {/* Message textarea */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Texto da mensagem
            </label>
            <textarea
              value={message}
              onChange={(e) => { setMessage(e.target.value); setTemplateKey('custom'); }}
              rows={4}
              maxLength={300}
              placeholder="Digite sua mensagem para os clientes..."
              className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-primary-400 text-sm resize-none"
            />
            <p className="text-xs text-gray-400 text-right mt-1">{message.length}/300</p>
          </div>

          <div className="flex gap-3">
            <button
              onClick={() => setStep(3)}
              className="flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-600 text-sm font-medium hover:bg-gray-50 transition-colors"
            >
              ← Voltar
            </button>
            <button
              onClick={() => {
                if (!message.trim()) { showToast('A mensagem não pode estar vazia.', 'error'); return; }
                handleLoadPreview();
              }}
              disabled={loading}
              className="flex-1 py-2.5 rounded-xl bg-primary-600 text-white text-sm font-semibold hover:bg-primary-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
            >
              {loading
                ? <><span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> Carregando...</>
                : 'Ver resumo →'
              }
            </button>
          </div>
        </div>
      )}

      {/* ── STEP 5: Resumo + confirmar ── */}
      {step === 5 && previewData && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 space-y-5">
          <h2 className="text-lg font-semibold text-gray-800">Resumo da campanha</h2>

          {/* Summary box */}
          <div className="bg-gray-50 rounded-xl p-5 space-y-4 border border-gray-100">
            <SummaryRow label="Nome" value={campaignName} highlight />
            <SummaryRow
              label="Filtro"
              value={`${filterType === 'ACTIVE' ? 'Melhores clientes' : 'Clientes inativos'} — ${PERIOD_LABELS[filterPeriod]}`}
            />
            <SummaryRow
              label="Clientes selecionados"
              value={`${previewData.totalClientes} cliente${previewData.totalClientes !== 1 ? 's' : ''}`}
              highlight
            />
            <SummaryRow
              label="Recompensa"
              value={
                rewardType === 'FIXED'
                  ? `${formatBRL(parseBRLInput(rewardValue))} de cashback por cliente`
                  : `${formatBRL(parseBRLInput(rewardValue))} de cashback por litro`
              }
            />
            {rewardType === 'FIXED' && (
              <SummaryRow
                label="Custo total estimado"
                value={previewData.custoTotal}
                highlight
              />
            )}
            <div className="pt-2 border-t border-gray-200">
              <p className="text-xs font-medium text-gray-500 mb-1">Mensagem</p>
              <p className="text-sm text-gray-800 italic">"{message}"</p>
            </div>
          </div>

          {/* Customer preview (collapsed list) */}
          {previewData.totalClientes > 0 && (
            <details className="group">
              <summary className="cursor-pointer text-sm text-primary-600 font-medium list-none flex items-center gap-1 select-none">
                <span className="group-open:rotate-90 transition-transform">▶</span>
                Ver lista de clientes ({previewData.totalClientes})
              </summary>
              <div className="mt-2 divide-y divide-gray-100 max-h-48 overflow-y-auto rounded-lg border border-gray-100">
                {previewData.clientes.map((c) => (
                  <div key={c.id} className="flex items-center justify-between px-4 py-2.5">
                    <div>
                      <p className="text-sm font-medium text-gray-800">{c.nome}</p>
                      <p className="text-xs text-gray-400">{c.cpf}</p>
                    </div>
                    <p className="text-sm text-gray-600">{c.saldo}</p>
                  </div>
                ))}
              </div>
            </details>
          )}

          <div className="flex gap-3">
            <button
              onClick={() => setStep(4)}
              disabled={sending}
              className="flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-600 text-sm font-medium hover:bg-gray-50 transition-colors disabled:opacity-50"
            >
              ← Voltar
            </button>
            <button
              onClick={handleSend}
              disabled={sending}
              className="flex-1 py-3 rounded-xl bg-green-600 text-white font-semibold hover:bg-green-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
            >
              {sending
                ? <><span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> Enviando...</>
                : '✓ Confirmar e enviar'
              }
            </button>
          </div>
        </div>
      )}
      {/* ── Histórico de campanhas ─────────────────────────────────────────── */}
      <div className="mt-10">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-gray-800">Histórico de campanhas</h2>
          <button
            onClick={() => loadHistory(historyTab, historyPage)}
            className="text-sm text-primary-600 hover:text-primary-800 font-medium transition-colors"
          >
            ↻ Atualizar
          </button>
        </div>

        {/* Abas de status */}
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1 mb-5 w-fit">
          {STATUS_TABS.map((t) => (
            <button
              key={t.value}
              onClick={() => handleTabChange(t.value)}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
                historyTab === t.value
                  ? 'bg-white text-gray-800 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Cards */}
        <div className="space-y-4">
          {historyLoading ? (
            <>
              <CampaignSkeleton />
              <CampaignSkeleton />
              <CampaignSkeleton />
            </>
          ) : !historyData || historyData.campaigns.length === 0 ? (
            <div className="text-center py-12 text-gray-400 bg-white rounded-xl border border-gray-100">
              <div className="text-4xl mb-2">📭</div>
              <p className="font-medium">Nenhuma campanha encontrada</p>
              <p className="text-sm mt-1">Crie sua primeira campanha acima.</p>
            </div>
          ) : (
            historyData.campaigns.map((c) => (
              <CampaignCard key={c.id} c={c} onClose={handleCloseCampaign} />
            ))
          )}
        </div>

        {/* Paginação */}
        {historyData && historyData.pages > 1 && (
          <div className="flex items-center justify-between mt-5">
            <button
              onClick={() => setHistoryPage((p) => Math.max(1, p - 1))}
              disabled={historyPage === 1}
              className="px-4 py-2 rounded-lg border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              ← Anterior
            </button>
            <span className="text-sm text-gray-500">
              Página {historyPage} de {historyData.pages}
            </span>
            <button
              onClick={() => setHistoryPage((p) => Math.min(historyData.pages, p + 1))}
              disabled={historyPage === historyData.pages}
              className="px-4 py-2 rounded-lg border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Próxima →
            </button>
          </div>
        )}
      </div>

    </div>
  );
}

function SummaryRow({ label, value, highlight }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="text-sm text-gray-500 shrink-0">{label}</span>
      <span className={`text-sm text-right font-medium ${highlight ? 'text-primary-700' : 'text-gray-800'}`}>
        {value}
      </span>
    </div>
  );
}
