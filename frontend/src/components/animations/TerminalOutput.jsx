import { useEffect, useRef, useState, useMemo } from 'react';
import gsap from 'gsap';

export default function TerminalOutput({ output = [], syncStep = 0, onComplete }) {
  const containerRef = useRef(null);
  const [visibleLines, setVisibleLines] = useState([]);
  const [typingLine, setTypingLine] = useState(null);
  const [typedText, setTypedText] = useState('');
  const lineRefs = useRef([]);
  const prevStep = useRef(-1);

  const stableOutput = useMemo(() => output, [JSON.stringify(output)]);

  const onCompleteRef = useRef(onComplete);
  useEffect(() => { onCompleteRef.current = onComplete; }, [onComplete]);

  useEffect(() => {
    if (!containerRef.current) return;
    gsap.fromTo(
      containerRef.current,
      { opacity: 0, y: 20, scale: 0.98 },
      { opacity: 1, y: 0, scale: 1, duration: 0.6, ease: 'power3.out' }
    );
  }, []);

  useEffect(() => {
    const lineIndex = syncStep;
    if (lineIndex === prevStep.current) return;
    if (lineIndex < 0 || lineIndex >= stableOutput.length) return;

    prevStep.current = lineIndex;
    const isLast = lineIndex === stableOutput.length - 1;
    const lineText = stableOutput[lineIndex];

    setTypingLine(lineIndex);
    setTypedText('');

    const chars = lineText.split('');
    const charDelay = Math.max(0.02, 0.5 / Math.max(chars.length, 1));

    const tl = gsap.timeline({
      onComplete: () => {
        setTypingLine(null);
        setVisibleLines((prev) => [...prev, lineText]);

        requestAnimationFrame(() => {
          const newLineEl = lineRefs.current[lineIndex];
          if (newLineEl) {
            gsap.fromTo(
              newLineEl,
              { opacity: 0, x: -4 },
              { opacity: 1, x: 0, duration: 0.2, ease: 'power2.out' }
            );
          }
        });

        if (isLast) onCompleteRef.current?.();
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
  }, [syncStep, stableOutput]);

  return (
    <div
      ref={containerRef}
      className="rounded-2xl overflow-hidden opacity-0 max-w-2xl border border-white/[0.06] shadow-2xl shadow-black/20"
    >
      {/* Terminal header */}
      <div className="bg-gradient-to-r from-slate-800 via-slate-800 to-slate-700 border-b border-white/[0.06] px-4 py-2.5 flex items-center gap-2">
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-full bg-[#ff5f57] shadow-[0_0_6px_rgba(255,95,87,0.4)]" />
          <span className="w-3 h-3 rounded-full bg-[#febc2e] shadow-[0_0_6px_rgba(254,188,46,0.4)]" />
          <span className="w-3 h-3 rounded-full bg-[#28c840] shadow-[0_0_6px_rgba(40,200,64,0.4)]" />
        </div>
        <span className="ml-3 text-[11px] text-slate-400 tracking-wide font-mono">python output</span>
        <div className="ml-auto flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
          <span className="text-[10px] text-green-400/80">running</span>
        </div>
      </div>

      <div className="relative bg-[#0d1117] p-4 min-h-[80px] font-mono text-sm">
        {/* CRT scanline effect */}
        <div
          className="absolute inset-0 pointer-events-none opacity-[0.02]"
          style={{
            backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,255,100,0.08) 2px, rgba(0,255,100,0.08) 4px)',
          }}
        />

        {/* Completed lines */}
        {visibleLines.map((line, idx) => (
          <div
            key={idx}
            ref={(el) => (lineRefs.current[idx] = el)}
            className="flex items-start gap-2 mb-1.5 group"
          >
            <span className="text-green-500/60 select-none flex-shrink-0 text-xs mt-0.5">{'>>>'}</span>
            <span className="text-green-300/90 leading-relaxed">{line}</span>
          </div>
        ))}

        {/* Currently typing line with cursor */}
        {typingLine !== null && (
          <div className="flex items-start gap-2 mb-1.5">
            <span className="text-green-500/60 select-none flex-shrink-0 text-xs mt-0.5">{'>>>'}</span>
            <span className="text-green-300/90 leading-relaxed">
              {typedText}
              <span className="inline-block w-[7px] h-[14px] bg-green-400 ml-px rounded-[1px] align-middle shadow-[0_0_8px_rgba(74,222,128,0.6)]"
                style={{ animation: 'blink 1s steps(2) infinite' }}
              />
            </span>
          </div>
        )}

        {/* Idle cursor */}
        {typingLine === null && (
          <div className="flex items-center gap-2 mt-1.5">
            <span className="text-green-500/60 select-none text-xs">{'>>>'}</span>
            <span className="inline-block w-[7px] h-[14px] bg-green-400 rounded-[1px] shadow-[0_0_8px_rgba(74,222,128,0.6)]"
              style={{ animation: 'blink 1s steps(2) infinite' }}
            />
          </div>
        )}
      </div>

      <style>{`
        @keyframes blink {
          0%, 49% { opacity: 1; }
          50%, 100% { opacity: 0; }
        }
      `}</style>
    </div>
  );
}
