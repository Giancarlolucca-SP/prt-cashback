import { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { customersAPI, redemptionsAPI } from '../services/api.js';
import { applyCpfMask, stripCpf } from '../utils/cpfMask.js';
import { useToast } from '../context/ToastContext.jsx';
import Button from '../components/ui/Button.jsx';
import Input from '../components/ui/Input.jsx';
import Card, { CardHeader } from '../components/ui/Card.jsx';
import Modal from '../components/ui/Modal.jsx';

export default function Resgatar() {
  const location = useLocation();
  const { showToast } = useToast();

  const [cpf, setCpf]           = useState(
    location.state?.cpf ? applyCpfMask(location.state.cpf) : ''
  );
  const [customer, setCustomer] = useState(null);
  const [amount, setAmount]     = useState('');
  const [loadingSearch, setLoadingSearch] = useState(false);
  const [loadingRedeem, setLoadingRedeem] = useState(false);
  const [errors, setErrors]     = useState({});
  const [showModal, setShowModal] = useState(false);
  const [result, setResult]     = useState(null);

  async function handleSearch(e) {
    e.preventDefault();
    const digits = stripCpf(cpf);
    if (digits.length !== 11) {
      setErrors({ cpf: 'CPF inválido.' });
      return;
    }
    setErrors({});
    setLoadingSearch(true);
    try {
      const { data } = await customersAPI.findByCpf(digits);
      setCustomer(data.cliente);
      setResult(null);
    } catch (err) {
      setErrors({ cpf: err.response?.data?.erro || 'Cliente não encontrado.' });
      setCustomer(null);
    } finally {
      setLoadingSearch(false);
    }
  }

  function handleRedeemClick(e) {
    e.preventDefault();
    const v = parseFloat(amount.replace(',', '.'));
    if (!amount || isNaN(v) || v <= 0) {
      setErrors((p) => ({ ...p, amount: 'Informe o valor a resgatar.' }));
      return;
    }
    if (v < 10) {
      setErrors((p) => ({ ...p, amount: 'Valor mínimo para resgate: R$ 10,00.' }));
      return;
    }
    if (v > customer.saldoNumerico) {
      setErrors((p) => ({ ...p, amount: `Saldo insuficiente. Disponível: ${customer.saldo}.` }));
      return;
    }
    setErrors({});
    setShowModal(true);
  }

  async function confirmRedeem() {
    setLoadingRedeem(true);
    try {
      const { data } = await redemptionsAPI.redeem({
        cpf: stripCpf(cpf),
        amount: parseFloat(amount.replace(',', '.')),
      });
      setResult(data);
      setShowModal(false);
      setAmount('');
      // Update balance display
      setCustomer((prev) => ({
        ...prev,
        saldo: data.resgate.novoSaldo,
        saldoNumerico: parseFloat(data.resgate.novoSaldo.replace(/[^\d,]/g, '').replace(',', '.')),
      }));
      showToast(data.mensagem, 'success');
    } catch (err) {
      const msg = err.response?.data?.erro || 'Erro ao processar resgate.';
      showToast(msg, 'error');
      setShowModal(false);
    } finally {
      setLoadingRedeem(false);
    }
  }

  const parsedAmount = parseFloat(amount.replace(',', '.')) || 0;

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Resgatar Cashback</h1>
        <p className="text-sm text-gray-500 mt-1">Consulte o saldo e confirme o resgate</p>
      </div>

      {/* Step 1: CPF search */}
      <Card>
        <CardHeader title="1. Identificar cliente" />
        <form onSubmit={handleSearch} className="space-y-4">
          <Input
            label="CPF do cliente"
            placeholder="000.000.000-00"
            value={cpf}
            onChange={(e) => {
              setCpf(applyCpfMask(e.target.value));
              setCustomer(null);
              setErrors({});
              setResult(null);
            }}
            inputMode="numeric"
            error={errors.cpf}
            autoFocus={!cpf}
          />
          <Button type="submit" fullWidth loading={loadingSearch}>
            🔍 Consultar saldo
          </Button>
        </form>
      </Card>

      {/* Step 2: Balance + amount */}
      {customer && (
        <Card>
          <CardHeader title={customer.nome} icon="👤" />

          <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-center mb-5">
            <p className="text-xs font-medium text-green-700 mb-1">Saldo disponível</p>
            <p className="text-3xl font-bold text-green-700">{customer.saldo}</p>
          </div>

          {customer.saldoNumerico <= 0 ? (
            <div className="text-center text-gray-500 text-sm py-4">
              Saldo zerado — resgate indisponível.
            </div>
          ) : (
            <form onSubmit={handleRedeemClick} className="space-y-4">
              <Input
                label="Valor a resgatar"
                prefix="R$"
                placeholder="0,00"
                value={amount}
                onChange={(e) => {
                  setAmount(e.target.value.replace(/[^\d,.]/g, ''));
                  setErrors((p) => ({ ...p, amount: '' }));
                }}
                inputMode="decimal"
                error={errors.amount}
                hint={`Mínimo: R$ 10,00  •  Máximo: ${customer.saldo}`}
              />

              {parsedAmount > 0 && parsedAmount <= customer.saldoNumerico && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-sm">
                  <div className="flex justify-between">
                    <span className="text-yellow-700">Saldo após resgate:</span>
                    <span className="font-bold text-yellow-800">
                      {(customer.saldoNumerico - parsedAmount).toLocaleString('pt-BR', {
                        style: 'currency',
                        currency: 'BRL',
                      })}
                    </span>
                  </div>
                </div>
              )}

              <Button type="submit" variant="success" fullWidth size="lg">
                💸 Resgatar
              </Button>
            </form>
          )}
        </Card>
      )}

      {/* Step 3: Result */}
      {result && (
        <Card>
          <CardHeader title="Comprovante de Resgate" icon="✅" />
          <div className="space-y-2 text-sm mb-4">
            <InfoRow label="Código" value={result.resgate.codigoCupom} mono />
            <InfoRow label="Valor resgatado" value={result.resgate.valorResgatado} highlight />
            <InfoRow label="Saldo anterior" value={result.resgate.saldoAnterior} />
            <InfoRow label="Novo saldo" value={result.resgate.novoSaldo} />
            <InfoRow label="Data" value={result.resgate.data} />
          </div>

          {result.cupom && (
            <details className="mt-4">
              <summary className="text-xs text-gray-500 cursor-pointer hover:text-gray-700 select-none">
                Ver cupom para impressão
              </summary>
              <pre className="receipt-text mt-3">{result.cupom}</pre>
            </details>
          )}
        </Card>
      )}

      {/* Confirmation Modal */}
      <Modal
        open={showModal}
        title="Confirmar resgate"
        confirmLabel="Confirmar resgate"
        cancelLabel="Cancelar"
        confirmVariant="success"
        loading={loadingRedeem}
        onConfirm={confirmRedeem}
        onCancel={() => setShowModal(false)}
      >
        <div className="space-y-3">
          <p>Confirme os dados antes de prosseguir:</p>
          <div className="bg-gray-50 rounded-lg p-4 space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-600">Cliente:</span>
              <span className="font-semibold">{customer?.nome}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">CPF:</span>
              <span className="font-mono text-xs">{customer?.cpf}</span>
            </div>
            <div className="flex justify-between border-t border-gray-200 pt-2 mt-2">
              <span className="text-gray-600">Valor a resgatar:</span>
              <span className="font-bold text-green-700 text-base">
                {parsedAmount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
              </span>
            </div>
          </div>
          <p className="text-xs text-gray-400">Esta ação não pode ser desfeita.</p>
        </div>
      </Modal>
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
