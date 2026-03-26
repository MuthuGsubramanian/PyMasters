import { useNavigate, Link } from 'react-router-dom';
import { motion, useInView } from 'framer-motion';
import { useRef, useEffect, useState } from 'react';
import {
    ArrowRight, Sparkles, Brain, Layers, Code2,
    Zap, Globe2, BookOpen, ChevronDown, Star,
    MessageSquare, Cpu, GraduationCap
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

/* ─── Sub-components ─────────────────────────────────────────────────────── */

function GridOverlay() {
    return (
        <div
            className="absolute inset-0 pointer-events-none opacity-[0.04]"
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
            className="group relative p-6 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-sm hover:bg-white/10 hover:border-white/20 transition-all duration-500 overflow-hidden"
        >
            <div className={`absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 rounded-2xl`}
                style={{ background: `radial-gradient(circle at top left, ${accentColor}15, transparent 60%)` }}
            />
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center mb-4 border`}
                style={{ background: `${accentColor}20`, borderColor: `${accentColor}40` }}>
                {icon}
            </div>
            <h3 className="text-white font-bold text-lg mb-2 font-display">{title}</h3>
            <p className="text-slate-400 text-sm leading-relaxed">{desc}</p>
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
            className="group relative rounded-3xl overflow-hidden border border-white/10 bg-white/5 backdrop-blur-sm hover:border-white/25 transition-all duration-500"
        >
            {/* Top gradient bar */}
            <div className="h-1.5 w-full" style={{ background: track.gradient }} />

            <div className="p-8">
                {/* Icon */}
                <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-6 text-2xl"
                    style={{ background: `${track.accent}20`, border: `1px solid ${track.accent}40` }}>
                    {track.icon}
                </div>

                {/* Track name + badge */}
                <div className="flex items-start justify-between mb-3">
                    <h3 className="text-white font-bold text-2xl font-display leading-tight">{track.name}</h3>
                    <span className="shrink-0 text-xs font-bold px-3 py-1 rounded-full ml-3 mt-1"
                        style={{ background: `${track.accent}25`, color: track.accent, border: `1px solid ${track.accent}35` }}>
                        {track.lessons} Lessons
                    </span>
                </div>

                <p className="text-slate-400 text-sm leading-relaxed mb-6">{track.desc}</p>

                {/* Topics */}
                <div className="flex flex-wrap gap-2">
                    {track.topics.map((t) => (
                        <span key={t} className="text-xs px-2.5 py-1 rounded-lg bg-white/5 border border-white/10 text-slate-300">
                            {t}
                        </span>
                    ))}
                </div>
            </div>

            {/* Hover glow */}
            <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none rounded-3xl"
                style={{ boxShadow: `inset 0 0 80px ${track.accent}12` }} />
        </motion.div>
    );
}

function StatItem({ value, suffix, label, shouldCount }) {
    const count = useCounter(value, 1600, shouldCount);
    return (
        <div className="text-center">
            <div className="text-4xl lg:text-5xl font-bold font-display text-white mb-1">
                {shouldCount ? count : 0}{suffix}
            </div>
            <div className="text-xs text-slate-400 uppercase tracking-widest font-bold">{label}</div>
        </div>
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
        <div className="min-h-screen bg-slate-950 text-slate-100 relative overflow-x-hidden font-sans selection:bg-purple-500/30 selection:text-white">

            {/* ── Navigation ── */}
            <nav className="fixed top-0 left-0 right-0 z-50 px-6 py-4 border-b border-white/[0.06] bg-slate-950/80 backdrop-blur-xl">
                <div className="max-w-7xl mx-auto flex justify-between items-center">
                    <div className="flex items-center gap-3">
                        <img src={PymastersIcon} alt="PyMasters" className="w-8 h-8 drop-shadow-[0_0_8px_rgba(124,58,237,0.8)]" />
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
                            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold text-white transition-all duration-300 hover:scale-[1.03] active:scale-[0.97]"
                            style={{ background: 'linear-gradient(135deg, #7c3aed, #06b6d4)', boxShadow: '0 4px 20px rgba(124,58,237,0.4)' }}
                        >
                            {user ? 'Continue Learning' : 'Get Started'}
                            <ArrowRight size={15} />
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

                {/* Live badge */}
                <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.6 }}
                    className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-purple-500/40 bg-purple-500/10 text-purple-300 text-xs font-bold tracking-wider uppercase mb-10"
                >
                    <span className="relative flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-purple-400 opacity-75" />
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-purple-500" />
                    </span>
                    v2.0 — Now Live
                </motion.div>

                {/* Arc reactor icon */}
                <motion.div
                    initial={{ opacity: 0, scale: 0.6 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 1, ease: 'easeOut', delay: 0.1 }}
                    className="relative mb-10"
                >
                    <div className="absolute inset-0 rounded-full blur-[60px] bg-purple-600/50 scale-125" />
                    <div className="relative w-32 h-32 flex items-center justify-center rounded-full border border-purple-500/30 bg-slate-900/60 backdrop-blur-sm shadow-[0_0_80px_rgba(124,58,237,0.5)]">
                        <img
                            src={PymastersIcon}
                            alt="PyMasters Arc Reactor"
                            className="w-20 h-20 drop-shadow-[0_0_20px_rgba(124,58,237,1)]"
                            style={{ filter: 'drop-shadow(0 0 16px #7c3aed) drop-shadow(0 0 32px #06b6d4)' }}
                        />
                    </div>
                    {/* Orbit ring */}
                    <div className="absolute inset-[-24px] rounded-full border border-purple-500/20 animate-spin" style={{ animationDuration: '12s' }}>
                        <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full bg-purple-400 shadow-[0_0_10px_#7c3aed]" />
                    </div>
                    <div className="absolute inset-[-50px] rounded-full border border-cyan-500/10 animate-spin" style={{ animationDuration: '20s', animationDirection: 'reverse' }}>
                        <div className="absolute bottom-0 right-0 translate-x-1/4 translate-y-1/4 w-2 h-2 rounded-full bg-cyan-400 shadow-[0_0_8px_#06b6d4]" />
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
                    className="text-lg sm:text-xl text-slate-400 max-w-2xl mb-12 leading-relaxed"
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
                        className="group inline-flex items-center justify-center gap-2 px-8 py-4 rounded-2xl text-base font-bold text-white transition-all duration-300 hover:scale-[1.04] active:scale-[0.97]"
                        style={{ background: 'linear-gradient(135deg, #7c3aed, #06b6d4)', boxShadow: '0 6px 30px rgba(124,58,237,0.45)' }}
                    >
                        <GraduationCap size={20} />
                        Start Learning
                        <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />
                    </button>
                    <button
                        onClick={() => {
                            document.getElementById('curriculum')?.scrollIntoView({ behavior: 'smooth' });
                        }}
                        className="inline-flex items-center justify-center gap-2 px-8 py-4 rounded-2xl text-base font-bold text-slate-300 border border-white/15 bg-white/5 backdrop-blur-sm hover:bg-white/10 hover:text-white hover:border-white/25 transition-all duration-300"
                    >
                        <BookOpen size={18} />
                        Explore Curriculum
                    </button>
                </motion.div>

                {/* Scroll hint */}
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 1.5, duration: 1 }}
                    className="absolute bottom-10 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 text-slate-600"
                >
                    <span className="text-xs tracking-widest uppercase">Scroll</span>
                    <ChevronDown size={18} className="animate-bounce" />
                </motion.div>
            </section>

            {/* ══════════════════════════════════════════
                SECTION 2 — WHAT MAKES PYMASTERS DIFFERENT
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
                SECTION 3 — CURRICULUM TRACKS
            ══════════════════════════════════════════ */}
            <section id="curriculum" className="relative py-28 px-6">
                {/* Section background accent */}
                <div className="absolute inset-0 pointer-events-none">
                    <div className="absolute inset-0 bg-gradient-to-b from-transparent via-purple-950/20 to-transparent" />
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
                SECTION 4 — MEET VAATHIYAAR
            ══════════════════════════════════════════ */}
            <section className="relative py-28 px-6">
                <div className="max-w-6xl mx-auto">
                    <div className="relative rounded-3xl overflow-hidden border border-white/10 bg-white/[0.03] backdrop-blur-sm p-10 lg:p-16">
                        {/* Background glow */}
                        <div className="absolute -top-20 -right-20 w-80 h-80 bg-purple-700/25 rounded-full blur-[100px] pointer-events-none" />
                        <div className="absolute -bottom-20 -left-20 w-64 h-64 bg-cyan-600/20 rounded-full blur-[80px] pointer-events-none" />

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
                                        <div key={text} className="flex items-start gap-3">
                                            <div className="shrink-0 w-9 h-9 rounded-lg flex items-center justify-center bg-white/5 border border-white/10 mt-0.5">
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
                                <div className="rounded-2xl bg-slate-900/80 border border-white/10 overflow-hidden shadow-2xl">
                                    {/* Header */}
                                    <div className="h-12 border-b border-white/[0.06] flex items-center px-5 gap-3">
                                        <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: 'linear-gradient(135deg,#7c3aed,#06b6d4)' }}>
                                            <img src={PymastersIcon} alt="" className="w-4 h-4" />
                                        </div>
                                        <span className="text-white text-sm font-semibold font-display">Vaathiyaar</span>
                                        <span className="ml-auto text-xs text-emerald-400 flex items-center gap-1">
                                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                                            Online
                                        </span>
                                    </div>
                                    {/* Chat body */}
                                    <div className="p-5 space-y-4 text-sm">
                                        <div className="flex gap-3">
                                            <div className="w-7 h-7 shrink-0 rounded-full flex items-center justify-center mt-0.5" style={{ background: 'linear-gradient(135deg,#7c3aed,#06b6d4)' }}>
                                                <img src={PymastersIcon} alt="" className="w-4 h-4" />
                                            </div>
                                            <div className="bg-white/5 border border-white/10 rounded-2xl rounded-tl-sm px-4 py-3 text-slate-300 max-w-[80%] leading-relaxed">
                                                Vanakkam! I'm Vaathiyaar. What concept would you like to master today?
                                            </div>
                                        </div>
                                        <div className="flex gap-3 justify-end">
                                            <div className="px-4 py-3 rounded-2xl rounded-tr-sm text-white max-w-[75%] leading-relaxed" style={{ background: 'linear-gradient(135deg,#7c3aed80,#06b6d480)', border: '1px solid rgba(124,58,237,0.3)' }}>
                                                Can you explain Python decorators?
                                            </div>
                                        </div>
                                        <div className="flex gap-3">
                                            <div className="w-7 h-7 shrink-0 rounded-full flex items-center justify-center mt-0.5" style={{ background: 'linear-gradient(135deg,#7c3aed,#06b6d4)' }}>
                                                <img src={PymastersIcon} alt="" className="w-4 h-4" />
                                            </div>
                                            <div className="bg-white/5 border border-white/10 rounded-2xl rounded-tl-sm px-4 py-3 text-slate-300 max-w-[80%] leading-relaxed">
                                                Great choice! A decorator is a function that wraps another function — think of it like adding a superpower to your existing code without changing it...
                                                <span className="inline-block w-1.5 h-4 bg-purple-400 ml-1 align-middle animate-pulse" />
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
                SECTION 5 — STATS BAR
            ══════════════════════════════════════════ */}
            <section ref={statsRef} className="relative py-20 px-6">
                <div className="absolute inset-0 pointer-events-none">
                    <div className="absolute inset-0 bg-gradient-to-r from-purple-950/30 via-slate-900 to-cyan-950/20" />
                    <GridOverlay />
                </div>
                <div className="relative max-w-5xl mx-auto">
                    <div className="rounded-3xl border border-white/10 bg-white/[0.03] backdrop-blur-sm p-10 lg:p-14">
                        <div className="grid grid-cols-2 lg:grid-cols-4 gap-10 divide-y-2 divide-white/0 lg:divide-y-0 lg:divide-x lg:divide-white/10">
                            <StatItem value={74} suffix="" label="Total Lessons" shouldCount={statsInView} />
                            <StatItem value={3} suffix="" label="Tracks" shouldCount={statsInView} />
                            <StatItem value={10} suffix="+" label="Modules" shouldCount={statsInView} />
                            <div className="text-center">
                                <div className="text-4xl lg:text-5xl font-bold font-display text-white mb-1 flex items-center justify-center gap-2">
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
                SECTION 6 — FINAL CTA
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
                            className="w-16 h-16 mx-auto mb-8"
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
                            className="group inline-flex items-center justify-center gap-3 px-10 py-5 rounded-2xl text-lg font-bold text-white transition-all duration-300 hover:scale-[1.04] active:scale-[0.97]"
                            style={{ background: 'linear-gradient(135deg, #7c3aed, #06b6d4)', boxShadow: '0 8px 40px rgba(124,58,237,0.5)' }}
                        >
                            <GraduationCap size={22} />
                            {user ? 'Continue Learning' : 'Begin for Free'}
                            <ArrowRight size={20} className="group-hover:translate-x-1 transition-transform" />
                        </button>
                    </motion.div>
                </div>
            </section>

            {/* ── Footer ── */}
            <footer className="relative z-10 border-t border-white/[0.06] bg-slate-950/80 backdrop-blur-sm py-8 px-6">
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
        </div>
    );
}
