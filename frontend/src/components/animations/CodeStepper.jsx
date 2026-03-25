import { useEffect, useRef, useState } from 'react';
import gsap from 'gsap';

const SPEED_MAP = {
  slow: 1.5,
  normal: 1.0,
  fast: 0.6,
  profile_adaptive: 1.0,
};

export default function CodeStepper({
  code = '',
  highlightSequence = [],
  speed = 'normal',
  onStep,
  onComplete,
}) {
  const containerRef = useRef(null);
  const [activeLineIndex, setActiveLineIndex] = useState(-1);
  const tlRef = useRef(null);

  const lines = code.split('\n');
  const stepDuration = SPEED_MAP[speed] ?? 1.0;

  useEffect(() => {
    if (!containerRef.current) return;

    // Slide in from left
    gsap.fromTo(
      containerRef.current,
      { opacity: 0, x: -30 },
      { opacity: 1, x: 0, duration: 0.5, ease: 'power2.out' }
    );
  }, []);

  useEffect(() => {
    if (highlightSequence.length === 0) return;

    if (tlRef.current) tlRef.current.kill();

    const tl = gsap.timeline({
      onComplete: () => {
        onComplete?.();
      },
    });
    tlRef.current = tl;

    highlightSequence.forEach((lineNum, idx) => {
      tl.call(
        () => {
          setActiveLineIndex(idx);
          onStep?.(idx, lineNum);
        },
        [],
        idx === 0 ? 0.3 : `+=${stepDuration}`
      );
    });

    // Hold on last step before completing
    tl.to({}, { duration: stepDuration });

    return () => {
      tl.kill();
    };
  }, [highlightSequence, stepDuration]);

  const activeLineNum = highlightSequence[activeLineIndex] ?? -1;

  return (
    <div
      ref={containerRef}
      className="panel rounded-xl overflow-hidden opacity-0 max-w-2xl font-mono text-sm"
    >
      {/* Header bar */}
      <div className="bg-white/5 border-b border-white/10 px-4 py-2 flex items-center gap-2">
        <span className="w-3 h-3 rounded-full bg-red-500/60" />
        <span className="w-3 h-3 rounded-full bg-yellow-500/60" />
        <span className="w-3 h-3 rounded-full bg-green-500/60" />
        <span className="ml-2 text-xs text-slate-500">code.py</span>
      </div>

      <div className="bg-[#020617] p-0">
        {lines.map((line, idx) => {
          // line numbers are 1-based
          const lineNum = idx + 1;
          const isActive = lineNum === activeLineNum;

          return (
            <div
              key={idx}
              className={`flex items-center px-4 py-1 transition-colors duration-200 ${
                isActive
                  ? 'bg-cyan-500/15 border-l-2 border-cyan-400'
                  : 'border-l-2 border-transparent'
              }`}
            >
              <span className="w-8 text-right text-slate-600 select-none mr-4 text-xs">
                {lineNum}
              </span>
              <span className={`flex-1 ${isActive ? 'text-cyan-100' : 'text-slate-300'}`}>
                {line || '\u00A0'}
              </span>
              {isActive && (
                <span className="ml-1 inline-block w-2 h-4 bg-cyan-400 animate-pulse rounded-sm" />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
