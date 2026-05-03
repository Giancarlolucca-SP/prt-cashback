import { useState, useEffect, useCallback } from 'react';
import { cashbackSettingsAPI } from '../services/api.js';
import { useToast } from '../context/ToastContext.jsx';
import Button from '../components/ui/Button.jsx';

// ── Shared primitives ─────────────────────────────────────────────────────────

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

function Toggle({ label, description, checked, onChange }) {
  return (
    <label className="flex items-start gap-4 cursor-pointer group py-1">
      <div className="relative mt-0.5 shrink-0">
        <input type="checkbox" className="sr-only" checked={checked} onChange={(e) => onChange(e.target.checked)} />
        <div className={`w-11 h-6 rounded-full transition-colors ${checked ? 'bg-primary-600' : 'bg-gray-200'}`} />
        <div className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${checked ? 'translate-x-5' : ''}`} />
      </div>
      <div>
        <p className="text-sm font-medium text-gray-800">{label}</p>
        {description && <p className="text-xs text-gray-400 mt-0.5">{description}</p>}
      </div>
    </label>
  );
}

function Field({ label, value, onChange, prefix, suffix, hint, type = 'number', min = '0', step = '0.01', disabled }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <div className="relative flex items-center">
        {prefix && (
          <span className="absolute left-3 text-gray-400 text-sm select-none">{prefix}</span>
        )}
        <input
          type={type}
          min={min}
          step={step}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          className={[
            'w-full rounded-lg border border-gray-200 text-sm py-2.5',
            'focus:outline-none focus:ring-2 focus:ring-primary-400',
            'disabled:bg-gray-50 disabled:text-gray-400 disabled:cursor-not-allowed',
            prefix ? 'pl-10' : 'pl-4',
            suffix ? 'pr-10' : 'pr-4',
          ].join(' ')}
        />
        {suffix && (
          <span className="absolute right-3 text-gray-400 text-sm select-none">{suffix}</span>
        )}
      </div>
      {hint && <p className="mt-1 text-xs text-gray-400">{hint}</p>}
    </div>
  );
}

function formatBRL(v) {
  const n = parseFloat(v);
  if (isNaN(n)) return 'R$ 0,00';
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

const FUEL_LABELS = {
  gasoline:         { label: 'Gasolina',              icon: '🟡' },
  ethanol:          { label: 'Etanol',                icon: '🟢' },
  diesel:           { label: 'Diesel',                icon: '🔵' },
  gnv:              { label: 'GNV',                   icon: '⚪' },
  carWash:          { label: 'Lavagem',               icon: '🚿' },
  convenienceStore: { label: 'Loja de Conveniência',  icon: '🛒' },
};

// Types that use fixedValue instead of centsPerLiter
const FIXED_VALUE_TYPES = new Set(['carWash', 'convenienceStore']);

// Reference amounts used in the per-card example text
const EXAMPLE_AMOUNTS = {
  carWash:          50,
  convenienceStore: 30,
};

const FUEL_KEYS = ['gasoline', 'ethanol', 'diesel', 'gnv', 'carWash', 'convenienceStore'];

const EMPTY_SETTINGS = {
  mode:                      'PERCENTAGE',
  defaultPercent:            5,
  defaultCentsPerLiter:      0.05,
  fuelTypes: {
    gasoline:         { active: false, percent: '5',  centsPerLiter: '0.05' },
    ethanol:          { active: false, percent: '5',  centsPerLiter: '0.05' },
    diesel:           { active: false, percent: '4',  centsPerLiter: '0.04' },
    gnv:              { active: false, percent: '3',  centsPerLiter: '0.03' },
    carWash:          { active: false, percent: '5',  fixedValue: '0' },
    convenienceStore: { active: false, percent: '5',  fixedValue: '0' },
  },
  minFuelAmount:             0,
  maxCashbackPerTransaction: 50,
  doubleBonus:               false,
  doubleBonusStart:          null,
  doubleBonusEnd:            null,
  rushHourBonus:             false,
  rushHourStart:             '06:00',
  rushHourEnd:               '10:00',
  rushHourPercent:           10,
};

// ISO datetime → datetime-local input value (YYYY-MM-DDTHH:mm)
function toDatetimeLocal(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// datetime-local value → ISO string
function fromDatetimeLocal(v) {
  return v ? new Date(v).toISOString() : null;
}

// Is double bonus currently active?
function isBonusNowActive(start, end) {
  const now = new Date();
  const s = start ? new Date(start) : null;
  const e = end   ? new Date(end)   : null;
  return (!s || now >= s) && (!e || now <= e);
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function ConfiguracoesCashback() {
  const { showToast } = useToast();

  const [loading,  setLoading]  = useState(true);
  const [saving,   setSaving]   = useState(false);

  // Settings state
  const [mode,                      setMode]                      = useState('PERCENTAGE');
  const [defaultPercent,            setDefaultPercent]            = useState('5');
  const [defaultCentsPerLiter,      setDefaultCentsPerLiter]      = useState('0.05');
  const [fuelTypes,                 setFuelTypes]                 = useState(EMPTY_SETTINGS.fuelTypes);
  const [minFuelAmount,             setMinFuelAmount]             = useState('0');
  const [maxCashbackPerTransaction, setMaxCashbackPerTransaction] = useState('50');
  const [doubleBonus,               setDoubleBonus]               = useState(false);
  const [doubleBonusStart,          setDoubleBonusStart]          = useState('');
  const [doubleBonusEnd,            setDoubleBonusEnd]            = useState('');
  const [rushHourBonus,             setRushHourBonus]             = useState(false);
  const [rushHourStart,             setRushHourStart]             = useState('06:00');
  const [rushHourEnd,               setRushHourEnd]               = useState('10:00');
  const [rushHourPercent,           setRushHourPercent]           = useState('10');

  // ── Load ────────────────────────────────────────────────────────────────────

  const applySettings = useCallback((cfg) => {
    setMode(cfg.mode || 'PERCENTAGE');
    setDefaultPercent(String(cfg.defaultPercent ?? 5));
    setDefaultCentsPerLiter(String(cfg.defaultCentsPerLiter ?? 0.05));

    // Normalise fuelTypes — values from API are numbers, keep as strings for inputs
    const ft = cfg.fuelTypes || EMPTY_SETTINGS.fuelTypes;
    const normalized = {};
    FUEL_KEYS.forEach((k) => {
      const v = ft[k] || {};
      if (FIXED_VALUE_TYPES.has(k)) {
        normalized[k] = {
          active:     v.active     ?? false,
          percent:    String(v.percent    ?? 5),
          fixedValue: String(v.fixedValue ?? 0),
        };
      } else {
        normalized[k] = {
          active:        v.active        ?? false,
          percent:       String(v.percent        ?? 5),
          centsPerLiter: String(v.centsPerLiter  ?? 0.05),
        };
      }
    });
    setFuelTypes(normalized);

    setMinFuelAmount(String(cfg.minFuelAmount ?? 0));
    setMaxCashbackPerTransaction(String(cfg.maxCashbackPerTransaction ?? 50));
    setDoubleBonus(cfg.doubleBonus ?? false);
    setDoubleBonusStart(toDatetimeLocal(cfg.doubleBonusStart));
    setDoubleBonusEnd(toDatetimeLocal(cfg.doubleBonusEnd));
    setRushHourBonus(cfg.rushHourBonus ?? false);
    setRushHourStart(cfg.rushHourStart || '06:00');
    setRushHourEnd(cfg.rushHourEnd   || '10:00');
    setRushHourPercent(String(cfg.rushHourPercent ?? 10));
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await cashbackSettingsAPI.get();
        applySettings(data.configuracoes);
      } catch {
        showToast('Erro ao carregar configurações.', 'error');
      } finally {
        setLoading(false);
      }
    })();
  }, [applySettings, showToast]);

  // ── Save ────────────────────────────────────────────────────────────────────

  async function handleSave() {
    setSaving(true);
    try {
      // Serialise fuelTypes back to numbers
      const ftPayload = {};
      FUEL_KEYS.forEach((k) => {
        if (FIXED_VALUE_TYPES.has(k)) {
          ftPayload[k] = {
            active:     fuelTypes[k].active,
            percent:    parseFloat(fuelTypes[k].percent)    || 0,
            fixedValue: parseFloat(fuelTypes[k].fixedValue) || 0,
          };
        } else {
          ftPayload[k] = {
            active:        fuelTypes[k].active,
            percent:       parseFloat(fuelTypes[k].percent)        || 0,
            centsPerLiter: parseFloat(fuelTypes[k].centsPerLiter)  || 0,
          };
        }
      });

      const payload = {
        mode,
        defaultPercent:             parseFloat(defaultPercent)             || 0,
        defaultCentsPerLiter:       parseFloat(defaultCentsPerLiter)       || 0,
        fuelTypes:                  ftPayload,
        minFuelAmount:              parseFloat(minFuelAmount)              || 0,
        maxCashbackPerTransaction:  parseFloat(maxCashbackPerTransaction)  || 0,
        doubleBonus,
        doubleBonusStart:  doubleBonus ? fromDatetimeLocal(doubleBonusStart) : null,
        doubleBonusEnd:    doubleBonus ? fromDatetimeLocal(doubleBonusEnd)   : null,
        rushHourBonus,
        rushHourStart,
        rushHourEnd,
        rushHourPercent:   parseFloat(rushHourPercent) || 0,
      };

      const { data } = await cashbackSettingsAPI.update(payload);
      applySettings(data.configuracoes);
      showToast(data.mensagem, 'success');
    } catch (err) {
      showToast(err.response?.data?.erro || 'Erro ao salvar configurações.', 'error');
    } finally {
      setSaving(false);
    }
  }

  // ── Fuel type helpers ────────────────────────────────────────────────────────

  function setFuelField(key, field, value) {
    setFuelTypes((prev) => ({ ...prev, [key]: { ...prev[key], [field]: value } }));
  }

  const bonusActive = doubleBonus && isBonusNowActive(
    fromDatetimeLocal(doubleBonusStart),
    fromDatetimeLocal(doubleBonusEnd)
  );

  // ── Render ───────────────────────────────────────────────────────────────────

  if (loading) {
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
        <h1 className="text-2xl font-bold text-gray-800">Configurações de Cashback</h1>
        <p className="text-gray-500 text-sm mt-1">Defina como o cashback é calculado para seu posto.</p>
      </div>

      {/* ── Section 1: Mode ── */}
      <Section title="Modo de Cashback" icon="⚙️">
        <div className="space-y-3">
          {[
            {
              value: 'PERCENTAGE',
              label: 'Percentual sobre o valor',
              desc:  'ex: 5% do valor do abastecimento',
              icon:  '%',
            },
            {
              value: 'CENTS_PER_LITER',
              label: 'Centavos por litro',
              desc:  'ex: R$ 0,05 por litro abastecido',
              icon:  '⛽',
            },
          ].map((opt) => (
            <label
              key={opt.value}
              className={`flex items-start gap-4 p-4 rounded-xl border-2 cursor-pointer transition-all ${
                mode === opt.value
                  ? 'border-primary-500 bg-primary-50'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <input
                type="radio"
                name="mode"
                value={opt.value}
                checked={mode === opt.value}
                onChange={() => setMode(opt.value)}
                className="mt-0.5 accent-primary-600"
              />
              <div>
                <p className="text-sm font-semibold text-gray-800">{opt.label}</p>
                <p className="text-xs text-gray-500 mt-0.5">{opt.desc}</p>
              </div>
            </label>
          ))}
        </div>

        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field
            label="Taxa padrão (%)"
            value={defaultPercent}
            onChange={setDefaultPercent}
            suffix="%"
            step="0.1"
            disabled={mode !== 'PERCENTAGE'}
            hint="Aplicada quando nenhum combustível específico está ativo"
          />
          <Field
            label="Taxa padrão (centavos/litro)"
            value={defaultCentsPerLiter}
            onChange={setDefaultCentsPerLiter}
            prefix="R$"
            step="0.001"
            disabled={mode !== 'CENTS_PER_LITER'}
            hint="Aplicada quando nenhum combustível específico está ativo"
          />
        </div>
      </Section>

      {/* ── Section 2: Fuel types ── */}
      <Section title="Configuração por Combustível" icon="⛽">
        <p className="text-xs text-gray-400 mb-4">
          Quando "Ativo", a taxa específica substitui a taxa padrão para aquele combustível.
        </p>
        <div className="space-y-4">
          {FUEL_KEYS.map((key) => {
            const ft        = fuelTypes[key];
            const meta      = FUEL_LABELS[key];
            const isFixed   = FIXED_VALUE_TYPES.has(key);
            const exampleAmt = EXAMPLE_AMOUNTS[key];

            // Preview cashback for example text
            let previewCashback;
            if (isFixed) {
              const fv = parseFloat(ft.fixedValue) || 0;
              previewCashback = fv > 0
                ? fv
                : exampleAmt * (parseFloat(ft.active ? ft.percent : defaultPercent) || 0) / 100;
            } else {
              previewCashback = mode === 'PERCENTAGE'
                ? 100 * (parseFloat(ft.active ? ft.percent : defaultPercent) || 0) / 100
                : (parseFloat(ft.active ? ft.centsPerLiter : defaultCentsPerLiter) || 0) * 1;
            }

            return (
              <div
                key={key}
                className={`rounded-xl border p-4 transition-all ${
                  ft.active ? 'border-primary-200 bg-primary-50/40' : 'border-gray-100 bg-gray-50'
                }`}
              >
                {/* Row header */}
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{meta.icon}</span>
                    <span className="text-sm font-semibold text-gray-800">{meta.label}</span>
                  </div>
                  <Toggle
                    label="Ativo"
                    checked={ft.active}
                    onChange={(v) => setFuelField(key, 'active', v)}
                  />
                </div>

                {/* Rate inputs */}
                <div className="grid grid-cols-2 gap-3">
                  <Field
                    label="Percentual (%)"
                    value={ft.percent}
                    onChange={(v) => setFuelField(key, 'percent', v)}
                    suffix="%"
                    step="0.1"
                    disabled={!ft.active || (isFixed ? false : mode !== 'PERCENTAGE')}
                  />
                  {isFixed ? (
                    <Field
                      label="Valor fixo de cashback (R$)"
                      value={ft.fixedValue}
                      onChange={(v) => setFuelField(key, 'fixedValue', v)}
                      prefix="R$"
                      step="0.01"
                      disabled={!ft.active}
                      hint="Sobrepõe o percentual quando preenchido"
                    />
                  ) : (
                    <Field
                      label="Centavos por litro"
                      value={ft.centsPerLiter}
                      onChange={(v) => setFuelField(key, 'centsPerLiter', v)}
                      prefix="R$"
                      step="0.001"
                      disabled={!ft.active || mode !== 'CENTS_PER_LITER'}
                    />
                  )}
                </div>

                {/* Example */}
                <p className="mt-2.5 text-xs text-gray-500">
                  {isFixed ? (
                    <>
                      A cada {key === 'carWash' ? 'lavagem' : 'compra'} de{' '}
                      <span className="font-semibold">R$ {exampleAmt},00</span> →{' '}
                      <span className="font-semibold text-green-700">
                        {formatBRL(previewCashback)} de cashback
                      </span>
                    </>
                  ) : mode === 'PERCENTAGE' ? (
                    <>
                      A cada <span className="font-semibold">R$ 100,00</span> →{' '}
                      <span className="font-semibold text-green-700">
                        {formatBRL(previewCashback)} de cashback
                      </span>
                    </>
                  ) : (
                    <>
                      Por litro →{' '}
                      <span className="font-semibold text-green-700">
                        {formatBRL(parseFloat(ft.active ? ft.centsPerLiter : defaultCentsPerLiter) || 0)} de cashback
                      </span>
                    </>
                  )}
                </p>
              </div>
            );
          })}
        </div>
      </Section>

      {/* ── Section 3: Limits ── */}
      <Section title="Limites" icon="🔒">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field
            label="Valor mínimo para gerar cashback (R$)"
            value={minFuelAmount}
            onChange={setMinFuelAmount}
            prefix="R$"
            hint="0 = sem mínimo"
          />
          <Field
            label="Teto máximo por abastecimento (R$)"
            value={maxCashbackPerTransaction}
            onChange={setMaxCashbackPerTransaction}
            prefix="R$"
            hint="0 = sem teto"
          />
        </div>
      </Section>

      {/* ── Section 4: Double bonus ── */}
      <Section title="Promoção Cashback Dobrado" icon="🔥">
        <Toggle
          label="Ativar cashback dobrado"
          description="Dobra o cashback gerado para todos os clientes no período definido"
          checked={doubleBonus}
          onChange={setDoubleBonus}
        />

        {doubleBonus && (
          <div className="mt-4 space-y-4">
            {bonusActive && (
              <div className="inline-flex items-center gap-2 bg-orange-50 border border-orange-200 text-orange-700 text-xs font-semibold px-3 py-1.5 rounded-full">
                🔥 Promoção ativa agora
              </div>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Data e hora início</label>
                <input
                  type="datetime-local"
                  value={doubleBonusStart}
                  onChange={(e) => setDoubleBonusStart(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Data e hora fim</label>
                <input
                  type="datetime-local"
                  value={doubleBonusEnd}
                  onChange={(e) => setDoubleBonusEnd(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400"
                />
              </div>
            </div>
          </div>
        )}
      </Section>

      {/* ── Section 5: Rush hour bonus ── */}
      <Section title="Bônus por Horário de Baixo Movimento" icon="⏰">
        <Toggle
          label="Ativar bônus por horário"
          description="Adiciona cashback extra em horários de menor movimento para atrair clientes"
          checked={rushHourBonus}
          onChange={setRushHourBonus}
        />

        {rushHourBonus && (
          <div className="mt-4 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Horário início</label>
                <input
                  type="time"
                  value={rushHourStart}
                  onChange={(e) => setRushHourStart(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Horário fim</label>
                <input
                  type="time"
                  value={rushHourEnd}
                  onChange={(e) => setRushHourEnd(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400"
                />
              </div>
              <Field
                label="% extra de cashback"
                value={rushHourPercent}
                onChange={setRushHourPercent}
                suffix="%"
                step="1"
              />
            </div>
            <p className="text-xs text-gray-500 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2">
              Das <span className="font-semibold">{rushHourStart}</span> às{' '}
              <span className="font-semibold">{rushHourEnd}</span> →{' '}
              cashback com <span className="font-semibold text-blue-700">+{rushHourPercent || 0}% extra</span>
            </p>
          </div>
        )}
      </Section>

      {/* ── Save button ── */}
      <div className="pb-6">
        <Button variant="primary" size="lg" fullWidth onClick={handleSave} loading={saving}>
          Salvar configurações
        </Button>
      </div>

    </div>
  );
}
