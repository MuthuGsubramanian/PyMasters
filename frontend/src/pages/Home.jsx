import { useNavigate, Link } from 'react-router-dom';
import { motion, useInView } from 'framer-motion';
import { useRef, useEffect, useState } from 'react';
import {
    ArrowRight, Sparkles, Brain, Layers, Code2,
    Zap, Globe2, BookOpen, ChevronDown, Star,
    MessageSquare, Cpu, GraduationCap, Play, Terminal
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import PymastersIcon from '../assets/pymasters-icon.svg';

/* ─── Animated counter hook ─────────────────────────────────────────────── */
function useCounter(target, duration = 1800, shouldStart = false) {
    const [count, setCount] = useState(0);
    useEffect(() => {
        if (!shouldStart) return;
        let startTime = null;
        const step = (timestamp) => {
            if (!startTime) startTime = timestamp;
            const progress = Math.min((timestamp - startTime) / duration, 1);
            const eased = 1 - Math.pow(1 - progress, 3);
            setCount(Math.floor(eased * target));
            if (progress < 1) requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
    }, [target, duration, shouldStart]);
    return count;
}

/* ─── Code Rain Background ──────────────────────────────────────────────── */
function CodeRain() {
    const canvasRef = useRef(null);
    const animRef = useRef(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');

        const resize = () => {
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;
        };
        resize();
        window.addEventListener('resize', resize);

        const chars = 'def for if else while class return import print range True False None yield lambda = + - * / ( ) [ ] { } : , . # int str list dict set tuple len map filter'.split(' ');
        const fontSize = 14;
        const columns = Math.floor(canvas.width / (fontSize * 3));
        const drops = Array(columns).fill(0).map(() => Math.random() * -100);
        const speeds = Array(columns).fill(0).map(() => 0.3 + Math.random() * 0.7);

        const draw = () => {
            ctx.fillStyle = 'rgba(2, 6, 23, 0.06)';
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            drops.forEach((y, i) => {
                const char = chars[Math.floor(Math.random() * chars.length)];
                const x = i * (fontSize * 3);
                const opacity = Math.max(0, Math.min(0.15, (y / canvas.height) * 0.2));

                ctx.font = `${fontSize}px 'JetBrains Mono', monospace`;
                ctx.fillStyle = `rgba(124, 58, 237, ${opacity})`;
                ctx.fillText(char, x, y);

                drops[i] += speeds[i];
                if (drops[i] > canvas.height && Math.random() > 0.98) {
                    drops[i] = 0;
                }
            });

            animRef.current = requestAnimationFrame(draw);
        };

        draw();

        return () => {
            cancelAnimationFrame(animRef.current);
            window.removeEventListener('resize', resize);
        };
    }, []);

    return <canvas ref={canvasRef} className="absolute inset-0 pointer-events-none opacity-60" />;
}

/* ─── Interactive Python REPL Demo ──────────────────────────────────────── */
function HeroREPL() {
    const [lines, setLines] = useState([]);
    const [currentLine, setCurrentLine] = useState('');
    const [lineIdx, setLineIdx] = useState(0);

    const demoScript = [
        { input: '>>> name = "PyMasters"', delay: 60 },
        { input: '>>> print(f"Welcome to {name}!")', delay: 50 },
        { output: 'Welcome to PyMasters!' },
        { input: '>>> skills = ["Python", "AI/ML", "Deep Learning"]', delay: 45 },
        { input: '>>> for skill in skills:', delay: 50 },
        { input: '...     print(f"Master: {skill}")', delay: 40 },
        { output: 'Master: Python' },
        { output: 'Master: AI/ML' },
        { output: 'Master: Deep Learning' },
        { input: '>>> vaathiyaar.teach("your_topic")', delay: 55 },
        { output: "Vaathiyaar is ready to teach you!" },
    ];

    useEffect(() => {
        if (lineIdx >= demoScript.length) {
            // Loop after a pause
            const timeout = setTimeout(() => {
                setLines([]);
                setCurrentLine('');
                setLineIdx(0);
            }, 4000);
            return () => clearTimeout(timeout);
        }

        const item = demoScript[lineIdx];

        if (item.output) {
            // Instant output
            const timeout = setTimeout(() => {
                setLines(prev => [...prev, { type: 'output', text: item.output }]);
                setLineIdx(i => i + 1);
            }, 300);
            return () => clearTimeout(timeout);
        }

        // Typewriter for input
        let charIdx = 0;
        setCurrentLine('');
        const interval = setInterval(() => {
            if (charIdx < item.input.length) {
                setCurrentLine(item.input.slice(0, charIdx + 1));
                charIdx++;
            } else {
                clearInterval(interval);
                setTimeout(() => {
                    setLines(prev => [...prev, { type: 'input', text: item.input }]);
                    setCurrentLine('');
                    setLineIdx(i => i + 1);
                }, 400);
            }
        }, item.delay || 60);

        return () => clearInterval(interval);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [lineIdx]);

    return (
        <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 1, delay: 0.8 }}
            className="relative max-w-xl mx-auto mt-12"
        >
            {/* Glow behind terminal */}
            <div className="absolute -inset-6 bg-gradient-to-r from-purple-600/15 via-cyan-500/10 to-purple-600/15 rounded-3xl blur-2xl" />

            <div className="relative rounded-2xl overflow-hidden border border-white/[0.08] shadow-2xl shadow-purple-900/30">
                {/* Terminal header */}
                <div className="bg-slate-800/90 border-b border-white/[0.06] px-4 py-2.5 flex items-center gap-2">
                    <div className="flex items-center gap-1.5">
                        <span className="w-3 h-3 rounded-full bg-[#ff5f57]" />
                        <span className="w-3 h-3 rounded-full bg-[#febc2e]" />
                        <span className="w-3 h-3 rounded-full bg-[#28c840]" />
                    </div>
                    <span className="ml-3 text-[11px] text-slate-400 font-mono flex items-center gap-1.5">
                        <Terminal size={12} />
                        python3 — PyMasters
                    </span>
                    <div className="ml-auto flex items-center gap-1.5">
                        <span className="relative flex h-2 w-2">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
                        </span>
                        <span className="text-[10px] text-green-400/80">live</span>
                    </div>
                </div>

                {/* Terminal body */}
                <div className="bg-[#0d1117] p-4 font-mono text-sm min-h-[200px] max-h-[280px] overflow-hidden">
                    {lines.map((line, idx) => (
                        <div key={idx} className={`mb-1 leading-relaxed ${
                            line.type === 'output'
                                ? 'text-green-400/90 pl-0'
                                : 'text-slate-300'
                        }`}>
                            {line.text}
                        </div>
                    ))}
                    {currentLine && (
                        <div className="text-slate-300 mb-1 leading-relaxed">
                            {currentLine}
                            <span className="inline-block w-[7px] h-[14px] bg-green-400 ml-px rounded-[1px] align-middle shadow-[0_0_8px_rgba(74,222,128,0.5)]"
                                style={{ animation: 'blink 1s steps(2) infinite' }}
                            />
                        </div>
                    )}
                    {!currentLine && lineIdx < demoScript.length && (
                        <div className="text-slate-500 flex items-center gap-1">
                            <span>{'>>>'}</span>
                            <span className="inline-block w-[7px] h-[14px] bg-green-400 rounded-[1px] shadow-[0_0_8px_rgba(74,222,128,0.5)]"
                                style={{ animation: 'blink 1s steps(2) infinite' }}
                            />
                        </div>
                    )}
                </div>
            </div>

            <style>{`
                @keyframes blink {
                    0%, 49% { opacity: 1; }
                    50%, 100% { opacity: 0; }
                }
            `}</style>
        </motion.div>
    );
}

/* ─── Sub-components ─────────────────────────────────────────────────────── */

function GridOverlay() {
    return (
        <div
            className="absolute inset-0 pointer-events-none opacity-[0.03]"
            style={{
                backgroundImage: `
                    linear-gradient(rgba(124,58,237,0.6) 1px, transparent 1px),
                    linear-gradient(90deg, rgba(124,58,237,0.6) 1px, transparent 1px)
                `,
                backgroundSize: '60px 60px',
            }}
        />
    );
}

function FloatingOrbs() {
    return (
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
            <div className="absolute top-[-15%] right-[-8%] w-[700px] h-[700px] bg-purple-700/20 rounded-full blur-[140px] animate-pulse" style={{ animationDuration: '8s' }} />
            <div className="absolute bottom-[-10%] left-[-5%] w-[500px] h-[500px] bg-cyan-600/15 rounded-full blur-[120px] animate-pulse" style={{ animationDuration: '10s', animationDelay: '2s' }} />
            <div className="absolute top-[40%] left-[30%] w-[300px] h-[300px] bg-violet-600/10 rounded-full blur-[80px] animate-pulse" style={{ animationDuration: '6s', animationDelay: '1s' }} />
        </div>
    );
}

function FeatureCard({ icon, title, desc, accentColor, delay }) {
    return (
        <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay }}
            className="group relative p-6 rounded-2xl bg-white/[0.03] border border-white/[0.06] backdrop-blur-sm hover:bg-white/[0.06] hover:border-white/[0.12] transition-all duration-500 overflow-hidden"
        >
            <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 rounded-2xl"
                style={{ background: `radial-gradient(circle at top left, ${accentColor}12, transparent 60%)` }}
            />
            {/* Hover shine effect */}
            <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none"
                style={{ background: `linear-gradient(135deg, transparent 40%, ${accentColor}08 50%, transparent 60%)` }}
            />
            <div className="w-12 h-12 rounded-xl flex items-center justify-center mb-4 border transition-all duration-300 group-hover:scale-110 group-hover:shadow-lg"
                style={{ background: `${accentColor}15`, borderColor: `${accentColor}30`, boxShadow: `0 0 0 0 ${accentColor}00` }}>
                {icon}
            </div>
            <h3 className="text-white font-bold text-lg mb-2 font-display">{title}</h3>
            <p className="text-slate-400 text-sm leading-relaxed">{desc}</p>

            {/* Bottom gradient line on hover */}
            <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-gradient-to-r opacity-0 group-hover:opacity-100 transition-opacity duration-500"
                style={{ backgroundImage: `linear-gradient(90deg, transparent, ${accentColor}, transparent)` }}
            />
        </motion.div>
    );
}

function TrackCard({ track, delay }) {
    return (
        <motion.div
            initial={{ opacity: 0, y: 40 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.7, delay }}
            className="group relative rounded-3xl overflow-hidden border border-white/[0.06] bg-white/[0.02] backdrop-blur-sm hover:border-white/[0.15] transition-all duration-500 hover:-translate-y-1"
        >
            {/* Top gradient bar with animated width */}
            <div className="h-1.5 w-full relative overflow-hidden">
                <div className="h-full w-full" style={{ background: track.gradient }} />
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000" />
            </div>

            <div className="p-8">
                <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-6 text-2xl transition-all duration-300 group-hover:scale-110 group-hover:shadow-xl"
                    style={{ background: `${track.accent}15`, border: `1px solid ${track.accent}30` }}>
                    {track.icon}
                </div>

                <div className="flex items-start justify-between mb-3">
                    <h3 className="text-white font-bold text-2xl font-display leading-tight">{track.name}</h3>
                    <span className="shrink-0 text-xs font-bold px-3 py-1 rounded-full ml-3 mt-1"
                        style={{ background: `${track.accent}20`, color: track.accent, border: `1px solid ${track.accent}25` }}>
                        {track.lessons} Lessons
                    </span>
                </div>

                <p className="text-slate-400 text-sm leading-relaxed mb-6">{track.desc}</p>

                <div className="flex flex-wrap gap-2">
                    {track.topics.map((t) => (
                        <span key={t} className="text-xs px-2.5 py-1 rounded-lg bg-white/[0.03] border border-white/[0.06] text-slate-400 transition-colors duration-300 hover:text-slate-200 hover:border-white/[0.12]">
                            {t}
                        </span>
                    ))}
                </div>
            </div>

            {/* Hover glow */}
            <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none rounded-3xl"
                style={{ boxShadow: `inset 0 0 80px ${track.accent}08` }} />
        </motion.div>
    );
}

function StatItem({ value, suffix, label, shouldCount }) {
    const count = useCounter(value, 1600, shouldCount);
    return (
        <div className="text-center group">
            <div className="text-4xl lg:text-5xl font-bold font-display text-white mb-1 transition-transform duration-300 group-hover:scale-110">
                {shouldCount ? count : 0}{suffix}
            </div>
            <div className="text-xs text-slate-400 uppercase tracking-widest font-bold">{label}</div>
        </div>
    );
}

/* ─── Animated Visual Demo Section ──────────────────────────────────────── */
function VisualLearningDemo() {
    const [activeTab, setActiveTab] = useState(0);
    const tabs = [
        {
            label: 'Code Cinema',
            icon: <Play size={14} />,
            code: 'for i in range(5):\n    print(f"Step {i}")',
            description: 'Watch code execute line-by-line with cinematic animations, variable tracking, and real-time output.',
        },
        {
            label: 'Visual Logic',
            icon: <Zap size={14} />,
            code: 'if score >= 90:\n    grade = "A"\nelse:\n    grade = "B"',
            description: 'See branching logic, loops, and data flow animated in real-time so abstract concepts click instantly.',
        },
        {
            label: 'Live Variables',
            icon: <Terminal size={14} />,
            code: 'x = 10\nx = x + 5\nprint(x)  # 15',
            description: 'Track variable values as they change, with history trails and type-aware color coding.',
        },
    ];

    useEffect(() => {
        const interval = setInterval(() => {
            setActiveTab(t => (t + 1) % tabs.length);
        }, 5000);
        return () => clearInterval(interval);
    }, []);

    return (
        <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8 }}
            className="rounded-3xl overflow-hidden border border-white/[0.06] bg-white/[0.02] backdrop-blur-sm"
        >
            {/* Tab header */}
            <div className="border-b border-white/[0.06] px-6 py-3 flex items-center gap-1">
                {tabs.map((tab, idx) => (
                    <button
                        key={idx}
                        onClick={() => setActiveTab(idx)}
                        className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold transition-all duration-300 ${
                            idx === activeTab
                                ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                                : 'text-slate-500 hover:text-slate-300 border border-transparent'
                        }`}
                    >
                        {tab.icon}
                        {tab.label}
                    </button>
                ))}
            </div>

            <div className="grid lg:grid-cols-2 gap-0">
                {/* Code panel */}
                <div className="bg-[#0d1117] p-6 font-mono text-sm border-r border-white/[0.04]">
                    <pre className="text-slate-300 leading-relaxed">
                        {tabs[activeTab].code.split('\n').map((line, i) => (
                            <motion.div
                                key={`${activeTab}-${i}`}
                                initial={{ opacity: 0, x: -10 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ delay: i * 0.15, duration: 0.3 }}
                                className="flex items-center gap-3 py-0.5"
                            >
                                <span className="text-slate-600 text-[11px] w-4 text-right select-none">{i + 1}</span>
                                <span>{line}</span>
                            </motion.div>
                        ))}
                    </pre>
                </div>

                {/* Description panel */}
                <div className="p-6 flex items-center">
                    <motion.div
                        key={activeTab}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.4 }}
                    >
                        <div className="flex items-center gap-2 mb-3">
                            <div className="w-8 h-8 rounded-lg bg-purple-500/20 border border-purple-500/30 flex items-center justify-center text-purple-300">
                                {tabs[activeTab].icon}
                            </div>
                            <h4 className="text-white font-bold font-display">{tabs[activeTab].label}</h4>
                        </div>
                        <p className="text-slate-400 text-sm leading-relaxed">
                            {tabs[activeTab].description}
                        </p>
                    </motion.div>
                </div>
            </div>

            {/* Auto-advancing progress */}
            <div className="h-0.5 bg-slate-800">
                <motion.div
                    key={activeTab}
                    initial={{ width: '0%' }}
                    animate={{ width: '100%' }}
                    transition={{ duration: 5, ease: 'linear' }}
                    className="h-full bg-gradient-to-r from-purple-500 to-cyan-400"
                />
            </div>
        </motion.div>
    );
}

/* ─── Data ───────────────────────────────────────────────────────────────── */

const TRACKS = [
    {
        name: 'Python Foundations',
        lessons: 36,
        accent: '#06b6d4',
        gradient: 'linear-gradient(90deg, #06b6d4, #3b82f6)',
        icon: <Code2 size={24} color="#06b6d4" />,
        desc: 'Build an unshakeable foundation in Python — from variables and loops to OOP, file handling, and real-world projects.',
        topics: ['Variables & Types', 'Control Flow', 'Functions', 'OOP', 'File I/O', 'Modules'],
    },
    {
        name: 'AI & Machine Learning',
        lessons: 18,
        accent: '#7c3aed',
        gradient: 'linear-gradient(90deg, #7c3aed, #a855f7)',
        icon: <Brain size={24} color="#a855f7" />,
        desc: 'Dive into supervised & unsupervised learning, model evaluation, and feature engineering with scikit-learn and pandas.',
        topics: ['Pandas', 'scikit-learn', 'Regression', 'Classification', 'Clustering', 'Pipelines'],
    },
    {
        name: 'Deep Learning',
        lessons: 20,
        accent: '#f59e0b',
        gradient: 'linear-gradient(90deg, #f59e0b, #ef4444)',
        icon: <Layers size={24} color="#f59e0b" />,
        desc: 'Master neural networks, CNNs, RNNs, and transformers. Train models from scratch and deploy them to production.',
        topics: ['PyTorch', 'Neural Nets', 'CNNs', 'RNNs', 'Transformers', 'Deployment'],
    },
];

const FEATURES = [
    {
        icon: <Brain size={22} color="#7c3aed" />,
        title: 'AI-Powered Learning',
        desc: 'Vaathiyaar, your personal AI teacher, adapts to your pace and learning style — explaining concepts in ways that click.',
        accentColor: '#7c3aed',
        delay: 0,
    },
    {
        icon: <Zap size={22} color="#06b6d4" />,
        title: 'Cinema-Quality Animations',
        desc: 'Complex concepts like recursion and linked lists come alive through beautifully crafted visual explanations.',
        accentColor: '#06b6d4',
        delay: 0.1,
    },
    {
        icon: <Star size={22} color="#f59e0b" />,
        title: 'Personalized Path',
        desc: 'Your curriculum adapts as you progress. Struggling with closures? Vaathiyaar detects it and reinforces the concept.',
        accentColor: '#f59e0b',
        delay: 0.2,
    },
    {
        icon: <Globe2 size={22} color="#10b981" />,
        title: 'Dynamic Modules',
        desc: 'Vaathiyaar can generate entirely new lesson modules on demand — covering any Python topic you want to explore.',
        accentColor: '#10b981',
        delay: 0.3,
    },
];

/* ─── Main Component ─────────────────────────────────────────────────────── */

export default function Home() {
    const navigate = useNavigate();
    const { user } = useAuth();
    const ctaTarget = user ? '/dashboard/classroom' : '/login';

    const statsRef = useRef(null);
    const statsInView = useInView(statsRef, { once: true, margin: '-80px' });

    return (
        <div className="min-h-screen bg-[#020617] text-slate-100 relative overflow-x-hidden font-sans selection:bg-purple-500/30 selection:text-white">

            {/* Code Rain Background */}
            <CodeRain />

            {/* ── Navigation ── */}
            <nav className="fixed top-0 left-0 right-0 z-50 px-6 py-4 border-b border-white/[0.04] bg-[#020617]/80 backdrop-blur-2xl">
                <div className="max-w-7xl mx-auto flex justify-between items-center">
                    <div className="flex items-center gap-3 group cursor-pointer" onClick={() => navigate('/')}>
                        <img src={PymastersIcon} alt="PyMasters" className="w-10 h-10 drop-shadow-[0_0_8px_rgba(124,58,237,0.8)] transition-transform duration-300 group-hover:scale-110" />
                        <span className="font-display font-bold text-xl tracking-tight text-white">PYMASTERS</span>
                    </div>
                    <div className="flex items-center gap-4">
                        {user ? (
                            <button
                                onClick={() => navigate('/dashboard/classroom')}
                                className="text-sm font-medium text-slate-300 hover:text-white transition-colors"
                            >
                                Dashboard
                            </button>
                        ) : (
                            <button
                                onClick={() => navigate('/login')}
                                className="text-sm font-medium text-slate-400 hover:text-white transition-colors"
                            >
                                Sign In
                            </button>
                        )}
                        <button
                            onClick={() => navigate(ctaTarget)}
                            className="group/btn inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold text-white transition-all duration-300 hover:scale-[1.03] active:scale-[0.97] relative overflow-hidden"
                            style={{ background: 'linear-gradient(135deg, #7c3aed, #06b6d4)', boxShadow: '0 4px 20px rgba(124,58,237,0.4)' }}
                        >
                            <span className="relative z-10 flex items-center gap-2">
                                {user ? 'Continue Learning' : 'Get Started'}
                                <ArrowRight size={15} className="group-hover/btn:translate-x-0.5 transition-transform" />
                            </span>
                            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent translate-x-[-100%] group-hover/btn:translate-x-[100%] transition-transform duration-700" />
                        </button>
                    </div>
                </div>
            </nav>

            {/* ══════════════════════════════════════════
                SECTION 1 — HERO
            ══════════════════════════════════════════ */}
            <section className="relative min-h-screen flex flex-col items-center justify-center text-center px-6 pt-20">
                <FloatingOrbs />
                <GridOverlay />

                {/* Arc reactor icon */}
                <motion.div
                    initial={{ opacity: 0, scale: 0.6 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 1, ease: 'easeOut', delay: 0.1 }}
                    className="relative mb-10"
                >
                    <div className="absolute inset-0 rounded-full blur-[60px] bg-purple-600/50 scale-125" />
                    <div className="relative w-36 h-36 flex items-center justify-center rounded-full border border-purple-500/30 bg-slate-900/60 backdrop-blur-sm shadow-[0_0_80px_rgba(124,58,237,0.5)]">
                        <img
                            src={PymastersIcon}
                            alt="PyMasters Arc Reactor"
                            className="w-24 h-24 drop-shadow-[0_0_20px_rgba(124,58,237,1)]"
                            style={{ filter: 'drop-shadow(0 0 16px #7c3aed) drop-shadow(0 0 32px #06b6d4)' }}
                        />
                    </div>
                    {/* Orbit rings */}
                    <div className="absolute inset-[-28px] rounded-full border border-purple-500/20 animate-spin" style={{ animationDuration: '12s' }}>
                        <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full bg-purple-400 shadow-[0_0_10px_#7c3aed]" />
                    </div>
                    <div className="absolute inset-[-50px] rounded-full border border-cyan-500/10 animate-spin" style={{ animationDuration: '20s', animationDirection: 'reverse' }}>
                        <div className="absolute bottom-0 right-0 translate-x-1/4 translate-y-1/4 w-2 h-2 rounded-full bg-cyan-400 shadow-[0_0_8px_#06b6d4]" />
                    </div>
                    {/* Third ring */}
                    <div className="absolute inset-[-72px] rounded-full border border-violet-500/5 animate-spin" style={{ animationDuration: '30s' }}>
                        <div className="absolute top-1/2 right-0 translate-x-1/2 w-1.5 h-1.5 rounded-full bg-violet-400/50 shadow-[0_0_6px_#8b5cf6]" />
                    </div>
                </motion.div>

                {/* Heading */}
                <motion.h1
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.8, delay: 0.3 }}
                    className="text-5xl sm:text-6xl lg:text-8xl font-bold font-display leading-[1.05] mb-6 max-w-4xl"
                >
                    Master Python.{' '}
                    <span
                        className="text-transparent bg-clip-text"
                        style={{ backgroundImage: 'linear-gradient(135deg, #7c3aed 0%, #06b6d4 60%, #a855f7 100%)' }}
                    >
                        Powered by AI.
                    </span>
                </motion.h1>

                {/* Sub-heading */}
                <motion.p
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.8, delay: 0.45 }}
                    className="text-lg sm:text-xl text-slate-400 max-w-2xl mb-10 leading-relaxed"
                >
                    Learn from <span className="text-white font-semibold">Vaathiyaar</span> — your AI teacher that adapts to you.
                    From Python basics to deep learning, build real skills that matter.
                </motion.p>

                {/* CTAs */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.8, delay: 0.6 }}
                    className="flex flex-col sm:flex-row gap-4 justify-center"
                >
                    <button
                        onClick={() => navigate(ctaTarget)}
                        className="group inline-flex items-center justify-center gap-2 px-8 py-4 rounded-2xl text-base font-bold text-white transition-all duration-300 hover:scale-[1.04] active:scale-[0.97] relative overflow-hidden"
                        style={{ background: 'linear-gradient(135deg, #7c3aed, #06b6d4)', boxShadow: '0 6px 30px rgba(124,58,237,0.45)' }}
                    >
                        <GraduationCap size={20} />
                        Start Learning
                        <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />
                        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700" />
                    </button>
                    <button
                        onClick={() => {
                            document.getElementById('curriculum')?.scrollIntoView({ behavior: 'smooth' });
                        }}
                        className="inline-flex items-center justify-center gap-2 px-8 py-4 rounded-2xl text-base font-bold text-slate-300 border border-white/10 bg-white/[0.03] backdrop-blur-sm hover:bg-white/[0.06] hover:text-white hover:border-white/20 transition-all duration-300"
                    >
                        <BookOpen size={18} />
                        Explore Curriculum
                    </button>
                </motion.div>

                {/* Interactive REPL Demo */}
                <HeroREPL />

                {/* Scroll hint */}
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 2, duration: 1 }}
                    className="absolute bottom-10 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 text-slate-600"
                >
                    <span className="text-xs tracking-widest uppercase">Scroll</span>
                    <ChevronDown size={18} className="animate-bounce" />
                </motion.div>
            </section>

            {/* ══════════════════════════════════════════
                SECTION 2 — VISUAL LEARNING DEMO
            ══════════════════════════════════════════ */}
            <section className="relative py-28 px-6">
                <div className="max-w-5xl mx-auto">
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ duration: 0.7 }}
                        className="text-center mb-12"
                    >
                        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-purple-500/30 bg-purple-500/10 text-purple-300 text-xs font-bold tracking-wider uppercase mb-6">
                            <Play size={12} />
                            See It In Action
                        </div>
                        <h2 className="text-3xl sm:text-5xl font-bold font-display text-white mb-4">
                            Code That<br />
                            <span className="text-transparent bg-clip-text" style={{ backgroundImage: 'linear-gradient(135deg, #7c3aed, #06b6d4)' }}>
                                Comes Alive
                            </span>
                        </h2>
                        <p className="text-slate-400 max-w-xl mx-auto text-base leading-relaxed">
                            No more staring at static text. Watch Python execute visually — see variables change, loops iterate, and logic branch in real time.
                        </p>
                    </motion.div>

                    <VisualLearningDemo />
                </div>
            </section>

            {/* ══════════════════════════════════════════
                SECTION 3 — WHAT MAKES PYMASTERS DIFFERENT
            ══════════════════════════════════════════ */}
            <section className="relative py-28 px-6">
                <div className="max-w-7xl mx-auto">
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ duration: 0.7 }}
                        className="text-center mb-16"
                    >
                        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-cyan-500/30 bg-cyan-500/10 text-cyan-400 text-xs font-bold tracking-wider uppercase mb-6">
                            <Sparkles size={12} />
                            Why PyMasters
                        </div>
                        <h2 className="text-3xl sm:text-5xl font-bold font-display text-white mb-4">
                            A Different Kind of<br />
                            <span className="text-transparent bg-clip-text" style={{ backgroundImage: 'linear-gradient(135deg, #06b6d4, #7c3aed)' }}>
                                Learning Experience
                            </span>
                        </h2>
                        <p className="text-slate-400 max-w-xl mx-auto text-base leading-relaxed">
                            PyMasters isn't just another tutorial site. It's a living, breathing AI-powered platform
                            that evolves with you.
                        </p>
                    </motion.div>

                    <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
                        {FEATURES.map((f) => (
                            <FeatureCard key={f.title} {...f} />
                        ))}
                    </div>
                </div>
            </section>

            {/* ══════════════════════════════════════════
                SECTION 4 — CURRICULUM TRACKS
            ══════════════════════════════════════════ */}
            <section id="curriculum" className="relative py-28 px-6">
                <div className="absolute inset-0 pointer-events-none">
                    <div className="absolute inset-0 bg-gradient-to-b from-transparent via-purple-950/15 to-transparent" />
                </div>

                <div className="max-w-7xl mx-auto relative">
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ duration: 0.7 }}
                        className="text-center mb-16"
                    >
                        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-purple-500/30 bg-purple-500/10 text-purple-300 text-xs font-bold tracking-wider uppercase mb-6">
                            <Layers size={12} />
                            3 Tracks · 74 Lessons
                        </div>
                        <h2 className="text-3xl sm:text-5xl font-bold font-display text-white mb-4">
                            Your Complete<br />
                            <span className="text-transparent bg-clip-text" style={{ backgroundImage: 'linear-gradient(135deg, #7c3aed, #f59e0b)' }}>
                                Learning Path
                            </span>
                        </h2>
                        <p className="text-slate-400 max-w-xl mx-auto">
                            From writing your first line of Python to training deep neural networks — every step is guided.
                        </p>
                    </motion.div>

                    <div className="grid lg:grid-cols-3 gap-6">
                        {TRACKS.map((track, i) => (
                            <TrackCard key={track.name} track={track} delay={i * 0.15} />
                        ))}
                    </div>
                </div>
            </section>

            {/* ══════════════════════════════════════════
                SECTION 5 — MEET VAATHIYAAR
            ══════════════════════════════════════════ */}
            <section className="relative py-28 px-6">
                <div className="max-w-6xl mx-auto">
                    <div className="relative rounded-3xl overflow-hidden border border-white/[0.06] bg-white/[0.02] backdrop-blur-sm p-10 lg:p-16">
                        <div className="absolute -top-20 -right-20 w-80 h-80 bg-purple-700/20 rounded-full blur-[100px] pointer-events-none" />
                        <div className="absolute -bottom-20 -left-20 w-64 h-64 bg-cyan-600/15 rounded-full blur-[80px] pointer-events-none" />

                        <div className="relative grid lg:grid-cols-2 gap-12 items-center">
                            {/* Left: text */}
                            <motion.div
                                initial={{ opacity: 0, x: -30 }}
                                whileInView={{ opacity: 1, x: 0 }}
                                viewport={{ once: true }}
                                transition={{ duration: 0.8 }}
                            >
                                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-purple-500/30 bg-purple-500/10 text-purple-300 text-xs font-bold tracking-wider uppercase mb-6">
                                    <MessageSquare size={12} />
                                    Meet Your Teacher
                                </div>
                                <h2 className="text-3xl sm:text-5xl font-bold font-display text-white mb-6 leading-tight">
                                    Say hello to<br />
                                    <span className="text-transparent bg-clip-text" style={{ backgroundImage: 'linear-gradient(135deg, #7c3aed, #06b6d4)' }}>
                                        Vaathiyaar
                                    </span>
                                </h2>
                                <p className="text-slate-400 text-base leading-relaxed mb-8">
                                    <em>"Vaathiyaar"</em> means <em>teacher</em> in Tamil. Our AI teacher isn't a chatbot — it's a
                                    deeply integrated learning intelligence that understands where you are and where you need to go.
                                </p>
                                <div className="space-y-4">
                                    {[
                                        { icon: <Brain size={18} color="#7c3aed" />, text: 'Adapts difficulty to your exact comprehension level in real time' },
                                        { icon: <Globe2 size={18} color="#06b6d4" />, text: 'Teaches in multiple languages — explain in your mother tongue' },
                                        { icon: <Cpu size={18} color="#f59e0b" />, text: 'Generates entirely new lesson modules for any Python topic on demand' },
                                        { icon: <Zap size={18} color="#10b981" />, text: 'Streams responses live — no waiting, instant educational dialogue' },
                                    ].map(({ icon, text }) => (
                                        <div key={text} className="flex items-start gap-3 group">
                                            <div className="shrink-0 w-9 h-9 rounded-lg flex items-center justify-center bg-white/[0.03] border border-white/[0.06] mt-0.5 transition-all duration-300 group-hover:scale-110 group-hover:bg-white/[0.06]">
                                                {icon}
                                            </div>
                                            <p className="text-slate-300 text-sm leading-relaxed pt-1.5">{text}</p>
                                        </div>
                                    ))}
                                </div>
                            </motion.div>

                            {/* Right: mock chat UI */}
                            <motion.div
                                initial={{ opacity: 0, x: 30 }}
                                whileInView={{ opacity: 1, x: 0 }}
                                viewport={{ once: true }}
                                transition={{ duration: 0.8, delay: 0.15 }}
                                className="relative"
                            >
                                <div className="absolute -inset-4 bg-gradient-to-r from-purple-600/10 via-transparent to-cyan-500/10 rounded-3xl blur-xl pointer-events-none" />
                                <div className="relative rounded-2xl bg-[#0d1117] border border-white/[0.08] overflow-hidden shadow-2xl shadow-purple-900/20">
                                    <div className="h-12 border-b border-white/[0.06] flex items-center px-5 gap-3 bg-slate-800/50">
                                        <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: 'linear-gradient(135deg,#7c3aed,#06b6d4)' }}>
                                            <img src={PymastersIcon} alt="" className="w-4 h-4" />
                                        </div>
                                        <span className="text-white text-sm font-semibold font-display">Vaathiyaar</span>
                                        <span className="ml-auto text-xs text-emerald-400 flex items-center gap-1">
                                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                                            Online
                                        </span>
                                    </div>
                                    <div className="p-5 space-y-4 text-sm">
                                        <div className="flex gap-3">
                                            <div className="w-7 h-7 shrink-0 rounded-full flex items-center justify-center mt-0.5" style={{ background: 'linear-gradient(135deg,#7c3aed,#06b6d4)' }}>
                                                <img src={PymastersIcon} alt="" className="w-4 h-4" />
                                            </div>
                                            <div className="bg-white/[0.04] border border-white/[0.06] rounded-2xl rounded-tl-sm px-4 py-3 text-slate-300 max-w-[80%] leading-relaxed">
                                                Vanakkam! I'm Vaathiyaar. What concept would you like to master today?
                                            </div>
                                        </div>
                                        <div className="flex gap-3 justify-end">
                                            <div className="px-4 py-3 rounded-2xl rounded-tr-sm text-white max-w-[75%] leading-relaxed bg-gradient-to-r from-purple-600/40 to-cyan-600/40 border border-purple-500/20">
                                                Can you explain Python decorators?
                                            </div>
                                        </div>
                                        <div className="flex gap-3">
                                            <div className="w-7 h-7 shrink-0 rounded-full flex items-center justify-center mt-0.5" style={{ background: 'linear-gradient(135deg,#7c3aed,#06b6d4)' }}>
                                                <img src={PymastersIcon} alt="" className="w-4 h-4" />
                                            </div>
                                            <div className="bg-white/[0.04] border border-white/[0.06] rounded-2xl rounded-tl-sm px-4 py-3 text-slate-300 max-w-[80%] leading-relaxed">
                                                Great choice! A decorator is a function that wraps another function — think of it like adding a superpower to your existing code without changing it...
                                                <span className="inline-block w-1.5 h-4 bg-purple-400 ml-1 align-middle" style={{ animation: 'blink 0.8s steps(2) infinite' }} />
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </motion.div>
                        </div>
                    </div>
                </div>
            </section>

            {/* ══════════════════════════════════════════
                SECTION 6 — STATS BAR
            ══════════════════════════════════════════ */}
            <section ref={statsRef} className="relative py-20 px-6">
                <div className="absolute inset-0 pointer-events-none">
                    <div className="absolute inset-0 bg-gradient-to-r from-purple-950/20 via-slate-900/50 to-cyan-950/15" />
                    <GridOverlay />
                </div>
                <div className="relative max-w-5xl mx-auto">
                    <div className="rounded-3xl border border-white/[0.06] bg-white/[0.02] backdrop-blur-sm p-10 lg:p-14">
                        <div className="grid grid-cols-2 lg:grid-cols-4 gap-10 divide-y-2 divide-white/0 lg:divide-y-0 lg:divide-x lg:divide-white/[0.06]">
                            <StatItem value={74} suffix="" label="Total Lessons" shouldCount={statsInView} />
                            <StatItem value={3} suffix="" label="Tracks" shouldCount={statsInView} />
                            <StatItem value={10} suffix="+" label="Modules" shouldCount={statsInView} />
                            <div className="text-center group">
                                <div className="text-4xl lg:text-5xl font-bold font-display text-white mb-1 flex items-center justify-center gap-2 transition-transform duration-300 group-hover:scale-110">
                                    <Sparkles size={36} className="text-purple-400" />
                                    AI
                                </div>
                                <div className="text-xs text-slate-400 uppercase tracking-widest font-bold">Powered</div>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* ══════════════════════════════════════════
                SECTION 7 — FINAL CTA
            ══════════════════════════════════════════ */}
            <section className="relative py-32 px-6 text-center">
                <FloatingOrbs />
                <div className="relative max-w-3xl mx-auto">
                    <motion.div
                        initial={{ opacity: 0, y: 30 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ duration: 0.8 }}
                    >
                        <img
                            src={PymastersIcon}
                            alt=""
                            className="w-16 h-16 mx-auto mb-8 transition-transform duration-500 hover:scale-110"
                            style={{ filter: 'drop-shadow(0 0 20px #7c3aed) drop-shadow(0 0 40px #06b6d4)' }}
                        />
                        <h2 className="text-4xl sm:text-6xl font-bold font-display text-white mb-6 leading-tight">
                            Ready to start your<br />
                            <span className="text-transparent bg-clip-text" style={{ backgroundImage: 'linear-gradient(135deg, #7c3aed, #06b6d4)' }}>
                                Python journey?
                            </span>
                        </h2>
                        <p className="text-slate-400 text-lg mb-10 leading-relaxed">
                            Join thousands of learners mastering Python with the help of Vaathiyaar, your AI-powered guide.
                        </p>
                        <button
                            onClick={() => navigate(ctaTarget)}
                            className="group inline-flex items-center justify-center gap-3 px-10 py-5 rounded-2xl text-lg font-bold text-white transition-all duration-300 hover:scale-[1.04] active:scale-[0.97] relative overflow-hidden"
                            style={{ background: 'linear-gradient(135deg, #7c3aed, #06b6d4)', boxShadow: '0 8px 40px rgba(124,58,237,0.5)' }}
                        >
                            <GraduationCap size={22} />
                            {user ? 'Continue Learning' : 'Begin for Free'}
                            <ArrowRight size={20} className="group-hover:translate-x-1 transition-transform" />
                            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700" />
                        </button>
                    </motion.div>
                </div>
            </section>

            {/* ── Footer ── */}
            <footer className="relative z-10 border-t border-white/[0.04] bg-[#020617]/80 backdrop-blur-sm py-8 px-6">
                <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
                    <p className="text-xs text-slate-500">
                        &copy; {new Date().getFullYear()} PyMasters &mdash;{' '}
                        <a href="https://www.pymasters.net" className="hover:text-cyan-400 transition-colors">
                            www.pymasters.net
                        </a>
                    </p>
                    <div className="flex items-center gap-6 text-xs text-slate-500">
                        <Link to="/terms" className="hover:text-cyan-400 transition-colors">Terms of Use</Link>
                        <Link to="/privacy" className="hover:text-cyan-400 transition-colors">Privacy Policy</Link>
                        <Link to="/security" className="hover:text-cyan-400 transition-colors">Security</Link>
                        <a href="mailto:legal@pymasters.net" className="hover:text-cyan-400 transition-colors">legal@pymasters.net</a>
                    </div>
                </div>
            </footer>

            <style>{`
                @keyframes blink {
                    0%, 49% { opacity: 1; }
                    50%, 100% { opacity: 0; }
                }
            `}</style>
        </div>
    );
}
