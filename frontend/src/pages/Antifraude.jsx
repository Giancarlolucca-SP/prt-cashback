import { useState, useEffect, useCallback } from 'react';
import { fraudAPI } from '../services/api.js';
import { useToast } from '../context/ToastContext.jsx';
import { applyCpfMask, stripCpf } from '../utils/cpfMask.js';
import Button from '../components/ui/Button.jsx';
import Modal from '../components/ui/Modal.jsx';
import { GasPump, CurrencyDollar, Bell, Prohibit, CheckCircle } from '@phosphor-icons/react';

// ── Section wrapper ───────────────────────────────────────────────────────────

function Section({ title, icon, children }) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 sm:p-6">
      <h2 className="flex items-center gap-2 text-base font-semibold text-gray-800 mb-5">
        <span>{icon}</span>
        {title}
      </h2>
      {children}
    </div>
  );
}

// ── Number input ──────────────────────────────────────────────────────────────

function NumericField({ label, value, onChange, prefix, min = 0, step = 1, hint }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <div className="relative">
        {prefix && (
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm select-none">
            {prefix}
          </span>
        )}
        <input
          type="number"
          min={min}
          step={step}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={`w-full ${prefix ? 'pl-10' : 'pl-4'} pr-4 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400`}
        />
      </div>
      {hint && <p className="mt-1 text-xs text-gray-400">{hint}</p>}
    </div>
  );
}

// ── Toggle ────────────────────────────────────────────────────────────────────

function Toggle({ label, description, checked, onChange }) {
  return (
    <label className="flex items-start gap-4 cursor-pointer group py-1">
      <div className="relative mt-0.5 shrink-0">
        <input
          type="checkbox"
          className="sr-only"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
        />
        <div
          className={`w-11 h-6 rounded-full transition-colors ${
            checked ? 'bg-primary-600' : 'bg-gray-200'
          }`}
        />
        <div
          className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
            checked ? 'translate-x-5' : 'translate-x-0'
          }`}
        />
      </div>
      <div>
        <p className="text-sm font-medium text-gray-800 group-hover:text-gray-900">{label}</p>
        {description && <p className="text-xs text-gray-400 mt-0.5">{description}</p>}
      </div>
    </label>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

const EMPTY_SETTINGS = {
  maxAbastecimentosPorDia:    1,
  maxAbastecimentosPorSemana: 3,
  maxValorAbastecimento:      500,
  maxCashbackPorDia:          50,
  maxResgatesPorSemana:       2,
  alertarCashbackExcedido:    true,
  alertarHorarioSuspeito:     true,
};

export default function Antifraude() {
  const { showToast } = useToast();

  // Settings state
  const [settings, setSettings] = useState(EMPTY_SETTINGS);

  // Blacklist state
  const [blacklist,   setBlacklist]   = useState([]);
  const [cpfInput,    setCpfInput]    = useState('');
  const [motivoInput, setMotivoInput] = useState('');

  // UI state
  const [loadingPage, setLoadingPage] = useState(true);
  const [saving,      setSaving]      = useState(false);
  const [blocking,    setBlocking]    = useState(false);

  // Confirm modal
  const [modal, setModal] = useState({ open: false, type: null, cpf: null, motivo: null, processing: false });

  // ── Load ──────────────────────────────────────────────────────────────────

  const loadData = useCallback(async () => {
    try {
      const [settingsRes, blacklistRes] = await Promise.all([
        fraudAPI.getSettings(),
        fraudAPI.getBlacklist(),
      ]);
      setSettings(settingsRes.data.configuracoes);
      setBlacklist(blacklistRes.data.bloqueios);
    } catch {
      showToast('Erro ao carregar configurações antifraude.', 'error');
    } finally {
      setLoadingPage(false);
    }
  }, [showToast]);

  useEffect(() => { loadData(); }, [loadData]);

  // ── Save settings ─────────────────────────────────────────────────────────

  async function handleSave() {
    setSaving(true);
    try {
      await fraudAPI.updateSettings(settings);
      showToast('Configurações salvas com sucesso!', 'success');
    } catch (err) {
      showToast(err.response?.data?.erro || 'Erro ao salvar configurações.', 'error');
    } finally {
      setSaving(false);
    }
  }

  function setField(key, value) {
    setSettings((prev) => ({ ...prev, [key]: value }));
  }

  // ── Block CPF ─────────────────────────────────────────────────────────────

  function openBlockModal() {
    const clean = stripCpf(cpfInput);
    if (clean.length !== 11) { showToast('CPF inválido. Verifique o formato.', 'error'); return; }
    if (!motivoInput.trim()) { showToast('Informe o motivo do bloqueio.', 'error'); return; }
    setModal({ open: true, type: 'block', cpf: cpfInput, motivo: motivoInput, processing: false });
  }

  async function confirmBlock() {
    setModal((m) => ({ ...m, processing: true }));
    setBlocking(true);
    try {
      await fraudAPI.addToBlacklist({ cpf: stripCpf(cpfInput), motivo: motivoInput.trim() });
      showToast('CPF bloqueado com sucesso.', 'success');
      setCpfInput('');
      setMotivoInput('');
      setModal({ open: false, type: null, cpf: null, motivo: null, processing: false });
      const res = await fraudAPI.getBlacklist();
      setBlacklist(res.data.bloqueios);
    } catch (err) {
      showToast(err.response?.data?.erro || 'Erro ao bloquear CPF. Tente novamente.', 'error');
      setModal((m) => ({ ...m, processing: false }));
    } finally {
      setBlocking(false);
    }
  }

  // ── Unblock CPF ───────────────────────────────────────────────────────────

  function openUnblockModal(entry) {
    setModal({ open: true, type: 'unblock', cpf: entry.cpf, motivo: entry.motivo, processing: false });
  }

  async function confirmUnblock() {
    setModal((m) => ({ ...m, processing: true }));
    try {
      await fraudAPI.removeFromBlacklist(stripCpf(modal.cpf));
      showToast('CPF desbloqueado com sucesso.', 'success');
      setModal({ open: false, type: null, cpf: null, motivo: null, processing: false });
      const res = await fraudAPI.getBlacklist();
      setBlacklist(res.data.bloqueios);
    } catch (err) {
      showToast(err.response?.data?.erro || 'Erro ao desbloquear CPF.', 'error');
      setModal((m) => ({ ...m, processing: false }));
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  if (loadingPage) {
    return (
      <div className="flex items-center justify-center min-h-64">
        <div className="w-8 h-8 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-800">Antifraude</h1>
        <p className="text-gray-500 text-sm mt-1">Defina limites e bloqueios para proteger seu estabelecimento.</p>
      </div>

      {/* ── Section 1: Fuel limits ── */}
      <Section title="Limites de Abastecimento" icon={<GasPump size={20} weight="duotone" />}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <NumericField
            label="Máximo de abastecimentos por dia por CPF"
            value={settings.maxAbastecimentosPorDia}
            onChange={(v) => setField('maxAbastecimentosPorDia', Number(v))}
            min={1}
            hint="Número máximo de abastecimentos diários"
          />
          <NumericField
            label="Máximo de abastecimentos por semana por CPF"
            value={settings.maxAbastecimentosPorSemana}
            onChange={(v) => setField('maxAbastecimentosPorSemana', Number(v))}
            min={1}
            hint="Contagem reinicia toda segunda-feira"
          />
          <NumericField
            label="Valor máximo por abastecimento (R$)"
            value={settings.maxValorAbastecimento}
            onChange={(v) => setField('maxValorAbastecimento', Number(v))}
            prefix="R$"
            min={1}
            step={10}
            hint="Acima deste valor a transação é bloqueada"
          />
          <NumericField
            label="Limite de cashback por dia por CPF (R$)"
            value={settings.maxCashbackPorDia}
            onChange={(v) => setField('maxCashbackPorDia', Number(v))}
            prefix="R$"
            min={1}
            step={5}
            hint="Soma de cashback gerado no dia"
          />
        </div>
      </Section>

      {/* ── Section 2: Redemption limits ── */}
      <Section title="Limites de Resgate" icon={<CurrencyDollar size={20} weight="duotone" />}>
        <div className="max-w-xs">
          <NumericField
            label="Máximo de resgates por semana por CPF"
            value={settings.maxResgatesPorSemana}
            onChange={(v) => setField('maxResgatesPorSemana', Number(v))}
            min={1}
            hint="Contagem reinicia toda segunda-feira"
          />
        </div>
      </Section>

      {/* ── Section 3: Alerts ── */}
      <Section title="Alertas" icon={<Bell size={20} weight="duotone" />}>
        <div className="space-y-4">
          <Toggle
            label="Alertar quando cashback exceder o limite diário"
            description="Notifica quando um CPF atingir o teto de cashback do dia"
            checked={settings.alertarCashbackExcedido}
            onChange={(v) => setField('alertarCashbackExcedido', v)}
          />
          <div className="border-t border-gray-100" />
          <Toggle
            label="Alertar transações fora do horário comercial (06:00–22:00)"
            description="Sinaliza abastecimentos registrados fora do horário padrão"
            checked={settings.alertarHorarioSuspeito}
            onChange={(v) => setField('alertarHorarioSuspeito', v)}
          />
        </div>
      </Section>

      {/* ── Section 4: Blacklist ── */}
      <Section title="Blacklist de CPFs" icon={<Prohibit size={20} weight="duotone" />}>

        {/* Add to blacklist form */}
        <div className="flex flex-col sm:flex-row gap-3 mb-5">
          <input
            type="text"
            value={cpfInput}
            onChange={(e) => setCpfInput(applyCpfMask(e.target.value))}
            placeholder="CPF (000.000.000-00)"
            maxLength={14}
            className="flex-1 px-4 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400"
          />
          <input
            type="text"
            value={motivoInput}
            onChange={(e) => setMotivoInput(e.target.value)}
            placeholder="Motivo do bloqueio"
            maxLength={200}
            className="flex-1 px-4 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400"
          />
          <Button
            variant="danger"
            onClick={openBlockModal}
            loading={blocking}
            className="shrink-0"
          >
            Bloquear CPF
          </Button>
        </div>

        {/* Blacklist table */}
        {blacklist.length === 0 ? (
          <div className="text-center py-10 text-gray-400 border border-dashed border-gray-200 rounded-xl">
            <CheckCircle size={32} weight="duotone" className="text-green-500 mx-auto mb-1" />
            <p className="text-sm font-medium">Nenhum CPF bloqueado</p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-gray-100">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wide">
                <tr>
                  <th className="px-4 py-3 text-left">CPF</th>
                  <th className="px-4 py-3 text-left">Motivo</th>
                  <th className="px-4 py-3 text-left hidden sm:table-cell">Bloqueado por</th>
                  <th className="px-4 py-3 text-left hidden md:table-cell">Data</th>
                  <th className="px-4 py-3 text-center">Ação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {blacklist.map((entry) => (
                  <tr key={entry.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 font-mono font-medium text-gray-800">{entry.cpf}</td>
                    <td className="px-4 py-3 text-gray-600 max-w-[140px] truncate" title={entry.motivo}>
                      {entry.motivo}
                    </td>
                    <td className="px-4 py-3 text-gray-500 hidden sm:table-cell">{entry.bloqueadoPor}</td>
                    <td className="px-4 py-3 text-gray-400 text-xs hidden md:table-cell whitespace-nowrap">
                      {entry.bloqueadoEm}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={() => openUnblockModal(entry)}
                        className="text-xs font-medium text-red-600 hover:text-red-800 hover:underline transition-colors"
                      >
                        Desbloquear
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      {/* ── Save button ── */}
      <div className="pb-6">
        <Button
          variant="primary"
          size="lg"
          fullWidth
          onClick={handleSave}
          loading={saving}
        >
          Salvar configurações
        </Button>
      </div>

      {/* ── Confirm modal ── */}
      <Modal
        open={modal.open}
        title={modal.type === 'block' ? 'Confirmar bloqueio' : 'Confirmar desbloqueio'}
        confirmLabel={modal.type === 'block' ? 'Bloquear' : 'Desbloquear'}
        confirmVariant={modal.type === 'block' ? 'danger' : 'primary'}
        cancelLabel="Cancelar"
        loading={modal.processing}
        onConfirm={modal.type === 'block' ? confirmBlock : confirmUnblock}
        onCancel={() => setModal({ open: false, type: null, cpf: null, motivo: null, processing: false })}
      >
        {modal.type === 'block' ? (
          <p>
            Deseja bloquear o CPF <span className="font-semibold font-mono">{modal.cpf}</span>?
            <br />
            <span className="text-gray-500">Motivo: {modal.motivo}</span>
          </p>
        ) : (
          <p>
            Deseja remover o bloqueio do CPF{' '}
            <span className="font-semibold font-mono">{modal.cpf}</span>?
          </p>
        )}
      </Modal>

    </div>
  );
}
