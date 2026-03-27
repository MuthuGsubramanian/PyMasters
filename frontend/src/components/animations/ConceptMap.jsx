import { useEffect, useRef, useMemo } from 'react';
import gsap from 'gsap';

const NODE_COLORS = [
  { bg: 'from-cyan-500/15 to-cyan-600/5', border: 'border-cyan-400/30', text: 'text-cyan-300' },
  { bg: 'from-purple-500/15 to-purple-600/5', border: 'border-purple-400/30', text: 'text-purple-300' },
  { bg: 'from-amber-500/15 to-amber-600/5', border: 'border-amber-400/30', text: 'text-amber-300' },
  { bg: 'from-green-500/15 to-green-600/5', border: 'border-green-400/30', text: 'text-green-300' },
  { bg: 'from-rose-500/15 to-rose-600/5', border: 'border-rose-400/30', text: 'text-rose-300' },
];

export default function ConceptMap({ nodes = [], edges = [], duration = 3000, onComplete }) {
  const containerRef = useRef(null);
  const nodeRefs = useRef({});
  const edgeRefs = useRef([]);

  const stableNodes = useMemo(() => nodes, [JSON.stringify(nodes)]);
  const stableEdges = useMemo(() => edges, [JSON.stringify(edges)]);

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

    tl.fromTo(containerRef.current,
      { opacity: 0 },
      { opacity: 1, duration: 0.3, ease: 'power2.out' }
    );

    // Nodes pop in with stagger and elastic
    if (nodeEls.length > 0) {
      tl.fromTo(nodeEls,
        { opacity: 0, scale: 0, y: 10 },
        {
          opacity: 1,
          scale: 1,
          y: 0,
          duration: 0.5,
          ease: 'back.out(2)',
          stagger: 0.08,
        },
        '-=0.1'
      );
    }

    // Edges animate in with line draw effect
    if (edgeEls.length > 0) {
      tl.fromTo(edgeEls,
        { opacity: 0, x: -8 },
        { opacity: 1, x: 0, duration: 0.35, stagger: 0.06, ease: 'power2.out' },
        '-=0.15'
      );
    }

    tl.to({}, { duration: holdSeconds });

    return () => { tl.kill(); };
  }, [stableNodes, stableEdges, duration]);

  return (
    <div
      ref={containerRef}
      className="opacity-0 max-w-2xl rounded-2xl border border-white/[0.06] overflow-hidden bg-gradient-to-br from-slate-900/30 to-slate-800/20 p-5"
    >
      {/* Title */}
      <div className="flex items-center gap-2 mb-4">
        <span className="text-base">🧠</span>
        <span className="text-[11px] font-bold text-cyan-400 uppercase tracking-widest">Concept Map</span>
      </div>

      {/* Nodes */}
      <div className="flex flex-wrap gap-2.5 mb-5">
        {stableNodes.map((node, i) => {
          const colors = NODE_COLORS[i % NODE_COLORS.length];
          return (
            <div
              key={node.id}
              ref={(el) => (nodeRefs.current[node.id] = el)}
              className={`rounded-xl px-4 py-2.5 bg-gradient-to-r ${colors.bg} border ${colors.border} ${colors.text} text-sm font-medium backdrop-blur-sm transition-all duration-300 hover:scale-105`}
            >
              {node.label}
            </div>
          );
        })}
      </div>

      {/* Edges */}
      {stableEdges.length > 0 && (
        <div className="flex flex-col gap-2 pl-2 border-l border-white/[0.06]">
          {stableEdges.map((edge, idx) => {
            const fromNode = stableNodes.find((n) => n.id === edge.from);
            const toNode = stableNodes.find((n) => n.id === edge.to);
            return (
              <div
                key={idx}
                ref={(el) => (edgeRefs.current[idx] = el)}
                className="flex items-center gap-2.5 text-sm py-1"
              >
                <span className="text-cyan-400 font-medium text-xs bg-cyan-500/10 rounded-lg px-2 py-0.5">
                  {fromNode?.label ?? edge.from}
                </span>
                <div className="flex items-center gap-1 text-slate-500">
                  <svg width="28" height="12" viewBox="0 0 28 12" className="opacity-60">
                    <defs>
                      <linearGradient id={`edge-grad-${idx}`} x1="0%" y1="0%" x2="100%" y2="0%">
                        <stop offset="0%" stopColor="#06b6d4" />
                        <stop offset="100%" stopColor="#8b5cf6" />
                      </linearGradient>
                    </defs>
                    <line x1="0" y1="6" x2="20" y2="6" stroke={`url(#edge-grad-${idx})`} strokeWidth="1.5" />
                    <polygon points="28,6 20,2 20,10" fill="#8b5cf6" />
                  </svg>
                  {edge.label && <span className="text-[10px] text-slate-500 italic">{edge.label}</span>}
                </div>
                <span className="text-purple-400 font-medium text-xs bg-purple-500/10 rounded-lg px-2 py-0.5">
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
