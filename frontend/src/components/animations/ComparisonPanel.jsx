import { useEffect, useRef, useMemo } from 'react';
import gsap from 'gsap';

export default function ComparisonPanel({
  before = { label: 'Before', code: '' },
  after = { label: 'After', code: '' },
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

  return (
    <div ref={containerRef} className="relative grid grid-cols-2 gap-6 max-w-3xl">
      {/* VS badge */}
      <div ref={vsRef} className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-10 opacity-0">
        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500 to-cyan-500 flex items-center justify-center text-white text-xs font-black shadow-lg shadow-purple-500/30">
          VS
        </div>
      </div>

      {/* Before */}
      <div
        ref={leftRef}
        className="rounded-2xl overflow-hidden border border-red-500/20 shadow-lg shadow-red-500/5 opacity-0"
        style={{ background: 'linear-gradient(135deg, rgba(239,68,68,0.05), transparent)' }}
      >
        <div className="border-b border-red-500/15 px-4 py-2.5 flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-red-400 shadow-[0_0_6px_rgba(248,113,113,0.5)]" />
          <span className="text-xs font-bold text-red-400 uppercase tracking-wider">{stableBefore.label}</span>
        </div>
        <pre className="bg-[#0d1117] p-4 font-mono text-sm text-slate-300 overflow-x-auto leading-relaxed min-h-[80px]">
          {stableBefore.code}
        </pre>
      </div>

      {/* After */}
      <div
        ref={rightRef}
        className="rounded-2xl overflow-hidden border border-green-500/20 shadow-lg shadow-green-500/5 opacity-0"
        style={{ background: 'linear-gradient(135deg, rgba(34,197,94,0.05), transparent)' }}
      >
        <div className="border-b border-green-500/15 px-4 py-2.5 flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-green-400 shadow-[0_0_6px_rgba(74,222,128,0.5)]" />
          <span className="text-xs font-bold text-green-400 uppercase tracking-wider">{stableAfter.label}</span>
        </div>
        <pre className="bg-[#0d1117] p-4 font-mono text-sm text-slate-300 overflow-x-auto leading-relaxed min-h-[80px]">
          {stableAfter.code}
        </pre>
      </div>
    </div>
  );
}
