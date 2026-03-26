import { useEffect, useRef, useState } from 'react';
import gsap from 'gsap';

function detectType(val) {
  if (val === null || val === undefined || val === 'None') return 'None';
  if (Array.isArray(val)) return 'list';
  if (typeof val === 'boolean' || val === 'True' || val === 'False') return 'bool';
  if (typeof val === 'number') return Number.isInteger(val) ? 'int' : 'float';
  if (typeof val === 'string') {
    if (/^-?\d+$/.test(val)) return 'int';
    if (/^-?\d+\.\d+$/.test(val)) return 'float';
    if (val.startsWith('[')) return 'list';
    return 'str';
  }
  return typeof val;
}

export default function VariableBox({ variable = '', values = [], label = '', syncStep = 0, onComplete }) {
  const boxRef = useRef(null);
  const valueRef = useRef(null);
  const oldValueRef = useRef(null);
  const [currentValue, setCurrentValue] = useState(values[0] ?? '');
  const [oldValue, setOldValue] = useState(null);
  const [showOld, setShowOld] = useState(false);
  const prevStep = useRef(-1);

  const typeLabel = detectType(currentValue);

  useEffect(() => {
    if (!boxRef.current) return;

    gsap.fromTo(
      boxRef.current,
      { opacity: 0, scale: 0.8, y: 20 },
      {
        opacity: 1,
        scale: 1,
        y: 0,
        duration: 0.7,
        ease: 'elastic.out(1, 0.6)',
        onComplete: () => {
          if (values.length === 0) onComplete?.();
        },
      }
    );
  }, []);

  useEffect(() => {
    const valueIndex = syncStep;
    if (valueIndex === prevStep.current) return;
    if (valueIndex < 0 || valueIndex >= values.length) return;

    prevStep.current = valueIndex;
    const newValue = values[valueIndex];
    const isLast = valueIndex === values.length - 1;

    // Show old -> new crossfade
    if (valueRef.current && currentValue !== newValue) {
      setOldValue(currentValue);
      setShowOld(true);

      const tl = gsap.timeline({
        onComplete: () => {
          setShowOld(false);
          if (isLast) onComplete?.();
        },
      });

      // Fade out old value
      if (oldValueRef.current) {
        tl.to(oldValueRef.current, { opacity: 0, y: -10, duration: 0.2, ease: 'power2.in' }, 0);
      }

      // Scale up and set new value
      tl.to(valueRef.current, { scale: 1.3, duration: 0.15, ease: 'power2.out' }, 0.1);
      tl.call(() => setCurrentValue(newValue), [], 0.2);
      tl.to(valueRef.current, { scale: 1, duration: 0.25, ease: 'elastic.out(1, 0.5)' });
    } else {
      setCurrentValue(newValue);
      if (isLast) onComplete?.();
    }
  }, [syncStep, values]);

  const totalSteps = values.length;
  const currentIndex = Math.min(syncStep, totalSteps - 1);

  return (
    <div
      ref={boxRef}
      className="rounded-xl p-[2px] opacity-0 w-52 bg-gradient-to-br from-cyan-400 via-purple-500 to-cyan-400"
    >
      <div className="bg-white rounded-[10px] p-5 flex flex-col items-center gap-3">
        {/* Variable name */}
        <div className="text-xs font-semibold text-cyan-600 uppercase tracking-widest">
          {variable}
        </div>

        {label && (
          <div className="text-xs text-slate-500">{label}</div>
        )}

        {/* Value display with crossfade */}
        <div className="relative w-full">
          {showOld && oldValue !== null && (
            <div
              ref={oldValueRef}
              className="absolute inset-0 font-mono text-2xl font-bold text-slate-400 bg-slate-100 rounded-lg px-4 py-2 text-center"
            >
              {String(oldValue)}
            </div>
          )}
          <div
            ref={valueRef}
            className="font-mono text-3xl font-bold text-slate-800 bg-cyan-50 border border-cyan-200 rounded-lg px-4 py-2 w-full text-center"
          >
            {String(currentValue)}
          </div>
        </div>

        {/* Type indicator */}
        <span className="text-[10px] font-mono text-slate-400 bg-slate-100 rounded-full px-2.5 py-0.5">
          {typeLabel}
        </span>

        {/* Progress dots */}
        {totalSteps > 1 && (
          <div className="flex gap-1.5">
            {values.map((_, i) => (
              <span
                key={i}
                className={`w-2 h-2 rounded-full transition-colors duration-300 ${
                  i <= currentIndex ? 'bg-cyan-400' : 'bg-slate-200'
                }`}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
