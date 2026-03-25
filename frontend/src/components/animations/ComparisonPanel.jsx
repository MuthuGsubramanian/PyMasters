import { useEffect, useRef } from 'react';
import gsap from 'gsap';

export default function ComparisonPanel({
  before = { label: 'Before', code: '' },
  after = { label: 'After', code: '' },
  onComplete,
}) {
  const leftRef = useRef(null);
  const rightRef = useRef(null);

  useEffect(() => {
    if (!leftRef.current || !rightRef.current) return;

    const tl = gsap.timeline({ onComplete: () => onComplete?.() });

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

    return () => {
      tl.kill();
    };
  }, []);

  return (
    <div className="grid grid-cols-2 gap-4 max-w-3xl">
      {/* Before */}
      <div
        ref={leftRef}
        className="panel rounded-xl border-l-4 border-red-500 overflow-hidden opacity-0"
      >
        <div className="bg-red-500/10 border-b border-red-500/20 px-4 py-2 flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-red-400" />
          <span className="text-xs font-semibold text-red-400">{before.label}</span>
        </div>
        <pre className="bg-[#020617] p-4 font-mono text-sm text-slate-300 overflow-x-auto leading-relaxed">
          {before.code}
        </pre>
      </div>

      {/* After */}
      <div
        ref={rightRef}
        className="panel rounded-xl border-l-4 border-green-500 overflow-hidden opacity-0"
      >
        <div className="bg-green-500/10 border-b border-green-500/20 px-4 py-2 flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-green-400" />
          <span className="text-xs font-semibold text-green-400">{after.label}</span>
        </div>
        <pre className="bg-[#020617] p-4 font-mono text-sm text-slate-300 overflow-x-auto leading-relaxed">
          {after.code}
        </pre>
      </div>
    </div>
  );
}
