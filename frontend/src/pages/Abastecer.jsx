import { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { customersAPI, transactionsAPI } from '../services/api.js';
import { applyCpfMask, stripCpf } from '../utils/cpfMask.js';
import { useToast } from '../context/ToastContext.jsx';
import Button from '../components/ui/Button.jsx';
import Input from '../components/ui/Input.jsx';
import Card, { CardHeader } from '../components/ui/Card.jsx';
import { User, GasPump, Receipt, Warning, CheckCircle } from '@phosphor-icons/react';

const FUEL_OPTIONS = [
  { value: '',                   label: 'Selecione o combustível (opcional)' },
  { value: 'gasolina',           label: 'Gasolina' },
  { value: 'gasolina_aditivada', label: 'Gasolina Aditivada' },
  { value: 'etanol',             label: 'Etanol' },
  { value: 'diesel',             label: 'Diesel' },
  { value: 'diesel_s10',         label: 'Diesel S-10' },
  { value: 'gnv',                label: 'GNV' },
];

// ── Steps ─────────────────────────────────────────────────────────────────────

function StepIndicator({ step }) {
  const steps = [
    { id: 'cpf',    label: 'Cliente' },
    { id: 'form',   label: 'Abastecimento' },
    { id: 'result', label: 'Resultado' },
  ];
  const current = steps.findIndex((s) => s.id === step);

  return (
    <div className="flex items-center gap-1 mb-6">
      {steps.map((s, i) => (
        <div key={s.id} className="flex items-center gap-1 flex-1">
          <div className={[
            'w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0',
            i < current  ? 'bg-green-500 text-white'
            : i === current ? 'bg-primary-600 text-white'
            : 'bg-gray-200 text-gray-400',
          ].join(' ')}>
            {i < current ? '✓' : i + 1}
          </div>
          <span className={[
            'text-xs hidden sm:block',
            i === current ? 'text-primary-700 font-semibold' : 'text-gray-400',
          ].join(' ')}>
            {s.label}
          </span>
          {i < steps.length - 1 && (
            <div className={[
              'h-px flex-1 mx-1',
              i < current ? 'bg-green-400' : 'bg-gray-200',
            ].join(' ')} />
          )}
        </div>
      ))}
    </div>
  );
}

// ── Step 1: CPF lookup ────────────────────────────────────────────────────────

function CpfStep({ initialCpf, onFound }) {
  const [cpf, setCpf]       = useState(initialCpf ? applyCpfMask(initialCpf) : '');
  const [loading, setLoading] = useState(false);
  const [error, setError]   = useState('');

  async function handleSearch(e) {
    e.preventDefault();
    const digits = stripCpf(cpf);
    if (digits.length !== 11) {
      setError('Digite um CPF completo (11 dígitos).');
      return;
    }
    setError('');
    setLoading(true);
    try {
      const { data } = await customersAPI.findByCpf(digits);
      onFound(data.cliente, digits);
    } catch (err) {
      setError(err.response?.data?.erro || 'Cliente não encontrado. Verifique o CPF.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <CardHeader title="Buscar Cliente" icon={<User size={20} weight="duotone" />} />
      <form onSubmit={handleSearch} className="space-y-4">
        <Input
          label="CPF do cliente"
          placeholder="000.000.000-00"
          value={cpf}
          onChange={(e) => { setCpf(applyCpfMask(e.target.value)); setError(''); }}
          inputMode="numeric"
          error={error}
          autoFocus={!initialCpf}
        />
        <Button type="submit" fullWidth size="lg" loading={loading}
          loadingText="Buscando cliente...">
          Buscar Cliente
        </Button>
      </form>
    </Card>
  );
}

// ── Step 2: Transaction form ──────────────────────────────────────────────────

function FormStep({ customer, cpfDigits, onResult, onBack }) {
  const [amount, setAmount]     = useState('');
  const [fuelType, setFuelType] = useState('');
  const [liters, setLiters]     = useState('');
  const [loading, setLoading]   = useState(false);
  const [errors, setErrors]     = useState({});

  function validate() {
    const e = {};
    const v = parseFloat(amount.replace(',', '.'));
    if (!amount || isNaN(v) || v <= 0) e.amount = 'Informe o valor do abastecimento.';
    if (liters) {
      const l = parseFloat(liters.replace(',', '.'));
      if (isNaN(l) || l <= 0) e.liters = 'Quantidade de litros inválida.';
    }
    return e;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length) { setErrors(errs); return; }
    setErrors({});
    setLoading(true);
    try {
      const payload = {
        cpf:      cpfDigits,
        amount:   parseFloat(amount.replace(',', '.')),
        fuelType: fuelType || undefined,
        liters:   liters ? parseFloat(liters.replace(',', '.')) : undefined,
      };
      const { data } = await transactionsAPI.earn(payload);
      onResult(data);
    } catch (err) {
      const msg = err.response?.data?.erro || 'Erro ao registrar abastecimento.';
      setErrors({ submit: msg });
    } finally {
      setLoading(false);
    }
  }

  const previewAmount  = parseFloat(amount.replace(',', '.')) || 0;

  return (
    <div className="space-y-4">
      {/* Customer mini-card */}
      <div className="bg-primary-50 border border-primary-100 rounded-xl px-4 py-3 flex justify-between items-center">
        <div>
          <p className="text-xs text-primary-500 font-medium">Cliente encontrado</p>
          <p className="text-primary-900 font-bold">{customer.nome}</p>
          <p className="text-xs text-primary-600 font-mono">{customer.cpf}</p>
        </div>
        <div className="text-right">
          <p className="text-xs text-primary-500">Saldo atual</p>
          <p className="text-lg font-bold text-green-700">{customer.saldoFormatado}</p>
        </div>
      </div>

      <Card>
        <CardHeader title="Dados do Abastecimento" icon={<GasPump size={20} weight="duotone" />} />
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            label="Valor do abastecimento"
            placeholder="0,00"
            prefix="R$"
            value={amount}
            onChange={(e) => {
              setAmount(e.target.value.replace(/[^\d,.]/g, ''));
              setErrors((p) => ({ ...p, amount: '' }));
            }}
            inputMode="decimal"
            error={errors.amount}
            autoFocus
          />

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Combustível
            </label>
            <select
              value={fuelType}
              onChange={(e) => setFuelType(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              {FUEL_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>

          {fuelType && (
            <Input
              label="Quantidade (litros)"
              placeholder="0,000"
              suffix="L"
              value={liters}
              onChange={(e) => {
                setLiters(e.target.value.replace(/[^\d,.]/g, ''));
                setErrors((p) => ({ ...p, liters: '' }));
              }}
              inputMode="decimal"
              error={errors.liters}
            />
          )}

          {/* Preview */}
          {previewAmount > 0 && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-sm text-center">
              <span className="text-green-700">Cashback estimado com base nas configurações do posto</span>
            </div>
          )}

          {errors.submit && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
              {errors.submit}
            </div>
          )}

          <Button type="submit" fullWidth size="lg" loading={loading}
            loadingText="Registrando abastecimento...">
            Confirmar Abastecimento
          </Button>

          <button
            type="button"
            onClick={onBack}
            disabled={loading}
            className="w-full text-sm text-gray-400 hover:text-gray-600 py-1"
          >
            ← Trocar CPF
          </button>
        </form>
      </Card>
    </div>
  );
}

// ── Step 3: Result ────────────────────────────────────────────────────────────

function ResultStep({ result, onNew }) {
  const isPending = result?.pendente === true;

  return (
    <Card>
      {isPending ? (
        <>
          <div className="flex flex-col items-center text-center py-4 gap-3">
            <div className="w-14 h-14 rounded-full bg-yellow-100 flex items-center justify-center"><Warning size={28} weight="duotone" className="text-yellow-500" /></div>
            <div>
              <p className="text-lg font-bold text-yellow-800">Salvo para validação posterior</p>
              <p className="text-sm text-yellow-700 mt-1">
                Não foi possível confirmar o abastecimento agora.
                O registro foi salvo e será validado assim que o serviço for restabelecido.
              </p>
            </div>
            {result.codigoCupom && (
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg px-4 py-2 w-full">
                <p className="text-xs text-yellow-600">Código de acompanhamento</p>
                <p className="font-mono font-bold text-yellow-900">{result.codigoCupom}</p>
              </div>
            )}
          </div>
        </>
      ) : (
        <>
          <div className="flex flex-col items-center text-center py-2 gap-2 mb-4">
            <div className="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center"><CheckCircle size={28} weight="duotone" className="text-green-500" /></div>
            <p className="text-lg font-bold text-green-800">Cashback gerado com sucesso!</p>
          </div>

          <CardHeader title="Comprovante" icon={<Receipt size={20} weight="duotone" />} />
          <div className="space-y-2 text-sm mb-4">
            <InfoRow label="Código"         value={result.transacao.codigoCupom} mono />
            <InfoRow label="Abastecimento"  value={result.transacao.valorAbastecimento} />
            <InfoRow label={`Cashback (${result.transacao.percentualCashback})`}
                     value={result.transacao.cashbackGerado} highlight />
            <InfoRow label="Novo saldo"     value={result.transacao.novoSaldo} highlight />
            <InfoRow label="Data"           value={result.transacao.data} />
          </div>

          {result.cupom && (
            <details className="mt-4">
              <summary className="text-xs text-gray-500 cursor-pointer hover:text-gray-700 select-none">
                Ver cupom para impressão
              </summary>
              <pre className="receipt-text mt-3">{result.cupom}</pre>
            </details>
          )}
        </>
      )}

      <Button variant="secondary" fullWidth size="sm" className="mt-4" onClick={onNew}>
        Novo abastecimento
      </Button>
    </Card>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function Abastecer() {
  const location              = useLocation();
  const { showToast }         = useToast();

  const [step, setStep]       = useState('cpf');
  const [customer, setCustomer] = useState(null);
  const [cpfDigits, setCpfDigits] = useState('');
  const [result, setResult]   = useState(null);

  function handleFound(cliente, digits) {
    setCustomer(cliente);
    setCpfDigits(digits);
    setStep('form');
  }

  function handleResult(data) {
    setResult(data);
    setStep('result');
    if (data.pendente) {
      showToast('Abastecimento salvo para validação posterior.', 'warning');
    } else {
      showToast(data.mensagem || 'Cashback gerado com sucesso!', 'success');
    }
  }

  function handleNew() {
    setStep('cpf');
    setCustomer(null);
    setCpfDigits('');
    setResult(null);
  }

  const initialCpf = location.state?.cpf ?? '';

  return (
    <div className="max-w-lg mx-auto space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Registrar Abastecimento</h1>
        <p className="text-sm text-gray-500 mt-1">Gere cashback para o cliente</p>
      </div>

      <StepIndicator step={step} />

      {step === 'cpf' && (
        <CpfStep initialCpf={initialCpf} onFound={handleFound} />
      )}
      {step === 'form' && (
        <FormStep
          customer={customer}
          cpfDigits={cpfDigits}
          onResult={handleResult}
          onBack={() => setStep('cpf')}
        />
      )}
      {step === 'result' && (
        <ResultStep result={result} onNew={handleNew} />
      )}
    </div>
  );
}

function InfoRow({ label, value, mono, highlight }) {
  return (
    <div className="flex justify-between items-center py-1.5 border-b border-gray-50 last:border-0">
      <span className="text-gray-500">{label}</span>
      <span className={[
        'font-medium',
        mono ? 'font-mono text-xs text-gray-700' : '',
        highlight ? 'text-green-700 font-bold' : 'text-gray-900',
      ].join(' ')}>
        {value}
      </span>
    </div>
  );
}
