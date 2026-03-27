import { useEffect, useRef, useState, useMemo } from 'react';
import gsap from 'gsap';

const SPEED_MAP = { slow: 2.5, normal: 1.8, fast: 1.0, profile_adaptive: 1.8 };

const KEYWORDS = new Set([
  'for', 'if', 'else', 'elif', 'while', 'def', 'class', 'return',
  'import', 'print', 'in', 'range', 'True', 'False', 'None',
  'from', 'as', 'try', 'except', 'finally', 'with', 'not', 'and', 'or',
  'yield', 'lambda', 'pass', 'break', 'continue',
]);

const BUILTINS = new Set([
  'print', 'len', 'range', 'int', 'str', 'float', 'list', 'dict', 'set',
  'tuple', 'bool', 'type', 'input', 'enumerate', 'sorted', 'sum', 'min', 'max',
]);

function colorizeLine(line) {
  const parts = [];
  let key = 0;
  const regex = /("""[\s\S]*?"""|'''[\s\S]*?'''|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|\b\d+\.?\d*\b|#.*$|\b\w+\b|[^\w\s]+|\s+)/g;
  let match;

  while ((match = regex.exec(line)) !== null) {
    const token = match[0];
    if (/^("|')/.test(token)) {
      parts.push(<span key={key++} className="text-amber-300">{token}</span>);
    } else if (/^#/.test(token)) {
      parts.push(<span key={key++} className="text-emerald-600/70 italic">{token}</span>);
    } else if (/^\d+\.?\d*$/.test(token)) {
      parts.push(<span key={key++} className="text-orange-300">{token}</span>);
    } else if (KEYWORDS.has(token)) {
      parts.push(<span key={key++} className="text-violet-400 font-semibold">{token}</span>);
    } else if (BUILTINS.has(token)) {
      parts.push(<span key={key++} className="text-cyan-300">{token}</span>);
    } else if (/^[=+\-*/<>!%&|^~]+$/.test(token)) {
      parts.push(<span key={key++} className="text-sky-300">{token}</span>);
    } else if (/^[()\[\]{}:,.]$/.test(token)) {
      parts.push(<span key={key++} className="text-slate-500">{token}</span>);
    } else if (/^\s+$/.test(token)) {
      parts.push(<span key={key++}>{token}</span>);
    } else {
      parts.push(<span key={key++} className="text-slate-200">{token}</span>);
    }
  }
  return parts.length > 0 ? parts : line;
}

function buildRangeCollection(start, end, step) {
  const items = [];
  if (step > 0) {
    for (let i = start; i < end; i += step) items.push(i);
  } else if (step < 0) {
    for (let i = start; i > end; i += step) items.push(i);
  }
  return items;
}

const LOOP_THEMES = {
  for: { accent: '#06b6d4', label: 'FOR LOOP', icon: '🔄' },
  while: { accent: '#f59e0b', label: 'WHILE LOOP', icon: '⚡' },
  for_range: { accent: '#8b5cf6', label: 'FOR RANGE', icon: '🔢' },
};

export default function LoopVisualizer({
  loopType = 'for',
  collection = [],
  variable = 'item',
  rangeStart = 0,
  rangeEnd = 5,
  rangeStep = 1,
  iterations = [],
  code = '',
  speed = 'normal',
  onComplete,
}) {
  const containerRef = useRef(null);
  const onCompleteRef = useRef(onComplete);
  const completedRef = useRef(false);
  const tlRef = useRef(null);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [outputLines, setOutputLines] = useState([]);

  useEffect(() => { onCompleteRef.current = onComplete; }, [onComplete]);

  // Build the items to iterate over
  const items = useMemo(() => {
    if (loopType === 'for_range' || (loopType === 'for' && collection.length === 0)) {
      return buildRangeCollection(rangeStart, rangeEnd, rangeStep || 1);
    }
    return collection;
  }, [loopType, collection, rangeStart, rangeEnd, rangeStep]);

  const stableIterations = useMemo(
    () => iterations,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [JSON.stringify(iterations)]
  );

  const stepDuration = SPEED_MAP[speed] ?? 1.8;
  const totalSteps = stableIterations.length > 0 ? stableIterations.length : items.length;
  const theme = LOOP_THEMES[loopType] || LOOP_THEMES.for;

  // Container fade-in
  useEffect(() => {
    if (!containerRef.current) return;
    gsap.fromTo(containerRef.current,
      { opacity: 0, y: 20 },
      { opacity: 1, y: 0, duration: 0.6, ease: 'power3.out' }
    );
  }, []);

  // Auto-play timeline
  useEffect(() => {
    const stepCount = stableIterations.length > 0 ? stableIterations.length : items.length;
    if (stepCount === 0) return;
    completedRef.current = false;
    setActiveIndex(-1);
    setOutputLines([]);

    if (tlRef.current) tlRef.current.kill();

    const tl = gsap.timeline({
      onComplete: () => {
        if (!completedRef.current) {
          completedRef.current = true;
          onCompleteRef.current?.();
        }
      },
    });
    tlRef.current = tl;

    tl.to({}, { duration: 0.8 });

    for (let idx = 0; idx < stepCount; idx++) {
      tl.call(
        () => {
          setActiveIndex(idx);
          const iter = stableIterations[idx];
          if (iter?.output) {
            setOutputLines(prev => [...prev, iter.output]);
          }
        },
        [],
        idx === 0 ? '>' : `+=${stepDuration}`
      );
    }

    tl.to({}, { duration: stepDuration + 0.5 });

    return () => { tl.kill(); };
  }, [stableIterations, items, stepDuration]);

  const currentIter = activeIndex >= 0 ? stableIterations[activeIndex] : null;
  const currentValue = currentIter?.value ?? (activeIndex >= 0 ? items[activeIndex] : undefined);
  const progress = totalSteps > 0 ? Math.max(((activeIndex + 1) / totalSteps) * 100, 0) : 0;

  return (
    <div ref={containerRef} className="rounded-2xl overflow-hidden opacity-0 max-w-2xl font-mono text-sm shadow-2xl shadow-black/20 border border-white/[0.06]">
      {/* Header */}
      <div className="bg-gradient-to-r from-slate-800 via-slate-800 to-slate-700 border-b border-white/[0.06] px-4 py-2.5 flex items-center gap-2">
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-full bg-[#ff5f57] shadow-[0_0_6px_rgba(255,95,87,0.4)]" />
          <span className="w-3 h-3 rounded-full bg-[#febc2e] shadow-[0_0_6px_rgba(254,188,46,0.4)]" />
          <span className="w-3 h-3 rounded-full bg-[#28c840] shadow-[0_0_6px_rgba(40,200,64,0.4)]" />
        </div>
        <span className="ml-3 text-[11px] tracking-wide" style={{ color: theme.accent }}>
          {theme.icon} {theme.label}
        </span>
        {totalSteps > 0 && (
          <span className="ml-auto text-[10px] text-slate-500 tabular-nums">
            Iteration {Math.max(activeIndex + 1, 0)}/{totalSteps}
          </span>
        )}
      </div>

      {/* Code display */}
      {code && (
        <div className="bg-[#0d1117] border-b border-white/[0.06] py-2 px-4">
          {code.split('\n').map((line, idx) => (
            <div key={idx} className="flex items-center py-[3px]">
              <span className="w-6 text-right select-none mr-3 text-[11px] text-slate-700 tabular-nums">{idx + 1}</span>
              <span className="text-slate-300 leading-relaxed">{colorizeLine(line) || '\u00A0'}</span>
            </div>
          ))}
        </div>
      )}

      {/* Collection items row */}
      <div className="bg-[#0d1117] px-4 py-4">
        <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-3">Collection</p>
        <div className="flex flex-wrap gap-2">
          {items.map((item, idx) => {
            const isActive = idx === activeIndex;
            const isPast = activeIndex >= 0 && idx < activeIndex;
            return (
              <div
                key={idx}
                className={`relative flex items-center justify-center min-w-[44px] h-11 px-3 rounded-lg border text-xs font-medium transition-all duration-300 ${
                  isActive
                    ? 'bg-cyan-500/15 border-cyan-400/60 text-cyan-100 scale-110 shadow-[0_0_16px_rgba(56,189,248,0.3)]'
                    : isPast
                    ? 'bg-green-500/10 border-green-500/30 text-green-400'
                    : 'bg-slate-800/40 border-white/[0.06] text-slate-500'
                }`}
              >
                {isPast && (
                  <span className="absolute -top-1 -right-1 text-[10px] text-green-400">✓</span>
                )}
                {typeof item === 'string' ? `"${item}"` : String(item)}
              </div>
            );
          })}
        </div>
      </div>

      {/* Variable display */}
      <div className="bg-[#0a0e14] border-t border-white/[0.06] px-4 py-3 flex items-center gap-4">
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-slate-500 uppercase tracking-wider">Variable</span>
          <span className="text-xs text-cyan-300 font-medium">{variable}</span>
          <span className="text-slate-600">=</span>
          <span className={`text-xs px-2 py-1 rounded transition-all duration-300 ${
            activeIndex >= 0
              ? 'text-amber-300 bg-amber-500/10 border border-amber-500/20'
              : 'text-slate-600 bg-slate-800/40 border border-white/[0.06]'
          }`}>
            {currentValue !== undefined
              ? (typeof currentValue === 'string' ? `"${currentValue}"` : String(currentValue))
              : '—'
            }
          </span>
        </div>
        {currentIter?.description && (
          <span className="text-xs text-slate-400 ml-auto">{currentIter.description}</span>
        )}
      </div>

      {/* Output */}
      {outputLines.length > 0 && (
        <div className="bg-[#0a0e14] border-t border-white/[0.06] px-4 py-3">
          <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-1.5">Output</p>
          <div className="space-y-0.5 max-h-32 overflow-y-auto">
            {outputLines.map((line, idx) => (
              <div key={idx} className="text-xs text-green-400 font-mono">
                <span className="text-green-600 mr-2">{'>'}</span>{line}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Progress bar */}
      {totalSteps > 0 && (
        <div className="bg-slate-900 border-t border-white/[0.06] px-4 py-2.5 flex items-center gap-3">
          <div className="flex-1 h-1 bg-slate-700/50 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-700 ease-out"
              style={{
                width: `${progress}%`,
                background: `linear-gradient(90deg, ${theme.accent}, #8b5cf6, ${theme.accent})`,
                backgroundSize: '200% 100%',
                animation: 'lv-shimmer 2s linear infinite',
              }}
            />
          </div>
          <span className="text-[10px] font-mono text-slate-500 tabular-nums">
            {activeIndex >= 0 ? activeIndex + 1 : 0}/{totalSteps}
          </span>
        </div>
      )}

      <style>{`
        @keyframes lv-shimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
      `}</style>
    </div>
  );
}
