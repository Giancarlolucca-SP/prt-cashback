import { useState, useEffect, useCallback } from 'react';
import { operatorsAPI } from '../services/api.js';
import { UserGear, Plus, Trash, Warning, CheckCircle, X } from '@phosphor-icons/react';

const ROLE_LABEL = { SUPERADMIN: 'Super admin', ADMIN: 'Administrador', OPERATOR: 'Operador (frentista)' };

export default function Operadores() {
  const [ops, setOps]       = useState([]);
  const [loading, setLoad]  = useState(true);
  const [name, setName]     = useState('');
  const [email, setEmail]   = useState('');
  const [password, setPass] = useState('');
  const [busy, setBusy]     = useState(false);
  const [error, setError]   = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(() => {
    operatorsAPI.list().then((r) => setOps(r.data.operadores || [])).catch(() => setOps([])).finally(() => setLoad(false));
  }, []);
  useEffect(() => { load(); }, [load]);

  async function add(e) {
    e.preventDefault();
    setError(''); setNotice('');
    if (!name.trim()) { setError('Informe o nome.'); return; }
    if (!email.trim()) { setError('Informe o e-mail.'); return; }
    if (password.length < 6) { setError('A senha deve ter ao menos 6 caracteres.'); return; }
    setBusy(true);
    try {
      const { data } = await operatorsAPI.create({ name: name.trim(), email: email.trim(), password });
      setNotice(`Login criado: ${data.operador.email}`);
      setName(''); setEmail(''); setPass('');
      load();
    } catch (e2) {
      setError(e2.response?.data?.erro ?? 'Não foi possível criar o login.');
    } finally { setBusy(false); }
  }

  async function remove(op) {
    if (!window.confirm(`Remover o login ${op.email}?`)) return;
    try { await operatorsAPI.remove(op.id); load(); }
    catch (e) { setError(e.response?.data?.erro ?? 'Não foi possível remover.'); }
  }

  return (
    <div className="space-y-5 max-w-2xl">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Operadores</h1>
        <p className="text-sm text-gray-500 mt-1">
          Crie o login de <b>operador (frentista)</b>. Esse login abre direto no <b>Painel da Pista</b> e
          só acessa Dashboard, baixa de cashback e fechamento de caixa — nada mais.
        </p>
      </div>

      {error && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-2.5">
          <Warning size={16} weight="fill" /><span className="flex-1">{error}</span>
          <button onClick={() => setError('')} className="text-red-400 hover:text-red-600"><X size={16} /></button>
        </div>
      )}
      {notice && (
        <div className="flex items-center gap-2 bg-green-50 border border-green-200 text-green-700 text-sm rounded-xl px-4 py-2.5">
          <CheckCircle size={16} weight="fill" /><span className="flex-1">{notice}</span>
          <button onClick={() => setNotice('')} className="text-green-500 hover:text-green-700"><X size={16} /></button>
        </div>
      )}

      {/* Create form */}
      <form onSubmit={add} className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 space-y-3">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Novo login de operador</p>
        <div className="flex flex-wrap gap-3">
          <div className="flex-1 min-w-[160px]">
            <label className="block text-xs text-gray-500 mb-1">Nome</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Frentistas — Turno A"
              className="w-full h-10 px-3 text-sm rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-amber-300" />
          </div>
          <div className="flex-1 min-w-[160px]">
            <label className="block text-xs text-gray-500 mb-1">E-mail (login)</label>
            <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="operador@posto.com"
              className="w-full h-10 px-3 text-sm rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-amber-300" />
          </div>
          <div className="w-44">
            <label className="block text-xs text-gray-500 mb-1">Senha</label>
            <input value={password} onChange={(e) => setPass(e.target.value)} type="text" placeholder="mín. 6 caracteres"
              className="w-full h-10 px-3 text-sm rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-amber-300" />
          </div>
        </div>
        <button type="submit" disabled={busy}
          className="h-10 px-4 inline-flex items-center gap-1.5 bg-amber-400 text-white text-sm font-bold rounded-lg hover:bg-amber-500 disabled:opacity-50">
          <Plus size={16} weight="bold" /> {busy ? 'Criando…' : 'Criar login de operador'}
        </button>
      </form>

      {/* List */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
        <div className="px-4 py-3 border-b border-gray-100"><p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Logins do estabelecimento</p></div>
        {loading ? <div className="p-6 text-center text-gray-400 text-sm">Carregando…</div>
          : ops.length === 0 ? <div className="p-6 text-center text-gray-400 text-sm">Nenhum login.</div>
          : <ul className="divide-y divide-gray-100">
              {ops.map((o) => (
                <li key={o.id} className="flex items-center gap-3 px-4 py-3">
                  <UserGear size={28} weight="duotone" className={o.role === 'OPERATOR' ? 'text-amber-500' : 'text-slate-400'} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-800 truncate">{o.name}</p>
                    <p className="text-[11px] text-slate-400 truncate">{o.email}</p>
                  </div>
                  <span className={`text-[10px] font-bold rounded-full px-2 py-0.5 ${o.role === 'OPERATOR' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600'}`}>
                    {ROLE_LABEL[o.role] || o.role}
                  </span>
                  {o.role === 'OPERATOR' && (
                    <button onClick={() => remove(o)} title="Remover" className="text-red-400 hover:text-red-600"><Trash size={16} weight="bold" /></button>
                  )}
                </li>
              ))}
            </ul>}
      </div>
    </div>
  );
}
