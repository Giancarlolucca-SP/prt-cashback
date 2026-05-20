import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { registrationAPI } from '../services/api.js';

const ESTADOS_BR = [
  'AC','AL','AP','AM','BA','CE','DF','ES','GO','MA',
  'MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN',
  'RS','RO','RR','SC','SP','SE','TO',
];

function formatCnpj(value) {
  return value
    .replace(/\D/g, '')
    .replace(/^(\d{2})(\d)/, '$1.$2')
    .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1/$2')
    .replace(/(\d{4})(\d)/, '$1-$2')
    .slice(0, 18);
}

function formatPhone(value) {
  return value
    .replace(/\D/g, '')
    .replace(/^(\d{2})(\d)/, '($1) $2')
    .replace(/(\d{5})(\d)/, '$1-$2')
    .slice(0, 15);
}

export default function CompletarCadastro() {
  const { operator, login } = useAuth();
  const navigate             = useNavigate();

  const [form, setForm] = useState({
    nome:     '',
    cnpj:     '',
    telefone: '',
    cidade:   '',
    estado:   '',
  });
  const [error,   setError]   = useState('');
  const [loading, setLoading] = useState(false);

  function handleChange(e) {
    const { name, value } = e.target;
    setForm(prev => ({
      ...prev,
      [name]: name === 'cnpj'     ? formatCnpj(value)
             : name === 'telefone' ? formatPhone(value)
             : value,
    }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');

    if (!form.nome.trim())  { setError('Nome do posto é obrigatório.');      return; }
    if (!form.cnpj.trim())  { setError('CNPJ é obrigatório.');               return; }
    if (!form.estado)       { setError('Selecione o estado.');                return; }

    setLoading(true);
    try {
      const { data } = await registrationAPI.completarCadastro({
        nome:     form.nome.trim(),
        cnpj:     form.cnpj,
        telefone: form.telefone || undefined,
        cidade:   form.cidade.trim() || undefined,
        estado:   form.estado,
      });

      // Update session with new token (now includes establishmentId)
      login(data.token, data.operador);
      navigate('/dashboard', { replace: true });
    } catch (err) {
      setError(err.response?.data?.erro || 'Erro ao salvar cadastro. Tente novamente.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary-700 to-primary-900 px-4 py-8">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-8">

        {/* Header */}
        <div className="text-center mb-8">
          <div className="flex justify-center mb-4">
            <img src="/logo-vertical.svg" alt="PostoCash" className="h-20 w-auto object-contain" />
          </div>
          <h1 className="text-xl font-bold text-gray-900">Complete seu cadastro</h1>
          <p className="text-sm text-gray-500 mt-1">
            Olá{operator?.nome ? `, ${operator.nome.split(' ')[0]}` : ''}! Informe os dados do seu posto para continuar.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">

          {/* Nome do posto */}
          <div>
            <label htmlFor="nome" className="block text-sm font-medium text-gray-700 mb-1">
              Nome do posto <span className="text-red-500">*</span>
            </label>
            <input
              id="nome"
              name="nome"
              type="text"
              autoFocus
              placeholder="Ex: Posto Central"
              value={form.nome}
              onChange={handleChange}
              className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition"
            />
          </div>

          {/* CNPJ */}
          <div>
            <label htmlFor="cnpj" className="block text-sm font-medium text-gray-700 mb-1">
              CNPJ <span className="text-red-500">*</span>
            </label>
            <input
              id="cnpj"
              name="cnpj"
              type="text"
              inputMode="numeric"
              placeholder="00.000.000/0001-00"
              value={form.cnpj}
              onChange={handleChange}
              className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition"
            />
          </div>

          {/* Telefone */}
          <div>
            <label htmlFor="telefone" className="block text-sm font-medium text-gray-700 mb-1">
              Telefone
            </label>
            <input
              id="telefone"
              name="telefone"
              type="tel"
              inputMode="numeric"
              placeholder="(11) 99999-9999"
              value={form.telefone}
              onChange={handleChange}
              className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition"
            />
          </div>

          {/* Cidade + Estado */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="cidade" className="block text-sm font-medium text-gray-700 mb-1">
                Cidade
              </label>
              <input
                id="cidade"
                name="cidade"
                type="text"
                placeholder="São Paulo"
                value={form.cidade}
                onChange={handleChange}
                className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition"
              />
            </div>
            <div>
              <label htmlFor="estado" className="block text-sm font-medium text-gray-700 mb-1">
                Estado <span className="text-red-500">*</span>
              </label>
              <select
                id="estado"
                name="estado"
                value={form.estado}
                onChange={handleChange}
                className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition bg-white"
              >
                <option value="">UF</option>
                {ESTADOS_BR.map(uf => (
                  <option key={uf} value={uf}>{uf}</option>
                ))}
              </select>
            </div>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 bg-primary-600 hover:bg-primary-700 disabled:opacity-60 disabled:cursor-not-allowed text-white font-semibold text-sm py-3 rounded-xl transition-colors mt-2"
          >
            {loading ? (
              <>
                <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
                Salvando...
              </>
            ) : 'Concluir cadastro e acessar o sistema'}
          </button>
        </form>
      </div>
    </div>
  );
}
