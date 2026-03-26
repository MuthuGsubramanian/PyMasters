import { useEffect, useRef, useState, useMemo } from 'react';
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
  const pulseRef = useRef(null);

  // Stabilize props to prevent re-render loops
  const stableValues = useMemo(() => values, [JSON.stringify(values)]);

  // Ref for onComplete to avoid it being a useEffect dependency
  const onCompleteRef = useRef(onComplete);
  useEffect(() => { onCompleteRef.current = onComplete; }, [onComplete]);

  const [currentValue, setCurrentValue] = useState(stableValues[0] ?? '');
  const [oldValue, setOldValue] = useState(null);
  const [showOld, setShowOld] = useState(false);
  const [justChanged, setJustChanged] = useState(false);
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
          if (stableValues.length === 0) onCompleteRef.current?.();
        },
      }
    );
  }, [stableValues]);

  useEffect(() => {
    const valueIndex = syncStep;
    if (valueIndex === prevStep.current) return;
    if (valueIndex < 0 || valueIndex >= stableValues.length) return;

    prevStep.current = valueIndex;
    const newValue = stableValues[valueIndex];
    const isLast = valueIndex === stableValues.length - 1;

    // Show old -> new crossfade
    if (valueRef.current && currentValue !== newValue) {
      setOldValue(currentValue);
      setShowOld(true);
      setJustChanged(true);

      const tl = gsap.timeline({
        onComplete: () => {
          setShowOld(false);
          if (isLast) onCompleteRef.current?.();
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

      // Pulse effect on change
      if (pulseRef.current) {
        tl.fromTo(
          pulseRef.current,
          { opacity: 0.8, scale: 1 },
          { opacity: 0, scale: 1.5, duration: 0.6, ease: 'power2.out' },
          0.15
        );
      }

      // Clear changed state after animation
      tl.call(() => setJustChanged(false), [], '+=0.5');
    } else {
      setCurrentValue(newValue);
      if (isLast) onCompleteRef.current?.();
    }
  }, [syncStep, stableValues]);

  const totalSteps = stableValues.length;
  const currentIndex = Math.min(syncStep, totalSteps - 1);

  return (
    <div
      ref={boxRef}
      className={`rounded-xl p-[2px] opacity-0 w-52 bg-gradient-to-br transition-all duration-300 ${
        justChanged
          ? 'from-yellow-400 via-orange-500 to-yellow-400 shadow-lg shadow-orange-300/40'
          : 'from-cyan-400 via-purple-500 to-cyan-400'
      }`}
    >
      <div className="bg-white rounded-[10px] p-5 flex flex-col items-center gap-3 relative">
        {/* Change indicator arrow */}
        {justChanged && (
          <div className="absolute -top-3 left-1/2 -translate-x-1/2 text-orange-500 text-lg animate-bounce">
            &#9660;
          </div>
        )}

        {/* Variable name */}
        <div className="text-xs font-semibold text-cyan-600 uppercase tracking-widest">
          {variable}
        </div>

        {label && (
          <div className="text-xs text-slate-600">{label}</div>
        )}

        {/* Value display with crossfade and pulse ring */}
        <div className="relative w-full">
          {/* Pulse ring */}
          <div
            ref={pulseRef}
            className="absolute inset-0 rounded-lg border-2 border-orange-400 opacity-0 pointer-events-none"
          />

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
            className={`font-mono text-3xl font-bold text-slate-800 rounded-lg px-4 py-2 w-full text-center transition-colors duration-300 ${
              justChanged
                ? 'bg-orange-50 border border-orange-300'
                : 'bg-cyan-50 border border-cyan-200'
            }`}
          >
            {String(currentValue)}
          </div>
        </div>

        {/* Type indicator */}
        <span className="text-[10px] font-mono text-slate-500 bg-slate-100 rounded-full px-2.5 py-0.5">
          {typeLabel}
        </span>

        {/* Progress dots */}
        {totalSteps > 1 && (
          <div className="flex gap-1.5">
            {stableValues.map((_, i) => (
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
