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
  'yield', 'lambda', 'pass', 'break', 'continue', 'del', 'is', 'raise',
  'global', 'nonlocal', 'assert', 'async', 'await',
]);

const BUILTINS = new Set([
  'print', 'len', 'range', 'int', 'str', 'float', 'list', 'dict', 'set',
  'tuple', 'bool', 'type', 'input', 'open', 'map', 'filter', 'zip',
  'enumerate', 'sorted', 'reversed', 'sum', 'min', 'max', 'abs', 'round',
  'isinstance', 'issubclass', 'hasattr', 'getattr', 'setattr', 'super',
]);

function colorizeWithContext(line) {
  // If previous line had 'def' or 'class', the first word is a function/class name
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
    return `Checking condition: ${cond}`;
  }
  if (trimmed.startsWith('else:')) return 'No previous conditions matched — entering else branch';
  if (trimmed.startsWith('for ')) {
    const loop = trimmed.match(/for\s+(.+):/)?.[1] || '';
    return `Looping: for ${loop}`;
  }
  if (trimmed.startsWith('while ')) {
    const cond = trimmed.match(/while\s+(.+):/)?.[1] || '';
    return `Loop while: ${cond}`;
  }
  if (trimmed.startsWith('def ')) {
    const name = trimmed.match(/def\s+(\w+)/)?.[1] || '';
    return `Defining function: ${name}()`;
  }
  if (trimmed.startsWith('class ')) {
    const name = trimmed.match(/class\s+(\w+)/)?.[1] || '';
    return `Defining class: ${name}`;
  }
  if (trimmed.startsWith('return ')) {
    return `Returning: ${trimmed.slice(7)}`;
  }
  if (trimmed.startsWith('import ') || trimmed.startsWith('from ')) {
    return `Importing: ${trimmed}`;
  }
  if (trimmed.includes('=') && !trimmed.includes('==')) {
    const parts = trimmed.split('=');
    return `Assign: ${parts[0].trim()} = ${parts.slice(1).join('=').trim()}`;
  }
  return `Execute: ${trimmed}`;
}

// Detect the "type" of line for icon display
function getLineIcon(line) {
  const trimmed = line.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('#')) return { icon: '💬', color: 'text-emerald-400' };
  if (trimmed.startsWith('print(')) return { icon: '📤', color: 'text-green-400' };
  if (trimmed.startsWith('if ') || trimmed.startsWith('elif ') || trimmed.startsWith('else:'))
    return { icon: '🔀', color: 'text-amber-400' };
  if (trimmed.startsWith('for ') || trimmed.startsWith('while '))
    return { icon: '🔄', color: 'text-blue-400' };
  if (trimmed.startsWith('def '))
    return { icon: '⚡', color: 'text-yellow-400' };
  if (trimmed.startsWith('class '))
    return { icon: '🏗️', color: 'text-purple-400' };
  if (trimmed.startsWith('return '))
    return { icon: '↩️', color: 'text-red-400' };
  if (trimmed.includes('=') && !trimmed.includes('=='))
    return { icon: '📦', color: 'text-cyan-400' };
  return { icon: '▸', color: 'text-slate-500' };
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
  const descBubbleRef = useRef(null);
  const [activeStepIndex, setActiveStepIndex] = useState(-1);
  const [isPlaying, setIsPlaying] = useState(true);
  const tlRef = useRef(null);
  const completedRef = useRef(false);
  const onCompleteRef = useRef(onComplete);
  const onStepRef = useRef(onStep);
  const lineRefs = useRef({});

  useEffect(() => { onCompleteRef.current = onComplete; }, [onComplete]);
  useEffect(() => { onStepRef.current = onStep; }, [onStep]);

  const lines = code.split('\n');
  const stepDuration = SPEED_MAP[speed] ?? 2.5;
  const totalSteps = highlightSequence.length;

  const stableSequence = useMemo(
    () => highlightSequence,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [JSON.stringify(highlightSequence)]
  );

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

  // Animate container in on mount with a cinematic entrance
  useEffect(() => {
    if (!containerRef.current) return;
    const tl = gsap.timeline();
    tl.fromTo(
      containerRef.current,
      { opacity: 0, y: 30, scale: 0.97 },
      { opacity: 1, y: 0, scale: 1, duration: 0.7, ease: 'power3.out' }
    );
  }, []);

  // Auto-play timeline
  useEffect(() => {
    if (stableSequence.length === 0) return;
    completedRef.current = false;

    if (tlRef.current) tlRef.current.kill();

    const tl = gsap.timeline({
      onComplete: () => {
        if (!completedRef.current) {
          completedRef.current = true;
          setIsPlaying(false);
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

          // Animate the active line with a glow pulse
          const lineEl = lineRefs.current[lineNum];
          if (lineEl) {
            gsap.fromTo(lineEl,
              { backgroundColor: 'rgba(56, 189, 248, 0.25)' },
              { backgroundColor: 'rgba(56, 189, 248, 0.08)', duration: 0.8, ease: 'power2.out' }
            );
          }

          // Animate the description bubble
          if (descBubbleRef.current) {
            gsap.fromTo(descBubbleRef.current,
              { opacity: 0, y: 8, scale: 0.95 },
              { opacity: 1, y: 0, scale: 1, duration: 0.35, ease: 'back.out(1.5)' }
            );
          }
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
  }, [stableSequence, stepDuration]);

  const activeLineNum = stableSequence[activeStepIndex] ?? -1;
  const currentDesc = activeStepIndex >= 0 ? descriptions[activeStepIndex] : null;
  const currentLineIcon = activeLineNum > 0 ? getLineIcon(lines[activeLineNum - 1] || '') : null;
  const progress = totalSteps > 0 ? Math.max(((activeStepIndex + 1) / totalSteps) * 100, 0) : 0;

  return (
    <div ref={containerRef} className="rounded-2xl overflow-hidden opacity-0 max-w-2xl font-mono text-sm shadow-2xl shadow-black/20 border border-white/[0.06]">
      {/* Header bar - macOS style */}
      <div className="bg-gradient-to-r from-slate-800 via-slate-800 to-slate-700 border-b border-white/[0.06] px-4 py-2.5 flex items-center gap-2">
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-full bg-[#ff5f57] shadow-[0_0_6px_rgba(255,95,87,0.4)]" />
          <span className="w-3 h-3 rounded-full bg-[#febc2e] shadow-[0_0_6px_rgba(254,188,46,0.4)]" />
          <span className="w-3 h-3 rounded-full bg-[#28c840] shadow-[0_0_6px_rgba(40,200,64,0.4)]" />
        </div>
        <span className="ml-3 text-[11px] text-slate-400 tracking-wide">code.py</span>

        {/* Cinema mode indicator */}
        <div className="ml-auto flex items-center gap-3">
          {isPlaying && (
            <div className="flex items-center gap-1.5">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
              </span>
              <span className="text-[10px] text-red-400 font-medium tracking-wider uppercase">Live</span>
            </div>
          )}
          {totalSteps > 0 && (
            <span className="text-[10px] text-slate-500 tabular-nums">
              {Math.max(activeStepIndex + 1, 1)}/{totalSteps}
            </span>
          )}
        </div>
      </div>

      {/* Code lines with execution visualization */}
      <div className="bg-[#0d1117] relative">
        {/* Scan line effect during playback */}
        {isPlaying && activeStepIndex >= 0 && (
          <div
            className="absolute left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-cyan-400/40 to-transparent pointer-events-none z-10 transition-all duration-500"
            style={{ top: `${(activeLineNum - 1) * 34 + 17}px` }}
          />
        )}

        <div className="py-1">
          {lines.map((line, idx) => {
            const lineNum = idx + 1;
            const isActive = lineNum === activeLineNum;
            const stepIdx = stableSequence.indexOf(lineNum);
            const isPast = stepIdx !== -1 && stepIdx < activeStepIndex;
            const isFuture = stepIdx !== -1 && stepIdx > activeStepIndex;

            return (
              <div
                key={idx}
                ref={(el) => (lineRefs.current[lineNum] = el)}
                className={`flex items-center px-4 py-[5px] transition-all duration-400 relative group ${
                  isActive
                    ? 'bg-cyan-500/10'
                    : isPast
                    ? 'bg-slate-800/20'
                    : ''
                }`}
              >
                {/* Left border indicator */}
                <div className={`absolute left-0 top-0 bottom-0 w-[3px] transition-all duration-300 ${
                  isActive
                    ? 'bg-gradient-to-b from-cyan-400 to-blue-500 shadow-[0_0_8px_rgba(56,189,248,0.5)]'
                    : isPast
                    ? 'bg-slate-600/50'
                    : 'bg-transparent'
                }`} />

                {/* Execution pointer with animation */}
                <span className={`w-5 flex-shrink-0 text-xs select-none mr-1 transition-all duration-300 ${
                  isActive ? 'text-cyan-400' : 'text-transparent'
                }`}>
                  {isActive ? (
                    <span className="inline-block animate-[pulse_1s_ease-in-out_infinite]">▶</span>
                  ) : ''}
                </span>

                {/* Line number */}
                <span className={`w-7 text-right select-none mr-4 text-[11px] tabular-nums transition-all duration-300 ${
                  isActive ? 'text-cyan-400 font-medium' : isPast ? 'text-slate-600' : 'text-slate-700'
                }`}>
                  {lineNum}
                </span>

                {/* Code content */}
                <span className={`flex-1 transition-all duration-300 leading-relaxed ${
                  isActive
                    ? 'text-slate-100 brightness-110'
                    : isPast
                    ? 'text-slate-500'
                    : isFuture
                    ? 'text-slate-500/70'
                    : 'text-slate-400'
                }`}>
                  {colorizeWithContext(line) || '\u00A0'}
                </span>

                {/* Inline output indicator for active step */}
                {isActive && currentDesc?.output && (
                  <span className="ml-3 text-[11px] text-green-400/80 bg-green-500/10 rounded px-2 py-0.5 font-mono animate-[fadeIn_0.3s_ease]">
                    → {currentDesc.output}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Execution trace panel - "Narration Bubble" */}
      {totalSteps > 0 && (
        <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 border-t border-white/[0.06] px-5 py-4">
          {/* Animated progress bar */}
          <div className="flex items-center gap-3 mb-3">
            <div className="flex-1 h-1 bg-slate-700/50 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-700 ease-out"
                style={{
                  width: `${progress}%`,
                  background: 'linear-gradient(90deg, #06b6d4, #8b5cf6, #06b6d4)',
                  backgroundSize: '200% 100%',
                  animation: 'shimmer 2s linear infinite',
                }}
              />
            </div>
            <span className="text-[10px] font-mono text-slate-500 tabular-nums">
              {activeStepIndex >= 0 ? activeStepIndex + 1 : 0}/{totalSteps}
            </span>
          </div>

          {/* Narration bubble */}
          <div ref={descBubbleRef} className="min-h-[2.5rem]">
            {currentDesc ? (
              <div className="flex items-start gap-3">
                {/* Line type icon */}
                {currentLineIcon && (
                  <span className={`text-lg flex-shrink-0 mt-0.5 ${currentLineIcon.color}`}>
                    {currentLineIcon.icon}
                  </span>
                )}
                <div className="space-y-1.5 flex-1">
                  <p className="text-sm text-slate-200 font-medium leading-relaxed">
                    {currentDesc.description}
                  </p>
                  {currentDesc.output && (
                    <div className="inline-flex items-center gap-2 text-xs font-mono text-green-400 bg-green-500/10 border border-green-500/20 rounded-lg px-3 py-1.5">
                      <span className="text-green-500">→</span>
                      {currentDesc.output}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <div className="flex gap-1">
                  <span className="w-1.5 h-1.5 bg-cyan-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="w-1.5 h-1.5 bg-cyan-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="w-1.5 h-1.5 bg-cyan-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
                <p className="text-sm text-slate-500 italic">
                  Preparing code execution...
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Bottom shimmer keyframe style */}
      <style>{`
        @keyframes shimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateX(-4px); }
          to { opacity: 1; transform: translateX(0); }
        }
      `}</style>
    </div>
  );
}
