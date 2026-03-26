import { useEffect, useRef, useMemo } from 'react';
import gsap from 'gsap';

export default function ConceptMap({ nodes = [], edges = [], duration = 3000, onComplete }) {
  const containerRef = useRef(null);
  const nodeRefs = useRef({});
  const edgeRefs = useRef([]);

  // Stabilize props to prevent re-render loops
  const stableNodes = useMemo(() => nodes, [JSON.stringify(nodes)]);
  const stableEdges = useMemo(() => edges, [JSON.stringify(edges)]);

  // Ref for onComplete to avoid it being a useEffect dependency
  const onCompleteRef = useRef(onComplete);
  useEffect(() => { onCompleteRef.current = onComplete; }, [onComplete]);

  useEffect(() => {
    if (!containerRef.current) return;

    const nodeEls = stableNodes.map((n) => nodeRefs.current[n.id]).filter(Boolean);
    const edgeEls = edgeRefs.current.filter(Boolean);

    const holdSeconds = Math.max(duration / 1000, 2);

    const tl = gsap.timeline({
      onComplete: () => onCompleteRef.current?.(),
    });

    // Animate container
    tl.fromTo(
      containerRef.current,
      { opacity: 0 },
      { opacity: 1, duration: 0.3, ease: 'power2.out' }
    );

    // Nodes scale in with stagger + back.out easing
    if (nodeEls.length > 0) {
      tl.fromTo(
        nodeEls,
        { opacity: 0, scale: 0 },
        {
          opacity: 1,
          scale: 1,
          duration: 0.5,
          ease: 'back.out(1.7)',
          stagger: 0.1,
        },
        '-=0.1'
      );
    }

    // Edges fade in after nodes
    if (edgeEls.length > 0) {
      tl.fromTo(
        edgeEls,
        { opacity: 0 },
        { opacity: 1, duration: 0.4, stagger: 0.08, ease: 'power2.out' },
        '-=0.1'
      );
    }

    // Hold so users can see the result before completing
    tl.to({}, { duration: holdSeconds });

    return () => {
      tl.kill();
    };
  }, [stableNodes, stableEdges, duration]);

  return (
    <div
      ref={containerRef}
      className="opacity-0 max-w-2xl"
    >
      {/* Nodes */}
      <div className="flex flex-wrap gap-3 mb-4">
        {stableNodes.map((node) => (
          <div
            key={node.id}
            ref={(el) => (nodeRefs.current[node.id] = el)}
            className="panel rounded-xl px-4 py-2.5 bg-cyan-500/10 border border-cyan-500/30 text-slate-800 text-sm font-medium"
          >
            {node.label}
          </div>
        ))}
      </div>

      {/* Edges */}
      {stableEdges.length > 0 && (
        <div className="flex flex-col gap-2">
          {stableEdges.map((edge, idx) => {
            const fromNode = stableNodes.find((n) => n.id === edge.from);
            const toNode = stableNodes.find((n) => n.id === edge.to);
            return (
              <div
                key={idx}
                ref={(el) => (edgeRefs.current[idx] = el)}
                className="flex items-center gap-2 text-sm"
              >
                <span className="text-cyan-700 font-medium">
                  {fromNode?.label ?? edge.from}
                </span>
                <span className="flex items-center gap-1 text-slate-500">
                  <span className="text-xs">{edge.label || '\u2192'}</span>
                  <svg width="24" height="12" viewBox="0 0 24 12">
                    <line x1="0" y1="6" x2="18" y2="6" stroke="#475569" strokeWidth="1.5" />
                    <polygon points="24,6 16,2 16,10" fill="#475569" />
                  </svg>
                </span>
                <span className="text-cyan-700 font-medium">
                  {toNode?.label ?? edge.to}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
