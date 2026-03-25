import { useEffect, useRef, useState } from 'react';
import gsap from 'gsap';

export default function TerminalOutput({ output = [], syncStep = 0, onComplete }) {
  const containerRef = useRef(null);
  const [visibleLines, setVisibleLines] = useState([]);
  const lineRefs = useRef([]);
  const prevStep = useRef(-1);

  useEffect(() => {
    if (!containerRef.current) return;

    gsap.fromTo(
      containerRef.current,
      { opacity: 0, y: 20 },
      { opacity: 1, y: 0, duration: 0.5, ease: 'power2.out' }
    );
  }, []);

  useEffect(() => {
    const lineIndex = syncStep;
    if (lineIndex === prevStep.current) return;
    if (lineIndex < 0 || lineIndex >= output.length) return;

    prevStep.current = lineIndex;
    const isLast = lineIndex === output.length - 1;

    setVisibleLines((prev) => {
      const next = [...prev, output[lineIndex]];
      return next;
    });

    // Animate the new line in after state update
    requestAnimationFrame(() => {
      const newLineEl = lineRefs.current[lineIndex];
      if (newLineEl) {
        gsap.fromTo(
          newLineEl,
          { opacity: 0, x: -10 },
          {
            opacity: 1,
            x: 0,
            duration: 0.3,
            ease: 'power2.out',
            onComplete: () => {
              if (isLast) onComplete?.();
            },
          }
        );
      } else if (isLast) {
        onComplete?.();
      }
    });
  }, [syncStep, output]);

  return (
    <div
      ref={containerRef}
      className="panel rounded-xl overflow-hidden opacity-0 max-w-2xl"
    >
      {/* Terminal header */}
      <div className="bg-white/5 border-b border-white/10 px-4 py-2 flex items-center gap-2">
        <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
        <span className="text-xs text-slate-500 font-mono">terminal</span>
      </div>

      <div className="bg-[#020617] p-4 min-h-[80px] font-mono text-sm">
        {visibleLines.map((line, idx) => (
          <div
            key={idx}
            ref={(el) => (lineRefs.current[idx] = el)}
            className="flex items-start gap-2 mb-1"
          >
            <span className="text-green-500 select-none flex-shrink-0">&gt;</span>
            <span className="text-green-300">{line}</span>
          </div>
        ))}

        {/* Blinking cursor on last line */}
        <div className="flex items-center gap-2 mt-1">
          <span className="text-green-500 select-none">&gt;</span>
          <span className="inline-block w-2 h-4 bg-green-400 animate-pulse rounded-sm" />
        </div>
      </div>
    </div>
  );
}
