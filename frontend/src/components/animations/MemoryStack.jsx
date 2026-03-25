import { useEffect, useRef, useState } from 'react';
import gsap from 'gsap';

export default function MemoryStack({ frames: initialFrames = [], operations = [], onComplete }) {
  const containerRef = useRef(null);
  const [frames, setFrames] = useState([...initialFrames]);
  const frameRefs = useRef({});
  const frameKeyCounter = useRef(0);

  // Assign unique keys to initial frames
  const [frameKeys] = useState(() => initialFrames.map(() => frameKeyCounter.current++));
  const [keys, setKeys] = useState([...frameKeys]);

  useEffect(() => {
    if (!containerRef.current) return;

    gsap.fromTo(
      containerRef.current,
      { opacity: 0, x: 20 },
      { opacity: 1, x: 0, duration: 0.5, ease: 'power2.out' }
    );

    if (operations.length === 0) {
      gsap.delayedCall(0.6, () => onComplete?.());
      return;
    }

    const tl = gsap.timeline({ delay: 0.6, onComplete: () => onComplete?.() });

    let currentFrames = [...initialFrames];
    let currentKeys = [...frameKeys];

    operations.forEach((op, idx) => {
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

    return () => {
      tl.kill();
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className="panel rounded-xl border-l-4 border-orange-500 p-5 opacity-0 w-64"
    >
      <div className="text-xs font-semibold text-orange-400 uppercase tracking-widest mb-3">
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
                  : 'bg-white/[0.02] border-white/10'
              }`}
            >
              <div className="text-xs font-semibold text-orange-300 mb-1.5 font-mono">
                {frame.name}()
              </div>
              {frame.variables && Object.entries(frame.variables).map(([k, v]) => (
                <div key={k} className="flex justify-between text-xs font-mono">
                  <span className="text-slate-400">{k}</span>
                  <span className="text-cyan-300">{String(v)}</span>
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
