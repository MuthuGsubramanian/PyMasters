import { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import gsap from 'gsap';

const SPEED_MAP = {
  slow: 3.0,
  normal: 1.5,
  fast: 0.8,
};

// ── Layout constants ──────────────────────────────────────────────
const NODE_W = 160;
const NODE_H = 50;
const DECISION_SIZE = 70; // half-diagonal for diamonds
const H_GAP = 200; // horizontal gap for decision branches
const V_GAP = 100; // vertical gap between rows
const PADDING = 40;
const VARIABLE_PANEL_W = 180;

// ── Shape helpers (return SVG elements) ──────────────────────────
function pillPath(cx, cy, w, h) {
  const r = h / 2;
  return `M ${cx - w / 2 + r},${cy - h / 2}
          L ${cx + w / 2 - r},${cy - h / 2}
          A ${r},${r} 0 0 1 ${cx + w / 2 - r},${cy + h / 2}
          L ${cx - w / 2 + r},${cy + h / 2}
          A ${r},${r} 0 0 1 ${cx - w / 2 + r},${cy - h / 2} Z`;
}

function rectPath(cx, cy, w, h, r = 8) {
  const x = cx - w / 2;
  const y = cy - h / 2;
  return `M ${x + r},${y}
          L ${x + w - r},${y} Q ${x + w},${y} ${x + w},${y + r}
          L ${x + w},${y + h - r} Q ${x + w},${y + h} ${x + w - r},${y + h}
          L ${x + r},${y + h} Q ${x},${y + h} ${x},${y + h - r}
          L ${x},${y + r} Q ${x},${y} ${x + r},${y} Z`;
}

function diamondPath(cx, cy, rx, ry) {
  return `M ${cx},${cy - ry}
          L ${cx + rx},${cy}
          L ${cx},${cy + ry}
          L ${cx - rx},${cy} Z`;
}

function parallelogramPath(cx, cy, w, h) {
  const skew = 15;
  return `M ${cx - w / 2 + skew},${cy - h / 2}
          L ${cx + w / 2 + skew},${cy - h / 2}
          L ${cx + w / 2 - skew},${cy + h / 2}
          L ${cx - w / 2 - skew},${cy + h / 2} Z`;
}

// ── Color scheme per node type ───────────────────────────────────
const NODE_COLORS = {
  start:    { fill: '#064e3b', stroke: '#34d399', text: '#6ee7b7', glow: 'rgba(52,211,153,0.5)' },
  end:      { fill: '#4c0519', stroke: '#f87171', text: '#fca5a5', glow: 'rgba(248,113,113,0.5)' },
  process:  { fill: '#0c2d48', stroke: '#22d3ee', text: '#a5f3fc', glow: 'rgba(34,211,238,0.5)' },
  decision: { fill: '#422006', stroke: '#fbbf24', text: '#fde68a', glow: 'rgba(251,191,36,0.5)' },
  io:       { fill: '#2e1065', stroke: '#a78bfa', text: '#c4b5fd', glow: 'rgba(167,139,250,0.5)' },
};

// ── Layout engine ────────────────────────────────────────────────
// Assigns { x, y } to each node in a top-to-bottom flowchart.
// Decision nodes create left/right branches.
function computeLayout(nodes, edges) {
  const nodeMap = {};
  nodes.forEach((n) => { nodeMap[n.id] = { ...n, x: 0, y: 0 }; });

  const childrenOf = {};
  const edgeLabelMap = {};
  edges.forEach((e) => {
    if (!childrenOf[e.from]) childrenOf[e.from] = [];
    childrenOf[e.from].push(e.to);
    edgeLabelMap[`${e.from}->${e.to}`] = e.label || '';
  });

  // BFS from the first node to assign rows
  const visited = new Set();
  const queue = [{ id: nodes[0].id, col: 0, row: 0 }];
  visited.add(nodes[0].id);

  // Track which column offsets are used per row to avoid overlap
  const rowCols = {}; // row -> [col, ...]
  const positions = {}; // id -> { row, col }

  while (queue.length > 0) {
    const { id, col, row } = queue.shift();
    positions[id] = { row, col };
    if (!rowCols[row]) rowCols[row] = [];
    rowCols[row].push(col);

    const children = childrenOf[id] || [];
    const node = nodeMap[id];

    if (node.type === 'decision' && children.length >= 2) {
      // Determine True and False branches from edge labels
      let trueBranch = null;
      let falseBranch = null;
      children.forEach((childId) => {
        const label = edgeLabelMap[`${id}->${childId}`] || '';
        const lowerLabel = label.toLowerCase();
        if (lowerLabel.includes('true') || lowerLabel.includes('yes')) {
          trueBranch = childId;
        } else if (lowerLabel.includes('false') || lowerLabel.includes('no')) {
          falseBranch = childId;
        }
      });
      // If labels don't clearly indicate, default first=true, second=false
      if (!trueBranch && !falseBranch) {
        trueBranch = children[0];
        falseBranch = children[1];
      } else if (!trueBranch) {
        trueBranch = children.find((c) => c !== falseBranch) || children[0];
      } else if (!falseBranch) {
        falseBranch = children.find((c) => c !== trueBranch) || children[1];
      }

      // True goes down (same column), False goes to the right
      if (!visited.has(trueBranch)) {
        visited.add(trueBranch);
        queue.push({ id: trueBranch, col: col - 1, row: row + 1 });
      }
      if (!visited.has(falseBranch)) {
        visited.add(falseBranch);
        queue.push({ id: falseBranch, col: col + 1, row: row + 1 });
      }
      // Any remaining children (e.g., loop backs) — skip if already visited
      children.forEach((childId) => {
        if (!visited.has(childId)) {
          visited.add(childId);
          queue.push({ id: childId, col, row: row + 1 });
        }
      });
    } else {
      children.forEach((childId) => {
        if (!visited.has(childId)) {
          visited.add(childId);
          queue.push({ id: childId, col, row: row + 1 });
        }
      });
    }
  }

  // Convert row/col to pixel positions
  // Find the range of columns used
  let minCol = Infinity;
  let maxCol = -Infinity;
  let maxRow = 0;
  Object.values(positions).forEach(({ row, col }) => {
    if (col < minCol) minCol = col;
    if (col > maxCol) maxCol = col;
    if (row > maxRow) maxRow = row;
  });

  const centerX = PADDING + ((maxCol - minCol) * H_GAP) / 2 + NODE_W / 2;

  nodes.forEach((n) => {
    const pos = positions[n.id];
    if (pos) {
      nodeMap[n.id].x = centerX + pos.col * H_GAP;
      nodeMap[n.id].y = PADDING + pos.row * V_GAP + NODE_H / 2;
    }
  });

  const svgWidth = Math.max((maxCol - minCol + 1) * H_GAP + NODE_W + PADDING * 2, 400);
  const svgHeight = (maxRow + 1) * V_GAP + NODE_H + PADDING * 2;

  return { nodeMap, svgWidth, svgHeight, edgeLabelMap };
}

// ── Curved edge path between two node positions ─────────────────
function edgePath(fromNode, toNode, nodeMap, label) {
  const fx = fromNode.x;
  const fy = fromNode.y;
  const tx = toNode.x;
  const ty = toNode.y;

  // If going upward (loop-back), curve to the left
  if (ty <= fy) {
    const offsetX = -Math.max(H_GAP * 0.6, 80);
    return `M ${fx},${fy + NODE_H / 2}
            C ${fx + offsetX},${fy + NODE_H / 2 + 40}
              ${tx + offsetX},${ty - NODE_H / 2 - 40}
              ${tx},${ty - NODE_H / 2}`;
  }

  // Straight-ish vertical connection
  if (Math.abs(fx - tx) < 10) {
    const midY = (fy + ty) / 2;
    return `M ${fx},${fy + NODE_H / 2}
            C ${fx},${midY} ${tx},${midY} ${tx},${ty - NODE_H / 2}`;
  }

  // Angled path for decision branches
  const startY = fy + NODE_H / 2;
  const endY = ty - NODE_H / 2;
  const midY = (startY + endY) / 2;
  return `M ${fx},${startY}
          C ${fx},${midY} ${tx},${midY} ${tx},${endY}`;
}

// ── Arrowhead marker definition ─────────────────────────────────
function ArrowDefs() {
  return (
    <defs>
      <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
        <polygon points="0 0, 10 3.5, 0 7" fill="#475569" />
      </marker>
      <marker id="arrowhead-active" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
        <polygon points="0 0, 10 3.5, 0 7" fill="#22d3ee" />
      </marker>
      <marker id="arrowhead-true" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
        <polygon points="0 0, 10 3.5, 0 7" fill="#34d399" />
      </marker>
      <marker id="arrowhead-false" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
        <polygon points="0 0, 10 3.5, 0 7" fill="#f87171" />
      </marker>
      <filter id="glow-cyan" x="-50%" y="-50%" width="200%" height="200%">
        <feGaussianBlur stdDeviation="6" result="blur" />
        <feMerge>
          <feMergeNode in="blur" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>
      <filter id="glow-node" x="-50%" y="-50%" width="200%" height="200%">
        <feGaussianBlur stdDeviation="4" result="blur" />
        <feMerge>
          <feMergeNode in="blur" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>
      {/* Grid pattern */}
      <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse">
        <path d="M 20 0 L 0 0 0 20" fill="none" stroke="rgba(255,255,255,0.03)" strokeWidth="0.5" />
      </pattern>
    </defs>
  );
}

// ── Main component ───────────────────────────────────────────────
export default function FlowDiagram({
  nodes = [],
  edges = [],
  executionPath = [],
  speed = 'normal',
  variables = {},
  onComplete,
}) {
  const containerRef = useRef(null);
  const svgRef = useRef(null);
  const nodeElRefs = useRef({});
  const edgeElRefs = useRef({});
  const pointerRef = useRef(null);
  const trailRef = useRef(null);
  const tlRef = useRef(null);
  const completedRef = useRef(false);
  const onCompleteRef = useRef(onComplete);

  const [activeStepIndex, setActiveStepIndex] = useState(-1);
  const [isPlaying, setIsPlaying] = useState(true);
  const [visitedNodes, setVisitedNodes] = useState(new Set());

  useEffect(() => { onCompleteRef.current = onComplete; }, [onComplete]);

  const stepDuration = SPEED_MAP[speed] ?? 1.5;

  // Compute layout once
  const { nodeMap, svgWidth, svgHeight, edgeLabelMap } = useMemo(
    () => computeLayout(nodes, edges),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [JSON.stringify(nodes), JSON.stringify(edges)]
  );

  // Determine which edges are "True" or "False" from decision nodes
  const edgeClassification = useMemo(() => {
    const result = {};
    edges.forEach((e) => {
      const fromNode = nodeMap[e.from];
      const label = (e.label || '').toLowerCase();
      if (fromNode && fromNode.type === 'decision') {
        if (label.includes('true') || label.includes('yes')) {
          result[`${e.from}->${e.to}`] = 'true';
        } else if (label.includes('false') || label.includes('no')) {
          result[`${e.from}->${e.to}`] = 'false';
        }
      }
    });
    return result;
  }, [edges, nodeMap]);

  // Build a set of active edges from the execution path for highlighting
  const activeEdgesAtStep = useCallback((stepIdx) => {
    const active = new Set();
    for (let i = 0; i < stepIdx; i++) {
      active.add(`${executionPath[i]}->${executionPath[i + 1]}`);
    }
    return active;
  }, [executionPath]);

  // Current variable values at a given step
  const variablesAtStep = useCallback((stepIdx) => {
    const result = {};
    Object.entries(variables).forEach(([varName, values]) => {
      if (Array.isArray(values) && stepIdx >= 0) {
        const idx = Math.min(stepIdx, values.length - 1);
        result[varName] = idx >= 0 ? values[idx] : undefined;
      }
    });
    return result;
  }, [variables]);

  // ── Container entrance animation ──────────────────────────────
  useEffect(() => {
    if (!containerRef.current) return;
    gsap.fromTo(
      containerRef.current,
      { opacity: 0, y: 30, scale: 0.97 },
      { opacity: 1, y: 0, scale: 1, duration: 0.7, ease: 'power3.out' }
    );
  }, []);

  // ── Main execution animation ──────────────────────────────────
  useEffect(() => {
    if (executionPath.length === 0 || !svgRef.current) return;
    completedRef.current = false;
    setVisitedNodes(new Set());
    setActiveStepIndex(-1);
    setIsPlaying(true);

    if (tlRef.current) tlRef.current.kill();

    const tl = gsap.timeline({
      onComplete: () => {
        if (!completedRef.current) {
          completedRef.current = true;
          setIsPlaying(false);
          onCompleteRef.current?.();
        }
      },
    });
    tlRef.current = tl;

    // Phase 1: Fade in all nodes with stagger
    const allNodeEls = nodes.map((n) => nodeElRefs.current[n.id]).filter(Boolean);
    const allEdgeEls = edges.map((e) => edgeElRefs.current[`${e.from}->${e.to}`]).filter(Boolean);

    tl.fromTo(
      allNodeEls,
      { opacity: 0, scale: 0.7 },
      { opacity: 1, scale: 1, duration: 0.4, stagger: 0.1, ease: 'back.out(1.7)' }
    );

    tl.fromTo(
      allEdgeEls,
      { opacity: 0 },
      { opacity: 1, duration: 0.3, stagger: 0.05, ease: 'power2.out' },
      '-=0.2'
    );

    // Show the execution pointer
    if (pointerRef.current) {
      const firstNode = nodeMap[executionPath[0]];
      if (firstNode) {
        tl.set(pointerRef.current, { attr: { cx: firstNode.x, cy: firstNode.y }, opacity: 0 });
        tl.set(trailRef.current, { attr: { cx: firstNode.x, cy: firstNode.y }, opacity: 0 });
      }
      tl.to(pointerRef.current, { opacity: 1, duration: 0.3 });
      tl.to(trailRef.current, { opacity: 0.4, duration: 0.3 }, '<');
    }

    // Phase 2: Step through execution path
    executionPath.forEach((nodeId, stepIdx) => {
      const node = nodeMap[nodeId];
      if (!node) return;

      tl.call(() => {
        setActiveStepIndex(stepIdx);
        setVisitedNodes((prev) => {
          const next = new Set(prev);
          next.add(nodeId);
          return next;
        });
      });

      // Move pointer to this node
      if (pointerRef.current) {
        tl.to(pointerRef.current, {
          attr: { cx: node.x, cy: node.y },
          duration: stepIdx === 0 ? 0.01 : stepDuration * 0.4,
          ease: 'power2.inOut',
        });
        tl.to(trailRef.current, {
          attr: { cx: node.x, cy: node.y },
          duration: stepIdx === 0 ? 0.01 : stepDuration * 0.5,
          ease: 'power2.inOut',
        }, '<0.05');
      }

      // Pulse the node
      const nodeEl = nodeElRefs.current[nodeId];
      if (nodeEl) {
        tl.to(nodeEl, {
          scale: 1.1,
          duration: 0.2,
          ease: 'back.out(2)',
          transformOrigin: 'center center',
        }, '<');
        tl.to(nodeEl, {
          scale: 1,
          duration: 0.3,
          ease: 'power2.out',
        });
      }

      // Highlight edge from previous node to this node
      if (stepIdx > 0) {
        const prevId = executionPath[stepIdx - 1];
        const edgeKey = `${prevId}->${nodeId}`;
        const edgeEl = edgeElRefs.current[edgeKey];
        if (edgeEl) {
          const cls = edgeClassification[edgeKey];
          const color = cls === 'true' ? '#34d399' : cls === 'false' ? '#f87171' : '#22d3ee';
          tl.to(edgeEl.querySelector('.edge-line'), {
            stroke: color,
            strokeWidth: 3,
            duration: 0.3,
          }, '<');
        }
      }

      // Hold on this step
      tl.to({}, { duration: stepDuration * 0.5 });
    });

    // Final hold
    tl.to({}, { duration: stepDuration + 0.5 });

    return () => { tl.kill(); };
  }, [
    JSON.stringify(executionPath),
    stepDuration,
    JSON.stringify(nodes.map((n) => n.id)),
    JSON.stringify(edges.map((e) => `${e.from}->${e.to}`)),
  ]);

  // Current state for rendering
  const currentNodeId = executionPath[activeStepIndex] || null;
  const currentVars = variablesAtStep(activeStepIndex);
  const activeEdges = activeEdgesAtStep(activeStepIndex);
  const progress = executionPath.length > 0
    ? Math.max(((activeStepIndex + 1) / executionPath.length) * 100, 0)
    : 0;

  // Get the edge that was just traversed (for decision highlighting)
  const lastEdgeKey = activeStepIndex > 0
    ? `${executionPath[activeStepIndex - 1]}->${executionPath[activeStepIndex]}`
    : null;

  const totalWidth = svgWidth + (Object.keys(variables).length > 0 ? VARIABLE_PANEL_W + 20 : 0);

  return (
    <div
      ref={containerRef}
      className="rounded-2xl overflow-hidden opacity-0 font-mono text-sm shadow-2xl shadow-black/20 border border-white/[0.06]"
      style={{ maxWidth: '700px' }}
    >
      {/* Header bar */}
      <div className="bg-gradient-to-r from-slate-800 via-slate-800 to-slate-700 border-b border-white/[0.06] px-4 py-2.5 flex items-center gap-2">
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-full bg-[#ff5f57] shadow-[0_0_6px_rgba(255,95,87,0.4)]" />
          <span className="w-3 h-3 rounded-full bg-[#febc2e] shadow-[0_0_6px_rgba(254,188,46,0.4)]" />
          <span className="w-3 h-3 rounded-full bg-[#28c840] shadow-[0_0_6px_rgba(40,200,64,0.4)]" />
        </div>
        <span className="ml-3 text-[11px] text-slate-400 tracking-wide">flowchart</span>
        <div className="ml-auto flex items-center gap-3">
          {isPlaying && (
            <div className="flex items-center gap-1.5">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan-500" />
              </span>
              <span className="text-[10px] text-cyan-400 font-medium tracking-wider uppercase">Executing</span>
            </div>
          )}
          {executionPath.length > 0 && (
            <span className="text-[10px] text-slate-500 tabular-nums">
              {Math.max(activeStepIndex + 1, 0)}/{executionPath.length}
            </span>
          )}
        </div>
      </div>

      {/* Main content area: SVG flowchart + variable panel */}
      <div className="bg-[#0d1117] relative flex">
        {/* SVG Flowchart */}
        <div className="flex-1 overflow-auto">
          <svg
            ref={svgRef}
            viewBox={`0 0 ${svgWidth} ${svgHeight}`}
            width="100%"
            style={{ minHeight: `${Math.max(svgHeight, 200)}px`, maxHeight: '600px' }}
            xmlns="http://www.w3.org/2000/svg"
          >
            <ArrowDefs />
            {/* Background grid */}
            <rect width="100%" height="100%" fill="url(#grid)" />

            {/* ── Edges ─────────────────────────────────── */}
            {edges.map((e) => {
              const fromNode = nodeMap[e.from];
              const toNode = nodeMap[e.to];
              if (!fromNode || !toNode) return null;

              const key = `${e.from}->${e.to}`;
              const d = edgePath(fromNode, toNode, nodeMap, e.label);
              const cls = edgeClassification[key];
              const isActiveEdge = activeEdges.has(key);
              const isLastEdge = key === lastEdgeKey;

              let strokeColor = '#334155';
              let markerEnd = 'url(#arrowhead)';
              let strokeWidth = 1.5;
              let edgeOpacity = 0.6;

              if (isActiveEdge || isLastEdge) {
                if (cls === 'true') {
                  strokeColor = '#34d399';
                  markerEnd = 'url(#arrowhead-true)';
                } else if (cls === 'false') {
                  strokeColor = '#f87171';
                  markerEnd = 'url(#arrowhead-false)';
                } else {
                  strokeColor = '#22d3ee';
                  markerEnd = 'url(#arrowhead-active)';
                }
                strokeWidth = 2.5;
                edgeOpacity = 1;
              }

              // Midpoint for edge label
              const midX = (fromNode.x + toNode.x) / 2;
              const midY = (fromNode.y + toNode.y) / 2;
              // For loop-back edges, offset the label
              const isLoopBack = toNode.y <= fromNode.y;
              const labelOffsetX = isLoopBack ? -50 : (toNode.x > fromNode.x ? 14 : toNode.x < fromNode.x ? -14 : 14);
              const labelOffsetY = isLoopBack ? 0 : -10;

              return (
                <g
                  key={key}
                  ref={(el) => (edgeElRefs.current[key] = el)}
                  opacity={0}
                >
                  {/* Animated dash-offset "flowing dots" background */}
                  <path
                    d={d}
                    fill="none"
                    stroke={strokeColor}
                    strokeWidth={strokeWidth + 2}
                    strokeOpacity={0.1}
                    strokeDasharray="4 8"
                    strokeLinecap="round"
                  >
                    <animate
                      attributeName="stroke-dashoffset"
                      from="0"
                      to="-24"
                      dur="1.5s"
                      repeatCount="indefinite"
                    />
                  </path>

                  {/* Main edge line */}
                  <path
                    className="edge-line"
                    d={d}
                    fill="none"
                    stroke={strokeColor}
                    strokeWidth={strokeWidth}
                    strokeOpacity={edgeOpacity}
                    markerEnd={markerEnd}
                    strokeLinecap="round"
                  />

                  {/* Edge label */}
                  {e.label && (
                    <g>
                      <rect
                        x={midX + labelOffsetX - 2}
                        y={midY + labelOffsetY - 10}
                        width={e.label.length * 7 + 10}
                        height={18}
                        rx="4"
                        fill="#0d1117"
                        fillOpacity="0.85"
                        stroke={cls === 'true' ? '#34d399' : cls === 'false' ? '#f87171' : '#475569'}
                        strokeWidth="0.5"
                      />
                      <text
                        x={midX + labelOffsetX + (e.label.length * 7 + 10) / 2 - 2}
                        y={midY + labelOffsetY + 3}
                        textAnchor="middle"
                        fill={cls === 'true' ? '#6ee7b7' : cls === 'false' ? '#fca5a5' : '#94a3b8'}
                        fontSize="10"
                        fontFamily="monospace"
                      >
                        {e.label}
                      </text>
                    </g>
                  )}
                </g>
              );
            })}

            {/* ── Nodes ─────────────────────────────────── */}
            {nodes.map((n) => {
              const node = nodeMap[n.id];
              if (!node) return null;

              const colors = NODE_COLORS[n.type] || NODE_COLORS.process;
              const isActive = n.id === currentNodeId;
              const isVisited = visitedNodes.has(n.id) && !isActive;

              let shapePath;
              let shapeWidth = NODE_W;
              let shapeHeight = NODE_H;

              switch (n.type) {
                case 'start':
                case 'end':
                  shapePath = pillPath(node.x, node.y, NODE_W, NODE_H);
                  break;
                case 'decision':
                  shapePath = diamondPath(node.x, node.y, DECISION_SIZE, DECISION_SIZE * 0.65);
                  shapeWidth = DECISION_SIZE * 2;
                  shapeHeight = DECISION_SIZE * 1.3;
                  break;
                case 'io':
                  shapePath = parallelogramPath(node.x, node.y, NODE_W, NODE_H);
                  break;
                default:
                  shapePath = rectPath(node.x, node.y, NODE_W, NODE_H, 8);
              }

              return (
                <g
                  key={n.id}
                  ref={(el) => (nodeElRefs.current[n.id] = el)}
                  opacity={0}
                  style={{ transformOrigin: `${node.x}px ${node.y}px` }}
                >
                  {/* Glow effect for active node */}
                  {isActive && (
                    <path
                      d={shapePath}
                      fill="none"
                      stroke={colors.glow}
                      strokeWidth="8"
                      filter="url(#glow-node)"
                      opacity="0.6"
                    />
                  )}

                  {/* Node shape - gradient fill */}
                  <path
                    d={shapePath}
                    fill={isActive ? colors.fill : isVisited ? '#1e293b' : colors.fill}
                    stroke={isActive ? colors.stroke : isVisited ? '#475569' : colors.stroke}
                    strokeWidth={isActive ? 2.5 : 1.5}
                    strokeOpacity={isVisited ? 0.5 : 1}
                    fillOpacity={isVisited ? 0.5 : 0.85}
                  />

                  {/* Node label */}
                  <text
                    x={node.x}
                    y={node.y + 1}
                    textAnchor="middle"
                    dominantBaseline="central"
                    fill={isActive ? '#ffffff' : isVisited ? '#64748b' : colors.text}
                    fontSize="12"
                    fontFamily="monospace"
                    fontWeight={isActive ? 'bold' : 'normal'}
                  >
                    {n.label}
                  </text>

                  {/* Visited checkmark */}
                  {isVisited && (
                    <text
                      x={node.x + (n.type === 'decision' ? DECISION_SIZE - 8 : NODE_W / 2 - 8)}
                      y={node.y - (n.type === 'decision' ? DECISION_SIZE * 0.65 - 8 : NODE_H / 2 - 8)}
                      textAnchor="middle"
                      dominantBaseline="central"
                      fill="#34d399"
                      fontSize="12"
                    >
                      &#10003;
                    </text>
                  )}
                </g>
              );
            })}

            {/* ── Execution pointer ─────────────────────── */}
            <circle
              ref={trailRef}
              cx={0}
              cy={0}
              r="18"
              fill="none"
              stroke="#22d3ee"
              strokeWidth="2"
              opacity={0}
              filter="url(#glow-cyan)"
            />
            <circle
              ref={pointerRef}
              cx={0}
              cy={0}
              r="8"
              fill="#22d3ee"
              opacity={0}
              filter="url(#glow-cyan)"
            >
              <animate
                attributeName="r"
                values="7;9;7"
                dur="1.2s"
                repeatCount="indefinite"
              />
            </circle>
          </svg>
        </div>

        {/* ── Variable panel ───────────────────────────── */}
        {Object.keys(variables).length > 0 && (
          <div
            className="border-l border-white/[0.06] bg-slate-900/50 p-3 flex flex-col gap-2"
            style={{ width: `${VARIABLE_PANEL_W}px`, minHeight: '100px' }}
          >
            <div className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold mb-1">
              Variables
            </div>
            {Object.entries(variables).map(([varName, values]) => {
              const currentValue = activeStepIndex >= 0 && Array.isArray(values)
                ? values[Math.min(activeStepIndex, values.length - 1)]
                : undefined;
              const prevValue = activeStepIndex > 0 && Array.isArray(values)
                ? values[Math.min(activeStepIndex - 1, values.length - 1)]
                : undefined;
              const changed = currentValue !== prevValue && activeStepIndex > 0;

              return (
                <div
                  key={varName}
                  className={`rounded-lg px-3 py-2 border transition-all duration-300 ${
                    changed
                      ? 'bg-cyan-500/10 border-cyan-500/30'
                      : 'bg-slate-800/50 border-white/[0.06]'
                  }`}
                >
                  <div className="text-[10px] text-slate-500 mb-0.5">{varName}</div>
                  <div className={`text-sm font-mono font-bold transition-all duration-300 ${
                    changed ? 'text-cyan-300' : 'text-slate-300'
                  }`}>
                    {currentValue !== undefined ? JSON.stringify(currentValue) : '--'}
                  </div>
                </div>
              );
            })}

            {/* Step indicator */}
            {activeStepIndex >= 0 && currentNodeId && (
              <div className="mt-auto pt-2 border-t border-white/[0.06]">
                <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Current</div>
                <div className="text-xs text-cyan-400 font-mono">
                  {nodeMap[currentNodeId]?.label || currentNodeId}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Progress bar footer */}
      {executionPath.length > 0 && (
        <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 border-t border-white/[0.06] px-5 py-3">
          <div className="flex items-center gap-3">
            <div className="flex-1 h-1 bg-slate-700/50 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-700 ease-out"
                style={{
                  width: `${progress}%`,
                  background: 'linear-gradient(90deg, #06b6d4, #8b5cf6, #06b6d4)',
                  backgroundSize: '200% 100%',
                  animation: 'shimmer 2s linear infinite',
                }}
              />
            </div>
            <span className="text-[10px] font-mono text-slate-500 tabular-nums">
              {activeStepIndex >= 0 ? activeStepIndex + 1 : 0}/{executionPath.length}
            </span>
          </div>
          {currentNodeId && (
            <div className="mt-2 flex items-center gap-2 text-xs">
              <span className="text-slate-500">Step {activeStepIndex + 1}:</span>
              <span className="text-slate-300 font-medium">
                {nodeMap[currentNodeId]?.label || currentNodeId}
              </span>
              {nodeMap[currentNodeId]?.type === 'decision' && activeStepIndex < executionPath.length - 1 && (
                <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                  edgeClassification[`${currentNodeId}->${executionPath[activeStepIndex + 1]}`] === 'true'
                    ? 'bg-green-500/20 text-green-400'
                    : edgeClassification[`${currentNodeId}->${executionPath[activeStepIndex + 1]}`] === 'false'
                    ? 'bg-red-500/20 text-red-400'
                    : ''
                }`}>
                  {edgeClassification[`${currentNodeId}->${executionPath[activeStepIndex + 1]}`] === 'true'
                    ? 'TRUE'
                    : edgeClassification[`${currentNodeId}->${executionPath[activeStepIndex + 1]}`] === 'false'
                    ? 'FALSE'
                    : ''}
                </span>
              )}
            </div>
          )}
        </div>
      )}

      <style>{`
        @keyframes shimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
      `}</style>
    </div>
  );
}
