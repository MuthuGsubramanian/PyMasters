import { useEffect, useRef, useState, useCallback } from 'react';
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

/**
 * Auto-generate a basic description from a line of code.
 */
function autoDescribe(line) {
  const trimmed = line.trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('#')) return `Comment: ${trimmed.slice(1).trim()}`;
  if (trimmed.startsWith('print(')) {
    const arg = trimmed.match(/print\((.+)\)/)?.[1] || '';
    return `Executing: print(${arg})`;
  }
  if (trimmed.startsWith('if ') || trimmed.startsWith('elif ')) {
    const cond = trimmed.match(/(?:if|elif)\s+(.+):/)?.[1] || '';
    return `Checking condition: ${cond}`;
  }
  if (trimmed.startsWith('else:')) return 'Entering else branch';
  if (trimmed.startsWith('for ')) {
    const loop = trimmed.match(/for\s+(.+):/)?.[1] || '';
    return `Starting loop: for ${loop}`;
  }
  if (trimmed.startsWith('while ')) {
    const cond = trimmed.match(/while\s+(.+):/)?.[1] || '';
    return `Loop condition: ${cond}`;
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
    const varName = parts[0].trim();
    const value = parts.slice(1).join('=').trim();
    return `Assigning: ${varName} = ${value}`;
  }
  return `Executing: ${trimmed}`;
}

export default function CodeStepper({
  code = '',
  highlightSequence = [],
  speed = 'normal',
  stepDescriptions = [],
  autoPlay = true,
  onStep,
  onComplete,
}) {
  const containerRef = useRef(null);
  const traceRef = useRef(null);
  const [activeStepIndex, setActiveStepIndex] = useState(-1);
  const [isPlaying, setIsPlaying] = useState(autoPlay);
  const tlRef = useRef(null);
  const completedRef = useRef(false);

  const lines = code.split('\n');
  const stepDuration = SPEED_MAP[speed] ?? 2.5;
  const totalSteps = highlightSequence.length;

  // Build descriptions: use provided ones, or auto-generate
  const descriptions = highlightSequence.map((lineNum, idx) => {
    if (stepDescriptions[idx]) {
      const desc = stepDescriptions[idx];
      return {
        description: desc.description || desc.explanation || autoDescribe(lines[lineNum - 1] || ''),
        output: desc.output || null,
      };
    }
    const line = lines[lineNum - 1] || '';
    return {
      description: autoDescribe(line),
      output: null,
    };
  });

  // Animate container in on mount
  useEffect(() => {
    if (!containerRef.current) return;
    gsap.fromTo(
      containerRef.current,
      { opacity: 0, x: -30 },
      { opacity: 1, x: 0, duration: 0.5, ease: 'power2.out' }
    );

    const lineEls = containerRef.current.querySelectorAll('.code-line');
    gsap.fromTo(
      lineEls,
      { opacity: 0, x: -10 },
      { opacity: 1, x: 0, duration: 0.3, stagger: 0.05, ease: 'power2.out', delay: 0.3 }
    );
  }, []);

  // Auto-play timeline
  useEffect(() => {
    if (!isPlaying || highlightSequence.length === 0) return;
    completedRef.current = false;

    if (tlRef.current) tlRef.current.kill();

    const tl = gsap.timeline({
      onComplete: () => {
        if (!completedRef.current) {
          completedRef.current = true;
          onComplete?.();
        }
      },
    });
    tlRef.current = tl;

    highlightSequence.forEach((lineNum, idx) => {
      tl.call(
        () => {
          setActiveStepIndex(idx);
          onStep?.(idx, lineNum);
          // Animate trace panel
          if (traceRef.current) {
            gsap.fromTo(
              traceRef.current,
              { opacity: 0, y: 8 },
              { opacity: 1, y: 0, duration: 0.3, ease: 'power2.out' }
            );
          }
        },
        [],
        idx === 0 ? 0.5 : `+=${stepDuration}`
      );
    });

    // Hold on last step
    tl.to({}, { duration: stepDuration });

    return () => {
      tl.kill();
    };
  }, [highlightSequence, stepDuration, isPlaying]);

  // Manual step forward
  const handleNextStep = useCallback(() => {
    const nextIdx = activeStepIndex + 1;
    if (nextIdx >= totalSteps) {
      if (!completedRef.current) {
        completedRef.current = true;
        onComplete?.();
      }
      return;
    }
    setActiveStepIndex(nextIdx);
    onStep?.(nextIdx, highlightSequence[nextIdx]);
    if (traceRef.current) {
      gsap.fromTo(
        traceRef.current,
        { opacity: 0, y: 8 },
        { opacity: 1, y: 0, duration: 0.3, ease: 'power2.out' }
      );
    }
  }, [activeStepIndex, totalSteps, highlightSequence, onStep, onComplete]);

  // Toggle play/pause
  const togglePlayMode = useCallback(() => {
    if (isPlaying && tlRef.current) {
      tlRef.current.kill();
      tlRef.current = null;
    }
    setIsPlaying((prev) => !prev);
  }, [isPlaying]);

  const activeLineNum = highlightSequence[activeStepIndex] ?? -1;
  const currentDesc = activeStepIndex >= 0 ? descriptions[activeStepIndex] : null;

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
        {totalSteps > 0 && (
          <span className="ml-auto text-xs text-slate-400">
            Step {Math.max(activeStepIndex + 1, 1)} of {totalSteps}
          </span>
        )}
      </div>

      {/* Code lines */}
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
              <span className={`w-5 flex-shrink-0 text-xs select-none mr-1 transition-all duration-200 ${
                isActive ? 'text-cyan-400 font-bold text-sm' : 'text-transparent'
              }`}>
                {isActive ? '\u25B6' : ''}
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

      {/* Execution trace panel */}
      {totalSteps > 0 && (
        <div className="bg-slate-50 border-t border-slate-200 px-4 py-3">
          {/* Controls */}
          <div className="flex items-center gap-3 mb-2">
            <button
              type="button"
              onClick={togglePlayMode}
              className="flex items-center gap-1.5 text-xs font-semibold text-purple-600 bg-purple-100 hover:bg-purple-200 rounded-full px-3 py-1 transition-colors"
            >
              {isPlaying ? '\u23F8 Pause' : '\u25B6 Auto'}
            </button>
            {!isPlaying && (
              <button
                type="button"
                onClick={handleNextStep}
                disabled={activeStepIndex >= totalSteps - 1 && completedRef.current}
                className="flex items-center gap-1.5 text-xs font-semibold text-cyan-700 bg-cyan-100 hover:bg-cyan-200 rounded-full px-3 py-1 transition-colors disabled:opacity-40"
              >
                {'\u25B6'} Next
              </button>
            )}
            <div className="ml-auto flex gap-1">
              {highlightSequence.map((_, i) => (
                <span
                  key={i}
                  className={`w-2 h-2 rounded-full transition-colors duration-300 ${
                    i <= activeStepIndex ? 'bg-cyan-500' : 'bg-slate-300'
                  }`}
                />
              ))}
            </div>
          </div>

          {/* Step description */}
          <div ref={traceRef} className="min-h-[2.5rem]">
            {currentDesc && (
              <div className="space-y-1">
                <p className="text-sm text-slate-800 font-medium">
                  {currentDesc.description}
                </p>
                {currentDesc.output && (
                  <p className="text-xs font-mono text-green-700 bg-green-50 border border-green-200 rounded px-2 py-1 inline-block">
                    Output: {currentDesc.output}
                  </p>
                )}
              </div>
            )}
            {!currentDesc && (
              <p className="text-sm text-slate-500 italic">
                Press Next or Auto to start stepping through the code.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
