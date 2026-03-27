import { useEffect, useRef, useState, useMemo } from 'react';
import gsap from 'gsap';

export default function MemoryStack({ frames: initialFrames = [], operations = [], duration = 3000, onComplete }) {
  const containerRef = useRef(null);

  const stableInitialFrames = useMemo(() => initialFrames, [JSON.stringify(initialFrames)]);
  const stableOperations = useMemo(() => operations, [JSON.stringify(operations)]);

  const [frames, setFrames] = useState([...stableInitialFrames]);
  const frameRefs = useRef({});
  const frameKeyCounter = useRef(0);
  const [frameKeys] = useState(() => stableInitialFrames.map(() => frameKeyCounter.current++));
  const [keys, setKeys] = useState([...frameKeys]);
  const [activeOp, setActiveOp] = useState('');

  const onCompleteRef = useRef(onComplete);
  useEffect(() => { onCompleteRef.current = onComplete; }, [onComplete]);

  useEffect(() => {
    if (!containerRef.current) return;

    const holdSeconds = Math.max(duration / 1000, 2);

    gsap.fromTo(
      containerRef.current,
      { opacity: 0, x: 20, scale: 0.97 },
      { opacity: 1, x: 0, scale: 1, duration: 0.6, ease: 'power3.out' }
    );

    if (stableOperations.length === 0) {
      const id = gsap.delayedCall(0.6 + holdSeconds, () => onCompleteRef.current?.());
      return () => { id.kill(); };
    }

    const tl = gsap.timeline({ delay: 0.6, onComplete: () => onCompleteRef.current?.() });

    let currentFrames = [...stableInitialFrames];
    let currentKeys = [...frameKeys];

    stableOperations.forEach((op, idx) => {
      tl.call(
        () => {
          if (op.action === 'push' && op.frame) {
            const newKey = frameKeyCounter.current++;
            currentFrames = [op.frame, ...currentFrames];
            currentKeys = [newKey, ...currentKeys];
            setFrames([...currentFrames]);
            setKeys([...currentKeys]);
            setActiveOp(`push: ${op.frame.name}()`);

            requestAnimationFrame(() => {
              const el = frameRefs.current[newKey];
              if (el) {
                gsap.fromTo(el,
                  { opacity: 0, y: -40, scale: 0.85, rotateX: -15 },
                  { opacity: 1, y: 0, scale: 1, rotateX: 0, duration: 0.5, ease: 'back.out(1.5)' }
                );
              }
            });
          } else if (op.action === 'pop') {
            const topKey = currentKeys[0];
            const topFrame = currentFrames[0];
            setActiveOp(`pop: ${topFrame?.name || 'frame'}()`);

            const el = frameRefs.current[topKey];
            if (el) {
              gsap.to(el, {
                opacity: 0,
                y: -30,
                scale: 0.85,
                rotateX: 15,
                duration: 0.4,
                ease: 'power2.in',
                onComplete: () => {
                  currentFrames = currentFrames.slice(1);
                  currentKeys = currentKeys.slice(1);
                  setFrames([...currentFrames]);
                  setKeys([...currentKeys]);
                },
              });
            } else {
              currentFrames = currentFrames.slice(1);
              currentKeys = currentKeys.slice(1);
              setFrames([...currentFrames]);
              setKeys([...currentKeys]);
            }
          }
        },
        [],
        idx === 0 ? 0 : `+=${1.0}`
      );
    });

    tl.to({}, { duration: holdSeconds });

    return () => { tl.kill(); };
  }, [stableInitialFrames, stableOperations, duration]);

  const FRAME_COLORS = [
    { bg: 'from-orange-500/15 to-orange-600/5', border: 'border-orange-400/40', text: 'text-orange-300', dot: 'bg-orange-400' },
    { bg: 'from-blue-500/15 to-blue-600/5', border: 'border-blue-400/40', text: 'text-blue-300', dot: 'bg-blue-400' },
    { bg: 'from-green-500/15 to-green-600/5', border: 'border-green-400/40', text: 'text-green-300', dot: 'bg-green-400' },
    { bg: 'from-purple-500/15 to-purple-600/5', border: 'border-purple-400/40', text: 'text-purple-300', dot: 'bg-purple-400' },
  ];

  return (
    <div
      ref={containerRef}
      className="rounded-2xl overflow-hidden opacity-0 w-72 border border-white/[0.06] shadow-xl shadow-black/10 bg-gradient-to-b from-slate-900/50 to-slate-800/30"
    >
      {/* Header */}
      <div className="px-4 py-2.5 border-b border-white/[0.06] flex items-center gap-2 bg-orange-500/5">
        <span className="text-base">🏗️</span>
        <span className="text-[11px] font-bold text-orange-400 uppercase tracking-widest">
          Call Stack
        </span>
        <span className="text-[10px] text-slate-500 font-mono ml-auto">
          depth: {frames.length}
        </span>
      </div>

      {/* Operation indicator */}
      {activeOp && (
        <div className="px-4 py-1.5 bg-orange-500/5 border-b border-white/[0.04] text-[10px] font-mono text-orange-300/70">
          {activeOp}
        </div>
      )}

      {/* Stack frames */}
      <div className="p-3 space-y-2 min-h-[80px]">
        {frames.length === 0 && (
          <div className="text-slate-600 text-xs font-mono text-center py-6 italic">
            stack is empty
          </div>
        )}

        {frames.map((frame, idx) => {
          const key = keys[idx] ?? idx;
          const colors = FRAME_COLORS[idx % FRAME_COLORS.length];

          return (
            <div
              key={key}
              ref={(el) => (frameRefs.current[key] = el)}
              className={`rounded-xl border bg-gradient-to-r ${colors.bg} ${colors.border} p-3 transition-all duration-300 ${
                idx === 0 ? 'shadow-lg' : ''
              }`}
              style={idx === 0 ? { boxShadow: '0 0 15px rgba(251,146,60,0.15)' } : {}}
            >
              <div className="flex items-center gap-2 mb-2">
                <span className={`w-2 h-2 rounded-full ${colors.dot} ${idx === 0 ? 'animate-pulse' : ''}`} />
                <span className={`text-xs font-bold font-mono ${colors.text}`}>
                  {frame.name}()
                </span>
                {idx === 0 && (
                  <span className="ml-auto text-[9px] text-orange-300/60 uppercase tracking-wider font-bold">
                    active
                  </span>
                )}
              </div>
              {frame.variables && Object.entries(frame.variables).length > 0 && (
                <div className="space-y-1 pl-4 border-l border-white/[0.06]">
                  {Object.entries(frame.variables).map(([k, v]) => (
                    <div key={k} className="flex justify-between text-[11px] font-mono">
                      <span className="text-slate-400">{k}</span>
                      <span className="text-cyan-300">{String(v)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Stack base */}
      <div className="px-3 pb-3">
        <div className="h-1 w-full bg-gradient-to-r from-orange-500/20 via-orange-400/30 to-orange-500/20 rounded-full" />
        <div className="text-center text-[10px] text-slate-600 mt-1 font-mono">stack base</div>
      </div>
    </div>
  );
}
