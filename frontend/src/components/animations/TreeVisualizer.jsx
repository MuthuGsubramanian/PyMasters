import { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

/**
 * TreeVisualizer
 *
 * Binary tree / BST / heap visualization with animated operations.
 * SVG-based with Framer Motion and glassmorphism styling.
 *
 * Props:
 *   type        - 'binary_tree' | 'bst' | 'heap'
 *   data        - number[] values to build the tree from
 *   operations  - string[] sequence of operations: 'insert', 'search', 'delete',
 *                 'inorder', 'preorder', 'postorder'
 *   operationArgs - object[] matching operations array, e.g. [{ value: 5 }]
 *   speed       - 'slow' | 'normal' | 'fast'
 *   duration    - total hold time in ms (default 5000)
 *   onComplete  - callback when animation completes
 */

const SPEED_MS = { slow: 1200, normal: 700, fast: 350 };

const NODE_RADIUS = 20;
const LEVEL_HEIGHT = 70;
const MIN_H_SPACING = 50;

const NODE_COLORS = {
  default: { fill: 'rgba(255,255,255,0.05)', stroke: '#94a3b8', text: '#e2e8f0' },
  current: { fill: 'rgba(6,182,212,0.15)', stroke: '#06b6d4', text: '#06b6d4' },
  visited: { fill: 'rgba(99,102,241,0.12)', stroke: '#6366f1', text: '#a5b4fc' },
  found: { fill: 'rgba(16,185,129,0.15)', stroke: '#10b981', text: '#10b981' },
  inserting: { fill: 'rgba(6,182,212,0.2)', stroke: '#06b6d4', text: '#06b6d4' },
  deleting: { fill: 'rgba(239,68,68,0.15)', stroke: '#ef4444', text: '#ef4444' },
};

// ---- BST node class ----
class TreeNode {
  constructor(value) {
    this.value = value;
    this.left = null;
    this.right = null;
    this.id = `node-${value}-${Math.random().toString(36).slice(2, 6)}`;
  }
}

function bstInsert(root, value) {
  if (!root) return new TreeNode(value);
  if (value < root.value) {
    root.left = bstInsert(root.left, value);
  } else if (value > root.value) {
    root.right = bstInsert(root.right, value);
  }
  return root;
}

function buildBST(values) {
  let root = null;
  for (const v of values) {
    root = bstInsert(root, v);
  }
  return root;
}

function buildBinaryTree(values) {
  if (!values.length) return null;
  const nodes = values.map((v) => (v != null ? new TreeNode(v) : null));
  for (let i = 0; i < nodes.length; i++) {
    if (nodes[i]) {
      const leftIdx = 2 * i + 1;
      const rightIdx = 2 * i + 2;
      if (leftIdx < nodes.length) nodes[i].left = nodes[leftIdx];
      if (rightIdx < nodes.length) nodes[i].right = nodes[rightIdx];
    }
  }
  return nodes[0] || null;
}

// Flatten tree into layout positions
function layoutTree(root) {
  if (!root) return { nodes: [], edges: [], width: 0, height: 0 };

  const nodes = [];
  const edges = [];
  let maxDepth = 0;

  function getDepth(node) {
    if (!node) return 0;
    return 1 + Math.max(getDepth(node.left), getDepth(node.right));
  }
  maxDepth = getDepth(root);

  const totalWidth = Math.pow(2, maxDepth) * MIN_H_SPACING;

  function traverse(node, depth, xMin, xMax) {
    if (!node) return;
    const x = (xMin + xMax) / 2;
    const y = 40 + depth * LEVEL_HEIGHT;
    nodes.push({ id: node.id, value: node.value, x, y, depth });

    if (node.left) {
      const childX = (xMin + (xMin + xMax) / 2) / 2;
      const childY = 40 + (depth + 1) * LEVEL_HEIGHT;
      edges.push({ from: node.id, to: node.left.id, x1: x, y1: y, x2: childX, y2: childY });
      traverse(node.left, depth + 1, xMin, (xMin + xMax) / 2);
    }
    if (node.right) {
      const childX = ((xMin + xMax) / 2 + xMax) / 2;
      const childY = 40 + (depth + 1) * LEVEL_HEIGHT;
      edges.push({ from: node.id, to: node.right.id, x1: x, y1: y, x2: childX, y2: childY });
      traverse(node.right, depth + 1, (xMin + xMax) / 2, xMax);
    }
  }

  traverse(root, 0, 0, totalWidth);

  return {
    nodes,
    edges,
    width: totalWidth,
    height: 80 + maxDepth * LEVEL_HEIGHT,
  };
}

// Traversal generators
function inorderTraversal(root) {
  const result = [];
  function walk(node) {
    if (!node) return;
    walk(node.left);
    result.push(node.id);
    walk(node.right);
  }
  walk(root);
  return result;
}

function preorderTraversal(root) {
  const result = [];
  function walk(node) {
    if (!node) return;
    result.push(node.id);
    walk(node.left);
    walk(node.right);
  }
  walk(root);
  return result;
}

function postorderTraversal(root) {
  const result = [];
  function walk(node) {
    if (!node) return;
    walk(node.left);
    walk(node.right);
    result.push(node.id);
  }
  walk(root);
  return result;
}

// Search path in BST
function bstSearchPath(root, value) {
  const path = [];
  let node = root;
  while (node) {
    path.push(node.id);
    if (value === node.value) break;
    node = value < node.value ? node.left : node.right;
  }
  return path;
}

const TYPE_LABELS = {
  binary_tree: 'Binary Tree',
  bst: 'Binary Search Tree',
  heap: 'Heap',
};

export default function TreeVisualizer({
  type = 'bst',
  data = [8, 4, 12, 2, 6, 10, 14],
  operations = [],
  operationArgs = [],
  speed = 'normal',
  duration = 5000,
  onComplete,
}) {
  const stableData = useMemo(() => data, [JSON.stringify(data)]);
  const stableOps = useMemo(() => operations, [JSON.stringify(operations)]);
  const stableArgs = useMemo(() => operationArgs, [JSON.stringify(operationArgs)]);

  const onCompleteRef = useRef(onComplete);
  useEffect(() => { onCompleteRef.current = onComplete; }, [onComplete]);

  const stepMs = SPEED_MS[speed] || 700;

  // Build initial tree
  const treeRoot = useMemo(() => {
    if (type === 'bst' || type === 'heap') return buildBST(stableData);
    return buildBinaryTree(stableData);
  }, [type, stableData]);

  const layout = useMemo(() => layoutTree(treeRoot), [treeRoot]);

  // Animation state
  const [highlightedNodes, setHighlightedNodes] = useState(new Set());
  const [currentNodeId, setCurrentNodeId] = useState(null);
  const [foundNodeId, setFoundNodeId] = useState(null);
  const [deletingNodeId, setDeletingNodeId] = useState(null);
  const [insertedNodeId, setInsertedNodeId] = useState(null);
  const [statusText, setStatusText] = useState('');
  const [traversalName, setTraversalName] = useState('');
  const [isComplete, setIsComplete] = useState(false);

  // Run operations sequence
  useEffect(() => {
    const timeouts = [];
    let delay = 800; // initial entrance delay

    function scheduleTimeout(fn, ms) {
      const t = setTimeout(fn, ms);
      timeouts.push(t);
      return t;
    }

    if (stableOps.length === 0) {
      // No operations, just display
      scheduleTimeout(() => {
        setIsComplete(true);
        onCompleteRef.current?.();
      }, delay + Math.max(duration, 2000));
      return () => timeouts.forEach(clearTimeout);
    }

    stableOps.forEach((op, opIdx) => {
      const args = stableArgs[opIdx] || {};

      if (op === 'inorder' || op === 'preorder' || op === 'postorder') {
        const traversalFn = op === 'inorder'
          ? inorderTraversal
          : op === 'preorder'
            ? preorderTraversal
            : postorderTraversal;

        const path = traversalFn(treeRoot);

        scheduleTimeout(() => {
          setTraversalName(op);
          setStatusText(`${op} traversal`);
          setHighlightedNodes(new Set());
          setCurrentNodeId(null);
          setFoundNodeId(null);
        }, delay);

        path.forEach((nodeId, i) => {
          scheduleTimeout(() => {
            setCurrentNodeId(nodeId);
            setHighlightedNodes((prev) => new Set([...prev, nodeId]));
            const nodeVal = layout.nodes.find((n) => n.id === nodeId)?.value ?? '';
            setStatusText(`${op}: visiting ${nodeVal}`);
          }, delay + (i + 1) * stepMs);
        });

        delay += (path.length + 1) * stepMs + 400;

        scheduleTimeout(() => {
          setCurrentNodeId(null);
          setStatusText(`${op} traversal complete`);
        }, delay);

        delay += 600;
      } else if (op === 'search') {
        const searchVal = args.value ?? stableData[Math.floor(stableData.length / 2)];
        const path = bstSearchPath(treeRoot, searchVal);

        scheduleTimeout(() => {
          setHighlightedNodes(new Set());
          setCurrentNodeId(null);
          setFoundNodeId(null);
          setStatusText(`Searching for ${searchVal}...`);
        }, delay);

        path.forEach((nodeId, i) => {
          scheduleTimeout(() => {
            setCurrentNodeId(nodeId);
            setHighlightedNodes((prev) => new Set([...prev, nodeId]));
            const nodeVal = layout.nodes.find((n) => n.id === nodeId)?.value ?? '';
            setStatusText(`Search: checking ${nodeVal}`);
          }, delay + (i + 1) * stepMs);
        });

        delay += (path.length + 1) * stepMs;

        scheduleTimeout(() => {
          const lastNode = layout.nodes.find((n) => n.id === path[path.length - 1]);
          if (lastNode && lastNode.value === searchVal) {
            setFoundNodeId(path[path.length - 1]);
            setStatusText(`Found ${searchVal}!`);
          } else {
            setStatusText(`${searchVal} not found`);
          }
          setCurrentNodeId(null);
        }, delay);

        delay += 800;
      } else if (op === 'insert') {
        const insertVal = args.value ?? 99;
        const path = bstSearchPath(treeRoot, insertVal);

        scheduleTimeout(() => {
          setHighlightedNodes(new Set());
          setCurrentNodeId(null);
          setFoundNodeId(null);
          setStatusText(`Inserting ${insertVal}...`);
        }, delay);

        path.forEach((nodeId, i) => {
          scheduleTimeout(() => {
            setCurrentNodeId(nodeId);
            setHighlightedNodes((prev) => new Set([...prev, nodeId]));
          }, delay + (i + 1) * stepMs);
        });

        delay += (path.length + 1) * stepMs;

        scheduleTimeout(() => {
          setInsertedNodeId(path[path.length - 1] || null);
          setStatusText(`Inserted ${insertVal}`);
          setCurrentNodeId(null);
        }, delay);

        delay += 800;
      } else if (op === 'delete') {
        const deleteVal = args.value ?? stableData[0];
        const path = bstSearchPath(treeRoot, deleteVal);

        scheduleTimeout(() => {
          setHighlightedNodes(new Set());
          setStatusText(`Deleting ${deleteVal}...`);
        }, delay);

        path.forEach((nodeId, i) => {
          scheduleTimeout(() => {
            setCurrentNodeId(nodeId);
            setHighlightedNodes((prev) => new Set([...prev, nodeId]));
          }, delay + (i + 1) * stepMs);
        });

        delay += (path.length + 1) * stepMs;

        scheduleTimeout(() => {
          const targetNode = layout.nodes.find((n) => n.id === path[path.length - 1]);
          if (targetNode && targetNode.value === deleteVal) {
            setDeletingNodeId(path[path.length - 1]);
            setStatusText(`Deleted ${deleteVal}`);
          } else {
            setStatusText(`${deleteVal} not found`);
          }
          setCurrentNodeId(null);
        }, delay);

        delay += 800;
      }
    });

    // Final completion
    scheduleTimeout(() => {
      setIsComplete(true);
      onCompleteRef.current?.();
    }, delay + Math.max(duration, 1000));

    return () => timeouts.forEach(clearTimeout);
  }, [treeRoot, layout, stableOps, stableArgs, stableData, stepMs, duration]);

  function getNodeStyle(nodeId) {
    if (deletingNodeId === nodeId) return NODE_COLORS.deleting;
    if (foundNodeId === nodeId) return NODE_COLORS.found;
    if (insertedNodeId === nodeId) return NODE_COLORS.inserting;
    if (currentNodeId === nodeId) return NODE_COLORS.current;
    if (highlightedNodes.has(nodeId)) return NODE_COLORS.visited;
    return NODE_COLORS.default;
  }

  // Responsive SVG dimensions
  const svgWidth = Math.max(layout.width, 300);
  const svgHeight = Math.max(layout.height, 200);

  return (
    <div
      className="rounded-2xl overflow-hidden border border-white/[0.06] shadow-xl shadow-black/10"
      style={{ background: 'linear-gradient(135deg, rgba(99,102,241,0.03), rgba(6,182,212,0.02))' }}
    >
      {/* Header */}
      <div className="px-4 py-2.5 border-b border-white/[0.06] flex items-center gap-2"
        style={{ background: 'rgba(99,102,241,0.04)' }}>
        <span className="text-base">🌳</span>
        <span className="text-[11px] font-bold uppercase tracking-widest text-indigo-400">
          {TYPE_LABELS[type] || type}
        </span>
        <span className="text-slate-500 font-mono text-xs ml-1">
          {layout.nodes.length} nodes
        </span>
        {traversalName && (
          <span className="ml-2 text-[10px] font-mono px-2 py-0.5 rounded-full border border-cyan-500/30 text-cyan-400 bg-cyan-500/10">
            {traversalName}
          </span>
        )}
        {isComplete && (
          <span className="ml-auto text-[10px] font-mono px-2 py-0.5 rounded-full border border-emerald-500/30 text-emerald-400 bg-emerald-500/10">
            complete
          </span>
        )}
      </div>

      {/* Tree SVG */}
      <div className="p-4 overflow-x-auto">
        <svg
          viewBox={`0 0 ${svgWidth} ${svgHeight}`}
          className="w-full h-auto"
          style={{ minHeight: 180, maxHeight: 450 }}
        >
          {/* Glow filter */}
          <defs>
            <filter id="tree-glow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="3" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* Edges */}
          {layout.edges.map((edge) => {
            const isActive = highlightedNodes.has(edge.from) && highlightedNodes.has(edge.to);
            return (
              <motion.line
                key={`${edge.from}-${edge.to}`}
                x1={edge.x1}
                y1={edge.y1 + NODE_RADIUS}
                x2={edge.x2}
                y2={edge.y2 - NODE_RADIUS}
                stroke={isActive ? '#06b6d4' : '#334155'}
                strokeWidth={isActive ? 2 : 1}
                strokeOpacity={isActive ? 0.7 : 0.3}
                initial={{ pathLength: 0, opacity: 0 }}
                animate={{ pathLength: 1, opacity: 1 }}
                transition={{ duration: 0.5, ease: 'easeOut' }}
              />
            );
          })}

          {/* Nodes */}
          {layout.nodes.map((node) => {
            const style = getNodeStyle(node.id);
            const isDeleting = deletingNodeId === node.id;
            const isCurrent = currentNodeId === node.id;

            return (
              <motion.g
                key={node.id}
                initial={{ scale: 0, opacity: 0 }}
                animate={{
                  scale: isDeleting ? 0 : 1,
                  opacity: isDeleting ? 0 : 1,
                }}
                transition={{
                  scale: { duration: isDeleting ? 0.5 : 0.4, ease: 'backOut' },
                  opacity: { duration: isDeleting ? 0.5 : 0.3 },
                  delay: isDeleting ? 0 : node.depth * 0.08,
                }}
                style={{ originX: `${node.x}px`, originY: `${node.y}px` }}
              >
                {/* Glow ring for current node */}
                {isCurrent && (
                  <motion.circle
                    cx={node.x}
                    cy={node.y}
                    r={NODE_RADIUS + 8}
                    fill="none"
                    stroke="rgba(6,182,212,0.4)"
                    strokeWidth={2}
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: [0, 0.7, 0.4], scale: 1 }}
                    transition={{ duration: 0.4, ease: 'easeOut' }}
                  />
                )}

                {/* Node circle */}
                <motion.circle
                  cx={node.x}
                  cy={node.y}
                  r={NODE_RADIUS}
                  fill={style.fill}
                  stroke={style.stroke}
                  strokeWidth={isCurrent ? 2.5 : 1.5}
                  filter={isCurrent ? 'url(#tree-glow)' : undefined}
                  animate={{
                    fill: style.fill,
                    stroke: style.stroke,
                  }}
                  transition={{ duration: 0.3 }}
                />

                {/* Value text */}
                <text
                  x={node.x}
                  y={node.y + 1}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fill={style.text}
                  className="text-[11px] font-mono font-bold"
                  style={{ pointerEvents: 'none' }}
                >
                  {node.value}
                </text>
              </motion.g>
            );
          })}
        </svg>
      </div>

      {/* Status bar */}
      <div className="px-4 py-2.5 border-t border-white/[0.06] flex items-center gap-3">
        <AnimatePresence mode="wait">
          {statusText && (
            <motion.span
              key={statusText}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 8 }}
              transition={{ duration: 0.2 }}
              className="text-[10px] font-mono text-slate-300"
            >
              {statusText}
            </motion.span>
          )}
        </AnimatePresence>

        {/* Legend */}
        <div className="ml-auto flex gap-3">
          {[
            { label: 'Current', color: NODE_COLORS.current.stroke },
            { label: 'Visited', color: NODE_COLORS.visited.stroke },
            { label: 'Found', color: NODE_COLORS.found.stroke },
          ].map(({ label, color }) => (
            <div key={label} className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
              <span className="text-[9px] font-mono text-slate-500">{label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
