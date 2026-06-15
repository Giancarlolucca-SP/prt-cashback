import { useState, useEffect, useMemo } from 'react';
import { ratingsAPI } from '../services/api.js';
import { Star, ChatCircleText, BellSimple, Check } from '@phosphor-icons/react';

const READ_KEY = 'postocash_read_ratings';

function loadReadSet() {
  try { return new Set(JSON.parse(localStorage.getItem(READ_KEY) || '[]')); }
  catch { return new Set(); }
}
function persistReadSet(set) {
  // Keep the last 500 ids to avoid unbounded growth
  const arr = Array.from(set).slice(-500);
  localStorage.setItem(READ_KEY, JSON.stringify(arr));
}

function Stars({ value }) {
  return (
    <span className="inline-flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <Star key={n} size={13} weight={n <= value ? 'fill' : 'regular'} className={n <= value ? 'text-amber-400' : 'text-slate-300'} />
      ))}
    </span>
  );
}

function timeAgo(iso) {
  const d = new Date(iso);
  const mins = Math.floor((Date.now() - d.getTime()) / 60000);
  if (mins < 1) return 'agora';
  if (mins < 60) return `há ${mins} min`;
  const h = Math.floor(mins / 60);
  if (h < 24) return `há ${h} h`;
  const days = Math.floor(h / 24);
  if (days < 30) return `há ${days} d`;
  return d.toLocaleDateString('pt-BR');
}

/**
 * Dashboard ratings panel:
 *  - overall average-rating summary card (PHASE 3c)
 *  - "Notificações": recent ratings that include a written comment, with
 *    optional mark-as-read (localStorage). LGPD-masked by the backend.
 */
export default function RatingNotifications({ params }) {
  const [loading, setLoading]     = useState(true);
  const [aggregates, setAggregates] = useState([]);
  const [ratings, setRatings]     = useState([]);
  const [readSet, setReadSet]     = useState(loadReadSet);

  useEffect(() => {
    setLoading(true);
    ratingsAPI.get(params)
      .then((res) => {
        setAggregates(res.data.aggregates || []);
        setRatings(res.data.ratings || []);
      })
      .catch(() => { setAggregates([]); setRatings([]); })
      .finally(() => setLoading(false));
  }, [JSON.stringify(params)]);

  // Overall average across all attendants (weighted by rating count)
  const overall = useMemo(() => {
    let sum = 0, count = 0;
    for (const a of aggregates) { sum += a.avgStars * a.totalRatings; count += a.totalRatings; }
    return { avg: count ? sum / count : 0, count };
  }, [aggregates]);

  const commented = useMemo(() => ratings.filter((r) => r.comment && r.comment.trim()), [ratings]);
  const unreadCount = commented.filter((r) => !readSet.has(r.id)).length;

  function markAllRead() {
    const next = new Set(readSet);
    commented.forEach((r) => next.add(r.id));
    persistReadSet(next);
    setReadSet(next);
  }
  function markRead(id) {
    const next = new Set(readSet);
    next.add(id);
    persistReadSet(next);
    setReadSet(next);
  }

  if (loading) {
    return <div className="h-40 bg-gray-100 rounded-xl animate-pulse" />;
  }

  return (
    <div className="grid lg:grid-cols-3 gap-4">
      {/* ── Overall average summary card (3c) ── */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 flex flex-col justify-center">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Avaliação média geral</p>
        {overall.count > 0 ? (
          <>
            <div className="flex items-end gap-2">
              <span className="text-4xl font-bold text-amber-500 leading-none">
                {overall.avg.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
              </span>
              <Star size={26} weight="fill" className="text-amber-400 mb-1" />
            </div>
            <div className="mt-2"><Stars value={Math.round(overall.avg)} /></div>
            <p className="text-xs text-gray-400 mt-2">{overall.count.toLocaleString('pt-BR')} avaliações no período</p>
          </>
        ) : (
          <p className="text-sm text-gray-400">Sem avaliações no período.</p>
        )}
      </div>

      {/* ── Notifications (3b) ── */}
      <div className="lg:col-span-2 bg-white rounded-xl border border-gray-200 shadow-sm flex flex-col max-h-[360px]">
        <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BellSimple size={16} weight="duotone" className="text-amber-500" />
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Notificações</p>
            {unreadCount > 0 && (
              <span className="text-[10px] font-bold bg-amber-400 text-white rounded-full px-1.5 py-0.5">{unreadCount}</span>
            )}
          </div>
          {commented.length > 0 && unreadCount > 0 && (
            <button onClick={markAllRead} className="text-[11px] font-semibold text-gray-400 hover:text-gray-700 inline-flex items-center gap-1">
              <Check size={13} weight="bold" /> Marcar como lidas
            </button>
          )}
        </div>

        <div className="overflow-y-auto px-2 py-2">
          {commented.length === 0 ? (
            <div className="py-10 text-center text-gray-400">
              <ChatCircleText size={32} weight="duotone" className="text-stone-300 mb-2 mx-auto" />
              <p className="text-sm">Nenhum comentário recente.</p>
            </div>
          ) : (
            commented.map((r) => {
              const unread = !readSet.has(r.id);
              return (
                <div
                  key={r.id}
                  className={`flex items-start gap-3 rounded-lg px-3 py-2.5 ${unread ? 'bg-amber-50/60' : ''}`}
                >
                  {unread && <span className="mt-2 w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />}
                  <div className={`flex-1 min-w-0 ${unread ? '' : 'pl-[18px]'}`}>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[13px] font-bold text-slate-800">{r.attendant}</span>
                      <span className="inline-flex items-center gap-1 text-[12px] font-semibold text-amber-600">
                        {r.stars}<Star size={11} weight="fill" className="text-amber-400" />
                      </span>
                      <span className="text-[11px] text-gray-400">· {timeAgo(r.createdAt)}</span>
                    </div>
                    <p className="text-[13px] text-gray-600 leading-snug mt-0.5">“{r.comment}”</p>
                    <p className="text-[11px] text-gray-400 mt-0.5">{r.customerName}</p>
                  </div>
                  {unread && (
                    <button onClick={() => markRead(r.id)} title="Marcar como lida" className="text-gray-300 hover:text-gray-600 mt-1 shrink-0">
                      <Check size={15} weight="bold" />
                    </button>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
