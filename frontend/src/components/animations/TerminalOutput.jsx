import { useEffect, useRef, useState } from 'react';
import gsap from 'gsap';

export default function TerminalOutput({ output = [], syncStep = 0, onComplete }) {
  const containerRef = useRef(null);
  const [visibleLines, setVisibleLines] = useState([]);
  const [typingLine, setTypingLine] = useState(null);
  const [typedText, setTypedText] = useState('');
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
    const lineText = output[lineIndex];

    // Typing effect for each line
    setTypingLine(lineIndex);
    setTypedText('');

    const chars = lineText.split('');
    const charDelay = Math.max(0.02, 0.5 / Math.max(chars.length, 1));

    const tl = gsap.timeline({
      onComplete: () => {
        setTypingLine(null);
        setVisibleLines((prev) => [...prev, lineText]);

        // Animate the completed line
        requestAnimationFrame(() => {
          const newLineEl = lineRefs.current[lineIndex];
          if (newLineEl) {
            gsap.fromTo(
              newLineEl,
              { opacity: 0 },
              { opacity: 1, duration: 0.15, ease: 'power2.out' }
            );
          }
        });

        if (isLast) onComplete?.();
      },
    });

    tl.to({}, {
      duration: chars.length * charDelay,
      ease: 'none',
      onUpdate: function () {
        const progress = this.progress();
        const charIndex = Math.floor(progress * chars.length);
        setTypedText(chars.slice(0, charIndex).join(''));
      },
      onComplete: () => {
        setTypedText(lineText);
      },
    });

    return () => {
      tl.kill();
    };
  }, [syncStep, output]);

  return (
    <div
      ref={containerRef}
      className="rounded-xl overflow-hidden opacity-0 max-w-2xl border border-slate-700"
    >
      {/* Terminal header */}
      <div className="bg-slate-800 border-b border-slate-700 px-4 py-2 flex items-center gap-2">
        <span className="w-2.5 h-2.5 rounded-full bg-red-500/80" />
        <span className="w-2.5 h-2.5 rounded-full bg-yellow-500/80" />
        <span className="w-2.5 h-2.5 rounded-full bg-green-500/80" />
        <span className="ml-2 text-xs text-slate-400 font-mono">terminal</span>
      </div>

      <div className="relative bg-[#0a0f1a] p-4 min-h-[80px] font-mono text-sm">
        {/* Scanline overlay */}
        <div
          className="absolute inset-0 pointer-events-none opacity-[0.03]"
          style={{
            backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,255,0,0.15) 2px, rgba(0,255,0,0.15) 4px)',
          }}
        />

        {/* Completed lines */}
        {visibleLines.map((line, idx) => (
          <div
            key={idx}
            ref={(el) => (lineRefs.current[idx] = el)}
            className="flex items-start gap-2 mb-1"
          >
            <span className="text-green-500 select-none flex-shrink-0">$</span>
            <span className="text-green-300">{line}</span>
          </div>
        ))}

        {/* Currently typing line */}
        {typingLine !== null && (
          <div className="flex items-start gap-2 mb-1">
            <span className="text-green-500 select-none flex-shrink-0">$</span>
            <span className="text-green-300">
              {typedText}
              <span className="inline-block w-2 h-4 bg-green-400 ml-px animate-pulse rounded-sm align-middle" />
            </span>
          </div>
        )}

        {/* Blinking cursor on idle */}
        {typingLine === null && (
          <div className="flex items-center gap-2 mt-1">
            <span className="text-green-500 select-none">$</span>
            <span className="inline-block w-2 h-4 bg-green-400 animate-[blink_1s_steps(2)_infinite] rounded-sm" />
          </div>
        )}
      </div>
    </div>
  );
}
