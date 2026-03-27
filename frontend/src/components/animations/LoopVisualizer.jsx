import { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import gsap from 'gsap';

const SPEED_MAP = {
  slow: 2.0,
  normal: 1.2,
  fast: 0.6,
};

const LOOP_THEMES = {
  for: { accent: '#06b6d4', label: 'FOR LOOP', icon: '\uD83D\uDD04' },
  while: { accent: '#f59e0b', label: 'WHILE LOOP', icon: '\u26A1' },
  for_range: { accent: '#8b5cf6', label: 'FOR RANGE LOOP', icon: '\uD83D\uDD22' },
};

function buildRangeCollection(start, end, step) {
  const items = [];
  if (step > 0) {
    for (let i = start; i < end; i += step) items.push(i);
  } else if (step < 0) {
    for (let i = start; i > end; i += step) items.push(i);
  }
  return items;
}

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
  const codeRef = useRef(null);
  const collectionRef = useRef(null);
  const itemRefs = useRef({});
  const pointerRef = useRef(null);
  const stateRef = useRef(null);
  const outputRef = useRef(null);
  const progressRef = useRef(null);
  const progressFillRef = useRef(null);
  const completeRef = useRef(null);
  const confettiContainerRef = useRef(null);

  const onCompleteRef = useRef(onComplete);
  useEffect(() => { onCompleteRef.current = onComplete; }, [onComplete]);

  const stableCollection = useMemo(() => collection, [JSON.stringify(collection)]);
  const stableIterations = useMemo(() => iterations, [JSON.stringify(iterations)]);

  // Build effective collection based on loop type
  const effectiveCollection = useMemo(() => {
    if (loopType === 'for_range') {
      return buildRangeCollection(rangeStart, rangeEnd, rangeStep);
    }
    return stableCollection;
  }, [loopType, stableCollection, rangeStart, rangeEnd, rangeStep]);

  const totalIterations = stableIterations.length || effectiveCollection.length;

  const [currentIdx, setCurrentIdx] = useState(-1);
  const [currentVariable, setCurrentVariable] = useState('');
  const [currentOutput, setCurrentOutput] = useState('');
  const [currentDescription, setCurrentDescription] = useState('');
  const [completedIndices, setCompletedIndices] = useState(new Set());
  const [isComplete, setIsComplete] = useState(false);
  const [conditionTrue, setConditionTrue] = useState(null); // for while loops
  const [outputHistory, setOutputHistory] = useState([]);

  const theme = LOOP_THEMES[loopType] || LOOP_THEMES.for;
  const stepDuration = SPEED_MAP[speed] || SPEED_MAP.normal;

  // Format code display with syntax coloring
  const formatCode = useCallback((codeStr) => {
    if (!codeStr) return null;
    const lines = codeStr.split('\n');
    return lines.map((line, i) => {
      // Simple keyword highlighting
      const highlighted = line
        .replace(/\b(for|while|in|range|if|print|def|return|True|False|not|and|or)\b/g,
          '<span style="color:#c084fc">$1</span>')
        .replace(/(["'])(.*?)\1/g,
          '<span style="color:#34d399">$&</span>')
        .replace(/\b(\d+)\b/g,
          '<span style="color:#60a5fa">$1</span>')
        .replace(/(#.*)$/,
          '<span style="color:#64748b">$1</span>');
      return (
        <div key={i} className="font-mono text-[13px] leading-relaxed"
          dangerouslySetInnerHTML={{ __html: highlighted }}
        />
      );
    });
  }, []);

  // Main animation timeline
  useEffect(() => {
    if (!containerRef.current) return;

    const tl = gsap.timeline();

    // Step 1: Fade in container
    tl.fromTo(containerRef.current,
      { opacity: 0, y: 30, scale: 0.95 },
      { opacity: 1, y: 0, scale: 1, duration: 0.7, ease: 'back.out(1.7)' }
    );

    // Step 2: Fade in code block
    if (codeRef.current) {
      tl.fromTo(codeRef.current,
        { opacity: 0, y: -10 },
        { opacity: 1, y: 0, duration: 0.4, ease: 'power2.out' },
        '-=0.3'
      );
    }

    // Step 3: Stagger in collection items
    tl.call(() => {
      const itemEls = Object.values(itemRefs.current).filter(Boolean);
      if (itemEls.length > 0) {
        gsap.fromTo(itemEls,
          { opacity: 0, scale: 0.3, y: 20 },
          {
            opacity: 1, scale: 1, y: 0,
            duration: 0.4,
            ease: 'back.out(2)',
            stagger: 0.08,
          }
        );
      }
    }, [], '+=0.1');

    // Wait for stagger to finish
    const staggerWait = 0.08 * effectiveCollection.length + 0.5;
    tl.to({}, { duration: staggerWait });

    // Step 4: Show pointer
    if (pointerRef.current) {
      tl.fromTo(pointerRef.current,
        { opacity: 0, y: 10 },
        { opacity: 1, y: 0, duration: 0.3, ease: 'power2.out' }
      );
    }

    // Show state and progress sections
    if (stateRef.current) {
      tl.fromTo(stateRef.current,
        { opacity: 0, y: 10 },
        { opacity: 1, y: 0, duration: 0.3, ease: 'power2.out' },
        '-=0.1'
      );
    }
    if (progressRef.current) {
      tl.fromTo(progressRef.current,
        { opacity: 0 },
        { opacity: 1, duration: 0.3 },
        '-=0.1'
      );
    }

    // Step 5: Iterate through each item
    for (let i = 0; i < totalIterations; i++) {
      const iteration = stableIterations[i] || {};
      const value = iteration.value ?? effectiveCollection[i] ?? i;
      const output = iteration.output ?? '';
      const description = iteration.description ?? '';
      const isLast = i === totalIterations - 1;

      // Move pointer, highlight element, update variable
      tl.call(() => {
        setCurrentIdx(i);
        setCurrentVariable(String(value));
        setCurrentOutput(output);
        setCurrentDescription(description);
        if (loopType === 'while') {
          setConditionTrue(true);
        }

        // Animate the pointer to the current item
        const targetEl = itemRefs.current[String(i)];
        if (targetEl && pointerRef.current) {
          const parentRect = collectionRef.current?.getBoundingClientRect();
          const targetRect = targetEl.getBoundingClientRect();
          if (parentRect) {
            const offset = targetRect.left - parentRect.left + targetRect.width / 2;
            gsap.to(pointerRef.current, {
              x: offset,
              duration: i === 0 ? 0.01 : 0.4,
              ease: 'power2.inOut',
            });
          }
        }

        // Scale up and glow current element
        if (targetEl) {
          gsap.to(targetEl, {
            scale: 1.1,
            duration: 0.3,
            ease: 'back.out(2)',
          });
        }

        // Dim previous element
        if (i > 0) {
          const prevEl = itemRefs.current[String(i - 1)];
          if (prevEl) {
            gsap.to(prevEl, {
              scale: 1,
              opacity: 0.6,
              duration: 0.3,
            });
          }
          setCompletedIndices(prev => new Set([...prev, i - 1]));
        }

        // Add output to history
        if (output) {
          setOutputHistory(prev => [...prev, output]);
        }
      }, [], i === 0 ? '+=0.1' : `+=${stepDuration * 0.3}`);

      // Animate the variable box update
      tl.call(() => {
        if (stateRef.current) {
          gsap.fromTo(stateRef.current.querySelector('.var-value'),
            { scale: 1.3, color: '#22d3ee' },
            { scale: 1, color: '#e2e8f0', duration: 0.4, ease: 'elastic.out(1, 0.5)' }
          );
        }
      }, [], '+=0.15');

      // Update progress bar
      tl.call(() => {
        if (progressFillRef.current) {
          gsap.to(progressFillRef.current, {
            width: `${((i + 1) / totalIterations) * 100}%`,
            duration: 0.4,
            ease: 'power2.out',
          });
        }
      }, [], '+=0.05');

      // Output typing animation
      if (output && outputRef.current) {
        tl.call(() => {
          if (outputRef.current) {
            gsap.fromTo(outputRef.current,
              { opacity: 0, x: -10 },
              { opacity: 1, x: 0, duration: 0.3, ease: 'power2.out' }
            );
          }
        }, [], '+=0.1');
      }

      // Hold on each iteration
      tl.to({}, { duration: stepDuration * 0.5 });

      // Mark last iteration complete
      if (isLast) {
        tl.call(() => {
          setCompletedIndices(prev => new Set([...prev, i]));
          const targetEl = itemRefs.current[String(i)];
          if (targetEl) {
            gsap.to(targetEl, {
              scale: 1,
              opacity: 0.6,
              duration: 0.3,
            });
          }
          if (loopType === 'while') {
            setConditionTrue(false);
          }
        }, [], `+=${stepDuration * 0.2}`);
      }
    }

    // Step 6: Loop complete state
    tl.call(() => {
      setIsComplete(true);
    }, [], '+=0.3');

    // Animate completion message
    tl.call(() => {
      if (completeRef.current) {
        gsap.fromTo(completeRef.current,
          { opacity: 0, scale: 0.5, y: 10 },
          { opacity: 1, scale: 1, y: 0, duration: 0.6, ease: 'elastic.out(1, 0.5)' }
        );
      }
    }, [], '+=0.1');

    // Confetti-like particles
    tl.call(() => {
      if (confettiContainerRef.current) {
        const colors = ['#06b6d4', '#8b5cf6', '#10b981', '#f59e0b', '#ec4899', '#3b82f6'];
        for (let p = 0; p < 24; p++) {
          const dot = document.createElement('div');
          dot.style.position = 'absolute';
          dot.style.width = `${4 + Math.random() * 6}px`;
          dot.style.height = dot.style.width;
          dot.style.borderRadius = Math.random() > 0.5 ? '50%' : '2px';
          dot.style.background = colors[Math.floor(Math.random() * colors.length)];
          dot.style.left = '50%';
          dot.style.top = '50%';
          dot.style.pointerEvents = 'none';
          confettiContainerRef.current.appendChild(dot);

          const angle = (Math.PI * 2 * p) / 24 + (Math.random() - 0.5) * 0.5;
          const distance = 60 + Math.random() * 100;
          gsap.fromTo(dot,
            { opacity: 1, scale: 1, x: 0, y: 0 },
            {
              opacity: 0,
              scale: 0,
              x: Math.cos(angle) * distance,
              y: Math.sin(angle) * distance - 30,
              rotation: Math.random() * 360,
              duration: 0.8 + Math.random() * 0.5,
              ease: 'power2.out',
              onComplete: () => dot.remove(),
            }
          );
        }
      }
    }, [], '+=0.05');

    // Hold on complete state then fire callback
    tl.to({}, { duration: 1.5 });
    tl.call(() => onCompleteRef.current?.());

    return () => { tl.kill(); };
  }, [effectiveCollection, stableIterations, totalIterations, stepDuration, loopType]);

  return (
    <div
      ref={containerRef}
      className="rounded-2xl overflow-hidden opacity-0 max-w-2xl border border-white/[0.06] shadow-xl shadow-black/10 relative"
      style={{ background: '#0d1117' }}
    >
      {/* Header */}
      <div
        className="px-4 py-2.5 border-b border-white/[0.06] flex items-center gap-2"
        style={{ background: `${theme.accent}10` }}
      >
        <span className="text-base">{theme.icon}</span>
        <span
          className="text-[11px] font-bold uppercase tracking-widest"
          style={{ color: theme.accent }}
        >
          {theme.label} Visualizer
        </span>
        <span className="text-slate-500 font-mono text-xs ml-1">
          {totalIterations} iteration{totalIterations !== 1 ? 's' : ''}
        </span>
      </div>

      <div className="p-5 flex flex-col gap-4">
        {/* Code block */}
        {code && (
          <div
            ref={codeRef}
            className="rounded-xl border border-white/[0.06] p-4 opacity-0"
            style={{ background: 'rgba(255,255,255,0.02)' }}
          >
            <div className="flex items-center gap-2 mb-2">
              <div className="flex gap-1">
                <div className="w-2.5 h-2.5 rounded-full bg-red-500/60" />
                <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/60" />
                <div className="w-2.5 h-2.5 rounded-full bg-green-500/60" />
              </div>
              <span className="text-[10px] text-slate-500 font-mono ml-1">python</span>
            </div>
            <div className="text-slate-200">{formatCode(code)}</div>
          </div>
        )}

        {/* Collection display */}
        <div
          ref={collectionRef}
          className="rounded-xl border border-white/[0.06] p-4 relative"
          style={{ background: 'rgba(255,255,255,0.02)' }}
        >
          <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-3">
            {loopType === 'for_range' ? (
              <>
                Collection{' '}
                <span className="font-mono text-violet-400/80 normal-case">
                  range({rangeStart !== 0 ? `${rangeStart}, ` : ''}{rangeEnd}{rangeStep !== 1 ? `, ${rangeStep}` : ''})
                </span>
              </>
            ) : loopType === 'while' ? (
              'State'
            ) : (
              'Collection'
            )}
          </div>

          {/* Items row */}
          <div className="flex flex-wrap gap-2 min-h-[3.5rem] items-start">
            {effectiveCollection.map((item, idx) => {
              const isActive = idx === currentIdx;
              const isDone = completedIndices.has(idx);
              return (
                <div
                  key={`${idx}-${item}`}
                  ref={(el) => (itemRefs.current[String(idx)] = el)}
                  className="flex flex-col items-center opacity-0 relative"
                >
                  {/* Checkmark for completed */}
                  {isDone && (
                    <div className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-emerald-500/90 flex items-center justify-center z-10 shadow-sm shadow-emerald-500/30">
                      <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                        <path d="M2 5L4.5 7.5L8 3" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </div>
                  )}
                  {/* Value cell */}
                  <div
                    className="rounded-lg px-3 py-2 font-mono text-sm min-w-[3rem] text-center border transition-colors duration-200"
                    style={isActive ? {
                      background: `${theme.accent}25`,
                      borderColor: `${theme.accent}80`,
                      boxShadow: `0 0 16px ${theme.accent}30, 0 0 4px ${theme.accent}20`,
                      color: '#fff',
                    } : isDone ? {
                      background: 'rgba(255,255,255,0.02)',
                      borderColor: 'rgba(255,255,255,0.06)',
                      color: 'rgba(148,163,184,0.6)',
                    } : {
                      background: 'rgba(255,255,255,0.03)',
                      borderColor: 'rgba(255,255,255,0.08)',
                      color: '#cbd5e1',
                    }}
                  >
                    {loopType === 'for_range' ? item : `"${item}"`}
                  </div>
                  {/* Index label */}
                  <div className="text-[9px] text-slate-500 mt-1 font-mono tabular-nums">[{idx}]</div>
                </div>
              );
            })}
          </div>

          {/* Pointer arrow */}
          <div
            ref={pointerRef}
            className="absolute bottom-2 opacity-0"
            style={{ left: 0, transform: 'translateX(-50%)' }}
          >
            <div className="flex flex-col items-center">
              <svg width="14" height="10" viewBox="0 0 14 10" fill="none" className="mb-0.5">
                <path d="M7 0L14 10H0L7 0Z" fill={theme.accent} fillOpacity="0.8"/>
              </svg>
              <span className="text-[9px] font-mono font-bold" style={{ color: theme.accent }}>
                {variable}
              </span>
            </div>
          </div>
        </div>

        {/* While loop condition indicator */}
        {loopType === 'while' && conditionTrue !== null && (
          <div className="flex items-center gap-2 px-1">
            <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Condition:</span>
            <span
              className="text-xs font-mono font-bold px-2 py-0.5 rounded-full border transition-all duration-300"
              style={conditionTrue ? {
                color: '#10b981',
                borderColor: 'rgba(16,185,129,0.3)',
                background: 'rgba(16,185,129,0.1)',
              } : {
                color: '#ef4444',
                borderColor: 'rgba(239,68,68,0.3)',
                background: 'rgba(239,68,68,0.1)',
              }}
            >
              {conditionTrue ? 'True \u2192 continue' : 'False \u2192 stop'}
            </span>
          </div>
        )}

        {/* Current state box */}
        <div
          ref={stateRef}
          className="rounded-xl border border-white/[0.06] p-4 opacity-0"
          style={{ background: 'rgba(255,255,255,0.02)' }}
        >
          <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2">
            Current State
          </div>

          {currentIdx >= 0 ? (
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono text-slate-400">{variable} =</span>
                  <span
                    className="var-value text-sm font-mono font-bold text-slate-200 px-2 py-0.5 rounded-md border"
                    style={{
                      background: `${theme.accent}15`,
                      borderColor: `${theme.accent}40`,
                    }}
                  >
                    {loopType === 'for_range' ? currentVariable : `"${currentVariable}"`}
                  </span>
                </div>
                <span className="text-[11px] text-slate-500 font-mono tabular-nums">
                  Iteration {currentIdx + 1} of {totalIterations}
                </span>
              </div>

              {currentDescription && (
                <div className="text-xs text-slate-400 italic">{currentDescription}</div>
              )}

              {currentOutput && (
                <div ref={outputRef} className="flex items-start gap-2 mt-1">
                  <span className="text-[11px] text-slate-500 font-mono shrink-0">{'\u2192'} Output:</span>
                  <span
                    className="text-[13px] font-mono font-medium"
                    style={{ color: '#34d399' }}
                  >
                    {currentOutput}
                  </span>
                </div>
              )}
            </div>
          ) : (
            <div className="text-xs text-slate-600 font-mono italic">Waiting to start...</div>
          )}
        </div>

        {/* Output history */}
        {outputHistory.length > 1 && (
          <div className="rounded-xl border border-white/[0.06] p-3 max-h-32 overflow-y-auto"
            style={{ background: 'rgba(0,0,0,0.3)' }}
          >
            <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2">
              Console Output
            </div>
            <div className="flex flex-col gap-0.5">
              {outputHistory.map((out, i) => (
                <div key={i} className="text-[12px] font-mono text-emerald-400/80 leading-relaxed">
                  <span className="text-slate-600 mr-2">{'>>>'}</span>{out}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Progress bar */}
        <div ref={progressRef} className="opacity-0">
          <div className="flex items-center gap-3">
            <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.05)' }}>
              <div
                ref={progressFillRef}
                className="h-full rounded-full"
                style={{
                  width: '0%',
                  background: `linear-gradient(90deg, ${theme.accent}, #8b5cf6)`,
                  boxShadow: `0 0 8px ${theme.accent}40`,
                  transition: 'none',
                }}
              />
            </div>
            <span className="text-[11px] font-mono text-slate-500 tabular-nums min-w-[4rem] text-right">
              {currentIdx >= 0
                ? `${Math.round(((currentIdx + 1) / totalIterations) * 100)}% (${currentIdx + 1}/${totalIterations})`
                : `0% (0/${totalIterations})`
              }
            </span>
          </div>
        </div>

        {/* Loop complete message */}
        {isComplete && (
          <div className="relative">
            <div
              ref={completeRef}
              className="rounded-xl border p-4 text-center opacity-0"
              style={{
                borderColor: `${theme.accent}40`,
                background: `linear-gradient(135deg, ${theme.accent}10, rgba(139,92,246,0.08))`,
              }}
            >
              <div className="text-lg font-bold mb-1" style={{ color: theme.accent }}>
                Loop Complete!
              </div>
              <div className="text-xs text-slate-400">
                All {totalIterations} iteration{totalIterations !== 1 ? 's' : ''} finished successfully
              </div>
            </div>
            {/* Confetti container */}
            <div
              ref={confettiContainerRef}
              className="absolute inset-0 pointer-events-none overflow-visible"
            />
          </div>
        )}
      </div>
    </div>
  );
}
