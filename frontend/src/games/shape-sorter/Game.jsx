import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Boxes } from 'lucide-react';
import { shortcutsBlocked } from '../engine/keys';

/**
 * Shape Sorter: a requirement card is dealt; drop it into the right bin. Tap a bin, use
 * arrow keys + Enter, or press the bin's number. Answers the bin label.
 */
export default function Game({ item, onAnswer, disabled, reducedMotion }) {
  const bins = item?.choices || [];
  const [cursor, setCursor] = useState(0);
  const answered = useRef(false);

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
      <p className="text-sm text-text-secondary"><Boxes size={14} className="inline mr-1" aria-hidden="true" /> Which container (or operation) fits this requirement?</p>
      <Card key={item.id} {...motionProps}
        className="mx-auto w-full max-w-md rounded-2xl border border-border-strong bg-bg-elevated shadow-md p-6 text-center">
        <p className="text-base sm:text-lg font-semibold text-text-primary leading-snug" aria-live="polite">{item.prompt?.text}</p>
      </Card>
      <div role="group" aria-label="Bins" className={`grid gap-2 ${bins.length > 4 ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-2 sm:grid-cols-4'}`}>
        {bins.map((b, i) => (
          <button key={b} type="button" data-bin={b} disabled={disabled} onClick={() => drop(b)}
            aria-current={cursor === i ? 'true' : undefined}
            className={`min-h-14 rounded-xl border bg-bg-surface px-3 py-2 flex flex-col items-center justify-center gap-1 focus-visible:ring-2 ring-accent-primary disabled:opacity-60 ${cursor === i ? 'border-accent-primary shadow-cyan' : 'border-border-default hover:border-accent-primary'}`}>
            <code className="font-mono text-sm text-text-primary">{b}</code>
            <kbd className="text-[10px] text-text-muted" aria-hidden="true">{i + 1}</kbd>
          </button>
        ))}
      </div>
      <p className="text-xs text-text-muted">Arrow keys move, Enter drops, or press the bin number.</p>
    </div>
  );
}
