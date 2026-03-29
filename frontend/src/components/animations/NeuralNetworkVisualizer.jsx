import { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

/**
 * NeuralNetworkVisualizer
 *
 * Renders an animated neural network diagram with forward-pass signal flow.
 * SVG-based with Framer Motion animations and glassmorphism styling.
 *
 * Props:
 *   layers        - Array of node counts per layer, e.g. [3, 4, 4, 2]
 *   labels        - { input: string[], output: string[] } optional labels
 *   activations   - Flat array of activation values (0-1) for every node
 *   speed         - 'slow' | 'normal' | 'fast'
 *   duration      - Total animation hold time in ms (default 5000)
 *   onComplete    - Callback when the full animation cycle finishes
 */

const SPEED_MAP = { slow: 1.8, normal: 1.0, fast: 0.5 };

// Layout constants
const NODE_RADIUS = 16;
const LAYER_GAP = 160;
const NODE_GAP = 56;
const PADDING_X = 80;
const PADDING_Y = 50;

// Color tokens
const COLORS = {
  inactive: '#64748b',    // gray/slate
  active: '#06b6d4',      // cyan
  output: '#10b981',      // green
  connection: '#334155',   // slate-700
  connectionActive: '#06b6d4',
  glow: 'rgba(6, 182, 212, 0.4)',
  glowOutput: 'rgba(16, 185, 129, 0.4)',
};

function getNodePosition(layerIdx, nodeIdx, layerCount, totalLayers) {
  const maxNodes = Math.max(layerCount, 1);
  const totalHeight = (maxNodes - 1) * NODE_GAP;
  const startY = PADDING_Y + (totalHeight > 0 ? 0 : 0);
  const x = PADDING_X + layerIdx * LAYER_GAP;
  const layerHeight = (layerCount - 1) * NODE_GAP;
  const offsetY = (totalHeight - layerHeight) / 2;
  const y = PADDING_Y + offsetY + nodeIdx * NODE_GAP;
  return { x, y };
}

function generateWeightValue() {
  return (Math.random() * 2 - 1).toFixed(2);
}

export default function NeuralNetworkVisualizer({
  layers = [3, 4, 4, 2],
  labels = {},
  activations = [],
  speed = 'normal',
  duration = 5000,
  onComplete,
}) {
  const stableLayers = useMemo(() => layers, [JSON.stringify(layers)]);
  const stableLabels = useMemo(() => labels, [JSON.stringify(labels)]);
  const stableActivations = useMemo(() => activations, [JSON.stringify(activations)]);

  const onCompleteRef = useRef(onComplete);
  useEffect(() => { onCompleteRef.current = onComplete; }, [onComplete]);

  const speedMultiplier = SPEED_MAP[speed] || 1.0;

  // Track which layer is currently "lit" during the forward pass
  const [activeLayer, setActiveLayer] = useState(-1);
  // Track which connection group is active (between layer i and i+1)
  const [activeConnection, setActiveConnection] = useState(-1);
  // Hovered connection for weight display
  const [hoveredConn, setHoveredConn] = useState(null);
  // Whether the full animation has completed
  const [completed, setCompleted] = useState(false);

  const maxNodes = Math.max(...stableLayers, 1);
  const svgWidth = PADDING_X * 2 + (stableLayers.length - 1) * LAYER_GAP;
  const svgHeight = PADDING_Y * 2 + (maxNodes - 1) * NODE_GAP;

  // Pre-generate stable random weights for connections
  const weights = useMemo(() => {
    const w = {};
    for (let l = 0; l < stableLayers.length - 1; l++) {
      for (let i = 0; i < stableLayers[l]; i++) {
        for (let j = 0; j < stableLayers[l + 1]; j++) {
          w[`${l}-${i}-${j}`] = generateWeightValue();
        }
      }
    }
    return w;
  }, [stableLayers]);

  // Run forward-pass animation
  useEffect(() => {
    setActiveLayer(-1);
    setActiveConnection(-1);
    setCompleted(false);

    const delays = [];
    let cumulativeDelay = 600; // initial entrance delay
    const stepDur = 500 * speedMultiplier;

    for (let l = 0; l < stableLayers.length; l++) {
      const capturedL = l;
      // Light up layer
      const t1 = setTimeout(() => setActiveLayer(capturedL), cumulativeDelay);
      delays.push(t1);

      if (l < stableLayers.length - 1) {
        // Light up connections to next layer
        const connDelay = cumulativeDelay + stepDur * 0.4;
        const t2 = setTimeout(() => setActiveConnection(capturedL), connDelay);
        delays.push(t2);
      }
      cumulativeDelay += stepDur;
    }

    // Mark completed
    const holdMs = Math.max(duration, 2000);
    const t3 = setTimeout(() => {
      setCompleted(true);
      onCompleteRef.current?.();
    }, cumulativeDelay + holdMs);
    delays.push(t3);

    return () => delays.forEach(clearTimeout);
  }, [stableLayers, speedMultiplier, duration]);

  // Build node data
  const nodes = useMemo(() => {
    const result = [];
    for (let l = 0; l < stableLayers.length; l++) {
      for (let n = 0; n < stableLayers[l]; n++) {
        const pos = getNodePosition(l, n, stableLayers[l], stableLayers.length);
        const flatIdx = stableLayers.slice(0, l).reduce((a, b) => a + b, 0) + n;
        const activation = stableActivations[flatIdx] ?? 0;
        const isOutput = l === stableLayers.length - 1;
        const isInput = l === 0;

        let label = '';
        if (isInput && stableLabels.input?.[n]) label = stableLabels.input[n];
        if (isOutput && stableLabels.output?.[n]) label = stableLabels.output[n];

        result.push({ l, n, ...pos, activation, isOutput, isInput, label });
      }
    }
    return result;
  }, [stableLayers, stableLabels, stableActivations]);

  // Build connections
  const connections = useMemo(() => {
    const result = [];
    for (let l = 0; l < stableLayers.length - 1; l++) {
      for (let i = 0; i < stableLayers[l]; i++) {
        for (let j = 0; j < stableLayers[l + 1]; j++) {
          const from = getNodePosition(l, i, stableLayers[l], stableLayers.length);
          const to = getNodePosition(l + 1, j, stableLayers[l + 1], stableLayers.length);
          result.push({
            key: `${l}-${i}-${j}`,
            l,
            x1: from.x + NODE_RADIUS,
            y1: from.y,
            x2: to.x - NODE_RADIUS,
            y2: to.y,
            weight: weights[`${l}-${i}-${j}`],
          });
        }
      }
    }
    return result;
  }, [stableLayers, weights]);

  const handleConnHover = useCallback((conn) => setHoveredConn(conn), []);
  const handleConnLeave = useCallback(() => setHoveredConn(null), []);

  return (
    <div
      className="rounded-2xl overflow-hidden border border-white/[0.06] shadow-xl shadow-black/10"
      style={{ background: 'linear-gradient(135deg, rgba(6,182,212,0.03), rgba(16,185,129,0.02))' }}
    >
      {/* Header */}
      <div className="px-4 py-2.5 border-b border-white/[0.06] flex items-center gap-2"
        style={{ background: 'rgba(6,182,212,0.04)' }}>
        <span className="text-base">🧠</span>
        <span className="text-[11px] font-bold uppercase tracking-widest text-cyan-400">
          Neural Network
        </span>
        <span className="text-slate-500 font-mono text-xs ml-1">
          {stableLayers.join(' → ')}
        </span>
        {completed && (
          <span className="ml-auto text-[10px] font-mono px-2 py-0.5 rounded-full border border-emerald-500/30 text-emerald-400 bg-emerald-500/10">
            forward pass complete
          </span>
        )}
      </div>

      {/* SVG Canvas */}
      <div className="p-4 overflow-x-auto">
        <svg
          viewBox={`0 0 ${svgWidth} ${svgHeight}`}
          className="w-full h-auto"
          style={{ minHeight: 200, maxHeight: 400 }}
        >
          {/* Glow filters */}
          <defs>
            <filter id="nn-glow-cyan" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="4" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            <filter id="nn-glow-green" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="4" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* Layer labels */}
          {stableLayers.map((count, l) => {
            const x = PADDING_X + l * LAYER_GAP;
            const isInput = l === 0;
            const isOutput = l === stableLayers.length - 1;
            const label = isInput ? 'Input' : isOutput ? 'Output' : `Hidden ${l}`;
            return (
              <text
                key={`label-${l}`}
                x={x}
                y={PADDING_Y - 28}
                textAnchor="middle"
                className="text-[10px] font-mono uppercase tracking-wider"
                fill={isOutput ? COLORS.output : '#64748b'}
                opacity={0.7}
              >
                {label}
              </text>
            );
          })}

          {/* Connections */}
          {connections.map((conn) => {
            const isActive = activeConnection >= conn.l;
            const isHovered = hoveredConn === conn.key;
            return (
              <g key={conn.key}>
                <motion.line
                  x1={conn.x1}
                  y1={conn.y1}
                  x2={conn.x2}
                  y2={conn.y2}
                  stroke={isActive ? COLORS.connectionActive : COLORS.connection}
                  strokeWidth={isHovered ? 2.5 : 1}
                  strokeOpacity={isActive ? 0.6 : 0.15}
                  initial={{ pathLength: 0, opacity: 0 }}
                  animate={{
                    pathLength: 1,
                    opacity: 1,
                    stroke: isActive ? COLORS.connectionActive : COLORS.connection,
                    strokeOpacity: isActive ? 0.6 : 0.15,
                  }}
                  transition={{ duration: 0.5 * speedMultiplier, ease: 'easeOut' }}
                />
                {/* Invisible wider hitbox for hover */}
                <line
                  x1={conn.x1}
                  y1={conn.y1}
                  x2={conn.x2}
                  y2={conn.y2}
                  stroke="transparent"
                  strokeWidth={12}
                  onMouseEnter={() => handleConnHover(conn.key)}
                  onMouseLeave={handleConnLeave}
                  style={{ cursor: 'pointer' }}
                />
              </g>
            );
          })}

          {/* Weight tooltip */}
          <AnimatePresence>
            {hoveredConn && (() => {
              const conn = connections.find(c => c.key === hoveredConn);
              if (!conn) return null;
              const mx = (conn.x1 + conn.x2) / 2;
              const my = (conn.y1 + conn.y2) / 2;
              return (
                <motion.g
                  key="weight-tooltip"
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  transition={{ duration: 0.15 }}
                >
                  <rect
                    x={mx - 28}
                    y={my - 14}
                    width={56}
                    height={22}
                    rx={6}
                    fill="rgba(15,23,42,0.9)"
                    stroke="rgba(6,182,212,0.3)"
                    strokeWidth={1}
                  />
                  <text
                    x={mx}
                    y={my + 1}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fill="#06b6d4"
                    className="text-[10px] font-mono"
                  >
                    w={conn.weight}
                  </text>
                </motion.g>
              );
            })()}
          </AnimatePresence>

          {/* Nodes */}
          {nodes.map((node) => {
            const isActive = activeLayer >= node.l;
            const isOutputNode = node.isOutput;
            const nodeColor = !isActive
              ? COLORS.inactive
              : isOutputNode
                ? COLORS.output
                : COLORS.active;
            const glowColor = isOutputNode ? COLORS.glowOutput : COLORS.glow;

            return (
              <g key={`node-${node.l}-${node.n}`}>
                {/* Glow ring when active */}
                {isActive && (
                  <motion.circle
                    cx={node.x}
                    cy={node.y}
                    r={NODE_RADIUS + 6}
                    fill="none"
                    stroke={glowColor}
                    strokeWidth={2}
                    initial={{ opacity: 0, scale: 0.5 }}
                    animate={{ opacity: [0, 0.6, 0.3], scale: 1 }}
                    transition={{ duration: 0.6 * speedMultiplier, ease: 'easeOut' }}
                  />
                )}

                {/* Node circle */}
                <motion.circle
                  cx={node.x}
                  cy={node.y}
                  r={NODE_RADIUS}
                  fill={isActive ? `${nodeColor}20` : 'rgba(51,65,85,0.15)'}
                  stroke={nodeColor}
                  strokeWidth={isActive ? 2 : 1}
                  filter={isActive ? (isOutputNode ? 'url(#nn-glow-green)' : 'url(#nn-glow-cyan)') : undefined}
                  initial={{ scale: 0, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{
                    delay: 0.05 * (node.l * 3 + node.n),
                    duration: 0.4,
                    ease: 'backOut',
                  }}
                />

                {/* Activation value */}
                {node.activation > 0 && isActive && (
                  <motion.text
                    x={node.x}
                    y={node.y + 1}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fill={nodeColor}
                    className="text-[9px] font-mono font-bold"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.3 * speedMultiplier }}
                  >
                    {node.activation.toFixed(1)}
                  </motion.text>
                )}

                {/* Node label */}
                {node.label && (
                  <text
                    x={node.x}
                    y={node.y + NODE_RADIUS + 14}
                    textAnchor="middle"
                    fill="#94a3b8"
                    className="text-[9px] font-mono"
                  >
                    {node.label}
                  </text>
                )}
              </g>
            );
          })}

          {/* Signal pulse animation along connections */}
          {connections.map((conn) => {
            if (activeConnection < conn.l) return null;
            if (activeConnection !== conn.l) return null; // only animate current wave
            return (
              <motion.circle
                key={`pulse-${conn.key}`}
                r={3}
                fill={COLORS.active}
                initial={{ cx: conn.x1, cy: conn.y1, opacity: 0 }}
                animate={{
                  cx: [conn.x1, conn.x2],
                  cy: [conn.y1, conn.y2],
                  opacity: [0, 1, 0],
                }}
                transition={{
                  duration: 0.4 * speedMultiplier,
                  ease: 'easeInOut',
                }}
              />
            );
          })}
        </svg>
      </div>

      {/* Footer info */}
      <div className="px-4 py-2 border-t border-white/[0.06] flex items-center gap-3">
        <span className="text-[10px] text-slate-500 font-mono">
          {nodes.length} nodes
        </span>
        <span className="text-[10px] text-slate-500 font-mono">
          {connections.length} connections
        </span>
        <span className="text-[10px] text-slate-500 font-mono ml-auto">
          hover connections to see weights
        </span>
      </div>
    </div>
  );
}
