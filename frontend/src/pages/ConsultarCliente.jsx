import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { customersAPI } from '../services/api.js';
import { applyCpfMask, stripCpf } from '../utils/cpfMask.js';
import Button from '../components/ui/Button.jsx';
import Input from '../components/ui/Input.jsx';
import Card, { CardHeader } from '../components/ui/Card.jsx';
import { User } from '@phosphor-icons/react';

export default function ConsultarCliente() {
  const [cpf, setCpf]         = useState('');
  const [customer, setCustomer] = useState(null);
  const [loading, setLoading]  = useState(false);
  const [error, setError]      = useState('');
  const navigate               = useNavigate();

  function handleCpfChange(e) {
    setCpf(applyCpfMask(e.target.value));
    setCustomer(null);
    setError('');
  }

  async function handleSearch(e) {
    e.preventDefault();
    const digits = stripCpf(cpf);
    if (digits.length !== 11) {
      setError('Digite um CPF completo (11 dígitos).');
      return;
    }

    setLoading(true);
    setError('');
    try {
      const { data } = await customersAPI.findByCpf(digits);
      setCustomer(data.cliente);
    } catch (err) {
      const msg = err.response?.data?.erro || 'Erro ao consultar cliente.';
      setError(msg);
      setCustomer(null);
    } finally {
      setLoading(false);
    }
  }

  function goTo(path) {
    navigate(path, { state: { cpf: stripCpf(cpf) } });
  }

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Consultar Cliente</h1>
        <p className="text-sm text-gray-500 mt-1">Busque pelo CPF para ver saldo e histórico</p>
      </div>

      <Card>
        <form onSubmit={handleSearch} className="space-y-4">
          <Input
            label="CPF do cliente"
            placeholder="000.000.000-00"
            value={cpf}
            onChange={handleCpfChange}
            inputMode="numeric"
            autoFocus
            error={error}
          />
          <Button type="submit" fullWidth loading={loading}>
            Consultar
          </Button>
        </form>
      </Card>

      {customer && (
        <Card>
          <CardHeader title={customer.nome} icon={<User size={20} weight="duotone" />} />

          <div className="space-y-3 text-sm">
            <Row label="CPF" value={customer.cpf} mono />
            <Row label="Telefone" value={customer.telefone} />
            <Row label="Cadastrado em" value={customer.cadastradoEm} />
          </div>

          {/* Balance highlight */}
          <div className="mt-5 bg-green-50 border border-green-200 rounded-xl p-4 text-center">
            <p className="text-xs font-medium text-green-700 mb-1">Saldo disponível</p>
            <p className="text-3xl font-bold text-green-700">{customer.saldo}</p>
          </div>

          {/* Actions */}
          <div className="mt-5 grid grid-cols-2 gap-3">
            <Button
              variant="primary"
              fullWidth
              onClick={() => goTo('/abastecer')}
            >
              Abastecer
            </Button>
            <Button
              variant={customer.saldoNumerico > 0 ? 'success' : 'secondary'}
              fullWidth
              onClick={() => goTo('/resgatar')}
              disabled={customer.saldoNumerico <= 0}
            >
              Resgatar
            </Button>
          </div>
          {customer.saldoNumerico <= 0 && (
            <p className="text-xs text-center text-gray-400 mt-2">Saldo zerado — resgate indisponível</p>
          )}

          {/* Recent transactions */}
          {customer.ultimasTransacoes?.length > 0 && (
            <div className="mt-6">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Últimos abastecimentos</p>
              <div className="space-y-2">
                {customer.ultimasTransacoes.map((t) => (
                  <div key={t.id} className="flex justify-between items-center text-xs bg-gray-50 rounded-lg px-3 py-2">
                    <div>
                      <span className="font-medium text-gray-700">{t.valorAbastecimento}</span>
                      <span className="text-gray-400 ml-2">{t.percentualCashback}</span>
                    </div>
                    <div className="text-right">
                      <span className="text-green-600 font-semibold">+{t.cashbackGerado}</span>
                      <p className="text-gray-400">{t.data}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}

function Row({ label, value, mono }) {
  return (
    <div className="flex justify-between items-center py-1.5 border-b border-gray-50 last:border-0">
      <span className="text-gray-500">{label}</span>
      <span className={`font-medium text-gray-900 ${mono ? 'font-mono text-xs' : ''}`}>{value}</span>
    </div>
  );
}
