import { useState, useEffect, useRef } from 'react';
import { establishmentsAPI } from '../services/api.js';

const DEEP_LINK_BASE = 'https://prtcashback.app/register';

export default function EstablishmentQRCode({ establishmentId }) {
  const [qrUrl,    setQrUrl]    = useState(null);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState(false);
  const [copied,   setCopied]   = useState(false);
  const objectUrlRef = useRef(null);

  const deepLink = `${DEEP_LINK_BASE}?e=${establishmentId}`;

  useEffect(() => {
    if (!establishmentId) return;

    let cancelled = false;
    setLoading(true);
    setError(false);

    establishmentsAPI.getQRCode(establishmentId)
      .then(({ data }) => {
        if (cancelled) return;
        const url = URL.createObjectURL(data);
        objectUrlRef.current = url;
        setQrUrl(url);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = null;
      }
    };
  }, [establishmentId]);

  function handleDownload() {
    if (!qrUrl) return;
    const a = document.createElement('a');
    a.href = qrUrl;
    a.download = `qrcode-posto-${establishmentId}.png`;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => document.body.removeChild(a), 1000);
  }

  async function handleCopyLink() {
    try {
      await navigator.clipboard.writeText(deepLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // fallback: select text from a temporary input
      const input = document.createElement('input');
      input.value = deepLink;
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      document.body.removeChild(input);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 space-y-5">
      <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
        QR Code de Cadastro
      </h2>

      {/* QR Code image */}
      <div className="flex justify-center">
        {loading ? (
          <div className="w-48 h-48 flex items-center justify-center bg-gray-50 rounded-xl border border-gray-100">
            <div className="w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
          </div>
        ) : error ? (
          <div className="w-48 h-48 flex flex-col items-center justify-center gap-2 bg-red-50 rounded-xl border border-red-100 text-red-400 text-sm text-center p-4">
            <span className="text-2xl">⚠️</span>
            Erro ao gerar QR Code
          </div>
        ) : (
          <img
            src={qrUrl}
            alt="QR Code de cadastro do posto"
            className="w-48 h-48 rounded-xl border border-gray-100"
          />
        )}
      </div>

      {/* Deep link URL */}
      <div className="bg-gray-50 rounded-lg px-3 py-2 border border-gray-100">
        <p className="text-xs text-gray-400 mb-0.5">Link de cadastro</p>
        <p className="text-xs font-mono text-gray-700 break-all">{deepLink}</p>
      </div>

      {/* Action buttons */}
      <div className="flex gap-3">
        <button
          onClick={handleDownload}
          disabled={!qrUrl}
          className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Baixar QR Code PNG
        </button>
        <button
          onClick={handleCopyLink}
          className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border border-gray-200 hover:bg-gray-50 text-gray-700 text-sm font-semibold transition-colors"
        >
          {copied ? '✓ Link copiado!' : 'Copiar link'}
        </button>
      </div>

      {/* Instructions */}
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-1">
        <p className="text-xs font-semibold text-amber-800">Como usar</p>
        <p className="text-xs text-amber-700 leading-relaxed">
          Imprima este QR Code e cole nas bombas e balcão.
          O cliente escaneia, baixa o app e já cadastra
          neste posto automaticamente!
        </p>
      </div>
    </div>
  );
}
