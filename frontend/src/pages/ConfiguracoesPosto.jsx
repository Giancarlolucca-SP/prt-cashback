import { useState, useRef } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { establishmentsAPI } from '../services/api.js';
import { useToast } from '../context/ToastContext.jsx';
import EstablishmentQRCode from '../components/EstablishmentQRCode.jsx';

const MAX_LOGO_BYTES = 2 * 1024 * 1024;

function formatBytes(bytes) {
  if (bytes < 1024)        return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ── Logo with fallback ────────────────────────────────────────────────────────

function EstablishmentLogo({ src, name, size = 'lg' }) {
  const [failed, setFailed] = useState(false);
  const dim = size === 'lg' ? 'w-24 h-24' : 'w-12 h-12';
  const txt = size === 'lg' ? 'text-3xl' : 'text-xl';

  if (!src || failed) {
    return (
      <div className={`${dim} rounded-2xl bg-amber-100 flex items-center justify-center ${txt} border-2 border-amber-200`}>
        ⛽
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={`Logo ${name}`}
      onError={() => setFailed(true)}
      className={`${dim} rounded-2xl object-contain border border-gray-200 bg-white`}
    />
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function ConfiguracoesPosto() {
  const { operator, updateOperator } = useAuth();
  const { showToast } = useToast();

  const inputRef = useRef(null);

  const [pendingFile,    setPendingFile]    = useState(null);
  const [pendingPreview, setPendingPreview] = useState(null);
  const [fileError,      setFileError]      = useState('');
  const [uploading,      setUploading]      = useState(false);
  const [progress,       setProgress]       = useState(0);
  const [dragging,       setDragging]       = useState(false);

  function handleFiles(files) {
    const file = files?.[0];
    if (!file) return;
    setFileError('');

    if (!['image/jpeg', 'image/png'].includes(file.type)) {
      setFileError('Formato inválido. Use PNG ou JPG.');
      return;
    }
    if (file.size > MAX_LOGO_BYTES) {
      setFileError('Arquivo muito grande. Máximo 2 MB.');
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      setPendingFile(file);
      setPendingPreview(e.target.result);
    };
    reader.readAsDataURL(file);
  }

  function cancelPending() {
    setPendingFile(null);
    setPendingPreview(null);
    setFileError('');
    if (inputRef.current) inputRef.current.value = '';
  }

  async function handleSave() {
    if (!pendingFile) return;
    setUploading(true);
    setProgress(0);
    try {
      const { data } = await establishmentsAPI.uploadLogo(
        operator.estabelecimentoId,
        pendingFile,
        (pct) => setProgress(pct),
      );
      updateOperator({ logoUrl: data.logoUrl });
      setPendingFile(null);
      setPendingPreview(null);
      if (inputRef.current) inputRef.current.value = '';
      showToast('Logo atualizado com sucesso! 🎉', 'success');
    } catch {
      showToast('Erro ao enviar logo. Tente novamente.', 'error');
    } finally {
      setUploading(false);
      setProgress(0);
    }
  }

  const currentLogo = operator?.logoUrl;

  return (
    <div className="max-w-xl mx-auto space-y-6">

      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-gray-900">Configurações do Posto</h1>
        <p className="text-sm text-gray-500 mt-0.5">{operator?.estabelecimento}</p>
      </div>

      {/* Logo card */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 space-y-5">
        <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
          Logo do Estabelecimento
        </h2>

        {/* Current logo */}
        <div className="flex items-center gap-4">
          <EstablishmentLogo src={currentLogo} name={operator?.estabelecimento} />
          <div>
            <p className="text-sm font-medium text-gray-800">
              {currentLogo ? 'Logo atual' : 'Nenhum logo cadastrado'}
            </p>
            <p className="text-xs text-gray-400 mt-0.5">
              {currentLogo
                ? 'Clique em "Alterar logo" para substituir.'
                : 'Adicione um logo para personalizar o sistema.'}
            </p>
          </div>
        </div>

        <div className="border-t border-gray-100" />

        {/* Pending preview or drop zone */}
        {pendingPreview ? (
          <div className="space-y-4">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              Pré-visualização
            </p>
            <div className="flex justify-center">
              <img
                src={pendingPreview}
                alt="Preview do logo"
                className="max-h-40 max-w-full rounded-xl border border-gray-200 object-contain"
              />
            </div>
            <p className="text-center text-xs text-gray-400">
              {pendingFile.name} — {formatBytes(pendingFile.size)}
            </p>

            {/* Progress bar */}
            {uploading && (
              <div className="space-y-1">
                <div className="flex justify-between text-xs text-gray-500">
                  <span>Enviando…</span>
                  <span>{progress}%</span>
                </div>
                <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
                  <div
                    className="bg-amber-400 h-2 rounded-full transition-all duration-150"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={cancelPending}
                disabled={uploading}
                className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-40"
              >
                Cancelar
              </button>
              <button
                onClick={handleSave}
                disabled={uploading}
                className="flex-1 py-2.5 rounded-xl bg-amber-400 hover:bg-amber-500 text-white text-sm font-semibold transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {uploading ? (
                  <>
                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                    </svg>
                    Salvando…
                  </>
                ) : (
                  'Salvar logo'
                )}
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {/* Drop zone */}
            <div
              onClick={() => inputRef.current?.click()}
              onDrop={(e) => { e.preventDefault(); setDragging(false); handleFiles(e.dataTransfer.files); }}
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              className={[
                'border-2 border-dashed rounded-xl p-8 flex flex-col items-center gap-2',
                'cursor-pointer transition-all select-none',
                dragging
                  ? 'border-amber-400 bg-amber-50'
                  : 'border-gray-200 hover:border-amber-300 hover:bg-gray-50',
              ].join(' ')}
            >
              <span className="text-3xl">📷</span>
              <p className="text-sm font-medium text-gray-700">
                {currentLogo ? 'Alterar logo' : 'Adicionar logo'}
              </p>
              <p className="text-xs text-gray-400">Clique ou arraste um arquivo aqui</p>
              <input
                ref={inputRef}
                type="file"
                accept="image/jpeg,image/png"
                className="hidden"
                onChange={(e) => handleFiles(e.target.files)}
              />
            </div>

            {fileError && (
              <p className="text-sm text-red-500 flex items-center gap-1.5">
                <span>⚠️</span> {fileError}
              </p>
            )}

            <p className="text-xs text-gray-400 text-center">
              Formatos aceitos: PNG, JPG — Máximo 2 MB
            </p>
          </div>
        )}
      </div>

      {/* Establishment info card */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 space-y-3">
        <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
          Informações do Posto
        </h2>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between py-1.5 border-b border-gray-50">
            <span className="text-gray-500">Nome</span>
            <span className="font-medium text-gray-800">{operator?.estabelecimento || '—'}</span>
          </div>
          <div className="flex justify-between py-1.5 border-b border-gray-50">
            <span className="text-gray-500">Operador</span>
            <span className="font-medium text-gray-800">{operator?.nome || '—'}</span>
          </div>
          <div className="flex justify-between py-1.5 border-b border-gray-50">
            <span className="text-gray-500">E-mail</span>
            <span className="font-medium text-gray-800">{operator?.email || '—'}</span>
          </div>
          <div className="flex justify-between py-1.5">
            <span className="text-gray-500">Cashback padrão</span>
            <span className="font-medium text-gray-800">
              {operator?.cashbackPercent != null ? `${operator.cashbackPercent}%` : '—'}
            </span>
          </div>
        </div>
      </div>

      {/* QR Code section */}
      {operator?.estabelecimentoId && (
        <EstablishmentQRCode establishmentId={operator.estabelecimentoId} />
      )}

    </div>
  );
}
