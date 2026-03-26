import { useEffect, useRef, useState, useMemo } from 'react';
import gsap from 'gsap';

export default function MemoryStack({ frames: initialFrames = [], operations = [], duration = 3000, onComplete }) {
  const containerRef = useRef(null);

  // Stabilize props to prevent re-render loops
  const stableInitialFrames = useMemo(() => initialFrames, [JSON.stringify(initialFrames)]);
  const stableOperations = useMemo(() => operations, [JSON.stringify(operations)]);

  const [frames, setFrames] = useState([...stableInitialFrames]);
  const frameRefs = useRef({});
  const frameKeyCounter = useRef(0);

  // Assign unique keys to initial frames
  const [frameKeys] = useState(() => stableInitialFrames.map(() => frameKeyCounter.current++));
  const [keys, setKeys] = useState([...frameKeys]);

  // Ref for onComplete to avoid it being a useEffect dependency
  const onCompleteRef = useRef(onComplete);
  useEffect(() => { onCompleteRef.current = onComplete; }, [onComplete]);

  useEffect(() => {
    if (!containerRef.current) return;

    const holdSeconds = Math.max(duration / 1000, 2);

    gsap.fromTo(
      containerRef.current,
      { opacity: 0, x: 20 },
      { opacity: 1, x: 0, duration: 0.5, ease: 'power2.out' }
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

            requestAnimationFrame(() => {
              const el = frameRefs.current[newKey];
              if (el) {
                gsap.fromTo(
                  el,
                  { opacity: 0, y: -30, scale: 0.9 },
                  { opacity: 1, y: 0, scale: 1, duration: 0.4, ease: 'back.out(1.5)' }
                );
              }
            });
          } else if (op.action === 'pop') {
            const topKey = currentKeys[0];
            const el = frameRefs.current[topKey];
            if (el) {
              gsap.to(el, {
                opacity: 0,
                y: -20,
                scale: 0.9,
                duration: 0.3,
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
        idx === 0 ? 0 : `+=${0.8}`
      );
    });

    // Hold so users can see the result before completing
    tl.to({}, { duration: holdSeconds });

    return () => {
      tl.kill();
    };
  }, [stableInitialFrames, stableOperations, duration]);

  return (
    <div
      ref={containerRef}
      className="panel rounded-xl border-l-4 border-orange-500 p-5 opacity-0 w-64"
    >
      <div className="text-xs font-semibold text-orange-600 uppercase tracking-widest mb-3">
        Call Stack
      </div>

      <div className="flex flex-col gap-2">
        {frames.length === 0 && (
          <div className="text-slate-600 text-xs font-mono text-center py-4">empty stack</div>
        )}

        {frames.map((frame, idx) => {
          const key = keys[idx] ?? idx;
          return (
            <div
              key={key}
              ref={(el) => (frameRefs.current[key] = el)}
              className={`rounded-lg border p-3 ${
                idx === 0
                  ? 'bg-orange-500/10 border-orange-500/40'
                  : 'bg-slate-50 border-slate-200'
              }`}
            >
              <div className="text-xs font-semibold text-orange-700 mb-1.5 font-mono">
                {frame.name}()
              </div>
              {frame.variables && Object.entries(frame.variables).map(([k, v]) => (
                <div key={k} className="flex justify-between text-xs font-mono">
                  <span className="text-slate-700">{k}</span>
                  <span className="text-cyan-700">{String(v)}</span>
                </div>
              ))}
            </div>
          );
        })}
      </div>

      {/* Stack base indicator */}
      <div className="mt-3 h-1 w-full bg-orange-500/30 rounded-full" />
      <div className="text-center text-xs text-slate-600 mt-1">bottom</div>
    </div>
  );
}
