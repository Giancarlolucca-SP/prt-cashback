import { useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import { establishmentsAPI } from '../services/api.js';
import { useToast } from '../context/ToastContext.jsx';
import Button from '../components/ui/Button.jsx';
import Input from '../components/ui/Input.jsx';
import EstablishmentQRCode from '../components/EstablishmentQRCode.jsx';
import { Camera, Warning, CheckCircle, Confetti, ClipboardList, ArrowClockwise, CreditCard, FileText, Info } from '@phosphor-icons/react';

// ── Constants ─────────────────────────────────────────────────────────────────

const BR_STATES = [
  'AC','AL','AP','AM','BA','CE','DF','ES','GO',
  'MA','MT','MS','MG','PA','PB','PR','PE','PI',
  'RJ','RN','RS','RO','RR','SC','SP','SE','TO',
];

const STEPS = ['Estabelecimento', 'Operador', 'Logo', 'Configurações'];

const MAX_LOGO_BYTES = 2 * 1024 * 1024;

// ── Helpers ───────────────────────────────────────────────────────────────────

function generatePassword() {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789@#!';
  return Array.from({ length: 10 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

function applyCnpjMask(v) {
  const d = v.replace(/\D/g, '').slice(0, 14);
  if (d.length <= 2)  return d;
  if (d.length <= 5)  return `${d.slice(0,2)}.${d.slice(2)}`;
  if (d.length <= 8)  return `${d.slice(0,2)}.${d.slice(2,5)}.${d.slice(5)}`;
  if (d.length <= 12) return `${d.slice(0,2)}.${d.slice(2,5)}.${d.slice(5,8)}/${d.slice(8)}`;
  return `${d.slice(0,2)}.${d.slice(2,5)}.${d.slice(5,8)}/${d.slice(8,12)}-${d.slice(12)}`;
}

function applyPhoneMask(v) {
  const d = v.replace(/\D/g, '').slice(0, 11);
  if (d.length <= 2)  return d;
  if (d.length <= 7)  return `(${d.slice(0,2)}) ${d.slice(2)}`;
  return `(${d.slice(0,2)}) ${d.slice(2,7)}-${d.slice(7)}`;
}

function applyCardNumberMask(v) {
  return v.replace(/\D/g, '').slice(0, 16).replace(/(.{4})(?=.)/g, '$1 ');
}

function applyValidityMask(v) {
  const d = v.replace(/\D/g, '').slice(0, 4);
  return d.length <= 2 ? d : `${d.slice(0,2)}/${d.slice(2)}`;
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function formatBytes(bytes) {
  if (bytes < 1024)       return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ── Step bar ──────────────────────────────────────────────────────────────────

function StepBar({ current }) {
  return (
    <div className="flex items-center mb-8">
      {STEPS.map((label, i) => {
        const idx    = i + 1;
        const done   = idx < current;
        const active = idx === current;
        const last   = i === STEPS.length - 1;
        return (
          <div key={label} className="flex items-center flex-1 last:flex-none">
            <div className="flex flex-col items-center gap-1">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-all
                ${done   ? 'bg-green-500 text-white'
                : active ? 'bg-primary-600 text-white ring-4 ring-primary-100'
                :          'bg-gray-200 text-gray-400'}`}>
                {done ? '✓' : idx}
              </div>
              <span className={`text-xs text-center hidden sm:block ${active ? 'text-primary-600 font-semibold' : 'text-gray-400'}`}>
                {label}
              </span>
            </div>
            {!last && (
              <div className={`flex-1 h-0.5 mx-2 mb-4 ${done ? 'bg-green-400' : 'bg-gray-200'}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Summary row ───────────────────────────────────────────────────────────────

function SummaryRow({ label, value }) {
  if (!value) return null;
  return (
    <div className="flex justify-between items-start gap-4 py-2 border-b border-gray-50 last:border-0">
      <span className="text-sm text-gray-500 shrink-0">{label}</span>
      <span className="text-sm font-medium text-gray-800 text-right">{value}</span>
    </div>
  );
}

// ── Logo upload step ──────────────────────────────────────────────────────────

function LogoUploadStep({ logoFile, logoPreview, onFile, onRemove, onSkip, onBack }) {
  const [dragging, setDragging]   = useState(false);
  const [fileError, setFileError] = useState('');
  const inputRef = useRef(null);

  function handleFiles(files) {
    const file = files[0];
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
    reader.onload = (e) => onFile(file, e.target.result);
    reader.readAsDataURL(file);
  }

  function onDrop(e) {
    e.preventDefault();
    setDragging(false);
    handleFiles(e.dataTransfer.files);
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 space-y-5">
      <div>
        <h2 className="text-base font-semibold text-gray-800">Logo do Estabelecimento</h2>
        <p className="text-sm text-gray-500 mt-0.5">Opcional — pode ser adicionado depois.</p>
      </div>

      {!logoFile ? (
        <>
          {/* Drop zone */}
          <div
            onClick={() => inputRef.current?.click()}
            onDrop={onDrop}
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            className={[
              'border-2 border-dashed rounded-xl p-10 flex flex-col items-center justify-center gap-3',
              'cursor-pointer transition-all select-none',
              dragging
                ? 'border-primary-400 bg-primary-50'
                : 'border-gray-200 hover:border-primary-300 hover:bg-gray-50',
            ].join(' ')}
          >
            <Camera size={40} weight="duotone" className="text-stone-400 mx-auto" />
            <div className="text-center">
              <p className="text-sm font-medium text-gray-700">
                Clique para adicionar
              </p>
              <p className="text-xs text-gray-400 mt-0.5">ou arraste aqui</p>
            </div>
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
              <Warning size={16} weight="bold" className="text-yellow-500 shrink-0" /> {fileError}
            </p>
          )}

          <p className="text-xs text-gray-400 text-center">
            Formatos: PNG, JPG — Máx. 2 MB
          </p>
        </>
      ) : (
        /* Preview */
        <div className="border border-gray-200 rounded-xl p-5 space-y-4">
          <div className="flex items-center gap-2 text-green-600">
            <CheckCircle size={20} weight="duotone" className="text-green-500 shrink-0" />
            <span className="text-sm font-semibold">Logo adicionado!</span>
          </div>

          <div className="flex justify-center">
            <img
              src={logoPreview}
              alt="Preview do logo"
              className="max-h-40 max-w-full rounded-lg border border-gray-100 object-contain"
            />
          </div>

          <p className="text-center text-xs text-gray-400">
            {logoFile.name} ({formatBytes(logoFile.size)})
          </p>

          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="flex-1 py-2 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
            >
              Trocar logo
            </button>
            <button
              type="button"
              onClick={onRemove}
              className="flex-1 py-2 rounded-lg border border-red-200 text-sm font-medium text-red-500 hover:bg-red-50 transition-colors"
            >
              Remover
            </button>
            <input
              ref={inputRef}
              type="file"
              accept="image/jpeg,image/png"
              className="hidden"
              onChange={(e) => handleFiles(e.target.files)}
            />
          </div>
        </div>
      )}

      <div className="flex gap-3 items-center">
        <Button variant="secondary" onClick={onBack}>← Voltar</Button>
        {logoFile ? (
          <Button fullWidth onClick={onSkip}>Continuar →</Button>
        ) : (
          <button
            type="button"
            onClick={onSkip}
            className="flex-1 text-sm text-gray-400 hover:text-gray-600 transition-colors py-2 text-center"
          >
            Pular esta etapa →
          </button>
        )}
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function NovoEstabelecimento() {
  const { showToast } = useToast();

  const [step, setStep] = useState(1);

  // Step 1 — Establishment data
  const [est, setEst] = useState({
    nome: '', cnpj: '', telefone: '', endereco: '', cidade: '', estado: '',
  });

  // Step 2 — Operator + payment
  const [op, setOp] = useState({
    nome: '', email: '', senha: generatePassword(),
    pagamento: 'cartao',
    cartaoNome: '', cartaoNumero: '', cartaoValidade: '', cartaoCvv: '',
  });

  // Step 3 — Logo (optional)
  const [logoFile,    setLogoFile]    = useState(null);
  const [logoPreview, setLogoPreview] = useState(null);

  // Step 4 — Settings
  const [cfg, setCfg] = useState({ cashbackPercent: '5', minRedemption: '10' });

  // Errors per step
  const [errors, setErrors] = useState({});

  // Submit state
  const [loading,         setLoading]         = useState(false);
  const [uploadProgress,  setUploadProgress]  = useState(0);
  const [uploadingLogo,   setUploadingLogo]   = useState(false);
  const [result,          setResult]          = useState(null);
  const [copied,          setCopied]          = useState(false);

  // ── Field setters ──────────────────────────────────────────────────────────

  function setEstField(k, v) { setEst((p) => ({ ...p, [k]: v }));  setErrors((p) => ({ ...p, [k]: '' })); }
  function setOpField(k, v)  { setOp((p)  => ({ ...p, [k]: v }));  setErrors((p) => ({ ...p, [k]: '' })); }
  function setCfgField(k, v) { setCfg((p) => ({ ...p, [k]: v }));  setErrors((p) => ({ ...p, [k]: '' })); }

  function regenerateSenha() {
    setOpField('senha', generatePassword());
    setCopied(false);
  }

  async function copySenha() {
    await navigator.clipboard.writeText(op.senha);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  // ── Validation ─────────────────────────────────────────────────────────────

  function validateStep1() {
    const e = {};
    if (!est.nome.trim())                           e.nome  = 'Nome é obrigatório.';
    if (est.cnpj.replace(/\D/g, '').length !== 14) e.cnpj  = 'CNPJ inválido.';
    return e;
  }

  function validateStep2() {
    const e = {};
    if (!op.nome.trim())            e.opNome  = 'Nome é obrigatório.';
    if (!isValidEmail(op.email))    e.opEmail = 'E-mail inválido.';
    if (op.pagamento === 'cartao') {
      if (!op.cartaoNome.trim())    e.cartaoNome     = 'Nome no cartão é obrigatório.';
      if (op.cartaoNumero.replace(/\D/g,'').length < 16) e.cartaoNumero = 'Número inválido.';
      if (op.cartaoValidade.replace(/\D/g,'').length < 4) e.cartaoValidade = 'Validade inválida.';
      if (op.cartaoCvv.replace(/\D/g,'').length < 3)     e.cartaoCvv = 'CVV inválido.';
    }
    return e;
  }

  function validateStep4() {
    const e = {};
    const pct = parseFloat(cfg.cashbackPercent);
    if (isNaN(pct) || pct < 0 || pct > 100) e.cashbackPercent = 'Percentual entre 0 e 100.';
    const min = parseFloat(cfg.minRedemption);
    if (isNaN(min) || min <= 0)              e.minRedemption   = 'Valor deve ser maior que zero.';
    return e;
  }

  // ── Navigation ─────────────────────────────────────────────────────────────

  function goNext(validate) {
    const e = validate();
    if (Object.keys(e).length) { setErrors(e); return; }
    setErrors({});
    setStep((s) => s + 1);
  }

  // ── Submit ─────────────────────────────────────────────────────────────────

  async function handleSubmit() {
    const e = validateStep4();
    if (Object.keys(e).length) { setErrors(e); return; }

    setLoading(true);
    try {
      const { data } = await establishmentsAPI.create({
        nome:             est.nome,
        cnpj:             est.cnpj,
        telefone:         est.telefone,
        endereco:         est.endereco,
        cidade:           est.cidade,
        estado:           est.estado,
        cashbackPercent:  cfg.cashbackPercent,
        minRedemption:    cfg.minRedemption,
        operatorName:     op.nome,
        operatorEmail:    op.email,
        operatorPassword: op.senha,
      });

      // Upload logo if selected
      if (logoFile && data.estabelecimento?.id) {
        setUploadingLogo(true);
        setUploadProgress(0);
        try {
          await establishmentsAPI.uploadLogo(
            data.estabelecimento.id,
            logoFile,
            (pct) => setUploadProgress(pct),
          );
          showToast('Logo adicionado com sucesso!', 'success');
        } catch {
          showToast('Erro ao enviar logo. Tente novamente.', 'error');
        } finally {
          setUploadingLogo(false);
        }
      }

      setResult(data);
    } catch (err) {
      showToast(err.response?.data?.erro || 'Erro ao cadastrar estabelecimento.', 'error');
    } finally {
      setLoading(false);
    }
  }

  // ── Success screen ─────────────────────────────────────────────────────────

  if (result) {
    return (
      <div className="max-w-lg mx-auto px-4 py-6">
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 space-y-5">
          <div className="text-center">
            <Confetti size={48} weight="duotone" className="text-orange-500 mb-3 mx-auto" />
            <h2 className="text-xl font-bold text-gray-800">{result.mensagem}</h2>
          </div>

          <div className="bg-green-50 border border-green-200 rounded-xl p-5 space-y-3">
            <p className="text-sm font-semibold text-green-800 mb-1">Credenciais de acesso</p>
            <div className="space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-green-700">Estabelecimento</span>
                <span className="font-semibold text-green-900">{result.estabelecimento.nome}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-green-700">Operador</span>
                <span className="font-semibold text-green-900">{result.operador.email}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-green-700">Senha provisória</span>
                <span className="font-bold font-mono text-green-900 bg-green-100 px-2 py-0.5 rounded">
                  {result.operador.senhaProvisoria}
                </span>
              </div>
            </div>
          </div>

          <p className="text-sm text-gray-500 text-center">
            Envie essas credenciais ao responsável pelo estabelecimento.
          </p>

          {/* QR Code for the new establishment */}
          <EstablishmentQRCode establishmentId={result.estabelecimento.id} />

          <Link to="/login" className="block">
            <Button variant="primary" fullWidth>
              Ir para o login
            </Button>
          </Link>

          <Button
            variant="secondary"
            fullWidth
            onClick={() => {
              setResult(null);
              setStep(1);
              setEst({ nome: '', cnpj: '', telefone: '', endereco: '', cidade: '', estado: '' });
              setOp({ nome: '', email: '', senha: generatePassword(), pagamento: 'cartao', cartaoNome: '', cartaoNumero: '', cartaoValidade: '', cartaoCvv: '' });
              setLogoFile(null);
              setLogoPreview(null);
              setCfg({ cashbackPercent: '5', minRedemption: '10' });
            }}
          >
            Cadastrar outro estabelecimento
          </Button>
        </div>
      </div>
    );
  }

  // ── Form ───────────────────────────────────────────────────────────────────

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <div className="mb-6">
        <Link
          to="/login"
          className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-primary-600 transition-colors mb-4"
        >
          ← Voltar para o login
        </Link>
        <h1 className="text-2xl font-bold text-gray-800">Novo Estabelecimento</h1>
        <p className="text-gray-500 text-sm mt-1">Cadastre um novo posto e seu operador principal.</p>
      </div>

      <StepBar current={step} />

      {/* ── Step 1 — Dados do Estabelecimento ── */}
      {step === 1 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 space-y-5">
          <h2 className="text-base font-semibold text-gray-800">Dados do Estabelecimento</h2>

          <Input
            label="Nome do posto *"
            placeholder="Ex: Posto Central"
            value={est.nome}
            onChange={(e) => setEstField('nome', e.target.value)}
            error={errors.nome}
            autoFocus
          />

          <Input
            label="CNPJ *"
            placeholder="00.000.000/0000-00"
            value={est.cnpj}
            onChange={(e) => setEstField('cnpj', applyCnpjMask(e.target.value))}
            error={errors.cnpj}
            inputMode="numeric"
          />

          <Input
            label="Telefone"
            placeholder="(00) 00000-0000"
            value={est.telefone}
            onChange={(e) => setEstField('telefone', applyPhoneMask(e.target.value))}
            inputMode="tel"
          />

          <Input
            label="Endereço completo"
            placeholder="Rua, número, bairro"
            value={est.endereco}
            onChange={(e) => setEstField('endereco', e.target.value)}
          />

          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Cidade"
              placeholder="São Paulo"
              value={est.cidade}
              onChange={(e) => setEstField('cidade', e.target.value)}
            />
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-gray-700">Estado</label>
              <select
                value={est.estado}
                onChange={(e) => setEstField('estado', e.target.value)}
                className="w-full px-3 py-2.5 rounded-lg border border-gray-300 text-sm bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary-500"
              >
                <option value="">Selecione</option>
                {BR_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>

          <Button fullWidth size="lg" onClick={() => goNext(validateStep1)}>
            Continuar →
          </Button>
        </div>
      )}

      {/* ── Step 2 — Operador + Pagamento ── */}
      {step === 2 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 space-y-5">
          <h2 className="text-base font-semibold text-gray-800">Operador Principal</h2>

          <Input
            label="Nome completo *"
            placeholder="João da Silva"
            value={op.nome}
            onChange={(e) => setOpField('nome', e.target.value)}
            error={errors.opNome}
            autoFocus
          />

          <Input
            label="E-mail *"
            type="email"
            placeholder="joao@posto.com"
            value={op.email}
            onChange={(e) => setOpField('email', e.target.value)}
            error={errors.opEmail}
          />

          {/* Auto-generated password */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Senha provisória</label>
            <div className="flex gap-2">
              <div className="flex-1 flex items-center px-3 py-2.5 rounded-lg border border-gray-300 bg-gray-50">
                <span className="flex-1 font-mono text-sm font-semibold tracking-widest text-gray-800 select-all">
                  {op.senha}
                </span>
              </div>
              <button
                type="button"
                onClick={copySenha}
                title="Copiar senha"
                className="px-3 py-2.5 rounded-lg border border-gray-300 text-sm hover:bg-gray-50 transition-colors"
              >
                {copied ? <CheckCircle size={16} weight="duotone" /> : <ClipboardList size={16} weight="duotone" />}
              </button>
              <button
                type="button"
                onClick={regenerateSenha}
                title="Gerar nova senha"
                className="px-3 py-2.5 rounded-lg border border-gray-300 text-sm hover:bg-gray-50 transition-colors"
              >
                <ArrowClockwise size={16} weight="bold" />
              </button>
            </div>
            <p className="text-xs text-gray-400 mt-1">Gerada automaticamente. Anote antes de continuar.</p>
          </div>

          {/* Payment method */}
          <div>
            <p className="text-sm font-medium text-gray-700 mb-2">Forma de pagamento</p>
            <div className="grid grid-cols-2 gap-3">
              {[
                { val: 'cartao', label: 'Cartão de crédito', icon: <CreditCard size={16} weight="duotone" /> },
                { val: 'boleto', label: 'Boleto bancário',   icon: <FileText size={16} weight="duotone" /> },
              ].map(({ val, label, icon }) => (
                <button
                  key={val}
                  type="button"
                  onClick={() => setOpField('pagamento', val)}
                  className={`flex items-center gap-3 px-4 py-3 rounded-xl border-2 transition-all text-left ${
                    op.pagamento === val
                      ? 'border-primary-500 bg-primary-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <span className="text-xl">{icon}</span>
                  <span className="text-sm font-medium text-gray-800">{label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Credit card fields */}
          {op.pagamento === 'cartao' && (
            <div className="space-y-4 pt-1">
              <Input
                label="Nome no cartão *"
                placeholder="JOAO DA SILVA"
                value={op.cartaoNome}
                onChange={(e) => setOpField('cartaoNome', e.target.value.toUpperCase())}
                error={errors.cartaoNome}
              />
              <Input
                label="Número do cartão *"
                placeholder="0000 0000 0000 0000"
                value={op.cartaoNumero}
                onChange={(e) => setOpField('cartaoNumero', applyCardNumberMask(e.target.value))}
                inputMode="numeric"
                error={errors.cartaoNumero}
              />
              <div className="grid grid-cols-2 gap-4">
                <Input
                  label="Validade *"
                  placeholder="MM/AA"
                  value={op.cartaoValidade}
                  onChange={(e) => setOpField('cartaoValidade', applyValidityMask(e.target.value))}
                  inputMode="numeric"
                  error={errors.cartaoValidade}
                />
                <Input
                  label="CVV *"
                  placeholder="000"
                  value={op.cartaoCvv}
                  onChange={(e) => setOpField('cartaoCvv', e.target.value.replace(/\D/g,'').slice(0,4))}
                  inputMode="numeric"
                  error={errors.cartaoCvv}
                />
              </div>
            </div>
          )}

          {/* Boleto message */}
          {op.pagamento === 'boleto' && (
            <div className="flex items-start gap-3 bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm text-blue-800">
              <Info size={20} weight="duotone" className="text-blue-500 shrink-0" />
              <p>O boleto será gerado e enviado para o e-mail cadastrado após a confirmação.</p>
            </div>
          )}

          <div className="flex gap-3">
            <Button variant="secondary" onClick={() => setStep(1)}>← Voltar</Button>
            <Button fullWidth onClick={() => goNext(validateStep2)}>Continuar →</Button>
          </div>
        </div>
      )}

      {/* ── Step 3 — Logo ── */}
      {step === 3 && (
        <LogoUploadStep
          logoFile={logoFile}
          logoPreview={logoPreview}
          onFile={(file, preview) => { setLogoFile(file); setLogoPreview(preview); }}
          onRemove={() => { setLogoFile(null); setLogoPreview(null); }}
          onSkip={() => setStep(4)}
          onBack={() => setStep(2)}
        />
      )}

      {/* ── Step 4 — Configurações + Resumo ── */}
      {step === 4 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 space-y-6">
          <h2 className="text-base font-semibold text-gray-800">Configurações</h2>

          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Cashback padrão (%)"
              type="number"
              min="0"
              max="100"
              step="0.5"
              value={cfg.cashbackPercent}
              onChange={(e) => setCfgField('cashbackPercent', e.target.value)}
              error={errors.cashbackPercent}
              hint="Percentual sobre o valor abastecido"
            />
            <Input
              label="Resgate mínimo (R$)"
              type="number"
              min="0.01"
              step="1"
              prefix="R$"
              value={cfg.minRedemption}
              onChange={(e) => setCfgField('minRedemption', e.target.value)}
              error={errors.minRedemption}
              hint="Valor mínimo para resgatar cashback"
            />
          </div>

          {/* Summary */}
          <div>
            <p className="text-sm font-semibold text-gray-700 mb-3">Resumo do cadastro</p>
            <div className="bg-gray-50 rounded-xl px-5 py-3 space-y-0">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide pt-2 pb-1">Estabelecimento</p>
              <SummaryRow label="Nome"      value={est.nome} />
              <SummaryRow label="CNPJ"      value={est.cnpj} />
              <SummaryRow label="Telefone"  value={est.telefone} />
              <SummaryRow label="Endereço"  value={est.endereco} />
              <SummaryRow label="Cidade"    value={est.cidade && est.estado ? `${est.cidade} — ${est.estado}` : est.cidade || est.estado} />
              {logoFile && (
                <SummaryRow label="Logo" value={`${logoFile.name} (${formatBytes(logoFile.size)})`} />
              )}

              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide pt-3 pb-1">Operador principal</p>
              <SummaryRow label="Nome"      value={op.nome} />
              <SummaryRow label="E-mail"    value={op.email} />
              <SummaryRow label="Senha"     value={op.senha} />
              <SummaryRow label="Pagamento" value={op.pagamento === 'cartao' ? 'Cartão de crédito' : 'Boleto bancário'} />

              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide pt-3 pb-1">Configurações</p>
              <SummaryRow label="Cashback padrão" value={`${cfg.cashbackPercent}%`} />
              <SummaryRow label="Resgate mínimo"  value={`R$ ${parseFloat(cfg.minRedemption || 0).toFixed(2)}`} />
            </div>
          </div>

          {/* Upload progress bar */}
          {uploadingLogo && (
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs text-gray-500">
                <span>Enviando logo…</span>
                <span>{uploadProgress}%</span>
              </div>
              <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
                <div
                  className="bg-primary-500 h-2 rounded-full transition-all duration-200"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
            </div>
          )}

          <div className="flex gap-3">
            <Button variant="secondary" onClick={() => setStep(3)}>← Voltar</Button>
            <Button
              fullWidth
              size="lg"
              variant="success"
              loading={loading}
              onClick={handleSubmit}
            >
              Cadastrar Estabelecimento
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
