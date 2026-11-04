import { useEffect, useRef, useMemo } from 'react';
import gsap from 'gsap';

// Python spellings for booleans; everything else as authored.
const pyValue = (v) => (v === true ? 'True' : v === false ? 'False' : String(v));

function Side({ side, innerRef, ba, kind }) {
  const hasCode = side.code != null && side.code !== '';
  const hasResult = side.result != null;
  const theme = !ba
    ? { box: 'border-border-default bg-bg-surface', head: 'border-border-default', dot: 'bg-accent-primary', label: 'text-accent-primary' }
    : kind === 'before'
      ? { box: 'border-red-500/20 shadow-lg shadow-red-500/5', head: 'border-red-500/15', dot: 'bg-red-400', label: 'text-red-400' }
      : { box: 'border-green-500/20 shadow-lg shadow-green-500/5', head: 'border-green-500/15', dot: 'bg-green-400', label: 'text-green-400' };
  return (
    <div ref={innerRef} className={`rounded-2xl overflow-hidden border opacity-0 ${theme.box}`}>
      <div className={`border-b px-4 py-2.5 flex items-start gap-2 ${theme.head}`}>
        <span className={`w-2.5 h-2.5 mt-1 rounded-full shrink-0 ${theme.dot}`} />
        <span className={`text-xs font-bold tracking-wide ${theme.label}`}>{side.label}</span>
      </div>
      {hasCode && (
        <pre className="bg-[#0d1117] p-4 font-mono text-sm text-slate-300 overflow-x-auto leading-relaxed whitespace-pre min-h-[80px]">
          {side.code}
        </pre>
      )}
      {hasResult && hasCode && (
        <div data-result className="bg-[#0d1117] px-4 pb-4 font-mono text-sm text-emerald-300">{`→ ${pyValue(side.result)}`}</div>
      )}
      {hasResult && !hasCode && (
        <div data-result className="px-4 py-6 font-mono text-3xl font-bold text-text-primary">{pyValue(side.result)}</div>
      )}
    </div>
  );
}

export default function ComparisonPanel({
  before = { label: 'Before', code: '' },
  after = { label: 'After', code: '' },
  tone = 'neutral',
  duration = 3000,
  onComplete,
}) {
  const containerRef = useRef(null);
  const leftRef = useRef(null);
  const rightRef = useRef(null);
  const vsRef = useRef(null);

  const stableBefore = useMemo(() => before, [JSON.stringify(before)]);
  const stableAfter = useMemo(() => after, [JSON.stringify(after)]);

  const onCompleteRef = useRef(onComplete);
  useEffect(() => { onCompleteRef.current = onComplete; }, [onComplete]);

  useEffect(() => {
    if (!leftRef.current || !rightRef.current) return;

    const holdSeconds = Math.max(duration / 1000, 2);

    const tl = gsap.timeline({ onComplete: () => onCompleteRef.current?.() });

    // Slide in from sides with a slight rotation
    tl.fromTo(leftRef.current,
      { opacity: 0, x: -50, rotateY: 5 },
      { opacity: 1, x: 0, rotateY: 0, duration: 0.6, ease: 'power3.out' }
    );

    // VS badge pops in
    if (vsRef.current) {
      tl.fromTo(vsRef.current,
        { opacity: 0, scale: 0 },
        { opacity: 1, scale: 1, duration: 0.4, ease: 'back.out(2)' },
        0.3
      );
    }

    tl.fromTo(rightRef.current,
      { opacity: 0, x: 50, rotateY: -5 },
      { opacity: 1, x: 0, rotateY: 0, duration: 0.6, ease: 'power3.out' },
      0.15
    );

    tl.to({}, { duration: holdSeconds });

    return () => { tl.kill(); };
  }, [stableBefore, stableAfter, duration]);

  const ba = tone === 'before_after';
  return (
    <div ref={containerRef} data-tone={ba ? 'before_after' : 'neutral'} className="relative grid grid-cols-2 gap-6 max-w-3xl">
      {/* VS badge */}
      <div ref={vsRef} className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-10 opacity-0">
        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500 to-cyan-500 flex items-center justify-center text-white text-xs font-black shadow-lg shadow-purple-500/30">
          VS
        </div>
      </div>
      <Side side={stableBefore} innerRef={leftRef} ba={ba} kind="before" />
      <Side side={stableAfter} innerRef={rightRef} ba={ba} kind="after" />
    </div>
  );
}
