import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import gsap from 'gsap';

const SPEED_MAP = {
  slow: 3.0,
  normal: 2.5,
  fast: 1.5,
  profile_adaptive: 2.5,
};

const KEYWORDS = new Set([
  'for', 'if', 'else', 'elif', 'while', 'def', 'class', 'return',
  'import', 'print', 'in', 'range', 'True', 'False', 'None',
  'from', 'as', 'try', 'except', 'finally', 'with', 'not', 'and', 'or',
]);

function colorizeLine(line) {
  const commentIdx = line.indexOf('#');
  if (commentIdx === 0) {
    return <span className="text-slate-500 italic">{line}</span>;
  }

  const parts = [];
  let key = 0;
  const regex = /("""[\s\S]*?"""|'''[\s\S]*?'''|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|\b\d+\.?\d*\b|#.*$|\b\w+\b|[^\w\s]+|\s+)/g;
  let match;
  while ((match = regex.exec(line)) !== null) {
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

function autoDescribe(line) {
  const trimmed = line.trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('#')) return `Comment: ${trimmed.slice(1).trim()}`;
  if (trimmed.startsWith('print(')) {
    const arg = trimmed.match(/print\((.+)\)/)?.[1] || '';
    return `Output: print(${arg})`;
  }
  if (trimmed.startsWith('if ') || trimmed.startsWith('elif ')) {
    const cond = trimmed.match(/(?:if|elif)\s+(.+):/)?.[1] || '';
    return `Checking: ${cond}`;
  }
  if (trimmed.startsWith('else:')) return 'No previous conditions matched — entering else branch';
  if (trimmed.startsWith('for ')) {
    const loop = trimmed.match(/for\s+(.+):/)?.[1] || '';
    return `Loop: for ${loop}`;
  }
  if (trimmed.startsWith('while ')) {
    const cond = trimmed.match(/while\s+(.+):/)?.[1] || '';
    return `Loop while: ${cond}`;
  }
  if (trimmed.startsWith('def ')) {
    const name = trimmed.match(/def\s+(\w+)/)?.[1] || '';
    return `Defining function: ${name}()`;
  }
  if (trimmed.startsWith('return ')) {
    return `Returning: ${trimmed.slice(7)}`;
  }
  if (trimmed.includes('=') && !trimmed.includes('==')) {
    const parts = trimmed.split('=');
    return `Assign: ${parts[0].trim()} = ${parts.slice(1).join('=').trim()}`;
  }
  return `Execute: ${trimmed}`;
}

export default function CodeStepper({
  code = '',
  highlightSequence = [],
  speed = 'normal',
  stepDescriptions = [],
  onStep,
  onComplete,
}) {
  const containerRef = useRef(null);
  const traceRef = useRef(null);
  const [activeStepIndex, setActiveStepIndex] = useState(-1);
  const tlRef = useRef(null);
  const completedRef = useRef(false);
  const onCompleteRef = useRef(onComplete);
  const onStepRef = useRef(onStep);

  // Keep refs current without triggering re-renders
  useEffect(() => { onCompleteRef.current = onComplete; }, [onComplete]);
  useEffect(() => { onStepRef.current = onStep; }, [onStep]);

  const lines = code.split('\n');
  const stepDuration = SPEED_MAP[speed] ?? 2.5;
  const totalSteps = highlightSequence.length;

  // Stabilize highlightSequence to prevent effect re-firing
  const stableSequence = useMemo(
    () => highlightSequence,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [JSON.stringify(highlightSequence)]
  );

  // Build descriptions once
  const descriptions = useMemo(() => {
    return stableSequence.map((lineNum, idx) => {
      if (stepDescriptions[idx] && (stepDescriptions[idx].description || stepDescriptions[idx].explanation)) {
        const desc = stepDescriptions[idx];
        return {
          description: desc.description || desc.explanation || autoDescribe(lines[lineNum - 1] || ''),
          output: desc.output || null,
        };
      }
      return {
        description: autoDescribe(lines[lineNum - 1] || ''),
        output: null,
      };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stableSequence, code]);

  // Animate container in on mount
  useEffect(() => {
    if (!containerRef.current) return;
    gsap.fromTo(
      containerRef.current,
      { opacity: 0, x: -30 },
      { opacity: 1, x: 0, duration: 0.5, ease: 'power2.out' }
    );
  }, []);

  // Auto-play timeline — runs ONCE when stableSequence is set
  useEffect(() => {
    if (stableSequence.length === 0) return;
    completedRef.current = false;

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

    // Initial delay
    tl.to({}, { duration: 0.8 });

    stableSequence.forEach((lineNum, idx) => {
      tl.call(
        () => {
          setActiveStepIndex(idx);
          onStepRef.current?.(idx, lineNum);
        },
        [],
        idx === 0 ? '>' : `+=${stepDuration}`
      );
    });

    // Hold on last step before completing
    tl.to({}, { duration: stepDuration + 0.5 });

    return () => {
      tl.kill();
    };
    // Only depend on stable values — NOT on callbacks
  }, [stableSequence, stepDuration]);

  const activeLineNum = stableSequence[activeStepIndex] ?? -1;
  const currentDesc = activeStepIndex >= 0 ? descriptions[activeStepIndex] : null;

  return (
    <div ref={containerRef} className="panel rounded-xl overflow-hidden opacity-0 max-w-2xl font-mono text-sm">
      {/* Header */}
      <div className="bg-slate-800 border-b border-slate-700 px-4 py-2 flex items-center gap-2">
        <span className="w-3 h-3 rounded-full bg-red-500/80" />
        <span className="w-3 h-3 rounded-full bg-yellow-500/80" />
        <span className="w-3 h-3 rounded-full bg-green-500/80" />
        <span className="ml-2 text-xs text-slate-400">code.py</span>
        {totalSteps > 0 && (
          <span className="ml-auto text-xs text-slate-400">
            Step {Math.max(activeStepIndex + 1, 1)} / {totalSteps}
          </span>
        )}
      </div>

      {/* Code lines */}
      <div className="bg-[#0f172a] p-0">
        {lines.map((line, idx) => {
          const lineNum = idx + 1;
          const isActive = lineNum === activeLineNum;
          const isPast = stableSequence.indexOf(lineNum) !== -1 &&
            stableSequence.indexOf(lineNum) < activeStepIndex;

          return (
            <div
              key={idx}
              className={`flex items-center px-4 py-1.5 transition-all duration-500 ${
                isActive
                  ? 'bg-cyan-500/20 border-l-[3px] border-cyan-400'
                  : isPast
                  ? 'bg-slate-800/30 border-l-[3px] border-slate-600'
                  : 'border-l-[3px] border-transparent'
              }`}
            >
              {/* Execution pointer */}
              <span className={`w-5 flex-shrink-0 text-xs select-none mr-1 transition-all duration-300 ${
                isActive ? 'text-cyan-400 font-bold' : 'text-transparent'
              }`}>
                {isActive ? '▶' : ''}
              </span>
              {/* Line number */}
              <span className={`w-6 text-right select-none mr-4 text-xs ${
                isActive ? 'text-cyan-400' : 'text-slate-600'
              }`}>
                {lineNum}
              </span>
              {/* Code */}
              <span className={`flex-1 transition-all duration-300 ${
                isActive ? 'text-slate-100 scale-[1.01]' : isPast ? 'text-slate-500' : 'text-slate-400'
              }`}>
                {colorizeLine(line) || '\u00A0'}
              </span>
            </div>
          );
        })}
      </div>

      {/* Execution trace */}
      {totalSteps > 0 && (
        <div className="bg-slate-50 border-t border-slate-200 px-4 py-3">
          {/* Progress bar */}
          <div className="flex items-center gap-2 mb-2">
            <div className="flex-1 h-1.5 bg-slate-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-cyan-500 to-purple-500 rounded-full transition-all duration-500"
                style={{ width: `${Math.max(((activeStepIndex + 1) / totalSteps) * 100, 0)}%` }}
              />
            </div>
            <span className="text-[10px] font-mono text-slate-500">
              {activeStepIndex >= 0 ? activeStepIndex + 1 : 0}/{totalSteps}
            </span>
          </div>

          {/* Step description */}
          <div ref={traceRef} className="min-h-[2.5rem]">
            {currentDesc ? (
              <div className="space-y-1.5">
                <p className="text-sm text-slate-800 font-medium leading-relaxed">
                  {currentDesc.description}
                </p>
                {currentDesc.output && (
                  <p className="text-xs font-mono text-green-700 bg-green-50 border border-green-200 rounded px-2 py-1 inline-block">
                    → {currentDesc.output}
                  </p>
                )}
              </div>
            ) : (
              <p className="text-sm text-slate-400 italic">
                Watching how Python executes this code...
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
