import { useEffect, useRef, useState, useMemo } from 'react';
import gsap from 'gsap';

const TYPE_COLORS = {
  int: { bg: 'from-blue-500/20 to-blue-600/10', border: 'border-blue-400/40', text: 'text-blue-300', badge: 'bg-blue-500/20 text-blue-300' },
  float: { bg: 'from-teal-500/20 to-teal-600/10', border: 'border-teal-400/40', text: 'text-teal-300', badge: 'bg-teal-500/20 text-teal-300' },
  str: { bg: 'from-amber-500/20 to-amber-600/10', border: 'border-amber-400/40', text: 'text-amber-300', badge: 'bg-amber-500/20 text-amber-300' },
  bool: { bg: 'from-purple-500/20 to-purple-600/10', border: 'border-purple-400/40', text: 'text-purple-300', badge: 'bg-purple-500/20 text-purple-300' },
  list: { bg: 'from-cyan-500/20 to-cyan-600/10', border: 'border-cyan-400/40', text: 'text-cyan-300', badge: 'bg-cyan-500/20 text-cyan-300' },
  None: { bg: 'from-slate-500/20 to-slate-600/10', border: 'border-slate-400/40', text: 'text-slate-400', badge: 'bg-slate-500/20 text-slate-400' },
};

const DEFAULT_COLORS = { bg: 'from-violet-500/20 to-violet-600/10', border: 'border-violet-400/40', text: 'text-violet-300', badge: 'bg-violet-500/20 text-violet-300' };

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
  const glowRef = useRef(null);
  const historyRef = useRef([]);

  const stableValues = useMemo(() => values, [JSON.stringify(values)]);

  const onCompleteRef = useRef(onComplete);
  useEffect(() => { onCompleteRef.current = onComplete; }, [onComplete]);

  const [currentValue, setCurrentValue] = useState(stableValues[0] ?? '');
  const [oldValue, setOldValue] = useState(null);
  const [showOld, setShowOld] = useState(false);
  const [justChanged, setJustChanged] = useState(false);
  const [history, setHistory] = useState([]);
  const prevStep = useRef(-1);

  const typeLabel = detectType(currentValue);
  const colors = TYPE_COLORS[typeLabel] || DEFAULT_COLORS;

  useEffect(() => {
    if (!boxRef.current) return;

    gsap.fromTo(
      boxRef.current,
      { opacity: 0, scale: 0.85, y: 20, rotateX: 15 },
      {
        opacity: 1,
        scale: 1,
        y: 0,
        rotateX: 0,
        duration: 0.8,
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

    if (valueRef.current && currentValue !== newValue) {
      setOldValue(currentValue);
      setShowOld(true);
      setJustChanged(true);

      // Add to history
      setHistory(prev => [...prev, { value: currentValue, step: valueIndex - 1 }]);

      const tl = gsap.timeline({
        onComplete: () => {
          setShowOld(false);
          if (isLast) onCompleteRef.current?.();
        },
      });

      // Glow burst on change
      if (glowRef.current) {
        tl.fromTo(
          glowRef.current,
          { opacity: 0.8, scale: 0.8 },
          { opacity: 0, scale: 2, duration: 0.8, ease: 'power2.out' },
          0
        );
      }

      // Fade out old value upward
      if (oldValueRef.current) {
        tl.to(oldValueRef.current, { opacity: 0, y: -20, scale: 0.8, duration: 0.25, ease: 'power2.in' }, 0);
      }

      // Bounce in new value
      tl.to(valueRef.current, { scale: 1.2, duration: 0.15, ease: 'power2.out' }, 0.15);
      tl.call(() => setCurrentValue(newValue), [], 0.25);
      tl.to(valueRef.current, { scale: 1, duration: 0.35, ease: 'elastic.out(1, 0.4)' });

      // Clear changed state
      tl.call(() => setJustChanged(false), [], '+=0.6');
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
      className="opacity-0 w-56 relative perspective-[800px]"
    >
      {/* Glow burst element */}
      <div
        ref={glowRef}
        className={`absolute inset-0 rounded-2xl opacity-0 pointer-events-none blur-xl ${
          justChanged ? 'bg-amber-400/30' : 'bg-cyan-400/20'
        }`}
      />

      <div className={`relative rounded-2xl border ${colors.border} bg-gradient-to-br ${colors.bg} backdrop-blur-sm overflow-hidden`}>
        {/* Header strip */}
        <div className="px-4 py-2.5 border-b border-white/[0.06] flex items-center justify-between">
          <span className="text-[11px] font-bold text-slate-300 uppercase tracking-widest font-mono">
            {variable}
          </span>
          <span className={`text-[9px] font-mono font-bold px-2 py-0.5 rounded-full ${colors.badge}`}>
            {typeLabel}
          </span>
        </div>

        {/* Value display */}
        <div className="px-4 py-5 relative">
          {/* Change indicator */}
          {justChanged && (
            <div className="absolute -top-1 left-1/2 -translate-x-1/2 text-amber-400 text-[10px] font-bold tracking-wider uppercase animate-bounce">
              updated
            </div>
          )}

          {showOld && oldValue !== null && (
            <div
              ref={oldValueRef}
              className="absolute inset-x-4 top-5 font-mono text-2xl font-bold text-slate-500/50 text-center z-0"
            >
              {String(oldValue)}
            </div>
          )}

          <div
            ref={valueRef}
            className={`font-mono text-3xl font-bold text-center relative z-10 transition-colors duration-300 ${
              justChanged ? 'text-amber-200' : colors.text
            }`}
          >
            {String(currentValue)}
          </div>

          {label && (
            <div className="text-[11px] text-slate-400 text-center mt-2">{label}</div>
          )}
        </div>

        {/* Progress indicator */}
        {totalSteps > 1 && (
          <div className="px-4 pb-3 flex items-center gap-1.5 justify-center">
            {stableValues.map((_, i) => (
              <div
                key={i}
                className={`h-1 rounded-full transition-all duration-400 ${
                  i <= currentIndex
                    ? i === currentIndex
                      ? 'w-4 bg-cyan-400 shadow-[0_0_4px_rgba(34,211,238,0.5)]'
                      : 'w-2 bg-slate-500'
                    : 'w-2 bg-slate-700'
                }`}
              />
            ))}
          </div>
        )}

        {/* Value history trail */}
        {history.length > 0 && (
          <div className="px-4 pb-3 flex items-center gap-1 justify-center">
            <span className="text-[9px] text-slate-600 mr-1">history:</span>
            {history.slice(-4).map((h, i) => (
              <span key={i} className="text-[10px] font-mono text-slate-600 bg-white/[0.03] rounded px-1.5 py-0.5">
                {String(h.value)}
              </span>
            ))}
            <span className="text-[10px] text-slate-500 mx-0.5">→</span>
            <span className={`text-[10px] font-mono font-bold ${colors.text} bg-white/[0.05] rounded px-1.5 py-0.5`}>
              {String(currentValue)}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
