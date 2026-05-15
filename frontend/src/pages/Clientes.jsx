import { useState, useEffect, useCallback, useRef } from 'react';
import { customersAPI } from '../services/api.js';
import { Users } from '@phosphor-icons/react';

const LIMIT = 20;

function formatPhone(phone) {
  const d = phone.replace(/\D/g, '');
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return phone;
}

function formatWhatsApp(phone) {
  const d = phone.replace(/\D/g, '');
  return d.startsWith('55') ? d : `55${d}`;
}

function formatDate(isoDate) {
  if (!isoDate) return 'Nunca abasteceu';
  return new Date(isoDate).toLocaleDateString('pt-BR');
}

function formatBRL(value) {
  return Number(value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function maskCpf(formatted) {
  if (!formatted || formatted.length !== 14) return formatted || '';
  return formatted.slice(0, 3) + '.XXX.XXX-' + formatted.slice(12);
}

// ── WhatsApp SVG icon ─────────────────────────────────────────────────────────

function WhatsAppIcon({ className }) {
  return (
    <svg viewBox="0 0 24 24" className={className} xmlns="http://www.w3.org/2000/svg" fill="currentColor">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" />
    </svg>
  );
}

// ── WhatsApp button ───────────────────────────────────────────────────────────

function WhatsAppButton({ phone, size = 'sm' }) {
  const href = `https://wa.me/${formatWhatsApp(phone)}`;
  const base =
    'inline-flex items-center gap-1.5 rounded-lg bg-green-500 text-white font-medium hover:bg-green-600 transition-colors';
  const sizes = {
    sm: 'px-2.5 py-1.5 text-xs',
    md: 'px-3 py-1.5 text-xs',
  };
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={`${base} ${sizes[size]}`}>
      <WhatsAppIcon className="w-3.5 h-3.5" />
      WhatsApp
    </a>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function Clientes() {
  const [customers, setCustomers] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [activeSearch, setActiveSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const debounceRef = useRef(null);

  const fetchCustomers = useCallback(async (searchTerm, pageNum) => {
    setLoading(true);
    try {
      const { data } = await customersAPI.list(searchTerm, pageNum);
      setCustomers(data.customers);
      setTotal(data.total);
    } catch {
      setCustomers([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCustomers(activeSearch, page);
  }, [activeSearch, page, fetchCustomers]);

  function handleSearchChange(e) {
    const value = e.target.value;
    setSearch(value);
    clearTimeout(debounceRef.current);

    if (value.length === 0) {
      setActiveSearch('');
      setPage(1);
    } else if (value.length >= 3) {
      debounceRef.current = setTimeout(() => {
        setActiveSearch(value);
        setPage(1);
      }, 400);
    }
  }

  function handleClear() {
    clearTimeout(debounceRef.current);
    setSearch('');
    setActiveSearch('');
    setPage(1);
  }

  const totalPages = Math.ceil(total / LIMIT);
  const showing = Math.min(page * LIMIT, total);
  const from = total === 0 ? 0 : (page - 1) * LIMIT + 1;

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Clientes Cadastrados</h1>
      </div>

      {/* Search bar */}
      <div className="flex gap-2">
        <input
          type="text"
          value={search}
          onChange={handleSearchChange}
          placeholder="Buscar por nome, CPF ou telefone"
          className="flex-1 px-4 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400"
        />
        {search && (
          <button
            onClick={handleClear}
            className="px-4 py-2.5 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 transition-colors whitespace-nowrap"
          >
            Limpar busca
          </button>
        )}
      </div>

      {/* Loading */}
      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin" />
        </div>
      ) : customers.length === 0 ? (

        /* Empty state */
        <div className="text-center py-16 text-gray-400 border border-dashed border-gray-200 rounded-xl">
          <Users size={48} weight="duotone" className="text-stone-300 mb-2 mx-auto" />
          <p className="text-sm font-medium">
            {activeSearch
              ? 'Nenhum cliente encontrado para essa busca'
              : 'Nenhum cliente encontrado'}
          </p>
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden sm:block overflow-x-auto rounded-xl border border-gray-100">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wide">
                <tr>
                  <th className="px-4 py-3 text-left">Cliente</th>
                  <th className="px-4 py-3 text-left">Telefone</th>
                  <th className="px-4 py-3 text-right">Consumo últimos 30 dias</th>
                  <th className="px-4 py-3 text-left">Último abastecimento</th>
                  <th className="px-4 py-3 text-center">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {customers.map((c) => (
                  <tr key={c.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-900">{c.name}</p>
                      <p className="text-xs text-gray-400 font-mono mt-0.5">{maskCpf(c.cpf)}</p>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{formatPhone(c.phone)}</td>
                    <td className="px-4 py-3 text-right font-semibold text-green-700">
                      {formatBRL(c.totalLast30Days)}
                    </td>
                    <td className="px-4 py-3 text-gray-500">{formatDate(c.lastFuelDate)}</td>
                    <td className="px-4 py-3 text-center">
                      <WhatsAppButton phone={c.phone} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="sm:hidden space-y-3">
            {customers.map((c) => (
              <div key={c.id} className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div>
                    <p className="font-semibold text-gray-900">{c.name}</p>
                    <p className="text-xs text-gray-400 font-mono mt-0.5">{maskCpf(c.cpf)}</p>
                    <p className="text-sm text-gray-500 mt-0.5">{formatPhone(c.phone)}</p>
                  </div>
                  <WhatsAppButton phone={c.phone} size="md" />
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <p className="text-gray-400 mb-0.5">Consumo 30 dias</p>
                    <p className="font-semibold text-green-700">{formatBRL(c.totalLast30Days)}</p>
                  </div>
                  <div>
                    <p className="text-gray-400 mb-0.5">Último abastecimento</p>
                    <p className="text-gray-600">{formatDate(c.lastFuelDate)}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Pagination */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-1">
            <p className="text-sm text-gray-500">
              Mostrando {from}–{showing} de {total} clientes
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setPage((p) => p - 1)}
                disabled={page === 1}
                className="px-4 py-2 text-sm rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                ← Anterior
              </button>
              <button
                onClick={() => setPage((p) => p + 1)}
                disabled={page >= totalPages}
                className="px-4 py-2 text-sm rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Próxima →
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
