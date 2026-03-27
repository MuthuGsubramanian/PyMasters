import { useEffect, useRef, useState, useMemo } from 'react';
import gsap from 'gsap';

const STRUCTURE_THEMES = {
  list: { accent: '#06b6d4', label: 'list', open: '[', close: ']', icon: '📋' },
  dict: { accent: '#8b5cf6', label: 'dict', open: '{', close: '}', icon: '🔑' },
  set: { accent: '#10b981', label: 'set', open: '{', close: '}', icon: '🎯' },
  tuple: { accent: '#f59e0b', label: 'tuple', open: '(', close: ')', icon: '📦' },
};

export default function DataStructure({
  structure = 'list',
  data = [],
  operations = [],
  duration = 3000,
  onComplete,
}) {
  const containerRef = useRef(null);
  const itemRefs = useRef({});
  const [items, setItems] = useState([...data]);
  const [highlightIdx, setHighlightIdx] = useState(-1);
  const [operationLabel, setOperationLabel] = useState('');

  const stableData = useMemo(() => data, [JSON.stringify(data)]);
  const stableOperations = useMemo(() => operations, [JSON.stringify(operations)]);

  const onCompleteRef = useRef(onComplete);
  useEffect(() => { onCompleteRef.current = onComplete; }, [onComplete]);

  useEffect(() => {
    setItems([...stableData]);
  }, [stableData]);

  useEffect(() => {
    if (!containerRef.current) return;

    const holdSeconds = Math.max(duration / 1000, 2);

    gsap.fromTo(
      containerRef.current,
      { opacity: 0, y: 30, scale: 0.95 },
      { opacity: 1, y: 0, scale: 1, duration: 0.7, ease: 'back.out(1.7)' }
    );

    if (stableOperations.length === 0) {
      const id = gsap.delayedCall(0.7 + holdSeconds, () => onCompleteRef.current?.());
      return () => { id.kill(); };
    }

    const tl = gsap.timeline({
      delay: 0.7,
      onComplete: () => onCompleteRef.current?.(),
    });

    let currentItems = [...stableData];

    stableOperations.forEach((op, opIdx) => {
      tl.call(
        () => {
          if (op.action === 'append' || op.action === 'add') {
            currentItems = [...currentItems, op.value];
            setItems([...currentItems]);
            setOperationLabel(`append(${JSON.stringify(op.value)})`);
            setHighlightIdx(currentItems.length - 1);

            requestAnimationFrame(() => {
              const key = `${currentItems.length - 1}`;
              const el = itemRefs.current[key];
              if (el) {
                gsap.fromTo(el,
                  { opacity: 0, scale: 0.3, y: -20 },
                  { opacity: 1, scale: 1, y: 0, duration: 0.5, ease: 'back.out(2.5)' }
                );
              }
            });

            // Reset highlight after delay
            setTimeout(() => setHighlightIdx(-1), 800);
          } else if (op.action === 'remove' || op.action === 'pop') {
            const removeIndex = op.index ?? currentItems.length - 1;
            setOperationLabel(op.action === 'pop' ? 'pop()' : `remove(${removeIndex})`);
            setHighlightIdx(removeIndex);

            const el = itemRefs.current[String(removeIndex)];
            if (el) {
              gsap.to(el, {
                opacity: 0, scale: 0.3, y: -20, duration: 0.4, ease: 'power2.in',
                onComplete: () => {
                  currentItems = currentItems.filter((_, i) => i !== removeIndex);
                  setItems([...currentItems]);
                  setHighlightIdx(-1);
                },
              });
            } else {
              currentItems = currentItems.filter((_, i) => i !== removeIndex);
              setItems([...currentItems]);
              setHighlightIdx(-1);
            }
          } else if (op.action === 'highlight') {
            setHighlightIdx(op.index);
            setOperationLabel(`access [${op.index}]`);
            const el = itemRefs.current[String(op.index)];
            if (el) {
              gsap.fromTo(el,
                { scale: 1.15, boxShadow: '0 0 20px rgba(139,92,246,0.5)' },
                { scale: 1, boxShadow: '0 0 0px transparent', duration: 0.8, ease: 'power2.out' }
              );
            }
            setTimeout(() => setHighlightIdx(-1), 800);
          } else if (op.action === 'insert') {
            const idx = op.index ?? 0;
            currentItems = [...currentItems.slice(0, idx), op.value, ...currentItems.slice(idx)];
            setItems([...currentItems]);
            setOperationLabel(`insert(${idx}, ${JSON.stringify(op.value)})`);
            setHighlightIdx(idx);

            requestAnimationFrame(() => {
              const el = itemRefs.current[String(idx)];
              if (el) {
                gsap.fromTo(el,
                  { opacity: 0, scale: 0, rotateY: 90 },
                  { opacity: 1, scale: 1, rotateY: 0, duration: 0.5, ease: 'back.out(2)' }
                );
              }
            });
            setTimeout(() => setHighlightIdx(-1), 800);
          }
        },
        [],
        opIdx === 0 ? 0 : `+=${1.0}`
      );
    });

    tl.to({}, { duration: holdSeconds });

    return () => { tl.kill(); };
  }, [stableData, stableOperations, duration]);

  const theme = STRUCTURE_THEMES[structure] || STRUCTURE_THEMES.list;

  return (
    <div
      ref={containerRef}
      className="rounded-2xl overflow-hidden opacity-0 max-w-lg border border-white/[0.06] shadow-xl shadow-black/10"
      style={{ background: `linear-gradient(135deg, ${theme.accent}08, ${theme.accent}03)` }}
    >
      {/* Header */}
      <div className="px-4 py-2.5 border-b border-white/[0.06] flex items-center gap-2"
        style={{ background: `${theme.accent}10` }}>
        <span className="text-base">{theme.icon}</span>
        <span className="text-[11px] font-bold uppercase tracking-widest" style={{ color: theme.accent }}>
          {theme.label}
        </span>
        <span className="text-slate-500 font-mono text-xs ml-1">
          len={items.length}
        </span>
        {operationLabel && (
          <span className="ml-auto text-[10px] font-mono px-2 py-0.5 rounded-full border"
            style={{ color: theme.accent, borderColor: `${theme.accent}30`, background: `${theme.accent}10` }}>
            .{operationLabel}
          </span>
        )}
      </div>

      {/* Items visualization */}
      <div className="p-4">
        <div className="flex items-center gap-1 mb-2">
          <span className="text-slate-500 font-mono text-sm font-bold">{theme.open}</span>
        </div>

        <div className="flex flex-wrap gap-2 min-h-[3rem] pl-4">
          {items.map((item, idx) => (
            <div
              key={`${idx}-${item}`}
              ref={(el) => (itemRefs.current[String(idx)] = el)}
              className="flex flex-col items-center"
            >
              {/* Index label */}
              <div className="text-[9px] text-slate-500 mb-1 font-mono tabular-nums">[{idx}]</div>
              {/* Value cell */}
              <div
                className={`rounded-lg px-3 py-2 font-mono text-sm min-w-[2.5rem] text-center border transition-all duration-300 ${
                  idx === highlightIdx
                    ? 'text-white scale-105'
                    : 'text-slate-300 bg-white/[0.03]'
                }`}
                style={idx === highlightIdx ? {
                  background: `${theme.accent}30`,
                  borderColor: `${theme.accent}60`,
                  boxShadow: `0 0 12px ${theme.accent}30`,
                } : {
                  borderColor: 'rgba(255,255,255,0.06)',
                }}
              >
                {String(item)}
              </div>
              {/* Comma separator */}
              {idx < items.length - 1 && (
                <span className="text-slate-600 font-mono text-xs mt-1">,</span>
              )}
            </div>
          ))}

          {items.length === 0 && (
            <span className="text-slate-600 text-sm font-mono italic py-2">empty</span>
          )}
        </div>

        <div className="flex items-center gap-1 mt-2">
          <span className="text-slate-500 font-mono text-sm font-bold">{theme.close}</span>
        </div>
      </div>
    </div>
  );
}
