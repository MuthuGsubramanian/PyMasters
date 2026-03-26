import { useEffect, useRef, useState } from 'react';
import gsap from 'gsap';

const SPEED_MAP = {
  slow: 1.5,
  normal: 1.0,
  fast: 0.6,
  profile_adaptive: 1.0,
};

const KEYWORDS = new Set([
  'for', 'if', 'else', 'elif', 'while', 'def', 'class', 'return',
  'import', 'print', 'in', 'range', 'True', 'False', 'None',
  'from', 'as', 'try', 'except', 'finally', 'with', 'not', 'and', 'or',
]);

function colorizeLine(line) {
  // Comment line
  const commentIdx = line.indexOf('#');
  if (commentIdx === 0) {
    return <span className="text-slate-500 italic">{line}</span>;
  }

  const parts = [];
  let remaining = line;
  let key = 0;

  // Split keeping structure; handle strings, keywords, numbers
  const regex = /("""[\s\S]*?"""|'''[\s\S]*?'''|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|\b\d+\.?\d*\b|#.*$|\b\w+\b|[^\w\s]+|\s+)/g;
  let match;
  while ((match = regex.exec(remaining)) !== null) {
    const token = match[0];

    if (/^("|')/.test(token) || /^("""|''')/.test(token)) {
      parts.push(<span key={key++} className="text-green-400">{token}</span>);
    } else if (/^#/.test(token)) {
      parts.push(<span key={key++} className="text-slate-500 italic">{token}</span>);
    } else if (/^\d+\.?\d*$/.test(token)) {
      parts.push(<span key={key++} className="text-cyan-300">{token}</span>);
    } else if (KEYWORDS.has(token)) {
      parts.push(<span key={key++} className="text-purple-400 font-semibold">{token}</span>);
    } else {
      parts.push(<span key={key++}>{token}</span>);
    }
  }

  return parts.length > 0 ? parts : line;
}

export default function CodeStepper({
  code = '',
  highlightSequence = [],
  speed = 'normal',
  onStep,
  onComplete,
}) {
  const containerRef = useRef(null);
  const [activeLineIndex, setActiveLineIndex] = useState(-1);
  const [visibleLines, setVisibleLines] = useState(new Set());
  const tlRef = useRef(null);

  const lines = code.split('\n');
  const stepDuration = SPEED_MAP[speed] ?? 1.0;

  useEffect(() => {
    if (!containerRef.current) return;

    gsap.fromTo(
      containerRef.current,
      { opacity: 0, x: -30 },
      { opacity: 1, x: 0, duration: 0.5, ease: 'power2.out' }
    );

    // Stagger lines in
    const lineEls = containerRef.current.querySelectorAll('.code-line');
    gsap.fromTo(
      lineEls,
      { opacity: 0, x: -10 },
      { opacity: 1, x: 0, duration: 0.3, stagger: 0.05, ease: 'power2.out', delay: 0.3 }
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
          setVisibleLines((prev) => new Set([...prev, idx]));
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
      <div className="bg-slate-800 border-b border-slate-700 px-4 py-2 flex items-center gap-2">
        <span className="w-3 h-3 rounded-full bg-red-500/80" />
        <span className="w-3 h-3 rounded-full bg-yellow-500/80" />
        <span className="w-3 h-3 rounded-full bg-green-500/80" />
        <span className="ml-2 text-xs text-slate-400">code.py</span>
      </div>

      <div className="bg-[#020617] p-0">
        {lines.map((line, idx) => {
          const lineNum = idx + 1;
          const isActive = lineNum === activeLineNum;

          return (
            <div
              key={idx}
              className={`code-line flex items-center px-4 py-1 transition-all duration-300 ${
                isActive
                  ? 'bg-cyan-500/15 border-l-[3px] border-cyan-400 shadow-[inset_0_0_20px_rgba(34,211,238,0.08)]'
                  : 'border-l-[3px] border-transparent'
              }`}
            >
              {/* Execution pointer */}
              <span className={`w-5 flex-shrink-0 text-xs select-none mr-1 transition-all duration-200 ${
                isActive ? 'text-cyan-400 font-bold text-sm' : 'text-transparent'
              }`}>
                {isActive ? '▶' : ''}
              </span>
              <span className="w-8 text-right text-slate-600 select-none mr-4 text-xs">
                {lineNum}
              </span>
              <span className={`flex-1 transition-colors duration-200 ${isActive ? 'text-cyan-100' : 'text-slate-300'}`}>
                {colorizeLine(line) || '\u00A0'}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
