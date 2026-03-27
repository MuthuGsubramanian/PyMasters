import { useEffect, useRef, useState, useMemo } from 'react';
import gsap from 'gsap';

const SPEED_MAP = { slow: 3.0, normal: 2.0, fast: 1.0, profile_adaptive: 2.0 };

function NodeBox({ node, isActive, isPast }) {
  const isDecision = node.type === 'decision';
  const isStart = node.type === 'start';
  const isEnd = node.type === 'end';

  const baseClasses = 'relative px-5 py-3 text-xs font-mono transition-all duration-400 text-center border';

  let shapeClasses = 'rounded-lg';
  if (isDecision) shapeClasses = 'rotate-0 rounded-lg border-dashed';
  if (isStart || isEnd) shapeClasses = 'rounded-full';

  let colorClasses = 'bg-slate-800/60 border-white/[0.08] text-slate-400';
  if (isActive) {
    colorClasses = 'bg-cyan-500/15 border-cyan-400/60 text-cyan-100 shadow-[0_0_20px_rgba(56,189,248,0.25)] scale-105';
  } else if (isPast) {
    colorClasses = 'bg-slate-800/40 border-slate-600/40 text-slate-500';
  }

  return (
    <div className={`${baseClasses} ${shapeClasses} ${colorClasses}`}>
      {isDecision && (
        <span className="absolute -top-5 left-1/2 -translate-x-1/2 text-[9px] text-amber-400 uppercase tracking-wider font-medium">
          Decision
        </span>
      )}
      <span className="leading-relaxed">{node.label || node.id}</span>
      {isActive && (
        <span className="absolute -right-1 -top-1 flex h-3 w-3">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-3 w-3 bg-cyan-500" />
        </span>
      )}
    </div>
  );
}

function Arrow({ edge, isActive, isPast }) {
  const colorClass = isActive
    ? 'border-cyan-400/70'
    : isPast
    ? 'border-slate-600/50'
    : 'border-white/[0.08]';

  const label = edge?.label || '';

  return (
    <div className="flex flex-col items-center py-1">
      <div className={`w-0 h-5 border-l-2 transition-all duration-300 ${colorClass}`} />
      <div className={`w-0 h-0 border-l-[5px] border-r-[5px] border-t-[6px] border-l-transparent border-r-transparent transition-all duration-300 ${
        isActive ? 'border-t-cyan-400/70' : isPast ? 'border-t-slate-600/50' : 'border-t-white/[0.08]'
      }`} />
      {label && (
        <span className={`text-[9px] mt-0.5 transition-all duration-300 ${
          isActive ? 'text-cyan-300' : 'text-slate-600'
        }`}>
          {label}
        </span>
      )}
    </div>
  );
}

export default function FlowDiagram({
  nodes = [],
  edges = [],
  executionPath = [],
  variables = {},
  speed = 'normal',
  onComplete,
}) {
  const containerRef = useRef(null);
  const onCompleteRef = useRef(onComplete);
  const completedRef = useRef(false);
  const tlRef = useRef(null);
  const [activePathIndex, setActivePathIndex] = useState(-1);

  useEffect(() => { onCompleteRef.current = onComplete; }, [onComplete]);

  const stablePath = useMemo(
    () => executionPath,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [JSON.stringify(executionPath)]
  );

  const stableNodes = useMemo(
    () => nodes,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [JSON.stringify(nodes)]
  );

  const stableEdges = useMemo(
    () => edges,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [JSON.stringify(edges)]
  );

  const stepDuration = SPEED_MAP[speed] ?? 2.0;
  const totalSteps = stablePath.length;
  const activeNodeId = activePathIndex >= 0 ? stablePath[activePathIndex] : null;

  // Container fade-in
  useEffect(() => {
    if (!containerRef.current) return;
    gsap.fromTo(containerRef.current,
      { opacity: 0, y: 20 },
      { opacity: 1, y: 0, duration: 0.6, ease: 'power3.out' }
    );
  }, []);

  // Auto-play timeline
  useEffect(() => {
    if (stablePath.length === 0) return;
    completedRef.current = false;
    setActivePathIndex(-1);

    if (tlRef.current) tlRef.current.kill();

    const tl = gsap.timeline({
      onComplete: () => {
        if (!completedRef.current) {
          completedRef.current = true;
          onCompleteRef.current?.();
        }
      },
    });
    tlRef.current = tl;

    tl.to({}, { duration: 0.8 });

    stablePath.forEach((_, idx) => {
      tl.call(
        () => { setActivePathIndex(idx); },
        [],
        idx === 0 ? '>' : `+=${stepDuration}`
      );
    });

    tl.to({}, { duration: stepDuration + 0.5 });

    return () => { tl.kill(); };
  }, [stablePath, stepDuration]);

  // Build a lookup for which edge connects consecutive path nodes
  const pathEdgePairs = useMemo(() => {
    const pairs = new Set();
    for (let i = 0; i < stablePath.length - 1; i++) {
      pairs.add(`${stablePath[i]}->${stablePath[i + 1]}`);
    }
    return pairs;
  }, [stablePath]);

  const pastNodes = useMemo(() => {
    if (activePathIndex < 0) return new Set();
    return new Set(stablePath.slice(0, activePathIndex));
  }, [stablePath, activePathIndex]);

  const progress = totalSteps > 0 ? Math.max(((activePathIndex + 1) / totalSteps) * 100, 0) : 0;

  // Build node order from edges or just use the nodes array
  const nodeMap = useMemo(() => {
    const m = {};
    stableNodes.forEach(n => { m[n.id] = n; });
    return m;
  }, [stableNodes]);

  return (
    <div ref={containerRef} className="rounded-2xl overflow-hidden opacity-0 max-w-2xl font-mono text-sm shadow-2xl shadow-black/20 border border-white/[0.06]">
      {/* Header */}
      <div className="bg-gradient-to-r from-slate-800 via-slate-800 to-slate-700 border-b border-white/[0.06] px-4 py-2.5 flex items-center gap-2">
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-full bg-[#ff5f57] shadow-[0_0_6px_rgba(255,95,87,0.4)]" />
          <span className="w-3 h-3 rounded-full bg-[#febc2e] shadow-[0_0_6px_rgba(254,188,46,0.4)]" />
          <span className="w-3 h-3 rounded-full bg-[#28c840] shadow-[0_0_6px_rgba(40,200,64,0.4)]" />
        </div>
        <span className="ml-3 text-[11px] text-slate-400 tracking-wide">Flow Diagram</span>
        {totalSteps > 0 && (
          <span className="ml-auto text-[10px] text-slate-500 tabular-nums">
            {Math.max(activePathIndex + 1, 0)}/{totalSteps}
          </span>
        )}
      </div>

      {/* Main content */}
      <div className="flex bg-[#0d1117]">
        {/* Flowchart nodes */}
        <div className="flex-1 flex flex-col items-center py-6 px-4 min-h-[200px]">
          {stableNodes.map((node, idx) => {
            const isActive = node.id === activeNodeId;
            const isPast = pastNodes.has(node.id);

            // Find edge going from this node to the next node in the nodes array
            const nextNode = stableNodes[idx + 1];
            const edge = nextNode
              ? stableEdges.find(e => e.from === node.id && e.to === nextNode.id)
                || stableEdges.find(e => e.source === node.id && e.target === nextNode.id)
              : null;

            // Is the arrow on the active path?
            const edgeKey = nextNode ? `${node.id}->${nextNode.id}` : '';
            const isEdgeActive = edgeKey === `${activeNodeId}->${stablePath[activePathIndex + 1]}`;
            const isEdgePast = pathEdgePairs.has(edgeKey) && pastNodes.has(node.id) && (pastNodes.has(nextNode?.id) || nextNode?.id === activeNodeId);

            return (
              <div key={node.id} className="flex flex-col items-center">
                <NodeBox node={node} isActive={isActive} isPast={isPast} />
                {/* Decision branch labels */}
                {node.type === 'decision' && (
                  <div className="flex gap-12 mt-1 mb-1">
                    {stableEdges
                      .filter(e => (e.from === node.id || e.source === node.id) && e.label)
                      .map((e, i) => (
                        <span key={i} className={`text-[9px] px-1.5 py-0.5 rounded ${
                          e.label === 'True' ? 'text-green-400 bg-green-500/10' : 'text-red-400 bg-red-500/10'
                        }`}>
                          {e.label}
                        </span>
                      ))}
                  </div>
                )}
                {nextNode && <Arrow edge={edge} isActive={isEdgeActive} isPast={isEdgePast} />}
              </div>
            );
          })}
        </div>

        {/* Variable sidebar */}
        {Object.keys(variables).length > 0 && (
          <div className="w-48 border-l border-white/[0.06] p-4">
            <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-2">Variables</p>
            <div className="space-y-1.5">
              {Object.entries(variables).map(([name, value]) => (
                <div key={name} className="flex items-center justify-between gap-2">
                  <span className="text-xs text-cyan-300 font-medium truncate">{name}</span>
                  <span className="text-xs text-amber-300 bg-amber-500/10 rounded px-1.5 py-0.5 truncate max-w-[80px]">
                    {value === null || value === undefined ? 'None' : String(value)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Progress bar */}
      {totalSteps > 0 && (
        <div className="bg-slate-900 border-t border-white/[0.06] px-4 py-2.5 flex items-center gap-3">
          <div className="flex-1 h-1 bg-slate-700/50 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-700 ease-out"
              style={{
                width: `${progress}%`,
                background: 'linear-gradient(90deg, #06b6d4, #8b5cf6, #06b6d4)',
                backgroundSize: '200% 100%',
                animation: 'fd-shimmer 2s linear infinite',
              }}
            />
          </div>
          <span className="text-[10px] font-mono text-slate-500 tabular-nums">
            {activePathIndex >= 0 ? activePathIndex + 1 : 0}/{totalSteps}
          </span>
        </div>
      )}

      <style>{`
        @keyframes fd-shimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
      `}</style>
    </div>
  );
}
