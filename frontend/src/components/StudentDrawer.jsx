import { useCallback, useEffect, useRef, useState } from 'react';
// eslint-disable-next-line no-unused-vars
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { X, Trophy, Zap, AlertTriangle, Activity, BookOpen, Loader2, Plus } from 'lucide-react';
import { getStudentDetail, setMemberGroups } from '../api';
import { safeErrorMsg } from '../utils/errorUtils';

const STATUS_PILL = {
  at_risk:  { label: 'At risk',  color: 'bg-red-100 text-red-600 border-red-200' },
  active:   { label: 'Active',   color: 'bg-green-100 text-green-600 border-green-200' },
  idle:     { label: 'Idle',     color: 'bg-amber-100 text-amber-600 border-amber-200' },
  inactive: { label: 'Inactive', color: 'bg-slate-100 text-slate-500 border-slate-200' },
};

function relTime(ts) {
  if (!ts) return 'never';
  let iso = String(ts).replace(' ', 'T');
  if (!/[zZ]|[+-]\d\d:?\d\d$/.test(iso)) iso += 'Z';
  const then = new Date(iso).getTime();
  if (isNaN(then)) return '—';
  const days = Math.floor((Date.now() - then) / 86400000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days}d ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

function masteryColor(level) {
  const pct = (Number(level) || 0) * 100;
  if (pct < 40) return 'bg-red-400';
  if (pct < 70) return 'bg-amber-400';
  return 'bg-green-400';
}

export default function StudentDrawer({ orgId, userId, studentId, canEdit, groupLabel = 'Group', onClose, onGroupsChanged }) {
  const reduced = useReducedMotion();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tags, setTags] = useState([]);
  const [newTag, setNewTag] = useState('');
  const [savingTags, setSavingTags] = useState(false);
  const panelRef = useRef(null);

  const load = useCallback(() => {
    setLoading(true); setError('');
    getStudentDetail(orgId, studentId, userId)
      .then((res) => { setData(res?.data || null); setTags(res?.data?.profile?.groups || []); })
      .catch((err) => setError(safeErrorMsg(err, 'Failed to load student')))
      .finally(() => setLoading(false));
  }, [orgId, studentId, userId]);
  useEffect(() => { load(); }, [load]);

  // Focus the panel on open; restore focus to the trigger element on close (mount/unmount only)
  useEffect(() => {
    const prevFocused = typeof document !== 'undefined' ? document.activeElement : null;
    panelRef.current?.focus();
    return () => { try { prevFocused?.focus?.(); } catch { /* trigger no longer in DOM */ } };
  }, []); // mount/unmount only — intentionally captures trigger element at open time

  // ESC to close
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const p = data?.profile;
  const s = data?.summary;
  const pill = STATUS_PILL[s?.status] || STATUS_PILL.inactive;
  const name = String(p?.name || p?.username || '—');

  const persistTags = async (next) => {
    setSavingTags(true);
    const prev = tags;
    setTags(next); // optimistic
    try {
      await setMemberGroups(orgId, studentId, next);
      onGroupsChanged?.();
    } catch {
      setTags(prev); // revert on failure
    } finally {
      setSavingTags(false);
    }
  };
  const addTag = () => {
    const t = newTag.trim().slice(0, 50);
    if (!t || tags.includes(t) || tags.length >= 20) { setNewTag(''); return; }
    setNewTag('');
    persistTags([...tags, t]);
  };
  const removeTag = (t) => persistTags(tags.filter((x) => x !== t));

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-50 flex justify-end bg-black/40 backdrop-blur-sm"
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        onClick={onClose}
      >
        <motion.aside
          ref={panelRef}
          tabIndex={-1}
          role="dialog"
          aria-modal="true"
          aria-label={`${name} detail`}
          onClick={(e) => e.stopPropagation()}
          initial={reduced ? false : { x: '100%' }}
          animate={reduced ? false : { x: 0 }}
          exit={reduced ? undefined : { x: '100%' }}
          transition={{ type: 'spring', stiffness: 400, damping: 40 }}
          className="w-full max-w-md h-full overflow-y-auto bg-bg-surface border-l border-border-default shadow-2xl focus:outline-none"
        >
          {loading ? (
            <div className="p-6 space-y-4">
              <div className="h-16 rounded-xl bg-bg-elevated animate-pulse" />
              <div className="h-20 rounded-xl bg-bg-elevated animate-pulse" />
              <div className="h-40 rounded-xl bg-bg-elevated animate-pulse" />
            </div>
          ) : error ? (
            <div className="p-6">
              <button onClick={onClose} className="mb-4 text-text-muted hover:text-text-secondary"><X size={18} /></button>
              <p className="text-sm text-red-500 mb-3">{String(error)}</p>
              <button onClick={load} className="px-4 py-2 rounded-xl bg-red-100 text-red-600 text-xs font-bold">Retry</button>
            </div>
          ) : (
            <div>
              {/* Header */}
              <div className="p-5 border-b border-border-default flex items-start gap-3">
                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-cyan-400 to-purple-500 flex items-center justify-center text-white font-bold shrink-0">
                  {name.substring(0, 2).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="text-lg font-bold text-text-primary truncate">{name}</h2>
                    <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${pill.color}`}>{pill.label}</span>
                  </div>
                  {p?.email && <p className="text-xs text-text-muted truncate">{String(p.email)}</p>}
                  <div className="flex flex-wrap items-center gap-1 mt-2">
                    {(canEdit ? tags : (p?.groups || [])).map((g) => (
                      <span key={g} className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-cyan-100 text-cyan-700 border border-cyan-200">
                        {g}
                        {canEdit && (
                          <button onClick={() => removeTag(g)} aria-label={`Remove ${g}`} className="hover:text-red-500"><X size={10} /></button>
                        )}
                      </span>
                    ))}
                    {canEdit && (
                      <span className="inline-flex items-center gap-1">
                        <input
                          value={newTag}
                          onChange={(e) => setNewTag(e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter') addTag(); }}
                          placeholder={`Add ${groupLabel.toLowerCase()}`}
                          className="text-[11px] px-2 py-0.5 rounded-full border border-border-default bg-bg-surface w-28 focus:outline-none focus:ring-1 focus:ring-cyan-400"
                        />
                        <button onClick={addTag} disabled={savingTags} aria-label="Add tag" className="text-cyan-600 hover:text-cyan-700">
                          {savingTags ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
                        </button>
                      </span>
                    )}
                  </div>
                </div>
                <button onClick={onClose} className="text-text-muted hover:text-text-secondary p-1" aria-label="Close"><X size={18} /></button>
              </div>

              {/* Summary */}
              <div className="p-5 grid grid-cols-3 gap-3 border-b border-border-default text-center">
                <div><Zap size={14} className="mx-auto text-cyan-500 mb-1" /><div className="text-lg font-bold text-text-primary">{s?.xp ?? 0}</div><div className="text-[10px] text-text-muted uppercase tracking-wide">XP</div></div>
                <div><Trophy size={14} className="mx-auto text-amber-500 mb-1" /><div className="text-lg font-bold text-text-primary">{s?.lessons_completed ?? 0}</div><div className="text-[10px] text-text-muted uppercase tracking-wide">Lessons</div></div>
                <div><AlertTriangle size={14} className="mx-auto text-red-500 mb-1" /><div className="text-lg font-bold text-text-primary">{s?.struggle_total ?? 0}</div><div className="text-[10px] text-text-muted uppercase tracking-wide">Struggles</div></div>
              </div>
              <div className="px-5 py-2 text-xs text-text-muted border-b border-border-default">Last active: {relTime(s?.last_active)}</div>

              {/* Mastery */}
              <div className="p-5 border-b border-border-default">
                <h3 className="text-sm font-bold text-text-secondary mb-3">Topic mastery</h3>
                {(data?.mastery || []).length === 0 ? (
                  <p className="text-xs text-text-muted">No mastery data yet — {name} hasn't practiced.</p>
                ) : (
                  <div className="space-y-2.5">
                    {data.mastery.map((m) => (
                      <div key={m.topic} className="flex items-center gap-2">
                        <span className="text-xs text-text-secondary w-28 truncate">{m.topic}</span>
                        <div className="flex-1 h-2.5 bg-bg-elevated rounded-full overflow-hidden">
                          <div className={`h-full rounded-full ${masteryColor(m.mastery_level)}`} style={{ width: `${Math.round((Number(m.mastery_level) || 0) * 100)}%` }} />
                        </div>
                        <span className="text-[11px] text-text-muted w-9 text-right">{Math.round((Number(m.mastery_level) || 0) * 100)}%</span>
                        {(m.struggle_count || 0) > 0 && (
                          <span className="text-[10px] text-red-500 font-bold w-7 text-right">⚠{m.struggle_count}</span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Activity */}
              <div className="p-5 border-b border-border-default">
                <h3 className="text-sm font-bold text-text-secondary mb-3 flex items-center gap-1.5"><Activity size={14} /> Recent activity</h3>
                {(data?.activity || []).length === 0 ? (
                  <p className="text-xs text-text-muted">No recent activity.</p>
                ) : (
                  <ul className="space-y-2">
                    {data.activity.slice(0, 12).map((a, i) => (
                      <li key={i} className="flex items-center justify-between text-xs">
                        <span className="text-text-secondary truncate">{String(a.signal_type || 'signal').replace(/_/g, ' ')}{a.topic ? ` · ${a.topic}` : ''}</span>
                        <span className="text-text-muted shrink-0 ml-2">{relTime(a.created_at)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* Lessons */}
              <div className="p-5">
                <h3 className="text-sm font-bold text-text-secondary mb-3 flex items-center gap-1.5"><BookOpen size={14} /> Recent lessons</h3>
                {(data?.lessons || []).length === 0 ? (
                  <p className="text-xs text-text-muted">No lessons completed yet.</p>
                ) : (
                  <ul className="space-y-2">
                    {data.lessons.map((l, i) => (
                      <li key={i} className="flex items-center justify-between text-xs">
                        <span className="text-text-secondary truncate">{String(l.lesson_id)}</span>
                        <span className="text-text-muted shrink-0 ml-2">+{l.xp_awarded || 0} XP · {relTime(l.completed_at)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}
        </motion.aside>
      </motion.div>
    </AnimatePresence>
  );
}
