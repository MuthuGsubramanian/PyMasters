import { useEffect, useRef, useState, useMemo } from 'react';
import gsap from 'gsap';

export default function DataStructure({
  structure = 'list',
  data = [],
  operations = [],
  duration = 3000,
  onComplete,
}) {
  const containerRef = useRef(null);
  const itemRefs = useRef({});
  const highlightedRef = useRef(null);

  // Stabilize props to prevent re-render loops
  const stableData = useMemo(() => data, [JSON.stringify(data)]);
  const stableOperations = useMemo(() => operations, [JSON.stringify(operations)]);

  const [items, setItems] = useState([...stableData]);

  // Ref for onComplete to avoid it being a useEffect dependency
  const onCompleteRef = useRef(onComplete);
  useEffect(() => { onCompleteRef.current = onComplete; }, [onComplete]);

  // Sync items when stableData changes
  useEffect(() => {
    setItems([...stableData]);
  }, [stableData]);

  useEffect(() => {
    if (!containerRef.current) return;

    const holdSeconds = Math.max(duration / 1000, 2);

    // Spring in on mount
    gsap.fromTo(
      containerRef.current,
      { opacity: 0, y: 30, scale: 0.95 },
      { opacity: 1, y: 0, scale: 1, duration: 0.6, ease: 'back.out(1.7)' }
    );

    if (stableOperations.length === 0) {
      // No operations — complete after hold duration
      const id = gsap.delayedCall(0.7 + holdSeconds, () => onCompleteRef.current?.());
      return () => { id.kill(); };
    }

    // Play operations sequentially
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

            // Highlight the newly added item
            requestAnimationFrame(() => {
              const key = `${currentItems.length - 1}`;
              const el = itemRefs.current[key];
              if (el) {
                gsap.fromTo(
                  el,
                  { opacity: 0, scale: 0.5, backgroundColor: 'rgba(34,211,238,0.4)' },
                  {
                    opacity: 1,
                    scale: 1,
                    backgroundColor: 'rgba(34,211,238,0.08)',
                    duration: 0.4,
                    ease: 'back.out(2)',
                  }
                );
              }
            });
          } else if (op.action === 'remove' || op.action === 'pop') {
            const removeIndex = op.index ?? currentItems.length - 1;
            currentItems = currentItems.filter((_, i) => i !== removeIndex);
            setItems([...currentItems]);
          } else if (op.action === 'highlight') {
            const el = itemRefs.current[op.index];
            if (el) {
              gsap.fromTo(
                el,
                { backgroundColor: 'rgba(139,92,246,0.5)' },
                { backgroundColor: 'rgba(139,92,246,0.1)', duration: 0.6, ease: 'power2.out' }
              );
            }
          }
        },
        [],
        opIdx === 0 ? 0 : `+=${0.8}`
      );
    });

    // Hold so users can see the result before completing
    tl.to({}, { duration: holdSeconds });

    return () => {
      tl.kill();
    };
  }, [stableData, stableOperations, duration]);

  const structureLabel = {
    list: 'list',
    dict: 'dict',
    set: 'set',
    tuple: 'tuple',
  }[structure] || structure;

  const bracketOpen = { list: '[', dict: '{', set: '{', tuple: '(' }[structure] ?? '[';
  const bracketClose = { list: ']', dict: '}', set: '}', tuple: ')' }[structure] ?? ']';

  return (
    <div
      ref={containerRef}
      className="panel rounded-xl border-l-4 border-purple-500 p-5 opacity-0 max-w-lg"
    >
      <div className="flex items-center gap-2 mb-3">
        <span className="text-xs font-semibold text-purple-600 uppercase tracking-widest">
          {structureLabel}
        </span>
        <span className="text-slate-600 font-mono text-sm">{bracketOpen}</span>
        <span className="ml-auto text-slate-600 font-mono text-sm">{bracketClose}</span>
      </div>

      <div className="flex flex-wrap gap-2">
        {items.map((item, idx) => (
          <div
            key={idx}
            ref={(el) => (itemRefs.current[String(idx)] = el)}
            className="flex flex-col items-center"
          >
            <div className="text-xs text-slate-600 mb-0.5 font-mono">[{idx}]</div>
            <div className="bg-cyan-500/10 border border-cyan-500/30 rounded-lg px-3 py-2 font-mono text-sm text-slate-800 min-w-[2.5rem] text-center">
              {String(item)}
            </div>
          </div>
        ))}

        {items.length === 0 && (
          <span className="text-slate-600 text-sm font-mono italic">empty</span>
        )}
      </div>
    </div>
  );
}
