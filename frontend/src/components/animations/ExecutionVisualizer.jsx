import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import gsap from 'gsap';

/* ── Speed config ── */
const SPEED_MAP = { slow: 3.0, normal: 1.8, fast: 1.0 };

/* ── Syntax highlighting (shared with CodeStepper) ── */
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

/* ── Variable type detection & color mapping ── */
const TYPE_COLORS = {
  int:   { bg: 'rgba(59,130,246,0.15)', border: 'rgba(96,165,250,0.5)',  text: '#93c5fd', badge: '#3b82f6', badgeText: '#bfdbfe' },
  float: { bg: 'rgba(20,184,166,0.15)', border: 'rgba(45,212,191,0.5)',  text: '#5eead4', badge: '#14b8a6', badgeText: '#99f6e4' },
  str:   { bg: 'rgba(245,158,11,0.15)', border: 'rgba(251,191,36,0.5)', text: '#fcd34d', badge: '#f59e0b', badgeText: '#fef3c7' },
  bool:  { bg: 'rgba(168,85,247,0.15)', border: 'rgba(192,132,252,0.5)', text: '#c4b5fd', badge: '#a855f7', badgeText: '#e9d5ff' },
  list:  { bg: 'rgba(6,182,212,0.15)',  border: 'rgba(34,211,238,0.5)',  text: '#67e8f9', badge: '#06b6d4', badgeText: '#cffafe' },
  dict:  { bg: 'rgba(236,72,153,0.15)', border: 'rgba(244,114,182,0.5)', text: '#f9a8d4', badge: '#ec4899', badgeText: '#fce7f3' },
  tuple: { bg: 'rgba(234,179,8,0.15)',  border: 'rgba(250,204,21,0.5)',  text: '#fde047', badge: '#eab308', badgeText: '#fef9c3' },
  None:  { bg: 'rgba(100,116,139,0.15)', border: 'rgba(148,163,184,0.4)', text: '#94a3b8', badge: '#64748b', badgeText: '#cbd5e1' },
};
const DEFAULT_TYPE_COLOR = { bg: 'rgba(139,92,246,0.15)', border: 'rgba(167,139,250,0.5)', text: '#c4b5fd', badge: '#8b5cf6', badgeText: '#e9d5ff' };

function detectType(val) {
  if (val === null || val === undefined || val === 'None') return 'None';
  if (Array.isArray(val)) return 'list';
  if (typeof val === 'boolean' || val === 'True' || val === 'False') return 'bool';
  if (typeof val === 'number') return Number.isInteger(val) ? 'int' : 'float';
  if (typeof val === 'string') {
    if (/^-?\d+$/.test(val)) return 'int';
    if (/^-?\d+\.\d+$/.test(val)) return 'float';
    if (val.startsWith('[')) return 'list';
    if (val.startsWith('{')) return 'dict';
    if (val.startsWith('(')) return 'tuple';
    return 'str';
  }
  if (typeof val === 'object' && !Array.isArray(val)) return 'dict';
  return typeof val;
}

function formatValue(val) {
  if (val === null || val === undefined) return 'None';
  if (Array.isArray(val)) return JSON.stringify(val);
  if (typeof val === 'object') return JSON.stringify(val);
  return String(val);
}

function getTypeColor(val) {
  return TYPE_COLORS[detectType(val)] || DEFAULT_TYPE_COLOR;
}

/* ── Main component ── */
export default function ExecutionVisualizer({
  code = '',
  executionSteps = [],
  speed = 'normal',
  onComplete,
}) {
  const containerRef = useRef(null);
  const codePanelRef = useRef(null);
  const variablesPanelRef = useRef(null);
  const outputPanelRef = useRef(null);
  const descRef = useRef(null);
  const outputTextRef = useRef(null);
  const lineRefs = useRef({});
  const varBoxRefs = useRef({});
  const tlRef = useRef(null);
  const completedRef = useRef(false);
  const onCompleteRef = useRef(onComplete);

  const [stepIndex, setStepIndex] = useState(-1);
  const [isPlaying, setIsPlaying] = useState(true);
  const [isPaused, setIsPaused] = useState(false);
  const [visitedLines, setVisitedLines] = useState(new Set());
  const [loopCounts, setLoopCounts] = useState({});
  const [currentVars, setCurrentVars] = useState({});
  const [prevVars, setPrevVars] = useState({});
  const [changedVars, setChangedVars] = useState(new Set());
  const [removedVars, setRemovedVars] = useState(new Set());
  const [displayedOutput, setDisplayedOutput] = useState('');
  const [description, setDescription] = useState('');
  const [callStack, setCallStack] = useState([]);

  useEffect(() => { onCompleteRef.current = onComplete; }, [onComplete]);

  const lines = useMemo(() => code.split('\n'), [code]);
  const stepDuration = SPEED_MAP[speed] ?? 1.8;
  const totalSteps = executionSteps.length;

  const stableSteps = useMemo(
    () => executionSteps,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [JSON.stringify(executionSteps)]
  );

  // Detect which lines are loop headers (for/while) to show iteration badges
  const loopLines = useMemo(() => {
    const set = new Set();
    lines.forEach((line, idx) => {
      const trimmed = line.trim();
      if (trimmed.startsWith('for ') || trimmed.startsWith('while ')) {
        set.add(idx + 1); // 1-based
      }
    });
    return set;
  }, [lines]);

  // Detect which lines are function definitions for call-stack effect
  const defLines = useMemo(() => {
    const map = {};
    lines.forEach((line, idx) => {
      const m = line.trim().match(/^def\s+(\w+)/);
      if (m) map[idx + 1] = m[1];
    });
    return map;
  }, [lines]);

  /* ── Entrance animation ── */
  useEffect(() => {
    if (!containerRef.current) return;
    gsap.fromTo(
      containerRef.current,
      { opacity: 0, y: 30, scale: 0.97 },
      { opacity: 1, y: 0, scale: 1, duration: 0.7, ease: 'power3.out' }
    );
  }, []);

  /* ── Main execution timeline ── */
  useEffect(() => {
    if (stableSteps.length === 0) return;
    completedRef.current = false;
    setStepIndex(-1);
    setVisitedLines(new Set());
    setLoopCounts({});
    setCurrentVars({});
    setPrevVars({});
    setChangedVars(new Set());
    setRemovedVars(new Set());
    setDisplayedOutput('');
    setDescription('');
    setCallStack([]);
    setIsPlaying(true);
    setIsPaused(false);

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
    tl.to({}, { duration: 0.6 });

    let prevVarsSnapshot = {};

    stableSteps.forEach((step, idx) => {
      tl.call(
        () => {
          const { line, variables = {}, output = '', description: desc = '', callStack: stack } = step;

          setStepIndex(idx);

          // Update visited lines
          setVisitedLines(prev => new Set([...prev, line]));

          // Update loop counts for loop lines
          if (loopLines.has(line)) {
            setLoopCounts(prev => ({ ...prev, [line]: (prev[line] || 0) + 1 }));
          }

          // Determine which variables changed
          const changed = new Set();
          const removed = new Set();
          const varKeys = Object.keys(variables);
          const prevKeys = Object.keys(prevVarsSnapshot);

          varKeys.forEach(k => {
            if (!(k in prevVarsSnapshot) || prevVarsSnapshot[k] !== variables[k]) {
              changed.add(k);
            }
          });

          prevKeys.forEach(k => {
            if (!(k in variables)) {
              removed.add(k);
            }
          });

          setPrevVars({ ...prevVarsSnapshot });
          setCurrentVars({ ...variables });
          setChangedVars(changed);
          setRemovedVars(removed);
          prevVarsSnapshot = { ...variables };

          // Output
          setDisplayedOutput(output);

          // Description
          setDescription(desc);

          // Call stack
          if (stack) {
            setCallStack(stack);
          } else if (defLines[line]) {
            setCallStack(prev => [...prev, defLines[line]]);
          }

          // Animate the active line highlight
          const lineEl = lineRefs.current[line];
          if (lineEl) {
            gsap.fromTo(lineEl,
              { backgroundColor: 'rgba(56, 189, 248, 0.25)' },
              { backgroundColor: 'rgba(56, 189, 248, 0.08)', duration: 0.8, ease: 'power2.out' }
            );
          }

          // Animate changed variable boxes
          changed.forEach(varName => {
            const el = varBoxRefs.current[varName];
            if (el) {
              gsap.fromTo(el,
                { scale: 1.15, borderColor: 'rgba(250,204,21,0.8)' },
                { scale: 1, borderColor: undefined, duration: 0.6, ease: 'elastic.out(1, 0.5)' }
              );
            }
          });

          // Animate description bubble
          if (descRef.current) {
            gsap.fromTo(descRef.current,
              { opacity: 0, y: 6, scale: 0.96 },
              { opacity: 1, y: 0, scale: 1, duration: 0.3, ease: 'back.out(1.5)' }
            );
          }

          // Auto-scroll output to bottom
          if (outputTextRef.current) {
            requestAnimationFrame(() => {
              if (outputTextRef.current) {
                outputTextRef.current.scrollTop = outputTextRef.current.scrollHeight;
              }
            });
          }
        },
        [],
        idx === 0 ? '>' : `+=${stepDuration}`
      );
    });

    // Hold on last step
    tl.to({}, { duration: stepDuration + 0.5 });

    return () => { tl.kill(); };
  }, [stableSteps, stepDuration, loopLines, defLines]);

  /* ── Playback controls ── */
  const handlePause = useCallback(() => {
    if (tlRef.current) {
      if (isPaused) {
        tlRef.current.play();
        setIsPaused(false);
      } else {
        tlRef.current.pause();
        setIsPaused(true);
      }
    }
  }, [isPaused]);

  const handleStepForward = useCallback(() => {
    if (!tlRef.current) return;
    tlRef.current.pause();
    setIsPaused(true);
    // Jump to the next call in the timeline
    const nextTime = tlRef.current.time() + stepDuration;
    tlRef.current.time(Math.min(nextTime, tlRef.current.duration()));
  }, [stepDuration]);

  const handleRestart = useCallback(() => {
    if (tlRef.current) {
      tlRef.current.restart();
      setIsPaused(false);
      setIsPlaying(true);
    }
  }, []);

  /* ── Derived state ── */
  const currentStep = stepIndex >= 0 ? stableSteps[stepIndex] : null;
  const activeLine = currentStep?.line ?? -1;
  const progress = totalSteps > 0 ? Math.max(((stepIndex + 1) / totalSteps) * 100, 0) : 0;
  const varEntries = Object.entries(currentVars);
  const outputLines = displayedOutput ? displayedOutput.split('\n') : [];

  return (
    <div
      ref={containerRef}
      className="opacity-0 w-full max-w-5xl font-mono text-sm"
      style={{ perspective: '1200px' }}
    >
      {/* ── Header bar ── */}
      <div
        style={{
          background: 'linear-gradient(to right, #1e293b, #1e293b, #334155)',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          borderRadius: '16px 16px 0 0',
          padding: '10px 16px',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
        }}
      >
        {/* Traffic lights */}
        <div style={{ display: 'flex', gap: '6px' }}>
          <span style={{ width: 12, height: 12, borderRadius: '50%', background: '#ff5f57', boxShadow: '0 0 6px rgba(255,95,87,0.4)' }} />
          <span style={{ width: 12, height: 12, borderRadius: '50%', background: '#febc2e', boxShadow: '0 0 6px rgba(254,188,46,0.4)' }} />
          <span style={{ width: 12, height: 12, borderRadius: '50%', background: '#28c840', boxShadow: '0 0 6px rgba(40,200,64,0.4)' }} />
        </div>

        <span style={{ marginLeft: 12, fontSize: 11, color: '#94a3b8', letterSpacing: '0.05em' }}>
          execution_visualizer.py
        </span>

        {/* Playback controls */}
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            onClick={handleRestart}
            style={{
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 6,
              padding: '3px 8px',
              color: '#94a3b8',
              fontSize: 11,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 4,
            }}
            title="Restart"
          >
            <span style={{ fontSize: 12 }}>&#8634;</span>
          </button>
          <button
            onClick={handlePause}
            style={{
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 6,
              padding: '3px 8px',
              color: '#94a3b8',
              fontSize: 11,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 4,
            }}
            title={isPaused ? 'Resume' : 'Pause'}
          >
            {isPaused ? '\u25B6' : '\u23F8'}
          </button>
          <button
            onClick={handleStepForward}
            style={{
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 6,
              padding: '3px 8px',
              color: '#94a3b8',
              fontSize: 11,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 4,
            }}
            title="Step Forward"
          >
            <span style={{ fontSize: 12 }}>&#9197;</span>
          </button>

          {/* Live indicator */}
          {isPlaying && !isPaused && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 4 }}>
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
              </span>
              <span style={{ fontSize: 10, color: '#f87171', fontWeight: 500, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                Live
              </span>
            </div>
          )}

          {totalSteps > 0 && (
            <span style={{ fontSize: 10, color: '#64748b', fontFamily: 'monospace', fontVariantNumeric: 'tabular-nums' }}>
              {Math.max(stepIndex + 1, 0)}/{totalSteps}
            </span>
          )}
        </div>
      </div>

      {/* ── Main 2-column layout: Code + Variables ── */}
      <div style={{ display: 'flex', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>

        {/* ── CODE PANEL (left, ~55%) ── */}
        <div
          ref={codePanelRef}
          style={{
            width: '55%',
            background: '#0d1117',
            position: 'relative',
            minHeight: 200,
            borderRight: '1px solid rgba(255,255,255,0.06)',
          }}
        >
          {/* Scan line */}
          {isPlaying && stepIndex >= 0 && (
            <div
              style={{
                position: 'absolute',
                left: 0,
                right: 0,
                height: 2,
                background: 'linear-gradient(to right, transparent, rgba(34,211,238,0.4), transparent)',
                pointerEvents: 'none',
                zIndex: 10,
                transition: 'top 0.4s ease',
                top: `${(activeLine - 1) * 32 + 16}px`,
              }}
            />
          )}

          <div style={{ padding: '4px 0' }}>
            {lines.map((line, idx) => {
              const lineNum = idx + 1;
              const isActive = lineNum === activeLine;
              const isVisited = visitedLines.has(lineNum) && !isActive;
              const isLoop = loopLines.has(lineNum);
              const loopCount = loopCounts[lineNum];

              return (
                <div
                  key={idx}
                  ref={el => (lineRefs.current[lineNum] = el)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    padding: '4px 16px',
                    position: 'relative',
                    transition: 'background-color 0.3s',
                    backgroundColor: isActive ? 'rgba(34,211,238,0.08)' : 'transparent',
                    minHeight: 32,
                  }}
                >
                  {/* Left border */}
                  <div style={{
                    position: 'absolute',
                    left: 0,
                    top: 0,
                    bottom: 0,
                    width: 3,
                    transition: 'all 0.3s',
                    background: isActive
                      ? 'linear-gradient(to bottom, #22d3ee, #3b82f6)'
                      : isVisited
                      ? 'rgba(100,116,139,0.3)'
                      : 'transparent',
                    boxShadow: isActive ? '0 0 8px rgba(56,189,248,0.5)' : 'none',
                  }} />

                  {/* Execution pointer / visited dot */}
                  <span style={{
                    width: 20,
                    flexShrink: 0,
                    fontSize: 12,
                    marginRight: 4,
                    textAlign: 'center',
                    color: isActive ? '#22d3ee' : 'transparent',
                    transition: 'color 0.3s',
                  }}>
                    {isActive ? (
                      <span className="inline-block animate-[pulse_1s_ease-in-out_infinite]">{'\u25B6'}</span>
                    ) : isVisited ? (
                      <span style={{ color: 'rgba(100,116,139,0.5)', fontSize: 8 }}>{'\u25CF'}</span>
                    ) : ''}
                  </span>

                  {/* Line number */}
                  <span style={{
                    width: 28,
                    textAlign: 'right',
                    marginRight: 16,
                    fontSize: 11,
                    fontVariantNumeric: 'tabular-nums',
                    transition: 'color 0.3s',
                    color: isActive ? '#22d3ee' : isVisited ? '#475569' : '#334155',
                    fontWeight: isActive ? 500 : 400,
                    userSelect: 'none',
                  }}>
                    {lineNum}
                  </span>

                  {/* Code content */}
                  <span style={{
                    flex: 1,
                    transition: 'all 0.3s',
                    lineHeight: '1.6',
                    filter: isActive ? 'brightness(1.1)' : isVisited ? 'brightness(0.7)' : 'brightness(0.6)',
                  }}>
                    {colorizeLine(line) || '\u00A0'}
                  </span>

                  {/* Loop iteration badge */}
                  {isLoop && loopCount > 0 && (
                    <span style={{
                      marginLeft: 8,
                      fontSize: 10,
                      fontWeight: 700,
                      color: '#38bdf8',
                      background: 'rgba(56,189,248,0.12)',
                      border: '1px solid rgba(56,189,248,0.25)',
                      borderRadius: 10,
                      padding: '1px 7px',
                      fontFamily: 'monospace',
                      whiteSpace: 'nowrap',
                    }}>
                      {'\u00D7'}{loopCount}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* ── VARIABLES + DESCRIPTION PANEL (right, ~45%) ── */}
        <div
          ref={variablesPanelRef}
          style={{
            width: '45%',
            background: 'linear-gradient(135deg, #0f172a, #1e293b)',
            display: 'flex',
            flexDirection: 'column',
            minHeight: 200,
          }}
        >
          {/* Variables section header */}
          <div style={{
            padding: '10px 16px 6px',
            borderBottom: '1px solid rgba(255,255,255,0.04)',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}>
            <span style={{ fontSize: 10, color: '#64748b', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
              Variables
            </span>
            {callStack.length > 0 && (
              <span style={{
                fontSize: 9,
                color: '#a78bfa',
                background: 'rgba(139,92,246,0.15)',
                borderRadius: 8,
                padding: '2px 8px',
                fontWeight: 600,
              }}>
                {callStack[callStack.length - 1]}()
              </span>
            )}
          </div>

          {/* Variable boxes */}
          <div style={{
            flex: 1,
            padding: '12px 16px',
            display: 'flex',
            flexWrap: 'wrap',
            gap: 10,
            alignContent: 'flex-start',
          }}>
            {varEntries.length === 0 && stepIndex < 0 && (
              <div style={{ color: '#475569', fontSize: 12, fontStyle: 'italic', padding: '8px 0' }}>
                Variables will appear here as code executes...
              </div>
            )}

            {varEntries.map(([name, value]) => {
              const typeColor = getTypeColor(value);
              const isChanged = changedVars.has(name);
              const isNew = !(name in prevVars);
              const oldVal = prevVars[name];
              const typeName = detectType(value);

              return (
                <div
                  key={name}
                  ref={el => (varBoxRefs.current[name] = el)}
                  style={{
                    background: typeColor.bg,
                    border: `1px solid ${isChanged ? 'rgba(250,204,21,0.6)' : typeColor.border}`,
                    borderRadius: 12,
                    padding: '8px 14px',
                    minWidth: 80,
                    position: 'relative',
                    transition: 'border-color 0.3s, transform 0.3s',
                    animation: isNew ? 'varAppear 0.4s ease-out' : undefined,
                  }}
                >
                  {/* Type badge */}
                  <span style={{
                    position: 'absolute',
                    top: -7,
                    right: 8,
                    fontSize: 8,
                    fontWeight: 700,
                    color: typeColor.badgeText,
                    background: typeColor.badge,
                    borderRadius: 6,
                    padding: '1px 6px',
                    fontFamily: 'monospace',
                    letterSpacing: '0.04em',
                  }}>
                    {typeName}
                  </span>

                  {/* Variable name */}
                  <div style={{
                    fontSize: 10,
                    fontWeight: 700,
                    color: '#cbd5e1',
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                    marginBottom: 4,
                    fontFamily: 'monospace',
                  }}>
                    {name}
                  </div>

                  {/* Old value (crossed out) shown during change */}
                  {isChanged && !isNew && oldVal !== undefined && (
                    <div style={{
                      fontSize: 14,
                      fontWeight: 700,
                      color: 'rgba(148,163,184,0.4)',
                      textDecoration: 'line-through',
                      fontFamily: 'monospace',
                      position: 'absolute',
                      top: 24,
                      left: 14,
                      animation: 'oldValueFade 0.5s ease-out forwards',
                    }}>
                      {formatValue(oldVal)}
                    </div>
                  )}

                  {/* Current value */}
                  <div style={{
                    fontSize: 20,
                    fontWeight: 700,
                    color: isChanged ? '#fde68a' : typeColor.text,
                    fontFamily: 'monospace',
                    transition: 'color 0.5s',
                    animation: isChanged ? 'valueBounce 0.4s ease-out' : undefined,
                  }}>
                    {formatValue(value)}
                  </div>

                  {/* Change indicator */}
                  {isChanged && !isNew && (
                    <div style={{
                      position: 'absolute',
                      top: -4,
                      left: -4,
                      width: 10,
                      height: 10,
                      borderRadius: '50%',
                      background: '#fbbf24',
                      boxShadow: '0 0 8px rgba(251,191,36,0.6)',
                      animation: 'changePulse 0.8s ease-out forwards',
                    }} />
                  )}
                </div>
              );
            })}

            {/* Show removed variables fading out */}
            {[...removedVars].map(name => (
              <div
                key={`removed-${name}`}
                style={{
                  background: 'rgba(100,116,139,0.08)',
                  border: '1px dashed rgba(100,116,139,0.3)',
                  borderRadius: 12,
                  padding: '8px 14px',
                  minWidth: 80,
                  opacity: 0.4,
                  animation: 'varDisappear 0.5s ease-out forwards',
                }}
              >
                <div style={{ fontSize: 10, fontWeight: 700, color: '#475569', fontFamily: 'monospace' }}>
                  {name}
                </div>
                <div style={{ fontSize: 14, color: '#475569', fontFamily: 'monospace', textDecoration: 'line-through' }}>
                  {formatValue(prevVars[name])}
                </div>
              </div>
            ))}
          </div>

          {/* Description section */}
          <div
            ref={descRef}
            style={{
              padding: '12px 16px',
              borderTop: '1px solid rgba(255,255,255,0.04)',
              minHeight: 48,
            }}
          >
            {description ? (
              <div style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 10,
              }}>
                {/* Data-flow arrow */}
                <span style={{
                  fontSize: 14,
                  color: '#38bdf8',
                  flexShrink: 0,
                  marginTop: 1,
                }}>
                  {'\u279C'}
                </span>
                <p style={{
                  fontSize: 13,
                  color: '#e2e8f0',
                  fontWeight: 500,
                  lineHeight: '1.5',
                  margin: 0,
                  fontFamily: 'system-ui, -apple-system, sans-serif',
                }}>
                  {description}
                </p>
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div className="flex gap-1">
                  <span className="w-1.5 h-1.5 bg-cyan-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="w-1.5 h-1.5 bg-cyan-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="w-1.5 h-1.5 bg-cyan-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
                <span style={{ fontSize: 12, color: '#64748b', fontStyle: 'italic' }}>
                  Waiting to execute...
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── OUTPUT PANEL (bottom, full width) ── */}
      <div
        ref={outputPanelRef}
        style={{
          background: '#0a0e14',
          borderRadius: '0 0 16px 16px',
          overflow: 'hidden',
        }}
      >
        {/* Output header */}
        <div style={{
          padding: '8px 16px',
          borderBottom: '1px solid rgba(255,255,255,0.04)',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}>
          <span style={{ fontSize: 10, color: '#64748b', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
            Output
          </span>
          <span style={{ fontSize: 10, color: '#22c55e', fontWeight: 500 }}>
            {'\u25CF'} stdout
          </span>
        </div>

        {/* Terminal output */}
        <div
          ref={outputTextRef}
          style={{
            padding: '10px 16px',
            minHeight: 48,
            maxHeight: 120,
            overflowY: 'auto',
            fontFamily: 'monospace',
            fontSize: 12,
            lineHeight: '1.7',
          }}
        >
          {outputLines.length > 0 ? (
            outputLines.map((line, i) => (
              <div
                key={i}
                style={{
                  color: '#4ade80',
                  animation: 'typeIn 0.2s ease-out',
                }}
              >
                <span style={{ color: '#374151', userSelect: 'none' }}>{'>>> '}</span>
                {line}
              </div>
            ))
          ) : (
            <div style={{ color: '#1e293b', fontStyle: 'italic', fontSize: 11 }}>
              <span style={{ color: '#374151', userSelect: 'none' }}>{'>>> '}</span>
              <span style={{ color: '#334155' }}>Awaiting output...</span>
            </div>
          )}
        </div>

        {/* Progress bar */}
        <div style={{
          padding: '8px 16px 12px',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
        }}>
          <div style={{
            flex: 1,
            height: 4,
            background: 'rgba(51,65,85,0.5)',
            borderRadius: 4,
            overflow: 'hidden',
          }}>
            <div style={{
              height: '100%',
              borderRadius: 4,
              transition: 'width 0.7s ease-out',
              width: `${progress}%`,
              background: 'linear-gradient(90deg, #06b6d4, #8b5cf6, #06b6d4)',
              backgroundSize: '200% 100%',
              animation: 'shimmer 2s linear infinite',
            }} />
          </div>
          <span style={{
            fontSize: 10,
            color: '#64748b',
            fontFamily: 'monospace',
            fontVariantNumeric: 'tabular-nums',
            whiteSpace: 'nowrap',
          }}>
            Step {Math.max(stepIndex + 1, 0)}/{totalSteps}
          </span>
        </div>
      </div>

      {/* ── Keyframe animations ── */}
      <style>{`
        @keyframes shimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
        @keyframes varAppear {
          0% { opacity: 0; transform: scale(0.7) translateY(10px); }
          60% { opacity: 1; transform: scale(1.08) translateY(-2px); }
          100% { opacity: 1; transform: scale(1) translateY(0); }
        }
        @keyframes varDisappear {
          0% { opacity: 0.4; transform: scale(1); }
          100% { opacity: 0; transform: scale(0.7) translateY(-10px); }
        }
        @keyframes valueBounce {
          0% { transform: scale(0.8) translateY(8px); opacity: 0.5; }
          50% { transform: scale(1.12) translateY(-2px); opacity: 1; }
          100% { transform: scale(1) translateY(0); opacity: 1; }
        }
        @keyframes oldValueFade {
          0% { opacity: 0.5; transform: translateY(0); }
          100% { opacity: 0; transform: translateY(-12px); }
        }
        @keyframes changePulse {
          0% { transform: scale(1); opacity: 1; }
          100% { transform: scale(3); opacity: 0; }
        }
        @keyframes typeIn {
          0% { opacity: 0; transform: translateX(-6px); }
          100% { opacity: 1; transform: translateX(0); }
        }
      `}</style>
    </div>
  );
}
