import { useNavigate, Link } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import {
    ArrowRight, Sparkles, Brain, Layers, Code2, Zap,
    BookOpen, Star, MessageSquare, Cpu, GraduationCap,
    Play, Terminal, Building2, ShieldCheck, Mail
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import PymastersGlyph from '../assets/pymasters-glyph.svg';
import PymastersHero from '../assets/pymasters-hero.svg';

/* ─── Tracks ─────────────────────────────────────────────────────────────── */
// Headline totals across the full catalogue (15 tracks). The cards below are a
// curated showcase, not the complete list.
const TOTAL_TRACKS = 15;
const TOTAL_LESSONS = 380;

const TRACKS = [
    {
        name: 'Python Foundations',
        lessons: 39,
        accent: '#06b6d4',
        gradient: 'linear-gradient(90deg, #06b6d4, #3b82f6)',
        icon: <Code2 size={22} color="#06b6d4" />,
        desc: 'Variables, control flow, functions, OOP, file I/O, modules, and projects that consolidate every concept.',
        topics: ['Variables', 'Control Flow', 'Functions', 'OOP', 'File I/O', 'Modules'],
    },
    {
        name: 'Vibe Coding',
        lessons: 14,
        badge: 'NEW',
        accent: '#10b981',
        gradient: 'linear-gradient(90deg, #10b981, #06b6d4)',
        icon: <Sparkles size={22} color="#10b981" />,
        desc: 'The dos & don\'ts of building software with AI — verify don\'t trust, catch hallucinated APIs, spot silent security holes, and stay the architect. Found nowhere else.',
        topics: ['Verify, Don\'t Trust', 'Hallucinated APIs', 'Security Holes', 'Prompting', 'Code Review', 'Architecture'],
    },
    {
        name: 'AI & Machine Learning',
        lessons: 63,
        accent: '#7c3aed',
        gradient: 'linear-gradient(90deg, #7c3aed, #a855f7)',
        icon: <Brain size={22} color="#a855f7" />,
        desc: 'Pandas, scikit-learn, regression, classification, clustering, and end-to-end ML pipelines.',
        topics: ['Pandas', 'scikit-learn', 'Regression', 'Classification', 'Clustering', 'Pipelines'],
    },
    {
        name: 'Deep Learning & AI Engineering',
        lessons: 170,
        accent: '#f59e0b',
        gradient: 'linear-gradient(90deg, #f59e0b, #ef4444)',
        icon: <Layers size={22} color="#f59e0b" />,
        desc: 'Neural networks, CNNs, RNNs, transformers, embeddings, RAG, rerankers, and local LLMs — from scratch to production.',
        topics: ['PyTorch', 'Transformers', 'Embeddings', 'RAG', 'Rerankers', 'Local LLMs'],
    },
];

const FEATURES = [
    {
        icon: <Brain size={20} color="#7c3aed" />,
        title: 'AI-Powered Learning',
        desc: 'Vaathiyaar — your personal AI teacher — adapts to your pace and explains concepts in ways that click.',
        accent: '#7c3aed',
    },
    {
        icon: <Zap size={20} color="#06b6d4" />,
        title: 'Visual Code Execution',
        desc: 'Watch Python execute step-by-step. Variables, loops, and recursion come alive through animations.',
        accent: '#06b6d4',
    },
    {
        icon: <Star size={20} color="#f59e0b" />,
        title: 'Personalized Path',
        desc: 'Your curriculum adapts as you progress. Vaathiyaar reinforces topics you struggle with automatically.',
        accent: '#f59e0b',
    },
    {
        icon: <Sparkles size={20} color="#10b981" />,
        title: 'Dynamic Modules',
        desc: 'On-demand lesson generation: ask Vaathiyaar to teach any Python topic, and a module is built for you.',
        accent: '#10b981',
    },
];

/* ─── Hero brand mark ────────────────────────────────────────────────────── */
function BrandMark({ reduced }) {
    return (
        <div className="relative inline-flex items-center justify-center mb-10">
            {/* Soft halo (skipped for reduced-motion users) */}
            {!reduced && (
                <div
                    className="absolute -inset-12 rounded-full blur-3xl opacity-60 pointer-events-none"
                    style={{ background: 'radial-gradient(circle, rgba(124,58,237,0.35), transparent 70%)' }}
                />
            )}
            <motion.div
                initial={reduced ? false : { opacity: 0, scale: 0.85 }}
                animate={reduced ? false : { opacity: 1, scale: 1 }}
                transition={{ duration: 0.7, ease: 'easeOut' }}
                className="relative flex items-center justify-center w-24 h-24 sm:w-28 sm:h-28 rounded-3xl bg-gradient-to-br from-purple-600 to-cyan-500 border border-white/15 shadow-[0_0_60px_rgba(124,58,237,0.45)]"
            >
                <img
                    src={PymastersHero}
                    alt="PyMasters logo"
                    width="64"
                    height="64"
                    className="w-14 h-14 sm:w-16 sm:h-16"
                    style={{ filter: 'drop-shadow(0 2px 6px rgba(0,0,0,0.25))' }}
                />
            </motion.div>
        </div>
    );
}

/* ─── Subtle ambient orbs (skipped for reduced motion) ───────────────────── */
function AmbientOrbs() {
    return (
        <div className="absolute inset-0 pointer-events-none overflow-hidden" aria-hidden="true">
            <div
                className="absolute -top-32 -right-24 w-[600px] h-[600px] rounded-full blur-[120px] opacity-40"
                style={{ background: 'radial-gradient(circle, rgba(124,58,237,0.4), transparent 70%)' }}
            />
            <div
                className="absolute -bottom-24 -left-24 w-[500px] h-[500px] rounded-full blur-[110px] opacity-30"
                style={{ background: 'radial-gradient(circle, rgba(6,182,212,0.4), transparent 70%)' }}
            />
        </div>
    );
}

/* ─── REPL demo (lightweight typewriter) ─────────────────────────────────── */
function HeroREPL({ reduced }) {
    const [lines, setLines] = useState([]);
    const [current, setCurrent] = useState('');
    const [idx, setIdx] = useState(0);

    const script = [
        { input: '>>> from pymasters import vaathiyaar' },
        { input: '>>> vaathiyaar.teach("decorators")' },
        { output: 'Vaathiyaar > A decorator is a function that wraps another function...' },
        { input: '>>> vaathiyaar.next_lesson()' },
        { output: 'Loaded: Closures & Higher-Order Functions (5 min)' },
    ];

    useEffect(() => {
        if (reduced) {
            // Show full transcript instantly for reduced motion
            setLines(script.map(s => ({
                type: s.output ? 'output' : 'input',
                text: s.output || s.input,
            })));
            return;
        }
        if (idx >= script.length) {
            const t = setTimeout(() => { setLines([]); setCurrent(''); setIdx(0); }, 4500);
            return () => clearTimeout(t);
        }
        const item = script[idx];
        if (item.output) {
            const t = setTimeout(() => {
                setLines(p => [...p, { type: 'output', text: item.output }]);
                setIdx(i => i + 1);
            }, 350);
            return () => clearTimeout(t);
        }
        let c = 0;
        setCurrent('');
        const ivl = setInterval(() => {
            if (c < item.input.length) { setCurrent(item.input.slice(0, c + 1)); c++; }
            else {
                clearInterval(ivl);
                setTimeout(() => {
                    setLines(p => [...p, { type: 'input', text: item.input }]);
                    setCurrent('');
                    setIdx(i => i + 1);
                }, 400);
            }
        }, 50);
        return () => clearInterval(ivl);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [idx, reduced]);

    return (
        <div className="relative max-w-xl mx-auto mt-12 w-full">
            <div className="absolute -inset-4 rounded-3xl blur-2xl bg-gradient-to-r from-purple-600/15 to-cyan-500/15" aria-hidden="true" />
            <div className="relative rounded-2xl overflow-hidden border border-white/10 shadow-2xl shadow-purple-900/30 bg-[#0d1117]">
                <div className="bg-slate-800/80 border-b border-white/5 px-4 py-2.5 flex items-center gap-2">
                    <div className="flex items-center gap-1.5">
                        <span className="w-3 h-3 rounded-full bg-[#ff5f57]" />
                        <span className="w-3 h-3 rounded-full bg-[#febc2e]" />
                        <span className="w-3 h-3 rounded-full bg-[#28c840]" />
                    </div>
                    <span className="ml-3 text-[11px] text-slate-400 font-mono flex items-center gap-1.5">
                        <Terminal size={12} aria-hidden="true" />
                        python3 — PyMasters
                    </span>
                    <span className="ml-auto inline-flex items-center gap-1.5 text-[10px] text-emerald-400">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                        live
                    </span>
                </div>
                <div className="p-4 font-mono text-[13px] sm:text-sm min-h-[180px] max-h-[260px] overflow-hidden text-left">
                    {lines.map((l, i) => (
                        <div key={i} className={`leading-relaxed mb-1 ${l.type === 'output' ? 'text-emerald-400/90' : 'text-slate-200'}`}>
                            {l.text}
                        </div>
                    ))}
                    {!reduced && current && (
                        <div className="text-slate-200 leading-relaxed mb-1">{current}<span className="caret" /></div>
                    )}
                </div>
            </div>
            <style>{`.caret{display:inline-block;width:7px;height:14px;background:#34d399;margin-left:1px;vertical-align:middle;animation:blink 1s steps(2) infinite;border-radius:1px;box-shadow:0 0 8px rgba(74,222,128,0.5)}@keyframes blink{0%,49%{opacity:1}50%,100%{opacity:0}}`}</style>
        </div>
    );
}

/* ─── Track card ─────────────────────────────────────────────────────────── */
function TrackCard({ track, delay, reduced }) {
    return (
        <motion.div
            initial={reduced ? false : { opacity: 0, y: 24 }}
            whileInView={reduced ? false : { opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-80px' }}
            transition={{ duration: 0.5, delay }}
            className="relative rounded-2xl overflow-hidden border border-white/10 bg-white/[0.02] backdrop-blur-sm hover:border-white/20 transition-colors duration-300"
        >
            <div className="h-1 w-full" style={{ background: track.gradient }} />
            <div className="p-7">
                <div
                    className="w-12 h-12 rounded-xl flex items-center justify-center mb-5"
                    style={{ background: `${track.accent}1a`, border: `1px solid ${track.accent}40` }}
                >
                    {track.icon}
                </div>
                <div className="flex items-start justify-between gap-3 mb-3">
                    <h3 className="text-white font-bold text-xl font-display leading-tight flex items-center gap-2 flex-wrap">
                        {track.name}
                        {track.badge && (
                            <span className="text-[9px] font-extrabold tracking-wider px-1.5 py-0.5 rounded-md bg-emerald-400 text-slate-900 uppercase">
                                {track.badge}
                            </span>
                        )}
                    </h3>
                    <span
                        className="shrink-0 text-[11px] font-bold px-2.5 py-1 rounded-full"
                        style={{ background: `${track.accent}1f`, color: track.accent, border: `1px solid ${track.accent}40` }}
                    >
                        {track.lessons} Lessons
                    </span>
                </div>
                <p className="text-slate-400 text-sm leading-relaxed mb-5">{track.desc}</p>
                <div className="flex flex-wrap gap-1.5">
                    {track.topics.map(t => (
                        <span key={t} className="text-[11px] px-2 py-0.5 rounded-md bg-white/[0.04] border border-white/10 text-slate-300">
                            {t}
                        </span>
                    ))}
                </div>
            </div>
        </motion.div>
    );
}

/* ─── Feature card ───────────────────────────────────────────────────────── */
function FeatureCard({ icon, title, desc, accent, reduced, delay }) {
    return (
        <motion.div
            initial={reduced ? false : { opacity: 0, y: 20 }}
            whileInView={reduced ? false : { opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-80px' }}
            transition={{ duration: 0.45, delay }}
            className="p-6 rounded-2xl bg-white/[0.03] border border-white/10 hover:bg-white/[0.05] hover:border-white/20 transition-all duration-300"
        >
            <div
                className="w-11 h-11 rounded-xl flex items-center justify-center mb-4"
                style={{ background: `${accent}1a`, border: `1px solid ${accent}40` }}
            >
                {icon}
            </div>
            <h3 className="text-white font-bold text-base mb-2 font-display">{title}</h3>
            <p className="text-slate-400 text-sm leading-relaxed">{desc}</p>
        </motion.div>
    );
}

/* ─── Main ───────────────────────────────────────────────────────────────── */
export default function Home() {
    const navigate = useNavigate();
    const { user } = useAuth();
    const reduced = useReducedMotion();
    const ctaTarget = user ? '/dashboard/classroom' : '/login';
    const navRef = useRef(null);
    const [scrolled, setScrolled] = useState(false);

    useEffect(() => { document.title = 'PyMasters — Learn Python with AI'; }, []);

    useEffect(() => {
        const onScroll = () => setScrolled(window.scrollY > 24);
        onScroll();
        window.addEventListener('scroll', onScroll, { passive: true });
        return () => window.removeEventListener('scroll', onScroll);
    }, []);

    return (
        <div className="min-h-screen bg-[#020617] text-slate-100 font-sans selection:bg-purple-500/30 selection:text-white">

            {/* ── NAV ── */}
            <nav
                ref={navRef}
                className={`fixed top-0 inset-x-0 z-50 transition-colors duration-300 ${scrolled ? 'bg-[#020617]/85 backdrop-blur-xl border-b border-white/10' : 'bg-transparent'}`}
            >
                <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between">
                    <button onClick={() => navigate('/')} className="flex items-center gap-2.5 group" aria-label="PyMasters home">
                        <img src={PymastersGlyph} alt="" className="w-8 h-8" style={{ filter: 'drop-shadow(0 0 6px rgba(124,58,237,0.6))' }} />
                        <span className="font-display font-bold text-base sm:text-lg tracking-tight text-white">PYMASTERS</span>
                    </button>
                    <div className="hidden sm:flex items-center gap-6">
                        <a href="#curriculum" className="text-sm text-slate-300 hover:text-white transition-colors">Curriculum</a>
                        <a href="#features" className="text-sm text-slate-300 hover:text-white transition-colors">Features</a>
                        <a href="#organizations" className="text-sm text-slate-300 hover:text-white transition-colors">For Schools</a>
                        {user ? (
                            <button onClick={() => navigate('/dashboard')} className="text-sm text-slate-300 hover:text-white transition-colors">Dashboard</button>
                        ) : (
                            <button onClick={() => navigate('/login')} className="text-sm text-slate-300 hover:text-white transition-colors">Sign In</button>
                        )}
                        <button
                            onClick={() => navigate(ctaTarget)}
                            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold text-white bg-gradient-to-r from-purple-600 to-cyan-500 hover:scale-[1.02] active:scale-[0.98] transition-transform shadow-lg shadow-purple-900/40"
                        >
                            {user ? 'Continue' : 'Get Started'}
                            <ArrowRight size={14} />
                        </button>
                    </div>
                    <button
                        onClick={() => navigate(ctaTarget)}
                        className="sm:hidden inline-flex items-center gap-1 px-3 py-2 rounded-lg text-sm font-bold text-white bg-gradient-to-r from-purple-600 to-cyan-500"
                    >
                        {user ? 'Open' : 'Start'}
                        <ArrowRight size={14} />
                    </button>
                </div>
            </nav>

            {/* ── HERO ── */}
            <section className="relative pt-32 pb-20 px-4 sm:px-6 overflow-hidden">
                {!reduced && <AmbientOrbs />}
                <div className="relative max-w-5xl mx-auto text-center">
                    <BrandMark reduced={reduced} />

                    <span className="inline-flex items-center gap-2 px-3 py-1 mb-6 rounded-full text-[11px] font-semibold tracking-wider uppercase text-purple-200 bg-purple-500/10 border border-purple-500/30">
                        <Sparkles size={12} aria-hidden="true" />
                        AI-Powered Python Mastery
                    </span>

                    <h1 className="text-white text-4xl sm:text-5xl lg:text-7xl font-bold font-display leading-[1.05] tracking-tight mb-6">
                        Master Python.{' '}
                        <span
                            className="text-transparent bg-clip-text"
                            style={{ backgroundImage: 'linear-gradient(135deg, #a855f7 0%, #06b6d4 60%, #c084fc 100%)' }}
                        >
                            Powered by AI.
                        </span>
                    </h1>

                    <p className="text-slate-300/90 text-base sm:text-lg lg:text-xl max-w-2xl mx-auto leading-relaxed mb-10">
                        Learn from <span className="text-white font-semibold">Vaathiyaar</span> — your AI teacher who adapts to you.
                        From Python fundamentals to deep learning, build skills that matter.
                    </p>

                    <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 justify-center items-center">
                        <button
                            onClick={() => navigate(ctaTarget)}
                            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-7 py-3.5 rounded-xl text-base font-bold text-white bg-gradient-to-r from-purple-600 to-cyan-500 hover:scale-[1.03] active:scale-[0.98] transition-transform shadow-xl shadow-purple-900/40 focus:outline-none focus:ring-2 focus:ring-purple-400 focus:ring-offset-2 focus:ring-offset-slate-950"
                        >
                            <GraduationCap size={18} aria-hidden="true" />
                            {user ? 'Continue Learning' : 'Start Free'}
                            <ArrowRight size={16} aria-hidden="true" />
                        </button>
                        <button
                            onClick={() => document.getElementById('curriculum')?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth' })}
                            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-7 py-3.5 rounded-xl text-base font-bold text-slate-200 border border-white/15 bg-white/[0.03] hover:bg-white/[0.06] hover:border-white/25 transition-colors focus:outline-none focus:ring-2 focus:ring-cyan-400 focus:ring-offset-2 focus:ring-offset-slate-950"
                        >
                            <BookOpen size={18} aria-hidden="true" />
                            Explore Curriculum
                        </button>
                    </div>

                    <HeroREPL reduced={reduced} />
                </div>
            </section>

            {/* ── FEATURES ── */}
            <section id="features" className="relative py-24 px-4 sm:px-6">
                <div className="max-w-6xl mx-auto">
                    <div className="text-center mb-14">
                        <span className="inline-flex items-center gap-2 px-3 py-1 mb-5 rounded-full text-[11px] font-semibold tracking-wider uppercase text-cyan-300 bg-cyan-500/10 border border-cyan-500/30">
                            <Sparkles size={12} aria-hidden="true" />
                            Why PyMasters
                        </span>
                        <h2 className="text-white text-3xl sm:text-4xl lg:text-5xl font-bold font-display mb-4">
                            A different kind of{' '}
                            <span className="text-transparent bg-clip-text" style={{ backgroundImage: 'linear-gradient(135deg, #06b6d4, #a855f7)' }}>
                                learning experience
                            </span>
                        </h2>
                        <p className="text-slate-400 max-w-2xl mx-auto leading-relaxed">
                            PyMasters isn't another tutorial site. It's an AI-powered platform that evolves with you.
                        </p>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                        {FEATURES.map((f, i) => (
                            <FeatureCard key={f.title} {...f} reduced={reduced} delay={i * 0.05} />
                        ))}
                    </div>
                </div>
            </section>

            {/* ── CURRICULUM ── */}
            <section id="curriculum" className="relative py-24 px-4 sm:px-6 bg-gradient-to-b from-transparent via-purple-950/10 to-transparent">
                <div className="max-w-6xl mx-auto">
                    <div className="text-center mb-14">
                        <span className="inline-flex items-center gap-2 px-3 py-1 mb-5 rounded-full text-[11px] font-semibold tracking-wider uppercase text-purple-200 bg-purple-500/10 border border-purple-500/30">
                            <Layers size={12} aria-hidden="true" />
                            {TOTAL_TRACKS} Tracks · {TOTAL_LESSONS}+ Lessons
                        </span>
                        <h2 className="text-white text-3xl sm:text-4xl lg:text-5xl font-bold font-display mb-4">
                            Your complete{' '}
                            <span className="text-transparent bg-clip-text" style={{ backgroundImage: 'linear-gradient(135deg, #a855f7, #f59e0b)' }}>
                                learning path
                            </span>
                        </h2>
                        <p className="text-slate-400 max-w-2xl mx-auto leading-relaxed">
                            From your first line of Python to training transformers — and how to build it all with AI, responsibly. Every step is guided.
                        </p>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5">
                        {TRACKS.map((t, i) => (
                            <TrackCard key={t.name} track={t} delay={i * 0.08} reduced={reduced} />
                        ))}
                    </div>
                    <p className="text-center text-sm text-slate-500 mt-8">
                        Plus AI Engineering, Data Structures &amp; Algorithms, Web Development, Testing &amp; DevOps, Automation &amp; more.
                    </p>
                </div>
            </section>

            {/* ── MEET VAATHIYAAR ── */}
            <section className="relative py-24 px-4 sm:px-6">
                <div className="max-w-6xl mx-auto">
                    <div className="rounded-3xl border border-white/10 bg-white/[0.02] backdrop-blur-sm p-8 sm:p-12 lg:p-16">
                        <div className="grid lg:grid-cols-2 gap-10 lg:gap-16 items-center">
                            <div>
                                <span className="inline-flex items-center gap-2 px-3 py-1 mb-5 rounded-full text-[11px] font-semibold tracking-wider uppercase text-purple-200 bg-purple-500/10 border border-purple-500/30">
                                    <MessageSquare size={12} aria-hidden="true" />
                                    Meet Your Teacher
                                </span>
                                <h2 className="text-white text-3xl sm:text-4xl lg:text-5xl font-bold font-display leading-tight mb-5">
                                    Say hello to{' '}
                                    <span className="text-transparent bg-clip-text" style={{ backgroundImage: 'linear-gradient(135deg, #a855f7, #06b6d4)' }}>
                                        Vaathiyaar
                                    </span>
                                </h2>
                                <p className="text-slate-300/90 leading-relaxed mb-7">
                                    <span className="italic">Vaathiyaar</span> means <span className="italic">teacher</span> in Tamil. Our AI isn't a chatbot —
                                    it's a learning intelligence that understands where you are and where you need to go.
                                </p>
                                <ul className="space-y-3.5">
                                    {[
                                        { i: <Brain size={16} color="#a855f7" />, t: 'Adapts difficulty to your exact comprehension level in real time' },
                                        { i: <Cpu size={16} color="#f59e0b" />, t: 'Generates new lesson modules on demand for any Python topic' },
                                        { i: <Zap size={16} color="#10b981" />, t: 'Streams responses live — no waiting, instant educational dialogue' },
                                        { i: <ShieldCheck size={16} color="#06b6d4" />, t: 'Tracks every concept you master and reinforces gaps automatically' },
                                    ].map(({ i, t }) => (
                                        <li key={t} className="flex items-start gap-3">
                                            <span className="shrink-0 w-8 h-8 rounded-lg flex items-center justify-center bg-white/[0.04] border border-white/10 mt-0.5">
                                                {i}
                                            </span>
                                            <span className="text-slate-200 text-sm leading-relaxed pt-1.5">{t}</span>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                            <div className="relative">
                                <div className="absolute -inset-3 rounded-3xl blur-xl bg-gradient-to-r from-purple-600/15 to-cyan-500/15" aria-hidden="true" />
                                <div className="relative rounded-2xl bg-[#0d1117] border border-white/10 overflow-hidden shadow-2xl">
                                    <div className="h-11 border-b border-white/10 flex items-center px-4 gap-2.5 bg-slate-800/50">
                                        <div className="w-6 h-6 rounded-md flex items-center justify-center bg-gradient-to-br from-purple-600 to-cyan-500">
                                            <img src={PymastersGlyph} alt="" className="w-3.5 h-3.5" />
                                        </div>
                                        <span className="text-white text-sm font-semibold font-display">Vaathiyaar</span>
                                        <span className="ml-auto text-[11px] text-emerald-400 flex items-center gap-1.5">
                                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                                            Online
                                        </span>
                                    </div>
                                    <div className="p-5 space-y-4 text-sm">
                                        <div className="flex gap-2.5">
                                            <div className="w-7 h-7 shrink-0 rounded-full flex items-center justify-center bg-gradient-to-br from-purple-600 to-cyan-500">
                                                <img src={PymastersGlyph} alt="" className="w-4 h-4" />
                                            </div>
                                            <div className="bg-white/[0.04] border border-white/10 rounded-2xl rounded-tl-sm px-4 py-2.5 text-slate-200 max-w-[80%] leading-relaxed">
                                                Vanakkam! What concept would you like to master today?
                                            </div>
                                        </div>
                                        <div className="flex gap-2.5 justify-end">
                                            <div className="px-4 py-2.5 rounded-2xl rounded-tr-sm text-white max-w-[75%] leading-relaxed bg-gradient-to-r from-purple-600/40 to-cyan-600/40 border border-purple-500/30">
                                                Can you explain Python decorators?
                                            </div>
                                        </div>
                                        <div className="flex gap-2.5">
                                            <div className="w-7 h-7 shrink-0 rounded-full flex items-center justify-center bg-gradient-to-br from-purple-600 to-cyan-500">
                                                <img src={PymastersGlyph} alt="" className="w-4 h-4" />
                                            </div>
                                            <div className="bg-white/[0.04] border border-white/10 rounded-2xl rounded-tl-sm px-4 py-2.5 text-slate-200 max-w-[80%] leading-relaxed">
                                                A decorator is a function that wraps another — adding behavior without changing the original code...
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* ── ORGANIZATIONS (B2B) ── */}
            <section id="organizations" className="relative py-24 px-4 sm:px-6">
                <div className="max-w-6xl mx-auto">
                    <div className="rounded-3xl border border-white/10 bg-gradient-to-br from-purple-950/30 via-slate-900/50 to-cyan-950/20 p-8 sm:p-12 lg:p-16 relative overflow-hidden">
                        {!reduced && (
                            <div className="absolute -top-24 -right-24 w-96 h-96 rounded-full blur-[100px] bg-purple-600/20 pointer-events-none" />
                        )}
                        <div className="relative grid lg:grid-cols-2 gap-10 items-center">
                            <div>
                                <span className="inline-flex items-center gap-2 px-3 py-1 mb-5 rounded-full text-[11px] font-semibold tracking-wider uppercase text-cyan-300 bg-cyan-500/10 border border-cyan-500/30">
                                    <Building2 size={12} aria-hidden="true" />
                                    For Schools, Universities & Enterprise
                                </span>
                                <h2 className="text-white text-3xl sm:text-4xl lg:text-5xl font-bold font-display leading-tight mb-5">
                                    Bring PyMasters to your{' '}
                                    <span className="text-transparent bg-clip-text" style={{ backgroundImage: 'linear-gradient(135deg, #06b6d4, #a855f7)' }}>
                                        organization
                                    </span>
                                </h2>
                                <p className="text-slate-300/90 leading-relaxed mb-6">
                                    Roll out PyMasters to your students or team. Manage cohorts, track mastery,
                                    and let Vaathiyaar tailor the curriculum to each learner.
                                </p>
                                <ul className="space-y-2.5 mb-8 text-sm text-slate-200">
                                    <li className="flex items-start gap-2.5">
                                        <ShieldCheck size={16} className="mt-0.5 shrink-0 text-cyan-400" />
                                        SSO, organization roles, and audit logs
                                    </li>
                                    <li className="flex items-start gap-2.5">
                                        <ShieldCheck size={16} className="mt-0.5 shrink-0 text-cyan-400" />
                                        Cohort dashboards with mastery analytics
                                    </li>
                                    <li className="flex items-start gap-2.5">
                                        <ShieldCheck size={16} className="mt-0.5 shrink-0 text-cyan-400" />
                                        Custom learning paths aligned to your syllabus
                                    </li>
                                </ul>
                                <div className="flex flex-col sm:flex-row gap-3">
                                    <a
                                        href="mailto:legal@pymasters.net?subject=PyMasters%20for%20Organizations"
                                        className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl text-sm font-bold text-white bg-gradient-to-r from-purple-600 to-cyan-500 hover:scale-[1.02] transition-transform shadow-lg shadow-purple-900/40"
                                    >
                                        <Mail size={16} aria-hidden="true" />
                                        Talk to Sales
                                    </a>
                                    <button
                                        onClick={() => navigate('/login')}
                                        className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl text-sm font-bold text-slate-200 border border-white/15 bg-white/[0.03] hover:bg-white/[0.06] hover:border-white/25 transition-colors"
                                    >
                                        Start a Pilot
                                        <ArrowRight size={14} />
                                    </button>
                                </div>
                            </div>
                            <div className="relative grid grid-cols-2 gap-3">
                                {[
                                    { v: '380+', l: 'Lessons' },
                                    { v: '15', l: 'Tracks' },
                                    { v: '∞', l: 'AI Modules' },
                                    { v: 'EN/TA', l: 'Languages' },
                                ].map(s => (
                                    <div key={s.l} className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 text-center">
                                        <div className="text-3xl sm:text-4xl font-bold font-display text-white mb-1">{s.v}</div>
                                        <div className="text-[11px] uppercase tracking-widest text-slate-400 font-bold">{s.l}</div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* ── FINAL CTA ── */}
            <section className="relative py-24 px-4 sm:px-6 text-center">
                <div className="relative max-w-3xl mx-auto">
                    <img
                        src={PymastersHero}
                        alt=""
                        className="w-16 h-16 mx-auto mb-6"
                        style={{ filter: 'drop-shadow(0 0 16px rgba(168,85,247,0.7))' }}
                    />
                    <h2 className="text-white text-3xl sm:text-4xl lg:text-5xl font-bold font-display mb-4">
                        Ready to start your{' '}
                        <span className="text-transparent bg-clip-text" style={{ backgroundImage: 'linear-gradient(135deg, #a855f7, #06b6d4)' }}>
                            Python journey?
                        </span>
                    </h2>
                    <p className="text-slate-300/90 mb-8 leading-relaxed">
                        With Vaathiyaar by your side. Free to start.
                    </p>
                    <button
                        onClick={() => navigate(ctaTarget)}
                        className="inline-flex items-center gap-2 px-8 py-4 rounded-xl text-base font-bold text-white bg-gradient-to-r from-purple-600 to-cyan-500 hover:scale-[1.03] active:scale-[0.98] transition-transform shadow-xl shadow-purple-900/40"
                    >
                        <GraduationCap size={18} aria-hidden="true" />
                        {user ? 'Continue Learning' : 'Begin for Free'}
                        <ArrowRight size={16} aria-hidden="true" />
                    </button>
                </div>
            </section>

            {/* ── FOOTER ── */}
            <footer className="relative border-t border-white/10 bg-[#020617]/80 py-8 px-4 sm:px-6">
                <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
                    <div className="flex items-center gap-2">
                        <img src={PymastersGlyph} alt="" className="w-6 h-6 opacity-80" />
                        <p className="text-xs text-slate-400">
                            &copy; {new Date().getFullYear()} PyMasters &mdash; <a href="https://www.pymasters.net" className="hover:text-cyan-400 transition-colors">www.pymasters.net</a>
                        </p>
                    </div>
                    <nav className="flex items-center gap-5 text-xs text-slate-400" aria-label="Footer">
                        <Link to="/terms" className="hover:text-cyan-400 transition-colors">Terms</Link>
                        <Link to="/privacy" className="hover:text-cyan-400 transition-colors">Privacy</Link>
                        <Link to="/security" className="hover:text-cyan-400 transition-colors">Security</Link>
                        <a href="mailto:legal@pymasters.net" className="hover:text-cyan-400 transition-colors">Contact</a>
                    </nav>
                </div>
            </footer>
        </div>
    );
}
