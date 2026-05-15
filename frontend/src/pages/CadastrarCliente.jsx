import { useState } from 'react';
import { customersAPI } from '../services/api.js';
import { applyCpfMask, stripCpf } from '../utils/cpfMask.js';
import { useToast } from '../context/ToastContext.jsx';
import Button from '../components/ui/Button.jsx';
import Input from '../components/ui/Input.jsx';
import Card, { CardHeader } from '../components/ui/Card.jsx';
import { CheckCircle, Info } from '@phosphor-icons/react';

const INITIAL = { name: '', cpf: '', phone: '' };

export default function CadastrarCliente() {
  const [form, setForm]       = useState(INITIAL);
  const [errors, setErrors]   = useState({});
  const [loading, setLoading] = useState(false);
  const [result, setResult]   = useState(null);
  const { showToast }         = useToast();

  function setField(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => ({ ...prev, [field]: '' }));
    setResult(null);
  }

  function handleCpfChange(e) {
    setField('cpf', applyCpfMask(e.target.value));
  }

  function handlePhoneChange(e) {
    const digits = e.target.value.replace(/\D/g, '').slice(0, 11);
    let masked = digits;
    if (digits.length > 2)  masked = `(${digits.slice(0,2)}) ${digits.slice(2)}`;
    if (digits.length > 7)  masked = `(${digits.slice(0,2)}) ${digits.slice(2,7)}-${digits.slice(7)}`;
    setField('phone', masked);
  }

  function validate() {
    const e = {};
    if (!form.name.trim()) e.name = 'Nome é obrigatório.';
    if (stripCpf(form.cpf).length !== 11) e.cpf = 'CPF inválido.';
    if (form.phone.replace(/\D/g, '').length < 10) e.phone = 'Telefone inválido.';
    return e;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length) { setErrors(errs); return; }

    setLoading(true);
    try {
      const { data } = await customersAPI.upsert({
        name: form.name.trim(),
        cpf: stripCpf(form.cpf),
        phone: form.phone.replace(/\D/g, ''),
      });
      setResult(data);
      showToast(data.mensagem, 'success');

      // If new customer, reset form
      if (data.mensagem.includes('cadastrado')) {
        setForm(INITIAL);
      }
    } catch (err) {
      const msg = err.response?.data?.erro || 'Erro ao cadastrar cliente.';
      showToast(msg, 'error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Cadastrar Cliente</h1>
        <p className="text-sm text-gray-500 mt-1">
          Se o CPF já existir, os dados do cliente serão retornados automaticamente
        </p>
      </div>

      <Card>
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            label="Nome completo"
            placeholder="João da Silva"
            value={form.name}
            onChange={(e) => setField('name', e.target.value)}
            error={errors.name}
            autoFocus
          />
          <Input
            label="CPF"
            placeholder="000.000.000-00"
            value={form.cpf}
            onChange={handleCpfChange}
            inputMode="numeric"
            error={errors.cpf}
          />
          <Input
            label="Telefone / WhatsApp"
            placeholder="(11) 99999-0000"
            value={form.phone}
            onChange={handlePhoneChange}
            inputMode="tel"
            error={errors.phone}
          />

          <Button type="submit" fullWidth size="lg" loading={loading}>
            Cadastrar Cliente
          </Button>
        </form>
      </Card>

      {result && (
        <Card>
          <div className={`flex items-center gap-3 mb-5 p-3 rounded-lg text-sm font-medium ${
            result.mensagem.includes('cadastrado')
              ? 'bg-green-50 text-green-700 border border-green-200'
              : 'bg-blue-50 text-blue-700 border border-blue-200'
          }`}>
            {result.mensagem.includes('cadastrado') ? <CheckCircle size={20} weight="duotone" className="text-green-500" /> : <Info size={20} weight="duotone" className="text-blue-500" />}
            {result.mensagem}
          </div>

          <div className="space-y-2 text-sm">
            <InfoRow label="Nome" value={result.cliente.nome} />
            <InfoRow label="CPF" value={result.cliente.cpf} mono />
            <InfoRow label="Telefone" value={result.cliente.telefone} />
            <InfoRow label="Saldo" value={result.cliente.saldo} highlight />
            <InfoRow label="Cadastrado em" value={result.cliente.cadastradoEm} />
          </div>
        </Card>
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
