import { useEffect, useRef, useState, useMemo } from 'react';
import gsap from 'gsap';

const SPEED_MAP = { slow: 3.0, normal: 2.5, fast: 1.5, profile_adaptive: 2.5 };

const KEYWORDS = new Set([
  'for', 'if', 'else', 'elif', 'while', 'def', 'class', 'return',
  'import', 'print', 'in', 'range', 'True', 'False', 'None',
  'from', 'as', 'try', 'except', 'finally', 'with', 'not', 'and', 'or',
  'yield', 'lambda', 'pass', 'break', 'continue', 'del', 'is', 'raise',
  'global', 'nonlocal', 'assert', 'async', 'await',
]);

const BUILTINS = new Set([
  'print', 'len', 'range', 'int', 'str', 'float', 'list', 'dict', 'set',
  'tuple', 'bool', 'type', 'input', 'open', 'map', 'filter', 'zip',
  'enumerate', 'sorted', 'reversed', 'sum', 'min', 'max', 'abs', 'round',
]);

function colorizeLine(line) {
  const parts = [];
  let key = 0;
  const regex = /("""[\s\S]*?"""|'''[\s\S]*?'''|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|\b\d+\.?\d*\b|#.*$|\b\w+\b|[^\w\s]+|\s+)/g;
  let match;
  let afterDef = false;

  while ((match = regex.exec(line)) !== null) {
    const token = match[0];
    if (/^("|')/.test(token) || /^("""|''')/.test(token)) {
      parts.push(<span key={key++} className="text-amber-300">{token}</span>);
    } else if (/^#/.test(token)) {
      parts.push(<span key={key++} className="text-emerald-600/70 italic">{token}</span>);
    } else if (/^\d+\.?\d*$/.test(token)) {
      parts.push(<span key={key++} className="text-orange-300">{token}</span>);
    } else if (token === 'def' || token === 'class') {
      parts.push(<span key={key++} className="text-violet-400 font-semibold">{token}</span>);
      afterDef = true;
    } else if (afterDef && /^\w+$/.test(token)) {
      parts.push(<span key={key++} className="text-yellow-200 font-semibold">{token}</span>);
      afterDef = false;
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

function formatValue(val) {
  if (val === null || val === undefined) return 'None';
  if (typeof val === 'string') return `"${val}"`;
  if (typeof val === 'object') return JSON.stringify(val);
  return String(val);
}

export default function ExecutionVisualizer({
  code = '',
  executionSteps = [],
  speed = 'normal',
  onComplete,
}) {
  const containerRef = useRef(null);
  const onCompleteRef = useRef(onComplete);
  const completedRef = useRef(false);
  const tlRef = useRef(null);
  const [activeStep, setActiveStep] = useState(-1);
  const [outputLines, setOutputLines] = useState([]);

  useEffect(() => { onCompleteRef.current = onComplete; }, [onComplete]);

  const stableSteps = useMemo(
    () => executionSteps,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [JSON.stringify(executionSteps)]
  );

  const lines = code.split('\n');
  const stepDuration = SPEED_MAP[speed] ?? 2.5;
  const totalSteps = stableSteps.length;

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
    if (stableSteps.length === 0) return;
    completedRef.current = false;
    setActiveStep(-1);
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

    stableSteps.forEach((step, idx) => {
      tl.call(
        () => {
          setActiveStep(idx);
          if (step.output) {
            setOutputLines(prev => [...prev, step.output]);
          }
        },
        [],
        idx === 0 ? '>' : `+=${stepDuration}`
      );
    });

    tl.to({}, { duration: stepDuration + 0.5 });

    return () => { tl.kill(); };
  }, [stableSteps, stepDuration]);

  const currentStep = activeStep >= 0 ? stableSteps[activeStep] : null;
  const activeLine = currentStep?.line ?? -1;
  const variables = currentStep?.variables ?? {};
  const description = currentStep?.description ?? '';
  const progress = totalSteps > 0 ? Math.max(((activeStep + 1) / totalSteps) * 100, 0) : 0;

  return (
    <div ref={containerRef} className="rounded-2xl overflow-hidden opacity-0 max-w-4xl font-mono text-sm shadow-2xl shadow-black/20 border border-white/[0.06]">
      {/* Header */}
      <div className="bg-gradient-to-r from-slate-800 via-slate-800 to-slate-700 border-b border-white/[0.06] px-4 py-2.5 flex items-center gap-2">
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-full bg-[#ff5f57] shadow-[0_0_6px_rgba(255,95,87,0.4)]" />
          <span className="w-3 h-3 rounded-full bg-[#febc2e] shadow-[0_0_6px_rgba(254,188,46,0.4)]" />
          <span className="w-3 h-3 rounded-full bg-[#28c840] shadow-[0_0_6px_rgba(40,200,64,0.4)]" />
        </div>
        <span className="ml-3 text-[11px] text-slate-400 tracking-wide">Visual Debugger</span>
        <div className="ml-auto flex items-center gap-3">
          {activeStep >= 0 && activeStep < totalSteps - 1 && (
            <div className="flex items-center gap-1.5">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
              </span>
              <span className="text-[10px] text-red-400 font-medium tracking-wider uppercase">Running</span>
            </div>
          )}
          {totalSteps > 0 && (
            <span className="text-[10px] text-slate-500 tabular-nums">
              Step {Math.max(activeStep + 1, 0)}/{totalSteps}
            </span>
          )}
        </div>
      </div>

      {/* Main content: 2-column layout */}
      <div className="flex bg-[#0d1117]">
        {/* Left: Code display */}
        <div className="flex-1 border-r border-white/[0.06] py-1 min-h-[200px]">
          {lines.map((line, idx) => {
            const lineNum = idx + 1;
            const isActive = lineNum === activeLine;
            return (
              <div
                key={idx}
                className={`flex items-center px-4 py-[5px] transition-all duration-300 relative ${
                  isActive ? 'bg-cyan-500/10' : ''
                }`}
              >
                <div className={`absolute left-0 top-0 bottom-0 w-[3px] transition-all duration-300 ${
                  isActive ? 'bg-gradient-to-b from-cyan-400 to-blue-500 shadow-[0_0_8px_rgba(56,189,248,0.5)]' : 'bg-transparent'
                }`} />
                <span className={`w-5 flex-shrink-0 text-xs select-none mr-1 transition-all duration-300 ${
                  isActive ? 'text-cyan-400' : 'text-transparent'
                }`}>
                  {isActive ? <span className="inline-block animate-[pulse_1s_ease-in-out_infinite]">▶</span> : ''}
                </span>
                <span className={`w-7 text-right select-none mr-4 text-[11px] tabular-nums transition-all duration-300 ${
                  isActive ? 'text-cyan-400 font-medium' : 'text-slate-700'
                }`}>
                  {lineNum}
                </span>
                <span className={`flex-1 transition-all duration-300 leading-relaxed ${
                  isActive ? 'text-slate-100 brightness-110' : 'text-slate-400'
                }`}>
                  {colorizeLine(line) || '\u00A0'}
                </span>
              </div>
            );
          })}
        </div>

        {/* Right: Variables + Description */}
        <div className="w-64 p-4 flex flex-col gap-3">
          {/* Description */}
          {description && (
            <div className="bg-slate-800/50 rounded-lg p-3 border border-white/[0.06]">
              <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">What's happening</p>
              <p className="text-xs text-slate-300 leading-relaxed">{description}</p>
            </div>
          )}

          {/* Variables */}
          <div className="bg-slate-800/50 rounded-lg p-3 border border-white/[0.06]">
            <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-2">Variables</p>
            {Object.keys(variables).length > 0 ? (
              <div className="space-y-1.5">
                {Object.entries(variables).map(([name, value]) => (
                  <div key={name} className="flex items-center justify-between gap-2">
                    <span className="text-xs text-cyan-300 font-medium truncate">{name}</span>
                    <span className="text-xs text-amber-300 bg-amber-500/10 rounded px-1.5 py-0.5 truncate max-w-[120px]">
                      {formatValue(value)}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-slate-600 italic">No variables yet</p>
            )}
          </div>
        </div>
      </div>

      {/* Output terminal */}
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
                background: 'linear-gradient(90deg, #06b6d4, #8b5cf6, #06b6d4)',
                backgroundSize: '200% 100%',
                animation: 'ev-shimmer 2s linear infinite',
              }}
            />
          </div>
          <span className="text-[10px] font-mono text-slate-500 tabular-nums">
            {activeStep >= 0 ? activeStep + 1 : 0}/{totalSteps}
          </span>
        </div>
      )}

      <style>{`
        @keyframes ev-shimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
      `}</style>
    </div>
  );
}
