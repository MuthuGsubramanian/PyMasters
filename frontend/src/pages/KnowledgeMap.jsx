import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Brain, Sparkles, Target, ChevronRight, X, GraduationCap, Lock } from 'lucide-react';
import clsx from 'clsx';
import { useAuth } from '../context/AuthContext';
import { getKnowledgeMap, getConceptRecommendations, getKnowledgeGaps } from '../api';

/**
 * KnowledgeMap — Vaathiyaar's live model of what the user knows.
 *
 * Renders the knowledge graph (backend /api/graph/user-map) as
 * category-grouped concept chips with mastery rings, plus the "learning
 * frontier" (recommended next concepts) and a per-concept prerequisite-gap
 * drill-down. All data is per-user and served by the (auth-guarded)
 * /api/graph endpoints; degrades gracefully for brand-new users with no
 * mastery signals yet.
 */

const MASTERED = 0.5; // matches backend frontier threshold

// Concept difficulty arrives numeric (1/2/3) from production data and as a
// string from some seeds — render a human label either way (live-QA finding:
// cards showed "python_core · 3").
function difficultyLabel(d) {
  const byNumber = { 1: 'Beginner', 2: 'Intermediate', 3: 'Advanced' };
  if (byNumber[d]) return byNumber[d];
  const s = String(d ?? '').toLowerCase();
  if (['beginner', 'intermediate', 'advanced'].includes(s)) {
    return s.charAt(0).toUpperCase() + s.slice(1);
  }
  return null;
}

// "python_core" → "Python Core", "ai_ml" → "AI ML"
const ACRONYMS = new Set(['ai', 'ml', 'dl', 'nlp', 'sql', 'api', 'dsa', 'llm', 'oop', 'ci', 'cd']);
function prettyCategory(c) {
  return String(c || 'General')
    .split('_')
    .map((w) => (ACRONYMS.has(w.toLowerCase()) ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(' ');
}

function masteryTone(m) {
  if (m >= MASTERED) return { ring: 'text-accent-primary', label: 'Mastered' };
  if (m > 0) return { ring: 'text-secondary', label: 'In progress' };
  return { ring: 'text-text-muted', label: 'Not started' };
}

function MasteryRing({ value, size = 34 }) {
  const r = (size - 6) / 2;
  const c = 2 * Math.PI * r;
  const tone = masteryTone(value);
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0" aria-hidden="true">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth="3"
        className="stroke-border-default" />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth="3"
        strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - Math.min(value, 1))}
        className={clsx('stroke-current transition-all duration-700', tone.ring)}
        transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      <text x="50%" y="54%" dominantBaseline="middle" textAnchor="middle"
        className="fill-current text-text-secondary" fontSize={size * 0.28} fontWeight="600">
        {Math.round(value * 100)}
      </text>
    </svg>
  );
}

function ConceptChip({ concept, onSelect, selected }) {
  const tone = masteryTone(concept.mastery);
  return (
    <button
      type="button"
      onClick={() => onSelect(concept)}
      aria-pressed={selected}
      className={clsx(
        'flex items-center gap-2.5 rounded-xl border px-3 py-2 text-left transition-all',
        'bg-bg-surface hover:border-accent-primary/50 focus-visible:ring-2 focus-visible:ring-accent-primary/60 outline-none',
        selected ? 'border-accent-primary shadow-glow' : 'border-border-default'
      )}
    >
      <MasteryRing value={concept.mastery} size={30} />
      <span className="min-w-0">
        <span className="block truncate text-sm font-medium text-text-primary">{concept.name}</span>
        <span className="block text-[11px] text-text-muted">{tone.label}</span>
      </span>
    </button>
  );
}

export default function KnowledgeMap() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [mapData, setMapData] = useState(null);
  const [recs, setRecs] = useState([]);
  const [selected, setSelected] = useState(null);
  const [gaps, setGaps] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    document.title = 'Knowledge Map — PyMasters';
  }, []);

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    setLoading(true);
    Promise.all([
      getKnowledgeMap(user.id),
      getConceptRecommendations(user.id, 5),
    ])
      .then(([m, r]) => {
        if (cancelled) return;
        setMapData(m.data);
        setRecs(r.data?.recommendations || []);
      })
      .catch(() => !cancelled && setError('Could not load your knowledge map right now.'))
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [user?.id]);

  useEffect(() => {
    if (!selected || !user?.id) { setGaps(null); return; }
    let cancelled = false;
    getKnowledgeGaps(user.id, selected.id)
      .then((g) => !cancelled && setGaps(g.data?.gaps || []))
      .catch(() => !cancelled && setGaps([]));
    return () => { cancelled = true; };
  }, [selected, user?.id]);

  const byCategory = useMemo(() => {
    if (!mapData?.nodes) return [];
    const groups = new Map();
    for (const n of mapData.nodes) {
      const key = n.category || 'General';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(n);
    }
    const order = { beginner: 0, intermediate: 1, advanced: 2 };
    return [...groups.entries()].map(([category, nodes]) => ({
      category,
      nodes: nodes.sort((a, b) => (order[a.difficulty] ?? 1) - (order[b.difficulty] ?? 1)),
    }));
  }, [mapData]);

  const stats = useMemo(() => {
    const nodes = mapData?.nodes || [];
    return {
      mastered: nodes.filter((n) => n.mastery >= MASTERED).length,
      inProgress: nodes.filter((n) => n.mastery > 0 && n.mastery < MASTERED).length,
      total: nodes.length,
    };
  }, [mapData]);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center text-text-muted" role="status" aria-live="polite">
        <Brain className="mr-2 h-5 w-5 animate-pulse" aria-hidden="true" /> Mapping what you know…
      </div>
    );
  }

  if (error) {
    return (
      <div className="panel mx-auto max-w-lg rounded-2xl p-8 text-center">
        <p className="text-text-secondary">{error}</p>
        <button type="button" className="btn-neo btn-neo-primary mt-4" onClick={() => window.location.reload()}>
          Try again
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-text-primary flex items-center gap-2">
            <Brain className="h-6 w-6 text-accent-primary" aria-hidden="true" /> Knowledge Map
          </h1>
          <p className="mt-1 text-sm text-text-secondary">
            Vaathiyaar's live model of what you know — updated as you learn, practice and review.
          </p>
        </div>
        <div className="flex gap-4 text-sm" aria-label="Mastery summary">
          <span className="text-text-secondary"><strong className="text-accent-primary">{stats.mastered}</strong> mastered</span>
          <span className="text-text-secondary"><strong className="text-secondary">{stats.inProgress}</strong> in progress</span>
          <span className="text-text-muted">{stats.total} concepts</span>
        </div>
      </div>

      {/* Recommended next (learning frontier) */}
      <section aria-labelledby="km-next" className="panel rounded-2xl p-5">
        <h2 id="km-next" className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-text-secondary">
          <Sparkles className="h-4 w-4 text-accent-primary" aria-hidden="true" />
          {stats.mastered + stats.inProgress === 0 ? 'Where to start' : 'Recommended next'}
        </h2>
        {recs.length === 0 ? (
          <p className="text-sm text-text-muted">
            Nothing to recommend right now — complete a lesson or challenge and Vaathiyaar will chart your next step.
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {recs.map((r) => (
              <motion.div key={r.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
                <button
                  type="button"
                  onClick={() => setSelected(r)}
                  className="w-full rounded-xl border border-border-default bg-bg-elevated p-4 text-left transition-all hover:border-accent-primary/60 focus-visible:ring-2 focus-visible:ring-accent-primary/60 outline-none"
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="font-medium text-text-primary">{r.name}</span>
                    <ChevronRight className="h-4 w-4 shrink-0 text-text-muted" aria-hidden="true" />
                  </span>
                  <span className="mt-1 block text-xs text-text-muted">
                    {r.category} · {r.difficulty}
                    {r.dependent_count > 0 && ` · unlocks ${r.dependent_count} concept${r.dependent_count === 1 ? '' : 's'}`}
                  </span>
                </button>
              </motion.div>
            ))}
          </div>
        )}
      </section>

      {/* Concept map by category */}
      <div className="grid gap-6 lg:grid-cols-[1fr_minmax(280px,340px)]">
        <div className="space-y-5">
          {byCategory.map(({ category, nodes }) => (
            <section key={category} aria-label={category} className="panel rounded-2xl p-5">
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-text-secondary">{category}</h2>
              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                {nodes.map((n) => (
                  <ConceptChip key={n.id} concept={n} selected={selected?.id === n.id} onSelect={setSelected} />
                ))}
              </div>
            </section>
          ))}
          {byCategory.length === 0 && (
            <div className="panel rounded-2xl p-8 text-center text-text-muted">
              The concept graph is warming up — check back shortly.
            </div>
          )}
        </div>

        {/* Detail rail */}
        <aside className="lg:sticky lg:top-6 lg:self-start" aria-live="polite">
          <AnimatePresence mode="wait">
            {selected ? (
              <motion.div key={selected.id} initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 12 }}
                className="panel rounded-2xl p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="font-display text-lg font-semibold text-text-primary">{selected.name}</h2>
                    <p className="text-xs text-text-muted">{selected.category} · {selected.difficulty}</p>
                  </div>
                  <button type="button" onClick={() => setSelected(null)} aria-label="Close concept details"
                    className="rounded-lg p-1.5 text-text-muted transition-colors hover:bg-bg-elevated">
                    <X className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>

                <div className="mt-4 flex items-center gap-3">
                  <MasteryRing value={selected.mastery ?? 0} size={44} />
                  <p className="text-sm text-text-secondary">{masteryTone(selected.mastery ?? 0).label}</p>
                </div>

                <div className="mt-5">
                  <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-text-secondary">
                    <Target className="h-3.5 w-3.5" aria-hidden="true" /> Prerequisite gaps
                  </h3>
                  {gaps === null ? (
                    <p className="text-sm text-text-muted">Checking prerequisites…</p>
                  ) : gaps.length === 0 ? (
                    <p className="text-sm text-text-secondary">No gaps — you're ready for this one.</p>
                  ) : (
                    <ul className="space-y-1.5">
                      {gaps.map((g) => (
                        <li key={g.id} className="flex items-center gap-2 rounded-lg bg-bg-elevated px-3 py-2 text-sm text-text-secondary">
                          <Lock className="h-3.5 w-3.5 shrink-0 text-text-muted" aria-hidden="true" />
                          <span className="truncate">{g.name}</span>
                          <span className="ml-auto text-xs text-text-muted">{Math.round((g.mastery ?? 0) * 100)}%</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <button type="button" onClick={() => navigate('/dashboard/classroom')}
                  className="btn-neo btn-neo-primary mt-5 w-full">
                  <GraduationCap className="mr-1.5 h-4 w-4" aria-hidden="true" /> Learn this in the Classroom
                </button>
              </motion.div>
            ) : (
              <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="panel rounded-2xl p-6 text-center text-sm text-text-muted">
                Select any concept to see how ready you are for it — and exactly what to close first.
              </motion.div>
            )}
          </AnimatePresence>
        </aside>
      </div>
    </div>
  );
}
