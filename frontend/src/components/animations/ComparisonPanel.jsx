import { useEffect, useRef, useMemo } from 'react';
import gsap from 'gsap';

export default function ComparisonPanel({
  before = { label: 'Before', code: '' },
  after = { label: 'After', code: '' },
  duration = 3000,
  onComplete,
}) {
  const leftRef = useRef(null);
  const rightRef = useRef(null);

  // Stabilize props to prevent re-render loops
  const stableBefore = useMemo(() => before, [JSON.stringify(before)]);
  const stableAfter = useMemo(() => after, [JSON.stringify(after)]);

  // Ref for onComplete to avoid it being a useEffect dependency
  const onCompleteRef = useRef(onComplete);
  useEffect(() => { onCompleteRef.current = onComplete; }, [onComplete]);

  useEffect(() => {
    if (!leftRef.current || !rightRef.current) return;

    const holdSeconds = Math.max(duration / 1000, 2);

    const tl = gsap.timeline({ onComplete: () => onCompleteRef.current?.() });

    tl.fromTo(
      leftRef.current,
      { opacity: 0, x: -40 },
      { opacity: 1, x: 0, duration: 0.55, ease: 'power2.out' }
    ).fromTo(
      rightRef.current,
      { opacity: 0, x: 40 },
      { opacity: 1, x: 0, duration: 0.55, ease: 'power2.out' },
      '-=0.35'
    );

    // Hold so users can see the result before completing
    tl.to({}, { duration: holdSeconds });

    return () => {
      tl.kill();
    };
  }, [stableBefore, stableAfter, duration]);

  return (
    <div className="grid grid-cols-2 gap-4 max-w-3xl">
      {/* Before */}
      <div
        ref={leftRef}
        className="panel rounded-xl border-l-4 border-red-500 overflow-hidden opacity-0"
      >
        <div className="bg-red-500/10 border-b border-red-500/20 px-4 py-2 flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-red-400" />
          <span className="text-xs font-semibold text-red-600">{stableBefore.label}</span>
        </div>
        <pre className="bg-[#020617] p-4 font-mono text-sm text-slate-300 overflow-x-auto leading-relaxed">
          {stableBefore.code}
        </pre>
      </div>

      {/* After */}
      <div
        ref={rightRef}
        className="panel rounded-xl border-l-4 border-green-500 overflow-hidden opacity-0"
      >
        <div className="bg-green-500/10 border-b border-green-500/20 px-4 py-2 flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-green-400" />
          <span className="text-xs font-semibold text-green-600">{stableAfter.label}</span>
        </div>
        <pre className="bg-[#020617] p-4 font-mono text-sm text-slate-300 overflow-x-auto leading-relaxed">
          {stableAfter.code}
        </pre>
      </div>
    </div>
  );
}
