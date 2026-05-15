import { useState } from 'react';
import { reportsAPI } from '../services/api.js';
import { useToast } from '../context/ToastContext.jsx';
import Button from '../components/ui/Button.jsx';
import { GasPump, CurrencyDollar, Users, ChartBar } from '@phosphor-icons/react';

// ── Constants ─────────────────────────────────────────────────────────────────

const REPORT_TYPES = [
  {
    value: 'TRANSACTIONS',
    label: 'Transações',
    icon: <GasPump size={20} weight="duotone" />,
    desc: 'Todos os abastecimentos com cashback gerado',
  },
  {
    value: 'REDEMPTIONS',
    label: 'Resgates',
    icon: <CurrencyDollar size={20} weight="duotone" />,
    desc: 'Resgates de cashback realizados',
  },
  {
    value: 'CUSTOMERS',
    label: 'Clientes',
    icon: <Users size={20} weight="duotone" />,
    desc: 'Base completa de clientes e consumo',
  },
  {
    value: 'SUMMARY',
    label: 'Resumo',
    icon: <ChartBar size={20} weight="duotone" />,
    desc: 'Visão geral do período com indicadores',
  },
];

const TYPE_SLUG = {
  TRANSACTIONS: 'transacoes',
  REDEMPTIONS:  'resgates',
  CUSTOMERS:    'clientes',
  SUMMARY:      'resumo',
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatBRL(value) {
  return Number(value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

// YYYY-MM-DD → DD/MM/YYYY for API
function toApiDate(v) {
  if (!v) return '';
  const [y, m, d] = v.split('-');
  return `${d}/${m}/${y}`;
}

// ISO date → DD/MM/YYYY display
function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('pt-BR');
}

// ISO date → DD/MM/YYYY HH:mm display
function fmtDateTime(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  // Delay cleanup — browsers (especially Firefox/Safari) initiate the download
  // asynchronously; revoking the URL synchronously aborts it before it starts.
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 1000);
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StatBox({ label, value, accent }) {
  return (
    <div className={`rounded-xl p-4 border ${accent ? 'bg-green-50 border-green-100' : 'bg-blue-50 border-blue-100'}`}>
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <p className={`text-xl font-bold ${accent ? 'text-green-700' : 'text-blue-800'}`}>{value}</p>
    </div>
  );
}

// ── Preview tables per type ───────────────────────────────────────────────────

function TransactionsPreview({ data }) {
  const { rows, totals } = data;
  return (
    <>
      <div className="grid grid-cols-3 gap-3 mb-5">
        <StatBox label="Transações" value={totals.count} />
        <StatBox label="Total abastecido" value={formatBRL(totals.totalAmount)} accent />
        <StatBox label="Cashback gerado" value={formatBRL(totals.totalCashback)} accent />
      </div>

      <div className="overflow-x-auto rounded-xl border border-gray-100">
        <table className="w-full text-xs">
          <thead className="bg-slate-700 text-white">
            <tr>
              {['Data/Hora', 'Cliente', 'CPF', 'Valor Abast.', 'CB%', 'Cashback'].map((h) => (
                <th key={h} className="px-3 py-2.5 text-left font-semibold whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.slice(0, 100).map((r, i) => (
              <tr key={i} className={i % 2 === 1 ? 'bg-gray-50' : ''}>
                <td className="px-3 py-2 whitespace-nowrap text-gray-500">{fmtDateTime(r.date)}</td>
                <td className="px-3 py-2 font-medium text-gray-900">{r.customerName}</td>
                <td className="px-3 py-2 font-mono text-gray-500">{r.cpf}</td>
                <td className="px-3 py-2 text-right font-semibold text-gray-800">{formatBRL(r.amount)}</td>
                <td className="px-3 py-2 text-right text-gray-500">{r.cashbackPercent}%</td>
                <td className="px-3 py-2 text-right font-semibold text-green-700">{formatBRL(r.cashbackValue)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-green-50 font-bold text-green-800">
              <td className="px-3 py-2.5" colSpan={2}>TOTAIS — {totals.count} transações</td>
              <td className="px-3 py-2.5"></td>
              <td className="px-3 py-2.5 text-right">{formatBRL(totals.totalAmount)}</td>
              <td className="px-3 py-2.5"></td>
              <td className="px-3 py-2.5 text-right">{formatBRL(totals.totalCashback)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      {rows.length > 100 && (
        <p className="text-xs text-gray-400 mt-2 text-center">
          Mostrando 100 de {rows.length} registros. O arquivo exportado contém todos.
        </p>
      )}
    </>
  );
}

function RedemptionsPreview({ data }) {
  const { rows, totals } = data;
  return (
    <>
      <div className="grid grid-cols-2 gap-3 mb-5">
        <StatBox label="Resgates" value={totals.count} />
        <StatBox label="Total resgatado" value={formatBRL(totals.totalAmount)} accent />
      </div>

      <div className="overflow-x-auto rounded-xl border border-gray-100">
        <table className="w-full text-xs">
          <thead className="bg-slate-700 text-white">
            <tr>
              {['Data/Hora', 'Cliente', 'CPF', 'Valor Resgatado', 'Operador'].map((h) => (
                <th key={h} className="px-3 py-2.5 text-left font-semibold whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.slice(0, 100).map((r, i) => (
              <tr key={i} className={i % 2 === 1 ? 'bg-gray-50' : ''}>
                <td className="px-3 py-2 whitespace-nowrap text-gray-500">{fmtDateTime(r.date)}</td>
                <td className="px-3 py-2 font-medium text-gray-900">{r.customerName}</td>
                <td className="px-3 py-2 font-mono text-gray-500">{r.cpf}</td>
                <td className="px-3 py-2 text-right font-semibold text-green-700">{formatBRL(r.amountRedeemed)}</td>
                <td className="px-3 py-2 text-gray-500">{r.operator}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-green-50 font-bold text-green-800">
              <td className="px-3 py-2.5" colSpan={2}>TOTAIS — {totals.count} resgates</td>
              <td className="px-3 py-2.5"></td>
              <td className="px-3 py-2.5 text-right">{formatBRL(totals.totalAmount)}</td>
              <td className="px-3 py-2.5"></td>
            </tr>
          </tfoot>
        </table>
      </div>
      {rows.length > 100 && (
        <p className="text-xs text-gray-400 mt-2 text-center">
          Mostrando 100 de {rows.length} registros. O arquivo exportado contém todos.
        </p>
      )}
    </>
  );
}

function CustomersPreview({ data }) {
  const { rows, totals } = data;
  return (
    <>
      <div className="grid grid-cols-3 gap-3 mb-5">
        <StatBox label="Total de clientes" value={totals.count} />
        <StatBox label="Saldo em circulação" value={formatBRL(totals.totalBalance)} accent />
        <StatBox label="Total gasto (lifetime)" value={formatBRL(totals.totalSpent)} accent />
      </div>

      <div className="overflow-x-auto rounded-xl border border-gray-100">
        <table className="w-full text-xs">
          <thead className="bg-slate-700 text-white">
            <tr>
              {['Nome', 'CPF', 'Telefone', 'Saldo', 'Total Gasto', 'Último Abast.', 'Trans.'].map((h) => (
                <th key={h} className="px-3 py-2.5 text-left font-semibold whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.slice(0, 100).map((r, i) => (
              <tr key={i} className={i % 2 === 1 ? 'bg-gray-50' : ''}>
                <td className="px-3 py-2 font-medium text-gray-900">{r.name}</td>
                <td className="px-3 py-2 font-mono text-gray-500">{r.cpf}</td>
                <td className="px-3 py-2 text-gray-600">{r.phone}</td>
                <td className="px-3 py-2 text-right font-semibold text-green-700">{formatBRL(r.balance)}</td>
                <td className="px-3 py-2 text-right text-gray-700">{formatBRL(r.totalSpent)}</td>
                <td className="px-3 py-2 whitespace-nowrap text-gray-500">{fmtDate(r.lastFuelDate)}</td>
                <td className="px-3 py-2 text-center text-gray-600">{r.transactionCount}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-green-50 font-bold text-green-800">
              <td className="px-3 py-2.5">{totals.count} clientes</td>
              <td className="px-3 py-2.5" colSpan={2}></td>
              <td className="px-3 py-2.5 text-right">{formatBRL(totals.totalBalance)}</td>
              <td className="px-3 py-2.5 text-right">{formatBRL(totals.totalSpent)}</td>
              <td className="px-3 py-2.5" colSpan={2}></td>
            </tr>
          </tfoot>
        </table>
      </div>
      {rows.length > 100 && (
        <p className="text-xs text-gray-400 mt-2 text-center">
          Mostrando 100 de {rows.length} registros. O arquivo exportado contém todos.
        </p>
      )}
    </>
  );
}

function SummaryPreview({ data }) {
  const { stats, topCustomers } = data;
  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        <StatBox label="Total de clientes" value={stats.totalCustomers} />
        <StatBox label="Novos no período" value={stats.newCustomers} />
        <StatBox label="Transações" value={stats.totalTransactions} />
        <StatBox label="Resgates" value={stats.totalRedemptions} />
        <StatBox label="Total abastecido" value={formatBRL(stats.totalFueled)} accent />
        <StatBox label="Cashback gerado" value={formatBRL(stats.totalCashback)} accent />
        <StatBox label="Cashback resgatado" value={formatBRL(stats.totalRedeemed)} accent />
        <StatBox label="Saldo em circulação" value={formatBRL(stats.totalCashback - stats.totalRedeemed)} accent />
      </div>

      {topCustomers.length > 0 && (
        <>
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Top 10 Clientes por Volume</h3>
          <div className="overflow-x-auto rounded-xl border border-gray-100">
            <table className="w-full text-xs">
              <thead className="bg-slate-700 text-white">
                <tr>
                  {['#', 'Nome', 'CPF', 'Total Abast.', 'Cashback', 'Visitas'].map((h) => (
                    <th key={h} className="px-3 py-2.5 text-left font-semibold">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {topCustomers.map((c, i) => (
                  <tr key={i} className={i % 2 === 1 ? 'bg-gray-50' : ''}>
                    <td className="px-3 py-2 text-gray-400 font-medium">{c.rank}</td>
                    <td className="px-3 py-2 font-medium text-gray-900">{c.name}</td>
                    <td className="px-3 py-2 font-mono text-gray-500">{c.cpf}</td>
                    <td className="px-3 py-2 text-right font-semibold text-gray-800">{formatBRL(c.totalSpent)}</td>
                    <td className="px-3 py-2 text-right font-semibold text-green-700">{formatBRL(c.totalCashback)}</td>
                    <td className="px-3 py-2 text-center text-gray-600">{c.visits}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}

function PreviewSection({ data }) {
  if (!data) return null;
  switch (data.type) {
    case 'TRANSACTIONS': return <TransactionsPreview data={data} />;
    case 'REDEMPTIONS':  return <RedemptionsPreview  data={data} />;
    case 'CUSTOMERS':    return <CustomersPreview    data={data} />;
    case 'SUMMARY':      return <SummaryPreview      data={data} />;
    default:             return null;
  }
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function Relatorios() {
  const { showToast } = useToast();

  const [type,       setType]       = useState('TRANSACTIONS');
  const [startDate,  setStartDate]  = useState('');
  const [endDate,    setEndDate]    = useState('');
  const [preview,    setPreview]    = useState(null);
  const [loading,    setLoading]    = useState(false);
  const [exportingPdf,   setExportingPdf]   = useState(false);
  const [exportingXlsx,  setExportingXlsx]  = useState(false);

  const params = {
    type,
    startDate: toApiDate(startDate),
    endDate:   toApiDate(endDate),
  };

  async function handlePreview() {
    setLoading(true);
    setPreview(null);
    try {
      const { data } = await reportsAPI.preview(params);
      setPreview(data);
    } catch (err) {
      showToast(err.response?.data?.erro || 'Erro ao gerar prévia.', 'error');
    } finally {
      setLoading(false);
    }
  }

  async function handleExportPdf() {
    setExportingPdf(true);
    try {
      const { data } = await reportsAPI.exportPDF(params);
      downloadBlob(data, `relatorio-${TYPE_SLUG[type] ?? type.toLowerCase()}.pdf`);
    } catch (err) {
      console.error('[PDF] Falha ao exportar:', err);
      const msg = err.response?.status === 401
        ? 'Sessão expirada. Faça login novamente.'
        : err.response?.status === 404
          ? 'Sem dados para exportar no período selecionado.'
          : 'Não foi possível exportar o PDF. Tente novamente.';
      showToast(msg, 'error');
    } finally {
      setExportingPdf(false);
    }
  }

  async function handleExportExcel() {
    setExportingXlsx(true);
    try {
      const { data } = await reportsAPI.exportExcel(params);
      downloadBlob(data, `relatorio-${TYPE_SLUG[type] ?? type.toLowerCase()}.xlsx`);
    } catch (err) {
      console.error('[Excel] Falha ao exportar:', err);
      const msg = err.response?.status === 401
        ? 'Sessão expirada. Faça login novamente.'
        : err.response?.status === 404
          ? 'Sem dados para exportar no período selecionado.'
          : 'Não foi possível exportar o Excel. Tente novamente.';
      showToast(msg, 'error');
    } finally {
      setExportingXlsx(false);
    }
  }

  const selectedType = REPORT_TYPES.find((t) => t.value === type);

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Relatórios</h1>
        <p className="text-sm text-gray-500 mt-1">Gere relatórios e exporte em PDF ou Excel.</p>
      </div>

      {/* Config card */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 sm:p-6 space-y-5">

        {/* Report type selector */}
        <div>
          <p className="text-sm font-semibold text-gray-700 mb-3">Tipo de relatório</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            {REPORT_TYPES.map((rt) => (
              <button
                key={rt.value}
                onClick={() => { setType(rt.value); setPreview(null); }}
                className={`text-left p-3 rounded-xl border-2 transition-all ${
                  type === rt.value
                    ? 'border-primary-500 bg-primary-50'
                    : 'border-gray-200 hover:border-gray-300 bg-white'
                }`}
              >
                <div className="text-xl mb-1">{rt.icon}</div>
                <div className={`text-xs font-semibold ${type === rt.value ? 'text-primary-700' : 'text-gray-800'}`}>
                  {rt.label}
                </div>
                <div className="text-xs text-gray-400 mt-0.5 leading-snug hidden sm:block">{rt.desc}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Date range */}
        <div>
          <p className="text-sm font-semibold text-gray-700 mb-3">Período (opcional)</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Data inicial</label>
              <input
                type="date"
                value={startDate}
                max={endDate || undefined}
                onChange={(e) => { setStartDate(e.target.value); setPreview(null); }}
                className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Data final</label>
              <input
                type="date"
                value={endDate}
                min={startDate || undefined}
                onChange={(e) => { setEndDate(e.target.value); setPreview(null); }}
                className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400"
              />
            </div>
          </div>
          {!startDate && !endDate && (
            <p className="text-xs text-gray-400 mt-1.5">Sem datas selecionadas: relatório incluirá todos os registros.</p>
          )}
        </div>

        {/* Action buttons */}
        <div className="flex flex-col sm:flex-row gap-2.5 pt-1">
          <Button
            variant="primary"
            onClick={handlePreview}
            loading={loading}
            className="flex-1"
          >
            {selectedType?.icon} Gerar prévia
          </Button>
          <Button
            variant="secondary"
            onClick={handleExportPdf}
            loading={exportingPdf}
            disabled={loading}
            className="flex-1"
          >
            Exportar PDF
          </Button>
          <Button
            variant="secondary"
            onClick={handleExportExcel}
            loading={exportingXlsx}
            disabled={loading}
            className="flex-1"
          >
            Exportar Excel
          </Button>
        </div>
      </div>

      {/* Loading state */}
      {loading && (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin" />
        </div>
      )}

      {/* Preview section */}
      {!loading && preview && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 sm:p-6">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h2 className="text-lg font-bold text-gray-900">
                {selectedType?.icon} Prévia — {selectedType?.label}
              </h2>
              {preview.meta && (
                <p className="text-xs text-gray-400 mt-0.5">
                  Período: {preview.meta.dateRange} &nbsp;·&nbsp; {preview.meta.establishmentName}
                </p>
              )}
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleExportPdf}
                disabled={exportingPdf}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50 transition-colors"
              >
                {exportingPdf
                  ? <span className="w-3 h-3 border-2 border-gray-400 border-t-gray-600 rounded-full animate-spin" />
                  : null
                }
                PDF
              </button>
              <button
                onClick={handleExportExcel}
                disabled={exportingXlsx}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50 transition-colors"
              >
                {exportingXlsx
                  ? <span className="w-3 h-3 border-2 border-gray-400 border-t-gray-600 rounded-full animate-spin" />
                  : null
                }
                Excel
              </button>
            </div>
          </div>

          <PreviewSection data={preview} />
        </div>
      )}

    </div>
  );
}
