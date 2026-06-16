import { useState, useEffect } from 'react';
import { ratingsAPI } from '../services/api.js';
import { Star, ChatCircleText, X } from '@phosphor-icons/react';

function fmtInt(v) {
  return Number(v || 0).toLocaleString('pt-BR');
}

export function StarRow({ stars }) {
  return (
    <span className="inline-flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          size={14}
          weight={n <= stars ? 'fill' : 'regular'}
          className={n <= stars ? 'text-amber-400' : 'text-slate-300'}
        />
      ))}
    </span>
  );
}

/**
 * Per-attendant ratings list (stars + comments, newest first). Customer identity
 * is LGPD-masked by the backend. Reused by the Ranking and Atendentes pages.
 */
export default function RatingsModal({ attendantName, params = {}, onClose }) {
  const [loading, setLoading] = useState(true);
  const [ratings, setRatings] = useState([]);
  const [aggregate, setAggregate] = useState(null);

  useEffect(() => {
    setLoading(true);
    ratingsAPI.get({ ...params, attendant: attendantName })
      .then((res) => {
        setRatings(res.data.ratings || []);
        setAggregate((res.data.aggregates || [])[0] || null);
      })
      .catch(() => { setRatings([]); setAggregate(null); })
      .finally(() => setLoading(false));
  }, [attendantName, JSON.stringify(params)]);

  return (
    <div
      className="fixed inset-0 z-[100] bg-black/40 flex items-center justify-center p-4"
      onMouseDown={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <div>
            <p className="text-sm font-bold text-gray-900">Avaliações — {attendantName}</p>
            {aggregate && (
              <div className="flex items-center gap-2 mt-1">
                <StarRow stars={Math.round(aggregate.avgStars)} />
                <span className="text-xs text-gray-500">
                  {Number(aggregate.avgStars).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
                  {' '}· {fmtInt(aggregate.totalRatings)} avaliaç{aggregate.totalRatings === 1 ? 'ão' : 'ões'}
                </span>
              </div>
            )}
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-colors"
            aria-label="Fechar"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto px-5 py-4 space-y-3">
          {loading ? (
            <div className="space-y-3 animate-pulse">
              {[0, 1, 2].map((i) => <div key={i} className="h-16 bg-gray-100 rounded-xl" />)}
            </div>
          ) : ratings.length === 0 ? (
            <div className="py-10 text-center text-gray-400">
              <ChatCircleText size={36} weight="duotone" className="text-stone-300 mb-2 mx-auto" />
              <p className="text-sm">Nenhuma avaliação no período selecionado</p>
            </div>
          ) : (
            ratings.map((r) => (
              <div key={r.id} className="border border-gray-100 rounded-xl p-3 bg-slate-50/60">
                <div className="flex items-center justify-between mb-1">
                  <StarRow stars={r.stars} />
                  <span className="text-[11px] text-gray-400">
                    {new Date(r.createdAt).toLocaleDateString('pt-BR')}
                  </span>
                </div>
                {r.comment
                  ? <p className="text-[13px] text-gray-700 leading-snug">{r.comment}</p>
                  : <p className="text-[13px] text-gray-300 italic">Sem comentário</p>}
                <p className="text-[11px] text-gray-400 mt-1.5">
                  {r.customerName}{r.customerCpf ? ` · ${r.customerCpf}` : ''}
                </p>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
