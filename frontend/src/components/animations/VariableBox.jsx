import { useEffect, useRef, useState } from 'react';
import gsap from 'gsap';

export default function VariableBox({ variable = '', values = [], label = '', syncStep = 0, onComplete }) {
  const boxRef = useRef(null);
  const valueRef = useRef(null);
  const [currentValue, setCurrentValue] = useState(values[0] ?? '');
  const prevStep = useRef(-1);

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

    if (valueRef.current) {
      gsap.timeline({
        onComplete: () => {
          if (isLast) onComplete?.();
        },
      })
        .to(valueRef.current, { scale: 1.3, duration: 0.15, ease: 'power2.out' })
        .call(() => setCurrentValue(newValue))
        .to(valueRef.current, { scale: 1, duration: 0.25, ease: 'elastic.out(1, 0.5)' });
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
      className="panel rounded-xl border-l-4 border-cyan-500 p-5 opacity-0 w-48 flex flex-col items-center gap-3"
    >
      {/* Variable name */}
      <div className="text-xs font-semibold text-cyan-400 uppercase tracking-widest">
        {variable}
      </div>

      {label && (
        <div className="text-xs text-slate-500">{label}</div>
      )}

      {/* Value display */}
      <div
        ref={valueRef}
        className="font-mono text-3xl font-bold text-white bg-cyan-500/10 rounded-lg px-4 py-2 w-full text-center"
      >
        {String(currentValue)}
      </div>

      {/* Progress dots */}
      {totalSteps > 1 && (
        <div className="flex gap-1.5">
          {values.map((_, i) => (
            <span
              key={i}
              className={`w-2 h-2 rounded-full transition-colors duration-300 ${
                i <= currentIndex ? 'bg-cyan-400' : 'bg-slate-700'
              }`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
