import { useState, useEffect, useRef, useCallback } from 'react';
import { attendantsAPI } from '../services/api.js';
import RatingsModal from '../components/RatingsModal.jsx';
import { UserCircle, Camera, Trash, PencilSimple, Check, X, Plus, Warning, Star, DownloadSimple } from '@phosphor-icons/react';

// ── Avatar (photo or initials) ────────────────────────────────────────────────

const AVATAR_COLORS = ['#F59E0B', '#3B82F6', '#10B981', '#8B5CF6', '#EF4444', '#06B6D4', '#F97316', '#84CC16'];

function initials(name) {
  return (name || '?')
    .split(/[\s-]+/)
    .map((w) => w[0] || '')
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

function Avatar({ name, photoUrl, color, size = 56 }) {
  if (photoUrl) {
    return (
      <img
        src={photoUrl}
        alt={name}
        style={{ width: size, height: size }}
        className="rounded-full object-cover shrink-0 border border-slate-200"
      />
    );
  }
  return (
    <div
      style={{ width: size, height: size, backgroundColor: color, fontSize: size * 0.36 }}
      className="rounded-full flex items-center justify-center font-bold text-white shrink-0 select-none"
    >
      {initials(name)}
    </div>
  );
}

// ── Attendant card ────────────────────────────────────────────────────────────

function AttendantCard({ attendant, color, onChanged, onError, onShowRatings }) {
  const [editing, setEditing] = useState(false);
  const [name, setName]   = useState(attendant.name);
  const [code, setCode]   = useState(attendant.code || '');
  const [busy, setBusy]   = useState(false);
  const fileRef = useRef(null);

  async function save() {
    if (!name.trim()) { onError('O nome é obrigatório.'); return; }
    setBusy(true);
    try {
      await attendantsAPI.update(attendant.id, { name: name.trim(), code: code.trim() });
      setEditing(false);
      onChanged();
    } catch (e) {
      onError(e.response?.data?.erro ?? 'Não foi possível salvar.');
    } finally { setBusy(false); }
  }

  async function toggleActive() {
    setBusy(true);
    try {
      await attendantsAPI.update(attendant.id, { active: !attendant.active });
      onChanged();
    } catch (e) {
      onError(e.response?.data?.erro ?? 'Não foi possível atualizar.');
    } finally { setBusy(false); }
  }

  async function remove() {
    if (!window.confirm(`Remover o atendente ${attendant.name}?`)) return;
    setBusy(true);
    try {
      await attendantsAPI.remove(attendant.id);
      onChanged();
    } catch (e) {
      onError(e.response?.data?.erro ?? 'Não foi possível remover.');
    } finally { setBusy(false); }
  }

  async function onPhotoPicked(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { onError('A imagem deve ter no máximo 2 MB.'); return; }
    setBusy(true);
    try {
      await attendantsAPI.uploadPhoto(attendant.id, file);
      onChanged();
    } catch (e2) {
      onError(e2.response?.data?.erro ?? 'Não foi possível enviar a foto.');
    } finally { setBusy(false); }
  }

  return (
    <div className={`bg-white rounded-xl border border-gray-200 shadow-sm p-4 ${!attendant.active ? 'opacity-60' : ''}`}>
      <div className="flex items-center gap-3">
        <div className="relative">
          <Avatar name={attendant.name} photoUrl={attendant.photoUrl} color={color} />
          <button
            onClick={() => fileRef.current?.click()}
            disabled={busy}
            title="Trocar foto"
            className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-amber-400 text-white flex items-center justify-center shadow hover:bg-amber-500 transition-colors disabled:opacity-50"
          >
            <Camera size={13} weight="bold" />
          </button>
          <input ref={fileRef} type="file" accept="image/png,image/jpeg" className="hidden" onChange={onPhotoPicked} />
        </div>

        {editing ? (
          <div className="flex-1 flex flex-col gap-2">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Nome"
              className="h-8 px-2 text-sm rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-amber-300"
            />
            <input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="Código (ex: 27)"
              className="h-8 px-2 text-sm rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-amber-300"
            />
          </div>
        ) : (
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-sm font-semibold text-slate-900 truncate">{attendant.name}</span>
              {attendant.code && <span className="text-[11px] text-slate-400">#{attendant.code}</span>}
            </div>
            <p className="text-[11px] text-slate-400 font-mono truncate">{attendant.key}</p>
            {!attendant.active && <span className="text-[10px] text-red-500 font-semibold">inativo</span>}
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-1">
          {editing ? (
            <>
              <button onClick={save} disabled={busy} title="Salvar" className="w-8 h-8 flex items-center justify-center rounded-lg text-green-600 hover:bg-green-50">
                <Check size={18} weight="bold" />
              </button>
              <button onClick={() => { setEditing(false); setName(attendant.name); setCode(attendant.code || ''); }} title="Cancelar" className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100">
                <X size={18} weight="bold" />
              </button>
            </>
          ) : (
            <>
              <button onClick={() => onShowRatings(attendant.name)} title="Ver avaliações" className="w-8 h-8 flex items-center justify-center rounded-lg text-amber-500 hover:bg-amber-50">
                <Star size={16} weight="fill" />
              </button>
              <button onClick={toggleActive} disabled={busy} title={attendant.active ? 'Desativar' : 'Ativar'} className="px-2 h-8 text-[11px] font-semibold rounded-lg text-slate-500 hover:bg-slate-100">
                {attendant.active ? 'Ativo' : 'Inativo'}
              </button>
              <button onClick={() => setEditing(true)} title="Editar" className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700">
                <PencilSimple size={16} weight="bold" />
              </button>
              <button onClick={remove} disabled={busy} title="Remover" className="w-8 h-8 flex items-center justify-center rounded-lg text-red-400 hover:bg-red-50 hover:text-red-600">
                <Trash size={16} weight="bold" />
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function Atendentes() {
  const [attendants, setAttendants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState('');
  const [ratingsFor, setRatingsFor] = useState(null);
  const [syncing, setSyncing] = useState(false);
  const [notice, setNotice] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    attendantsAPI.list()
      .then((res) => setAttendants(res.data.attendants || []))
      .catch(() => setAttendants([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  async function addAttendant(e) {
    e.preventDefault();
    setError('');
    if (!name.trim()) { setError('Informe o nome do atendente.'); return; }
    setAdding(true);
    try {
      await attendantsAPI.create({ name: name.trim(), code: code.trim() });
      setName(''); setCode('');
      load();
    } catch (e2) {
      setError(e2.response?.data?.erro ?? 'Não foi possível cadastrar.');
    } finally { setAdding(false); }
  }

  async function syncFromHistory() {
    setSyncing(true);
    setError(''); setNotice('');
    try {
      const { data } = await attendantsAPI.sync();
      setNotice(data.imported > 0
        ? `${data.imported} atendente(s) importado(s) do histórico de cupons.`
        : 'Nenhum atendente novo encontrado no histórico.');
      load();
    } catch (e) {
      setError(e.response?.data?.erro ?? 'Não foi possível importar.');
    } finally { setSyncing(false); }
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Atendentes</h1>
          <p className="text-sm text-gray-500 mt-1">
            Cadastre os frentistas e suas fotos. O nome/código deve bater com o que aparece no cupom
            fiscal (ex.: <span className="font-mono">27-JUNIOR</span>) para a detecção automática na avaliação.
          </p>
        </div>
        <button
          onClick={syncFromHistory}
          disabled={syncing}
          title="Importar atendentes que já aparecem nos cupons/ranking"
          className="h-9 px-3 inline-flex items-center gap-1.5 bg-slate-100 text-slate-700 text-sm font-semibold rounded-lg hover:bg-slate-200 transition-colors disabled:opacity-50 shrink-0"
        >
          <DownloadSimple size={16} weight="bold" /> {syncing ? 'Importando…' : 'Importar do histórico'}
        </button>
      </div>

      {/* Notice banner */}
      {notice && (
        <div className="flex items-center gap-2 bg-green-50 border border-green-200 text-green-700 text-sm rounded-xl px-4 py-2.5">
          <span className="flex-1">{notice}</span>
          <button onClick={() => setNotice('')} className="text-green-500 hover:text-green-700"><X size={16} /></button>
        </div>
      )}

      {/* Error banner */}
      {error && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-2.5">
          <Warning size={16} weight="fill" />
          <span className="flex-1">{error}</span>
          <button onClick={() => setError('')} className="text-red-400 hover:text-red-600"><X size={16} /></button>
        </div>
      )}

      {/* Add form */}
      <form onSubmit={addAttendant} className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Novo atendente</p>
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[160px]">
            <label className="block text-xs text-gray-500 mb-1">Nome</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex: JUNIOR"
              className="w-full h-9 px-3 text-sm rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-amber-300"
            />
          </div>
          <div className="w-32">
            <label className="block text-xs text-gray-500 mb-1">Código (opcional)</label>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="Ex: 27"
              className="w-full h-9 px-3 text-sm rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-amber-300"
            />
          </div>
          <button
            type="submit"
            disabled={adding}
            className="h-9 px-4 inline-flex items-center gap-1.5 bg-amber-400 text-white text-sm font-semibold rounded-lg hover:bg-amber-500 transition-colors disabled:opacity-50"
          >
            <Plus size={16} weight="bold" /> Adicionar
          </button>
        </div>
      </form>

      {/* List */}
      {loading ? (
        <div className="grid sm:grid-cols-2 gap-3 animate-pulse">
          {[0, 1, 2, 3].map((i) => <div key={i} className="h-20 bg-gray-200 rounded-xl" />)}
        </div>
      ) : attendants.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-16 text-center">
          <UserCircle size={48} weight="duotone" className="text-stone-300 mb-4 mx-auto" />
          <p className="text-lg font-semibold text-gray-700">Nenhum atendente cadastrado</p>
          <p className="text-sm text-gray-400 mt-1">Adicione o primeiro frentista acima.</p>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 gap-3">
          {attendants.map((a, idx) => (
            <AttendantCard
              key={a.id}
              attendant={a}
              color={AVATAR_COLORS[idx % AVATAR_COLORS.length]}
              onChanged={load}
              onError={setError}
              onShowRatings={setRatingsFor}
            />
          ))}
        </div>
      )}

      {/* Per-attendant ratings (last 90 days), newest first, LGPD-masked */}
      {ratingsFor && (
        <RatingsModal
          attendantName={ratingsFor}
          params={{ period: '90d' }}
          onClose={() => setRatingsFor(null)}
        />
      )}
    </div>
  );
}
