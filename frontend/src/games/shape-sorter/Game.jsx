import { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Boxes, Sparkles } from 'lucide-react';
import { shortcutsBlocked } from '../engine/keys';

const CONTAINER_SPECS = {
  list: { syntax: '[a, b, c]', traits: 'Ordered · Mutable · O(1) index' },
  tuple: { syntax: '(a, b, c)', traits: 'Ordered · Immutable · Hashable' },
  set: { syntax: '{a, b, c}', traits: 'Unique · Unordered · O(1) `in`' },
  dict: { syntax: '{k: v}', traits: 'Key → Value · O(1) lookup' },
  deque: { syntax: 'deque([a, b])', traits: 'FIFO / LIFO · O(1) both ends' },
  frozenset: { syntax: 'frozenset({a})', traits: 'Unique · Immutable · Hashable' },
  heapq: { syntax: 'heappush(h, x)', traits: 'Priority Queue · O(1) min' },
  counter: { syntax: 'Counter(seq)', traits: 'Frequency counts · Hash tally' },
};

function detectSignal(text) {
  const s = String(text || '').toLowerCase();
  if (/unique|duplicat|distinct|membership|already seen/.test(s)) return 'Signal: Uniqueness & fast O(1) membership test';
  if (/immutab|constant|dict key|fixed|never change|coordinates/.test(s)) return 'Signal: Fixed record / immutable & hashable';
  if (/lookup by|map|associate|by id|by name|key|count how many/.test(s)) return 'Signal: Key → Value mapping & fast lookup';
  if (/both ends|queue|fifo|first-in|sliding window/.test(s)) return 'Signal: Fast appends/pops from both ends';
  if (/order|sequence|append|sort|index|stack|lifo/.test(s)) return 'Signal: Ordered sequence that grows or sorts in place';
  return 'Signal: Analyze mutability, ordering, and lookup speed';
}

/**
 * Shape Sorter: a requirement card is dealt; drop it into the right bin. Tap a bin, use
 * arrow keys + Enter, or press the bin's number. Answers the bin label.
 */
export default function Game({ item, onAnswer, disabled, reducedMotion }) {
  const bins = item?.choices || [];
  const [cursor, setCursor] = useState(0);
  const answered = useRef(false);
  const signal = useMemo(() => detectSignal(item?.prompt?.text), [item?.prompt?.text]);

  useEffect(() => { answered.current = false; setCursor(0); }, [item?.id]);

  const drop = (label) => {
    if (disabled || answered.current) return;
    answered.current = true;
    onAnswer(label);
  };

  useEffect(() => {
    const onKey = (e) => {
      if (disabled || answered.current) return;
      if (shortcutsBlocked(e)) return;
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); setCursor((c) => (c + 1) % bins.length); }
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); setCursor((c) => (c - 1 + bins.length) % bins.length); }
      else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); drop(bins[cursor]); }
      else {
        const n = Number(e.key);
        if (n >= 1 && n <= bins.length) { e.preventDefault(); drop(bins[n - 1]); }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // drop reads refs/props at call time
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [disabled, cursor, bins, item]);

  if (!item) return null;
  const Card = reducedMotion ? 'div' : motion.div;
  const motionProps = reducedMotion ? {} : { initial: { y: -24, opacity: 0, rotate: -2 }, animate: { y: 0, opacity: 1, rotate: 0 }, transition: { type: 'spring', stiffness: 260, damping: 20 } };
  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="text-sm text-text-secondary"><Boxes size={14} className="inline mr-1 text-accent-primary" aria-hidden="true" /> Which Python container (or operation) best fits this requirement?</p>
        <span className="inline-flex items-center gap-1 rounded-full bg-bg-inset px-2.5 py-0.5 text-xs text-text-muted">
          <Sparkles size={11} className="text-amber-500" aria-hidden="true" /> {signal}
        </span>
      </div>
      <Card key={item.id} {...motionProps}
        className="mx-auto w-full max-w-lg rounded-2xl border border-border-strong bg-bg-elevated shadow-md p-6 text-center flex flex-col gap-2">
        <span className="text-xs uppercase tracking-wider font-semibold text-accent-primary">Engineering Requirement</span>
        <p className="text-base sm:text-lg font-semibold text-text-primary leading-snug" aria-live="polite">{item.prompt?.text}</p>
      </Card>
      <div role="group" aria-label="Bins" className={`grid gap-2.5 ${bins.length > 4 ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-2 sm:grid-cols-4'}`}>
        {bins.map((b, i) => {
          const spec = CONTAINER_SPECS[String(b).toLowerCase()];
          return (
            <button key={b} type="button" data-bin={b} disabled={disabled} onClick={() => drop(b)}
              aria-current={cursor === i ? 'true' : undefined}
              className={`min-h-20 rounded-xl border bg-bg-surface px-3 py-2.5 flex flex-col items-center justify-between gap-1 transition-all focus-visible:ring-2 ring-accent-primary disabled:opacity-60 ${cursor === i ? 'border-accent-primary shadow-cyan bg-bg-elevated' : 'border-border-default hover:border-accent-primary'}`}>
              <div className="flex items-center justify-between w-full">
                <kbd className="inline-flex items-center justify-center w-5 h-5 rounded bg-bg-inset text-xs font-semibold text-text-muted" aria-hidden="true">{i + 1}</kbd>
                {spec && <span className="font-mono text-xs text-accent-primary">{spec.syntax}</span>}
              </div>
              <code className="font-mono text-sm font-bold text-text-primary">{b}</code>
              {spec && <span className="text-xs text-text-muted text-center leading-tight">{spec.traits}</span>}
            </button>
          );
        })}
      </div>
      <p className="text-xs text-text-muted">Arrow keys move, Enter drops, or press the bin number (1–{bins.length}).</p>
    </div>
  );
}
