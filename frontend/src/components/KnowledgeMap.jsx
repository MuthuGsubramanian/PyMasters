import { useState, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import gsap from 'gsap';

// ─── Color helpers ──────────────────────────────────────────────────────────
function masteryColor(mastery) {
    if (mastery >= 0.7) return '#22c55e';
    if (mastery >= 0.3) return '#eab308';
    return '#94a3b8';
}

function masteryLabel(mastery) {
    if (mastery >= 0.7) return 'Strong';
    if (mastery >= 0.3) return 'Learning';
    return 'New';
}

// ─── Layout: group nodes by category into a grid of columns ─────────────────
function layoutNodes(nodes, categories, width, height) {
    const catList = categories.length > 0 ? categories : [...new Set(nodes.map(n => n.category))];
    const cols = Math.ceil(catList.length / 2);
    const rows = Math.min(2, Math.ceil(catList.length / cols));
    const colWidth = width / (cols + 1);
    const rowHeight = height / (rows + 1);

    const positioned = [];
    catList.forEach((cat, catIdx) => {
        const col = catIdx % cols;
        const row = Math.floor(catIdx / cols);
        const cx = colWidth * (col + 1);
        const cy = rowHeight * (row + 1);

        const catNodes = nodes.filter(n => n.category === cat);
        const spread = Math.min(colWidth * 0.7, 160);
        const vSpread = Math.min(rowHeight * 0.6, 120);

        catNodes.forEach((node, nIdx) => {
            const angle = (2 * Math.PI * nIdx) / Math.max(catNodes.length, 1);
            const r = catNodes.length === 1 ? 0 : Math.min(spread, vSpread) * 0.5;
            positioned.push({
                ...node,
                x: cx + r * Math.cos(angle),
                y: cy + r * Math.sin(angle),
            });
        });
    });

    return positioned;
}

// ─── Curved edge path ───────────────────────────────────────────────────────
function edgePath(x1, y1, x2, y2) {
    const mx = (x1 + x2) / 2;
    const my = (y1 + y2) / 2;
    const dx = x2 - x1;
    const dy = y2 - y1;
    const offset = Math.min(Math.abs(dx), Math.abs(dy)) * 0.3;
    const cx = mx - dy * 0.15 + offset * 0.2;
    const cy = my + dx * 0.15;
    return `M ${x1} ${y1} Q ${cx} ${cy} ${x2} ${y2}`;
}

// ─── Main Component ─────────────────────────────────────────────────────────
export default function KnowledgeMap({ data }) {
    const svgRef = useRef(null);
    const nodesRef = useRef([]);
    const [activeCategory, setActiveCategory] = useState('all');
    const [tooltip, setTooltip] = useState(null);
    const [selectedNode, setSelectedNode] = useState(null);

    const nodes = data?.nodes || [];
    const edges = data?.edges || [];
    const categories = useMemo(() => [...new Set(nodes.map(n => n.category))], [nodes]);

    const WIDTH = 900;
    const HEIGHT = Math.max(500, Math.ceil(categories.length / 5) * 300 + 200);

    const filteredNodes = useMemo(() => {
        if (activeCategory === 'all') return nodes;
        return nodes.filter(n => n.category === activeCategory);
    }, [nodes, activeCategory]);

    const positionedNodes = useMemo(
        () => layoutNodes(filteredNodes, activeCategory === 'all' ? categories : [activeCategory], WIDTH, HEIGHT),
        [filteredNodes, categories, activeCategory, WIDTH, HEIGHT]
    );

    const nodeMap = useMemo(() => {
        const map = {};
        positionedNodes.forEach(n => { map[n.id] = n; });
        return map;
    }, [positionedNodes]);

    const filteredEdges = useMemo(() => {
        return edges.filter(e => nodeMap[e.source] && nodeMap[e.target]);
    }, [edges, nodeMap]);

    // GSAP animation on mount / filter change
    useEffect(() => {
        if (nodesRef.current.length === 0) return;
        const validNodes = nodesRef.current.filter(Boolean);
        gsap.fromTo(
            validNodes,
            { scale: 0, transformOrigin: 'center center' },
            { scale: 1, duration: 0.5, stagger: 0.03, ease: 'back.out(1.7)' }
        );
    }, [positionedNodes]);

    const handleNodeClick = (node) => {
        setSelectedNode(selectedNode?.id === node.id ? null : node);
    };

    const isEdgeHighlighted = (edge) => {
        if (!selectedNode) return false;
        return edge.source === selectedNode.id || edge.target === selectedNode.id;
    };

    if (nodes.length === 0) {
        return (
            <div className="rounded-2xl border border-black/[0.04] bg-white/80 backdrop-blur-sm p-8 text-center">
                <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-4 text-2xl select-none">
                    {'🧠'}
                </div>
                <h3 className="text-lg font-bold text-slate-800 font-display mb-2">Knowledge Map</h3>
                <p className="text-sm text-slate-500">Complete lessons to build your knowledge graph.</p>
            </div>
        );
    }

    return (
        <div className="rounded-2xl border border-black/[0.04] bg-white/80 backdrop-blur-sm overflow-hidden">
            {/* Header */}
            <div className="px-6 py-4 border-b border-black/[0.04] flex items-center justify-between">
                <div>
                    <h3 className="text-lg font-bold text-slate-800 font-display">Knowledge Map</h3>
                    <p className="text-xs text-slate-400 mt-0.5">
                        {nodes.length} concepts across {categories.length} categories
                    </p>
                </div>
                <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider">
                    <span className="flex items-center gap-1.5">
                        <span className="w-2.5 h-2.5 rounded-full bg-green-500" /> Strong
                    </span>
                    <span className="flex items-center gap-1.5">
                        <span className="w-2.5 h-2.5 rounded-full bg-yellow-500" /> Learning
                    </span>
                    <span className="flex items-center gap-1.5">
                        <span className="w-2.5 h-2.5 rounded-full bg-slate-400" /> New
                    </span>
                </div>
            </div>

            {/* Category tabs */}
            <div className="px-6 py-3 border-b border-black/[0.04] flex gap-2 overflow-x-auto">
                <button
                    onClick={() => setActiveCategory('all')}
                    className={`text-xs font-bold px-3 py-1.5 rounded-lg transition-all duration-200 whitespace-nowrap ${
                        activeCategory === 'all'
                            ? 'bg-cyan-50 text-cyan-700 border border-cyan-200'
                            : 'text-slate-400 hover:text-slate-600 hover:bg-slate-50 border border-transparent'
                    }`}
                >
                    All
                </button>
                {categories.map(cat => (
                    <button
                        key={cat}
                        onClick={() => setActiveCategory(cat)}
                        className={`text-xs font-bold px-3 py-1.5 rounded-lg transition-all duration-200 whitespace-nowrap ${
                            activeCategory === cat
                                ? 'bg-cyan-50 text-cyan-700 border border-cyan-200'
                                : 'text-slate-400 hover:text-slate-600 hover:bg-slate-50 border border-transparent'
                        }`}
                    >
                        {cat}
                    </button>
                ))}
            </div>

            {/* SVG Graph */}
            <div className="relative overflow-auto">
                <svg
                    ref={svgRef}
                    width={WIDTH}
                    height={HEIGHT}
                    viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
                    className="w-full"
                    style={{ minHeight: 400 }}
                >
                    {/* Edges */}
                    {filteredEdges.map((edge, idx) => {
                        const source = nodeMap[edge.source];
                        const target = nodeMap[edge.target];
                        if (!source || !target) return null;
                        const highlighted = isEdgeHighlighted(edge);
                        return (
                            <path
                                key={`edge-${idx}`}
                                d={edgePath(source.x, source.y, target.x, target.y)}
                                fill="none"
                                stroke={highlighted ? '#06b6d4' : '#e2e8f0'}
                                strokeWidth={highlighted ? 2.5 : 1.5}
                                strokeDasharray={highlighted ? 'none' : '4 4'}
                                opacity={selectedNode && !highlighted ? 0.2 : 0.8}
                                className="transition-all duration-300"
                            />
                        );
                    })}

                    {/* Nodes */}
                    {positionedNodes.map((node, idx) => {
                        const color = masteryColor(node.mastery ?? 0);
                        const isSelected = selectedNode?.id === node.id;
                        const dimmed = selectedNode && !isSelected &&
                            !filteredEdges.some(e =>
                                (e.source === selectedNode.id && e.target === node.id) ||
                                (e.target === selectedNode.id && e.source === node.id)
                            );

                        return (
                            <g
                                key={node.id}
                                ref={el => nodesRef.current[idx] = el}
                                className="cursor-pointer"
                                onClick={() => handleNodeClick(node)}
                                onMouseEnter={(e) => {
                                    const rect = svgRef.current.getBoundingClientRect();
                                    setTooltip({
                                        name: node.name || node.concept || node.id,
                                        mastery: node.mastery ?? 0,
                                        category: node.category,
                                        x: e.clientX - rect.left,
                                        y: e.clientY - rect.top - 45,
                                    });
                                }}
                                onMouseLeave={() => setTooltip(null)}
                                style={{ opacity: dimmed ? 0.25 : 1, transition: 'opacity 0.3s' }}
                            >
                                {/* Glow */}
                                <circle
                                    cx={node.x}
                                    cy={node.y}
                                    r={isSelected ? 24 : 18}
                                    fill={color}
                                    opacity={0.15}
                                    className="transition-all duration-300"
                                />
                                {/* Main circle */}
                                <circle
                                    cx={node.x}
                                    cy={node.y}
                                    r={isSelected ? 16 : 12}
                                    fill={color}
                                    stroke="white"
                                    strokeWidth={2}
                                    className="transition-all duration-300"
                                />
                                {/* Label */}
                                <text
                                    x={node.x}
                                    y={node.y + (isSelected ? 28 : 24)}
                                    textAnchor="middle"
                                    className="text-[9px] font-bold fill-slate-500 select-none"
                                >
                                    {(node.name || node.concept || node.id).length > 14
                                        ? (node.name || node.concept || node.id).slice(0, 12) + '...'
                                        : (node.name || node.concept || node.id)}
                                </text>
                            </g>
                        );
                    })}
                </svg>

                {/* Tooltip */}
                <AnimatePresence>
                    {tooltip && (
                        <motion.div
                            initial={{ opacity: 0, y: 5 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0 }}
                            className="absolute pointer-events-none bg-slate-900 text-white rounded-xl px-3 py-2 text-xs shadow-xl z-20"
                            style={{ left: tooltip.x, top: tooltip.y, transform: 'translateX(-50%)' }}
                        >
                            <div className="font-bold">{tooltip.name}</div>
                            <div className="flex items-center gap-2 mt-1 text-slate-300">
                                <span className="flex items-center gap-1">
                                    <span
                                        className="w-2 h-2 rounded-full inline-block"
                                        style={{ backgroundColor: masteryColor(tooltip.mastery) }}
                                    />
                                    {Math.round(tooltip.mastery * 100)}% — {masteryLabel(tooltip.mastery)}
                                </span>
                            </div>
                            {tooltip.category && (
                                <div className="text-slate-400 mt-0.5">{tooltip.category}</div>
                            )}
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </div>
    );
}
