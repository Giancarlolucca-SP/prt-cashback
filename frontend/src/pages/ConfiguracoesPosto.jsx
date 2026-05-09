import { useState, useRef, useEffect } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { establishmentsAPI, subscriptionAPI } from '../services/api.js';
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

// ── App header preview ────────────────────────────────────────────────────────

function AppHeaderPreview({ logoUrl, primaryColor, secondaryColor, appName }) {
  return (
    <div className="rounded-xl overflow-hidden border border-gray-200 shadow-sm">
      {/* Status bar mock */}
      <div className="h-6 flex items-center justify-between px-4" style={{ backgroundColor: secondaryColor }}>
        <span className="text-white text-xs opacity-70">9:41</span>
        <span className="text-white text-xs opacity-70">●●●</span>
      </div>
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3" style={{ backgroundColor: secondaryColor }}>
        {logoUrl ? (
          <img src={logoUrl} alt={appName} className="h-8 w-24 object-contain" />
        ) : (
          <span className="font-extrabold text-xl tracking-tight" style={{ color: primaryColor }}>
            {appName}
          </span>
        )}
        <div className="flex-1" />
        <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ backgroundColor: 'rgba(255,255,255,0.15)' }}>
          <span className="text-white text-sm">↗</span>
        </div>
      </div>
      {/* Tab bar mock */}
      <div className="flex border-t border-gray-100 bg-white">
        {['Início', 'Resgatar', 'Histórico', 'Validar', 'Config.'].map((tab, i) => (
          <div key={tab} className="flex-1 flex flex-col items-center py-2 gap-0.5">
            <div className="w-5 h-5 rounded" style={{ backgroundColor: i === 0 ? primaryColor + '20' : '#f1f5f9' }} />
            <span className="text-xs" style={{ color: i === 0 ? primaryColor : '#94a3b8', fontWeight: i === 0 ? 700 : 400 }}>
              {tab}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Color picker field ────────────────────────────────────────────────────────

function ColorField({ label, value, onChange, hint }) {
  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium text-gray-700">{label}</label>
      <div className="flex items-center gap-3">
        <div className="relative">
          <input
            type="color"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="w-12 h-10 rounded-lg cursor-pointer border border-gray-200 p-0.5"
          />
        </div>
        <input
          type="text"
          value={value}
          onChange={(e) => {
            const v = e.target.value;
            if (/^#[0-9A-Fa-f]{0,6}$/.test(v)) onChange(v);
          }}
          maxLength={7}
          className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg font-mono focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent"
          placeholder="#000000"
        />
        <div
          className="w-10 h-10 rounded-lg border border-gray-200 flex-shrink-0"
          style={{ backgroundColor: /^#[0-9A-Fa-f]{6}$/.test(value) ? value : '#f3f4f6' }}
        />
      </div>
      {hint && <p className="text-xs text-gray-400">{hint}</p>}
    </div>
  );
}

// ── Subscription section ──────────────────────────────────────────────────────

const STATUS_LABEL = {
  ACTIVE:     { text: 'Ativa',              cls: 'bg-green-100 text-green-700'  },
  CANCELLING: { text: 'Cancelando',         cls: 'bg-yellow-100 text-yellow-700'},
  PAST_DUE:   { text: 'Pagamento pendente', cls: 'bg-red-100 text-red-600'      },
  CANCELLED:  { text: 'Cancelada',          cls: 'bg-gray-100 text-gray-500'    },
  INCOMPLETE: { text: 'Incompleta',         cls: 'bg-orange-100 text-orange-600'},
};

function CardBrandIcon({ brand }) {
  const icons = { visa: '💳', mastercard: '💳', amex: '💳', elo: '💳' };
  return <span>{icons[brand] ?? '💳'}</span>;
}

function SubscriptionSection() {
  const { showToast } = useToast();
  const [sub,       setSub]       = useState(null);
  const [loading,   setLoading]   = useState(true);
  const [cancelling, setCancelling] = useState(false);

  useEffect(() => {
    subscriptionAPI.getStatus()
      .then(({ data }) => setSub(data))
      .catch(() => setSub(null))
      .finally(() => setLoading(false));
  }, []);

  async function handleCancel() {
    if (!window.confirm(
      'Tem certeza que deseja cancelar a assinatura?\n\nSeu acesso continuará ativo até o final do período já pago.'
    )) return;

    setCancelling(true);
    try {
      const { data } = await subscriptionAPI.cancel();
      showToast('Assinatura cancelada. Acesso ativo até ' + new Date(data.endsAt).toLocaleDateString('pt-BR'), 'success');
      const { data: updated } = await subscriptionAPI.getStatus();
      setSub(updated);
    } catch (err) {
      showToast(err.response?.data?.erro ?? 'Erro ao cancelar assinatura.', 'error');
    } finally {
      setCancelling(false);
    }
  }

  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 animate-pulse space-y-3">
        <div className="h-3 bg-gray-200 rounded w-32" />
        <div className="h-4 bg-gray-100 rounded w-48" />
        <div className="h-4 bg-gray-100 rounded w-40" />
      </div>
    );
  }

  // No Stripe subscription (established manually or legacy)
  if (!sub || !sub.hasSubscription) {
    const statusInfo = STATUS_LABEL[sub?.subscriptionStatus ?? 'ACTIVE'] ?? STATUS_LABEL.ACTIVE;
    return (
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 space-y-3">
        <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
          Minha Assinatura
        </h2>
        <div className="flex items-center gap-3">
          <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${statusInfo.cls}`}>
            {statusInfo.text}
          </span>
          <span className="text-sm text-gray-500">PostoCash — R$ 200/mês</span>
        </div>
        <p className="text-xs text-gray-400">Assinatura gerenciada manualmente. Entre em contato para alterações.</p>
      </div>
    );
  }

  const statusInfo    = STATUS_LABEL[sub.subscriptionStatus] ?? STATUS_LABEL.ACTIVE;
  const nextBilling   = sub.currentPeriodEnd
    ? new Date(sub.currentPeriodEnd).toLocaleDateString('pt-BR')
    : '—';
  const isActive      = sub.subscriptionStatus === 'ACTIVE';
  const isCancelling  = sub.subscriptionStatus === 'CANCELLING';

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 space-y-5">
      <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
        Minha Assinatura
      </h2>

      <div className="space-y-3 text-sm">
        {/* Status */}
        <div className="flex items-center justify-between py-1.5 border-b border-gray-50">
          <span className="text-gray-500">Status</span>
          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${statusInfo.cls}`}>
            {isActive && <span className="w-1.5 h-1.5 rounded-full bg-green-500 mr-1.5 animate-pulse" />}
            {statusInfo.text}
          </span>
        </div>

        {/* Plan */}
        <div className="flex items-center justify-between py-1.5 border-b border-gray-50">
          <span className="text-gray-500">Plano</span>
          <span className="font-medium text-gray-800">PostoCash — R$ 200/mês</span>
        </div>

        {/* Next billing / ends at */}
        {!isCancelling && isActive && (
          <div className="flex items-center justify-between py-1.5 border-b border-gray-50">
            <span className="text-gray-500">Próxima cobrança</span>
            <span className="font-medium text-gray-800">{nextBilling}</span>
          </div>
        )}
        {(isCancelling || sub.cancelAtPeriodEnd) && (
          <div className="flex items-center justify-between py-1.5 border-b border-gray-50">
            <span className="text-gray-500">Acesso até</span>
            <span className="font-medium text-yellow-600">{nextBilling}</span>
          </div>
        )}

        {/* Card */}
        {sub.card && (
          <div className="flex items-center justify-between py-1.5">
            <span className="text-gray-500">Cartão</span>
            <span className="flex items-center gap-1.5 font-medium text-gray-800">
              <CardBrandIcon brand={sub.card.brand} />
              <span className="font-mono">•••• {sub.card.last4}</span>
              <span className="text-gray-400 text-xs">{sub.card.expMonth}/{String(sub.card.expYear).slice(-2)}</span>
            </span>
          </div>
        )}
      </div>

      {/* Cancel button — only for active subscriptions */}
      {isActive && !sub.cancelAtPeriodEnd && (
        <div className="border-t border-gray-100 pt-4">
          <button
            onClick={handleCancel}
            disabled={cancelling}
            className="text-sm font-medium text-red-500 hover:text-red-700 transition-colors disabled:opacity-50"
          >
            {cancelling ? 'Cancelando…' : 'Cancelar assinatura'}
          </button>
          <p className="text-xs text-gray-400 mt-1">
            O acesso continua ativo até o final do período pago.
          </p>
        </div>
      )}

      {(isCancelling || sub.cancelAtPeriodEnd) && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg px-4 py-3 text-xs text-yellow-700">
          Cancelamento agendado. Você continuará com acesso completo até {nextBilling}.
        </div>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function ConfiguracoesPosto() {
  const { operator, updateOperator } = useAuth();
  const { showToast } = useToast();

  const inputRef = useRef(null);

  // Logo state
  const [pendingFile,    setPendingFile]    = useState(null);
  const [pendingPreview, setPendingPreview] = useState(null);
  const [fileError,      setFileError]      = useState('');
  const [uploading,      setUploading]      = useState(false);
  const [progress,       setProgress]       = useState(0);
  const [dragging,       setDragging]       = useState(false);

  // Branding colors state
  const [primaryColor,   setPrimaryColor]   = useState(operator?.primaryColor   ?? '#FF6B00');
  const [secondaryColor, setSecondaryColor] = useState(operator?.secondaryColor ?? '#1e293b');
  const [savingColors,   setSavingColors]   = useState(false);

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

  async function handleSaveLogo() {
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

  async function handleSaveColors() {
    if (!/^#[0-9A-Fa-f]{6}$/.test(primaryColor)) {
      showToast('Cor primária inválida. Use formato #RRGGBB.', 'error');
      return;
    }
    if (!/^#[0-9A-Fa-f]{6}$/.test(secondaryColor)) {
      showToast('Cor secundária inválida. Use formato #RRGGBB.', 'error');
      return;
    }
    setSavingColors(true);
    try {
      await establishmentsAPI.updateBranding(
        operator.estabelecimentoId,
        { primaryColor, secondaryColor },
      );
      updateOperator({ primaryColor, secondaryColor });
      showToast('Identidade visual atualizada! As mudanças aparecem no app em até 1 hora.', 'success');
    } catch (err) {
      showToast(err.response?.data?.erro ?? 'Erro ao salvar cores. Tente novamente.', 'error');
    } finally {
      setSavingColors(false);
    }
  }

  const currentLogo = operator?.logoUrl;
  const previewLogo = pendingPreview ?? currentLogo;

  return (
    <div className="max-w-xl mx-auto space-y-6">

      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-gray-900">Configurações do Posto</h1>
        <p className="text-sm text-gray-500 mt-0.5">{operator?.estabelecimento}</p>
      </div>

      {/* ── Logo card ──────────────────────────────────────────────────────── */}
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
                onClick={handleSaveLogo}
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

      {/* ── Identidade Visual ──────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 space-y-5">
        <div>
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
            Identidade Visual
          </h2>
          <p className="text-xs text-gray-400 mt-1">
            Defina as cores do app para os clientes do seu posto.
          </p>
        </div>

        <div className="space-y-4">
          <ColorField
            label="Cor primária"
            value={primaryColor}
            onChange={setPrimaryColor}
            hint="Usada em botões, ícones ativos e destaques"
          />
          <ColorField
            label="Cor secundária"
            value={secondaryColor}
            onChange={setSecondaryColor}
            hint="Usada no cabeçalho e fundo de telas de login"
          />
        </div>

        <div className="border-t border-gray-100" />

        {/* Live preview */}
        <div className="space-y-2">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
            Pré-visualização no app
          </p>
          <AppHeaderPreview
            logoUrl={previewLogo}
            primaryColor={/^#[0-9A-Fa-f]{6}$/.test(primaryColor) ? primaryColor : '#FF6B00'}
            secondaryColor={/^#[0-9A-Fa-f]{6}$/.test(secondaryColor) ? secondaryColor : '#1e293b'}
            appName={operator?.estabelecimento ?? 'PostoCash'}
          />
        </div>

        <button
          onClick={handleSaveColors}
          disabled={savingColors}
          className="w-full py-3 rounded-xl bg-amber-400 hover:bg-amber-500 text-white text-sm font-semibold transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {savingColors ? (
            <>
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
              Salvando…
            </>
          ) : (
            'Salvar identidade visual'
          )}
        </button>
      </div>

      {/* ── Subscription ───────────────────────────────────────────────────── */}
      <SubscriptionSection />

      {/* ── Establishment info card ─────────────────────────────────────────── */}
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
