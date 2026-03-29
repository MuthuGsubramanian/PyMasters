import { useState, useEffect, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
    BookOpen,
    Cpu,
    Lock,
    CheckCircle2,
    Trophy,
    Award,
    ChevronRight,
    Zap,
    Star,
    ArrowLeft,
    Target,
    GraduationCap,
    Sparkles,
    RotateCcw,
    TrendingUp,
    Flame,
    Clock,
    Play,
    Code2,
    MessageCircle,
    User,
    Calendar,
    Lightbulb,
    Rocket,
    ArrowRight,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { useAuth } from '../context/AuthContext';
import { getModules, getModule, completeModule, getCompletions, getProfile, recordSignal } from '../api';
import { motion, AnimatePresence } from 'framer-motion';
import axios from 'axios';
import clsx from 'clsx';

// ─── Animated Number Counter ───────────────────────────────────────────────
function AnimatedNumber({ value, duration = 1200 }) {
    const [display, setDisplay] = useState(0);
    useEffect(() => {
        let start = null;
        let rafId;
        const step = (ts) => {
            if (!start) start = ts;
            const progress = Math.min((ts - start) / duration, 1);
            const eased = 1 - Math.pow(1 - progress, 3);
            setDisplay(Math.floor(eased * value));
            if (progress < 1) rafId = requestAnimationFrame(step);
        };
        rafId = requestAnimationFrame(step);
        return () => cancelAnimationFrame(rafId);
    }, [value, duration]);
    return display;
}

// ─── Progress Ring ─────────────────────────────────────────────────────────
function ProgressRing({ progress, size = 80, strokeWidth = 6, color = '#06b6d4' }) {
    const radius = (size - strokeWidth) / 2;
    const circumference = 2 * Math.PI * radius;
    const offset = circumference - (progress / 100) * circumference;

    return (
        <svg width={size} height={size} className="transform -rotate-90">
            <circle cx={size/2} cy={size/2} r={radius} fill="none"
                stroke="currentColor" strokeWidth={strokeWidth}
                className="text-slate-100" />
            <motion.circle
                cx={size/2} cy={size/2} r={radius} fill="none"
                stroke={color} strokeWidth={strokeWidth}
                strokeLinecap="round"
                strokeDasharray={circumference}
                initial={{ strokeDashoffset: circumference }}
                animate={{ strokeDashoffset: offset }}
                transition={{ duration: 1.5, ease: 'easeOut', delay: 0.3 }}
                style={{ filter: `drop-shadow(0 0 4px ${color}40)` }}
            />
        </svg>
    );
}

// ─── Skeleton Loader ───────────────────────────────────────────────────────
function Skeleton({ className }) {
    return (
        <div className={`animate-pulse bg-gradient-to-r from-slate-100 via-slate-200 to-slate-100 rounded-lg ${className}`}
            style={{ backgroundSize: '200% 100%', animation: 'shimmer 1.5s ease-in-out infinite' }}
        />
    );
}

// ─── Motivational Quotes ──────────────────────────────────────────────────
const QUOTES = [
    { text: "Code is like humor. When you have to explain it, it's bad.", author: "Cory House" },
    { text: "First, solve the problem. Then, write the code.", author: "John Johnson" },
    { text: "The best way to predict the future is to invent it.", author: "Alan Kay" },
    { text: "AI is the new electricity.", author: "Andrew Ng" },
    { text: "Talk is cheap. Show me the code.", author: "Linus Torvalds" },
    { text: "Simplicity is the soul of efficiency.", author: "Austin Freeman" },
    { text: "Python is executable pseudocode.", author: "Bruce Eckel" },
    { text: "In God we trust. All others must bring data.", author: "W. Edwards Deming" },
    { text: "The only way to learn a new programming language is by writing programs in it.", author: "Dennis Ritchie" },
    { text: "Machine intelligence is the last invention that humanity will ever need.", author: "Nick Bostrom" },
];

// ─── Trending Topics (fallback) ───────────────────────────────────────────
const FALLBACK_TRENDS = [
    { id: 't1', title: 'Building RAG Pipelines', category: 'AI', difficulty: 'Intermediate', desc: 'Learn to build Retrieval-Augmented Generation systems with Python.' },
    { id: 't2', title: 'FastAPI Masterclass', category: 'Python', difficulty: 'Beginner', desc: 'Create production-ready APIs with FastAPI and Pydantic.' },
    { id: 't3', title: 'PyTorch from Scratch', category: 'AI', difficulty: 'Advanced', desc: 'Deep dive into neural networks with PyTorch tensors.' },
    { id: 't4', title: 'Async Python Patterns', category: 'Python', difficulty: 'Intermediate', desc: 'Master asyncio, coroutines, and concurrent programming.' },
    { id: 't5', title: 'LangChain Agents', category: 'AI', difficulty: 'Advanced', desc: 'Build autonomous AI agents with LangChain and tool calling.' },
];

// ─── Helpers ──────────────────────────────────────────────────────────────
function getGreeting() {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 17) return 'Good afternoon';
    return 'Good evening';
}

function formatDate() {
    return new Date().toLocaleDateString('en-US', {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    });
}

function formatLearningTime(minutes) {
    if (!minutes || minutes < 1) return '0m';
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    if (h === 0) return `${m}m`;
    if (m === 0) return `${h}h`;
    return `${h}h ${m}m`;
}

const API_URL = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8001/api';

// ─── Stat Card ────────────────────────────────────────────────────────────
function StatCard({ label, value, suffix, icon, gradient, iconBg, border, delay, children }) {
    return (
        <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay, type: 'spring', stiffness: 260, damping: 20 }}
            className={clsx(
                'relative rounded-2xl p-5 border backdrop-blur-xl transition-all duration-300',
                'hover:shadow-xl hover:-translate-y-1 group overflow-hidden',
                gradient, border,
            )}
        >
            {/* Subtle glow on hover */}
            <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none bg-gradient-to-br from-white/40 to-transparent" />
            <div className="relative z-10">
                <div className="flex items-center justify-between mb-3">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-slate-600">{label}</span>
                    <div className={clsx(
                        'w-10 h-10 rounded-xl flex items-center justify-center transition-transform duration-300 group-hover:scale-110 group-hover:rotate-3',
                        iconBg,
                    )}>
                        {icon}
                    </div>
                </div>
                <div className="text-2xl font-display font-bold text-slate-900">
                    {children || (
                        <>
                            <AnimatedNumber value={value} />
                            {suffix && <span className="text-slate-500 text-lg ml-0.5">{suffix}</span>}
                        </>
                    )}
                </div>
            </div>
        </motion.div>
    );
}

// ─── Overview ──────────────────────────────────────────────────────────────
export function Overview() {
    const { user } = useAuth();
    const navigate = useNavigate();

    const [totalModules, setTotalModules] = useState(4);
    const [loading, setLoading] = useState(true);
    const [stats, setStats] = useState(null);
    const [recommendation, setRecommendation] = useState(null);
    const [trends, setTrends] = useState(FALLBACK_TRENDS);

    const modulesUnlocked = (user.unlocked || []).length;
    const progressPct = totalModules > 0 ? Math.round((modulesUnlocked / totalModules) * 100) : 0;

    const dailyQuote = useMemo(() => {
        const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0)) / 86400000);
        return QUOTES[dayOfYear % QUOTES.length];
    }, []);

    useEffect(() => { document.title = 'Dashboard \u2014 PyMasters'; }, []);

    useEffect(() => {
        const fetchAll = async () => {
            setLoading(true);
            try {
                const [modsRes] = await Promise.all([
                    getModules(),
                ]);
                setTotalModules(modsRes.data.length);
            } catch {}

            // Fetch stats (graceful fallback)
            if (user?.id) {
                try {
                    const res = await axios.get(`${API_URL}/profile/${user.id}/stats`, {
                        headers: { Authorization: `Bearer ${user.token}` },
                    });
                    setStats(res.data);
                } catch {
                    setStats(null);
                }
                // Fetch daily recommendation (graceful fallback)
                try {
                    const res = await axios.get(`${API_URL}/profile/${user.id}/daily-recommendation`, {
                        headers: { Authorization: `Bearer ${user.token}` },
                    });
                    setRecommendation(res.data);
                } catch {
                    setRecommendation(null);
                }
            }

            // Fetch trends (graceful fallback)
            try {
                const res = await axios.get(`${API_URL}/trends`, {
                    headers: { Authorization: `Bearer ${user?.token}` },
                });
                if (Array.isArray(res.data) && res.data.length > 0) setTrends(res.data);
            } catch {}

            setLoading(false);
        };
        fetchAll();
    }, [user?.id, user?.token]);

    const streak = stats?.streak ?? (user.streak || 0);
    const learningMinutes = stats?.learning_minutes ?? 0;
    const recentActivity = stats?.recent_activity ?? [];
    const nextMilestone = stats?.next_milestone ?? { label: `${Math.ceil((user.points || 0) / 100) * 100} XP`, progress: ((user.points || 0) % 100) };

    // ─── Stagger animation variants ──────────────────────────────────────
    const containerVariants = {
        hidden: {},
        visible: { transition: { staggerChildren: 0.08 } },
    };
    const itemVariants = {
        hidden: { opacity: 0, y: 20 },
        visible: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 260, damping: 20 } },
    };

    return (
        <motion.div
            variants={containerVariants}
            initial="hidden"
            animate="visible"
            className="space-y-8 pb-8"
        >
            {/* ─── Welcome Banner ────────────────────────────────────────── */}
            <motion.div
                variants={itemVariants}
                className="relative rounded-2xl overflow-hidden border border-black/[0.04] bg-white/80 backdrop-blur-xl shadow-sm"
            >
                {/* Top gradient bar */}
                <div className="h-1.5 bg-gradient-to-r from-cyan-400 via-blue-500 to-purple-500" />

                {/* Background decoration */}
                <div className="absolute top-0 right-0 w-80 h-80 bg-gradient-to-br from-cyan-200/10 via-blue-200/10 to-purple-200/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/4 pointer-events-none" />
                <div className="absolute bottom-0 left-0 w-40 h-40 bg-gradient-to-tr from-purple-200/10 to-cyan-200/10 rounded-full blur-2xl translate-y-1/2 -translate-x-1/4 pointer-events-none" />

                <div className="relative z-10 p-6 sm:p-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 text-xs text-slate-600 mb-2">
                            <Calendar size={12} />
                            <span>{formatDate()}</span>
                        </div>
                        <h1 className="text-2xl sm:text-3xl font-bold font-display text-slate-900 mb-2">
                            {getGreeting()}, <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-500 to-blue-600">{user.username}</span>!
                        </h1>
                        <p className="text-sm text-slate-700 italic max-w-lg">
                            &ldquo;{dailyQuote.text}&rdquo; <span className="not-italic text-slate-600">&mdash; {dailyQuote.author}</span>
                        </p>
                    </div>

                    {/* Streak badge */}
                    <motion.div
                        initial={{ scale: 0.8, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        transition={{ delay: 0.3, type: 'spring' }}
                        className="flex items-center gap-2.5 px-5 py-3 rounded-2xl bg-gradient-to-br from-orange-50 to-amber-50 border border-orange-200/60 shadow-sm self-start"
                    >
                        <div className="relative">
                            <span className="text-2xl" role="img" aria-label="fire">&#x1F525;</span>
                            {streak > 0 && (
                                <motion.div
                                    animate={{ scale: [1, 1.2, 1] }}
                                    transition={{ repeat: Infinity, duration: 2, ease: 'easeInOut' }}
                                    className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-orange-400/40"
                                />
                            )}
                        </div>
                        <div>
                            <div className="text-xl font-bold font-display text-orange-700">{streak}</div>
                            <div className="text-[10px] font-bold uppercase tracking-widest text-orange-400">day streak</div>
                        </div>
                    </motion.div>
                </div>
            </motion.div>

            {/* ─── Stats Row ─────────────────────────────────────────────── */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <StatCard
                    label="Total XP"
                    value={user.points || 0}
                    icon={<Trophy size={20} />}
                    gradient="bg-gradient-to-br from-amber-50/80 to-orange-50/80"
                    iconBg="bg-amber-100 text-amber-600"
                    border="border-amber-100"
                    delay={0.1}
                />
                <StatCard
                    label="Modules Completed"
                    value={modulesUnlocked}
                    suffix={` / ${totalModules}`}
                    icon={<BookOpen size={20} />}
                    gradient="bg-gradient-to-br from-cyan-50/80 to-blue-50/80"
                    iconBg="bg-cyan-100 text-cyan-600"
                    border="border-cyan-100"
                    delay={0.15}
                >
                    <div className="flex items-center gap-3">
                        <span>
                            <AnimatedNumber value={modulesUnlocked} />
                            <span className="text-slate-500 text-lg ml-0.5">/ {totalModules}</span>
                        </span>
                        <div className="w-16">
                            <ProgressRing progress={progressPct} size={36} strokeWidth={3} />
                        </div>
                    </div>
                </StatCard>
                <StatCard
                    label="Current Streak"
                    icon={<Flame size={20} />}
                    gradient="bg-gradient-to-br from-orange-50/80 to-red-50/80"
                    iconBg="bg-orange-100 text-orange-600"
                    border="border-orange-100"
                    delay={0.2}
                >
                    <div className="flex items-center gap-2">
                        <AnimatedNumber value={streak} />
                        <span className="text-slate-500 text-lg">days</span>
                        {streak > 0 && (
                            <motion.span
                                animate={{ y: [0, -3, 0] }}
                                transition={{ repeat: Infinity, duration: 1.5 }}
                                className="text-lg"
                            >
                                &#x1F525;
                            </motion.span>
                        )}
                    </div>
                </StatCard>
                <StatCard
                    label="Learning Time"
                    icon={<Clock size={20} />}
                    gradient="bg-gradient-to-br from-purple-50/80 to-violet-50/80"
                    iconBg="bg-purple-100 text-purple-600"
                    border="border-purple-100"
                    delay={0.25}
                >
                    <span className="text-2xl font-display font-bold text-slate-900">
                        {loading ? <Skeleton className="h-7 w-16 inline-block" /> : formatLearningTime(learningMinutes)}
                    </span>
                </StatCard>
            </div>

            {/* ─── Main Content Grid ─────────────────────────────────────── */}
            <div className="grid lg:grid-cols-3 gap-6">
                {/* Left Column (2/3) */}
                <div className="lg:col-span-2 space-y-6">
                    {/* ─── Daily Recommendation Card ─────────────────────── */}
                    <motion.div
                        variants={itemVariants}
                        className="relative rounded-2xl overflow-hidden border border-black/[0.04] bg-white/80 backdrop-blur-xl shadow-sm group hover:shadow-xl transition-all duration-500"
                    >
                        <div className="h-1 bg-gradient-to-r from-cyan-400 via-blue-500 to-purple-500" />
                        <div className="absolute top-0 right-0 w-60 h-60 bg-gradient-to-bl from-cyan-100/20 to-transparent rounded-full blur-3xl pointer-events-none" />
                        <div className="relative z-10 p-6 sm:p-8">
                            <div className="flex items-center gap-3 mb-4">
                                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-100 to-blue-100 flex items-center justify-center">
                                    <Lightbulb size={20} className="text-cyan-600" />
                                </div>
                                <div>
                                    <h3 className="text-lg font-bold text-slate-900 font-display">Today&apos;s Recommended Lesson</h3>
                                    <p className="text-xs text-slate-500">Personalized for your learning path</p>
                                </div>
                                {(recommendation?.trending) && (
                                    <span className="ml-auto inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-gradient-to-r from-rose-50 to-orange-50 border border-rose-200 text-[10px] font-bold text-rose-600 uppercase tracking-wider">
                                        <TrendingUp size={10} />
                                        Trending
                                    </span>
                                )}
                            </div>

                            {loading ? (
                                <div className="space-y-3">
                                    <Skeleton className="h-6 w-3/4" />
                                    <Skeleton className="h-4 w-full" />
                                    <Skeleton className="h-4 w-2/3" />
                                </div>
                            ) : (
                                <>
                                    <h4 className="text-xl font-bold text-slate-800 font-display mb-2">
                                        {recommendation?.title || (modulesUnlocked >= totalModules ? 'Explore AI Topics' : `Module ${modulesUnlocked + 1}`)}
                                    </h4>
                                    <p className="text-sm text-slate-700 mb-3 leading-relaxed">
                                        {recommendation?.description || (
                                            modulesUnlocked >= totalModules
                                                ? 'You have completed all core modules. Explore trending AI and Python topics in the classroom!'
                                                : `Continue your learning journey with the next module. Keep the momentum going!`
                                        )}
                                    </p>
                                    {recommendation?.reason && (
                                        <div className="flex items-start gap-2 mb-5 p-3 rounded-xl bg-gradient-to-r from-blue-50/50 to-purple-50/50 border border-blue-100/50">
                                            <Sparkles size={14} className="text-blue-500 mt-0.5 flex-shrink-0" />
                                            <p className="text-xs text-blue-700">{recommendation.reason}</p>
                                        </div>
                                    )}
                                    <button
                                        onClick={() => navigate(recommendation?.link || '/dashboard/learn')}
                                        className="btn-neo btn-neo-primary py-2.5 text-sm group/btn inline-flex items-center gap-2"
                                    >
                                        <Play size={14} />
                                        Start Learning
                                        <ArrowRight size={14} className="group-hover/btn:translate-x-0.5 transition-transform" />
                                    </button>
                                </>
                            )}
                        </div>
                    </motion.div>

                    {/* ─── Trending in AI/Python ──────────────────────────── */}
                    <motion.div variants={itemVariants}>
                        <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center gap-2">
                                <TrendingUp size={16} className="text-cyan-500" />
                                <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wider">Trending in AI & Python</h3>
                            </div>
                        </div>
                        <div className="flex gap-4 overflow-x-auto pb-2 scrollbar-thin scrollbar-thumb-slate-200 scrollbar-track-transparent -mx-1 px-1">
                            {(loading ? Array(5).fill(null) : trends).map((trend, idx) => (
                                <motion.div
                                    key={trend?.id || idx}
                                    initial={{ opacity: 0, x: 20 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    transition={{ delay: 0.3 + idx * 0.05 }}
                                    onClick={() => !loading && navigate('/dashboard/classroom')}
                                    className={clsx(
                                        'flex-shrink-0 w-60 rounded-2xl border border-black/[0.04] bg-white/80 backdrop-blur-xl p-5 cursor-pointer',
                                        'hover:shadow-lg hover:-translate-y-1 transition-all duration-300 group',
                                    )}
                                >
                                    {loading ? (
                                        <div className="space-y-3">
                                            <Skeleton className="h-4 w-16" />
                                            <Skeleton className="h-5 w-40" />
                                            <Skeleton className="h-3 w-full" />
                                        </div>
                                    ) : (
                                        <>
                                            <div className="flex items-center gap-2 mb-3">
                                                <span className={clsx(
                                                    'text-[10px] font-bold px-2 py-0.5 rounded-full border uppercase tracking-wider',
                                                    trend.category === 'AI'
                                                        ? 'text-purple-600 bg-purple-50 border-purple-200'
                                                        : 'text-cyan-600 bg-cyan-50 border-cyan-200',
                                                )}>
                                                    {trend.category}
                                                </span>
                                                <span className={clsx(
                                                    'text-[10px] font-bold px-2 py-0.5 rounded-full border',
                                                    trend.difficulty === 'Beginner' ? 'text-green-600 bg-green-50 border-green-200'
                                                        : trend.difficulty === 'Intermediate' ? 'text-amber-600 bg-amber-50 border-amber-200'
                                                        : 'text-red-600 bg-red-50 border-red-200',
                                                )}>
                                                    {trend.difficulty}
                                                </span>
                                            </div>
                                            <h4 className="text-sm font-bold text-slate-800 mb-1.5 group-hover:text-cyan-600 transition-colors font-display line-clamp-2">
                                                {trend.title}
                                            </h4>
                                            <p className="text-xs text-slate-600 line-clamp-2">{trend.desc}</p>
                                        </>
                                    )}
                                </motion.div>
                            ))}
                        </div>
                    </motion.div>
                </div>

                {/* Right Column (1/3) */}
                <div className="space-y-6">
                    {/* ─── Learning Progress ─────────────────────────────── */}
                    <motion.div
                        variants={itemVariants}
                        className="rounded-2xl border border-black/[0.04] bg-white/80 backdrop-blur-xl shadow-sm overflow-hidden"
                    >
                        <div className="px-5 py-3.5 border-b border-black/[0.04]">
                            <h3 className="font-bold text-xs text-slate-600 uppercase tracking-widest">Learning Progress</h3>
                        </div>
                        <div className="p-5">
                            {/* Progress Ring */}
                            <div className="flex items-center justify-center mb-5">
                                <div className="relative">
                                    <ProgressRing progress={progressPct} size={100} strokeWidth={8} color="#06b6d4" />
                                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                                        <span className="text-2xl font-bold text-slate-800 font-display">{progressPct}%</span>
                                        <span className="text-[10px] text-slate-600 uppercase tracking-wider">Complete</span>
                                    </div>
                                </div>
                            </div>

                            {/* Next Milestone */}
                            <div className="mb-5 p-3 rounded-xl bg-gradient-to-r from-cyan-50/50 to-blue-50/50 border border-cyan-100/50">
                                <div className="flex items-center gap-2 mb-2">
                                    <Rocket size={12} className="text-cyan-500" />
                                    <span className="text-[10px] font-bold text-cyan-600 uppercase tracking-widest">Next Milestone</span>
                                </div>
                                <p className="text-sm font-bold text-slate-700 font-display">{nextMilestone.label}</p>
                                <div className="mt-2 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                    <motion.div
                                        initial={{ width: 0 }}
                                        animate={{ width: `${Math.min(nextMilestone.progress, 100)}%` }}
                                        transition={{ duration: 1.2, ease: 'easeOut', delay: 0.5 }}
                                        className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-blue-500"
                                    />
                                </div>
                            </div>

                            {/* Recent Activity */}
                            <div>
                                <h4 className="text-[10px] font-bold text-slate-600 uppercase tracking-widest mb-3">Recent Activity</h4>
                                {recentActivity.length > 0 ? (
                                    <div className="space-y-3">
                                        {recentActivity.slice(0, 5).map((act, i) => (
                                            <motion.div
                                                key={i}
                                                initial={{ opacity: 0, x: -10 }}
                                                animate={{ opacity: 1, x: 0 }}
                                                transition={{ delay: 0.6 + i * 0.08 }}
                                                className="flex items-center gap-2.5 text-xs"
                                            >
                                                <div className="w-1.5 h-1.5 rounded-full bg-cyan-400 flex-shrink-0" />
                                                <span className="text-slate-600 truncate">{act.label || act}</span>
                                                {act.time && <span className="text-slate-500 ml-auto text-[10px] flex-shrink-0">{act.time}</span>}
                                            </motion.div>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="text-center py-4">
                                        <p className="text-xs text-slate-500">Start learning to see your activity here</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    </motion.div>

                    {/* ─── Quick Actions ──────────────────────────────────── */}
                    <motion.div
                        variants={itemVariants}
                        className="rounded-2xl border border-black/[0.04] bg-white/80 backdrop-blur-xl shadow-sm overflow-hidden"
                    >
                        <div className="px-5 py-3.5 border-b border-black/[0.04]">
                            <h3 className="font-bold text-xs text-slate-600 uppercase tracking-widest">Quick Actions</h3>
                        </div>
                        <div className="p-4 grid grid-cols-2 gap-3">
                            {[
                                {
                                    label: 'Continue Learning',
                                    icon: <Play size={18} />,
                                    to: '/dashboard/learn',
                                    colors: 'from-cyan-500 to-blue-500',
                                    bg: 'bg-cyan-50 hover:bg-cyan-100',
                                    text: 'text-cyan-700',
                                },
                                {
                                    label: 'Practice Mode',
                                    icon: <Code2 size={18} />,
                                    to: '/dashboard/classroom',
                                    colors: 'from-purple-500 to-violet-500',
                                    bg: 'bg-purple-50 hover:bg-purple-100',
                                    text: 'text-purple-700',
                                },
                                {
                                    label: 'Ask Vaathiyaar',
                                    icon: <MessageCircle size={18} />,
                                    to: '/dashboard/classroom',
                                    colors: 'from-amber-500 to-orange-500',
                                    bg: 'bg-amber-50 hover:bg-amber-100',
                                    text: 'text-amber-700',
                                },
                                {
                                    label: 'View Profile',
                                    icon: <User size={18} />,
                                    to: '/dashboard/profile',
                                    colors: 'from-emerald-500 to-green-500',
                                    bg: 'bg-emerald-50 hover:bg-emerald-100',
                                    text: 'text-emerald-700',
                                },
                            ].map((action, idx) => (
                                <motion.button
                                    key={action.label}
                                    initial={{ opacity: 0, scale: 0.9 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    transition={{ delay: 0.5 + idx * 0.05 }}
                                    onClick={() => navigate(action.to)}
                                    className={clsx(
                                        'flex flex-col items-center gap-2 p-4 rounded-xl border border-transparent transition-all duration-200',
                                        action.bg, action.text,
                                        'hover:border-black/[0.04] hover:shadow-sm',
                                    )}
                                >
                                    <div className={clsx(
                                        'w-9 h-9 rounded-lg flex items-center justify-center bg-gradient-to-br text-white',
                                        action.colors,
                                    )}>
                                        {action.icon}
                                    </div>
                                    <span className="text-[11px] font-bold leading-tight text-center">{action.label}</span>
                                </motion.button>
                            ))}
                        </div>
                    </motion.div>
                </div>
            </div>

            <style>{`
                @keyframes shimmer {
                    0% { background-position: 200% 0; }
                    100% { background-position: -200% 0; }
                }
                .scrollbar-thin::-webkit-scrollbar { height: 4px; }
                .scrollbar-thin::-webkit-scrollbar-track { background: transparent; }
                .scrollbar-thin::-webkit-scrollbar-thumb { background: #e2e8f0; border-radius: 4px; }
                .scrollbar-thin::-webkit-scrollbar-thumb:hover { background: #cbd5e1; }
            `}</style>
        </motion.div>
    );
}

// ─── Learning Map ──────────────────────────────────────────────────────────
export function LearningMap() {
    const { user } = useAuth();
    const [modules, setModules] = useState([]);
    const [completions, setCompletions] = useState(new Set());
    const [loading, setLoading] = useState(true);
    const navigate = useNavigate();

    useEffect(() => { document.title = 'Learning Path — PyMasters'; }, []);
    useEffect(() => {
        Promise.all([
            getModules(),
            user?.id ? getCompletions(user.id) : Promise.resolve({ data: { completions: [] } }),
        ])
            .then(([modsRes, compRes]) => {
                setModules(modsRes.data);
                setCompletions(new Set((compRes.data.completions || []).map(c => c.lesson_id)));
            })
            .catch(err => console.error(err))
            .finally(() => setLoading(false));
    }, [user?.id]);

    const isUnlocked = (id) => (user.unlocked || []).includes(id) || id === "module_1";
    const isCompleted = (id) => completions.has(id);
    const modulesUnlocked = (user.unlocked || []).length;
    const progressPct = modules.length > 0 ? Math.round((modulesUnlocked / modules.length) * 100) : 0;

    return (
        <div className="animate-fade-in pb-20 max-w-5xl mx-auto">
            <header className="mb-10 flex justify-between items-end border-b border-black/[0.04] pb-6">
                <div>
                    <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-cyan-200 bg-cyan-50 text-cyan-600 text-xs font-bold tracking-wider uppercase mb-3">
                        <TrendingUp size={12} />
                        Learning Path
                    </div>
                    <h2 className="text-3xl font-bold mb-2 font-display">Module Progression</h2>
                    <p className="text-slate-600">Complete each module sequentially to unlock the next.</p>
                </div>
                <div className="text-right hidden sm:block">
                    <div className="text-xs text-slate-600 font-bold uppercase tracking-widest mb-1">Progress</div>
                    <div className="text-3xl font-bold font-display text-transparent bg-clip-text bg-gradient-to-r from-cyan-500 to-blue-600">
                        {progressPct}%
                    </div>
                    <div className="w-32 h-1.5 bg-slate-100 rounded-full overflow-hidden mt-2">
                        <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${progressPct}%` }}
                            transition={{ duration: 1, ease: 'easeOut' }}
                            className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-blue-500"
                        />
                    </div>
                </div>
            </header>

            {loading ? (
                <div className="space-y-4">
                    {[1,2,3,4].map(i => (
                        <Skeleton key={i} className="h-24 w-full rounded-2xl" />
                    ))}
                </div>
            ) : (
                <div className="space-y-3">
                    {modules.map((mod, idx) => {
                        const unlocked = isUnlocked(mod.id);
                        const isNext = !unlocked && idx > 0 && isUnlocked(modules[idx-1]?.id);

                        return (
                            <motion.div
                                key={mod.id}
                                initial={{ opacity: 0, y: 15 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: idx * 0.05 }}
                                onClick={() => unlocked && navigate(`/dashboard/learn/${mod.id}`)}
                                className={clsx(
                                    "group relative overflow-hidden rounded-2xl border transition-all duration-300 p-5 flex items-center justify-between",
                                    unlocked
                                        ? "bg-white/80 backdrop-blur-sm border-black/[0.04] hover:border-cyan-200 hover:shadow-lg hover:-translate-y-0.5 cursor-pointer"
                                        : isNext
                                        ? "bg-white/60 border-dashed border-cyan-200 opacity-70 cursor-not-allowed"
                                        : "bg-slate-50/50 border-transparent opacity-40 cursor-not-allowed"
                                )}
                            >
                                {/* Connection line to next module */}
                                {idx < modules.length - 1 && (
                                    <div className="absolute left-[2.15rem] top-full w-[2px] h-3 bg-slate-200 -translate-x-1/2 z-0" />
                                )}

                                <div className="flex items-center gap-5 relative z-10">
                                    <div className={clsx(
                                        "flex items-center justify-center w-11 h-11 rounded-xl font-mono font-bold text-base border transition-all duration-300",
                                        unlocked
                                            ? "bg-gradient-to-br from-cyan-50 to-blue-50 border-cyan-200 text-cyan-600 group-hover:shadow-md group-hover:scale-105"
                                            : isNext
                                            ? "bg-cyan-50/50 border-cyan-200 text-cyan-400"
                                            : "bg-slate-100 border-slate-200 text-slate-400"
                                    )}>
                                        {isCompleted(mod.id) ? <CheckCircle2 size={18} className="text-green-500" /> : unlocked ? <span className="text-sm">{idx + 1}</span> : idx + 1}
                                    </div>
                                    <div>
                                        <h3 className={clsx(
                                            "text-lg font-bold mb-0.5 transition-colors font-display",
                                            unlocked ? "text-slate-800 group-hover:text-cyan-600" : "text-slate-500"
                                        )}>{mod.title}</h3>
                                        <p className="text-sm text-slate-600 max-w-xl line-clamp-1">{mod.desc}</p>
                                    </div>
                                </div>

                                <div className="flex items-center gap-3 relative z-10">
                                    {mod.xp_reward && (
                                        <span className={clsx(
                                            "text-[10px] font-bold rounded-full px-2.5 py-1 border",
                                            unlocked
                                                ? "text-amber-600 bg-amber-50 border-amber-200"
                                                : "text-slate-400 bg-slate-50 border-slate-200"
                                        )}>
                                            +{mod.xp_reward} XP
                                        </span>
                                    )}
                                    {isCompleted(mod.id) && (
                                        <span className="text-[10px] font-bold rounded-full px-2.5 py-1 border text-green-600 bg-green-50 border-green-200">
                                            Completed
                                        </span>
                                    )}
                                    {unlocked ? (
                                        <ChevronRight size={18} className="text-slate-300 group-hover:text-cyan-500 group-hover:translate-x-0.5 transition-all" />
                                    ) : isNext ? (
                                        <Lock size={16} className="text-cyan-300" />
                                    ) : (
                                        <Lock size={16} className="text-slate-300" />
                                    )}
                                </div>

                                {/* Hover glow */}
                                {unlocked && (
                                    <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none bg-gradient-to-r from-cyan-500/[0.02] to-blue-500/[0.02]" />
                                )}
                            </motion.div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

// ─── Module Viewer ─────────────────────────────────────────────────────────
export function ModuleViewer() {
    const { id } = useParams();
    const { user, updateProgress } = useAuth();
    const navigate = useNavigate();
    const [module, setModule] = useState(null);
    const [isModuleCompleted, setIsModuleCompleted] = useState(false);
    const [completionInfo, setCompletionInfo] = useState(null);
    const [quizMode, setQuizMode] = useState(false);
    const [answers, setAnswers] = useState({});
    const [result, setResult] = useState(null);

    useEffect(() => {
        getModule(id).then(res => {
            setModule(res.data);
            document.title = res.data.title + ' — PyMasters';
        }).catch(() => navigate('/dashboard/learn'));
        if (user?.id) {
            getCompletions(user.id).then(res => {
                const match = (res.data.completions || []).find(c => c.lesson_id === id);
                if (match) {
                    setIsModuleCompleted(true);
                    setCompletionInfo(match);
                }
            }).catch(() => {});
        }
    }, [id, navigate, user?.id]);

    if (!module) return (
        <div className="flex flex-col items-center justify-center h-64 gap-3">
            <div className="w-10 h-10 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-slate-500">Loading module...</p>
        </div>
    );

    const handleQuizSubmit = async () => {
        let correctCount = 0;
        module.quiz.forEach((q, idx) => {
            if (answers[idx] === q.correct) correctCount++;
        });

        const passed = correctCount === module.quiz.length;

        recordSignal({
            user_id: user.id,
            signal_type: 'quiz_attempt',
            topic: module.id,
            value: { module_id: module.id, score: correctCount, total: module.quiz.length, passed },
        }).catch(() => {});

        if (passed) {
            try {
                const res = await completeModule(user.id, module.id, correctCount);
                if (res.data.success) {
                    updateProgress(res.data.new_points, res.data.unlocked);
                    const unlocked = res.data.unlocked;
                    const unlockedMsg = unlocked?.length
                        ? `\nNew modules unlocked: ${unlocked.join(', ')}`
                        : '';
                    setResult({
                        passed: true,
                        msg: `Module Complete! You earned ${module.xp_reward} XP.${unlockedMsg}\nYou're ready to move on to the next challenge.`,
                    });
                }
            } catch (err) {
                console.error(err);
                setResult({
                    passed: false,
                    msg: 'Failed to submit quiz. Please check your connection and try again.',
                });
            }
        } else {
            const remaining = module.quiz.length - correctCount;
            setResult({
                passed: false,
                msg: `You got ${correctCount} out of ${module.quiz.length} correct — ${remaining} ${remaining === 1 ? 'answer' : 'answers'} to fix. Review the material and try again. You need 100% to pass.`,
            });
        }
    };

    const quizProgress = module.quiz ? Object.keys(answers).length / module.quiz.length * 100 : 0;

    return (
        <div className="max-w-4xl mx-auto pb-20 animate-fade-in relative">
            <button
                onClick={() => navigate('/dashboard/learn')}
                className="mb-6 flex items-center gap-2 text-sm text-slate-500 hover:text-slate-700 transition-colors group"
            >
                <ArrowLeft size={16} className="group-hover:-translate-x-1 transition-transform" />
                Back to Learning Path
            </button>

            <div className="rounded-2xl overflow-hidden border border-black/[0.04] bg-white/80 backdrop-blur-sm shadow-sm">
                {/* Header */}
                <div className="relative h-36 bg-gradient-to-r from-cyan-50 via-blue-50 to-purple-50 border-b border-black/[0.04] p-8 flex items-end overflow-hidden">
                    <div className="absolute top-0 right-0 w-60 h-60 bg-gradient-to-br from-cyan-200/20 to-blue-200/20 rounded-full blur-3xl -translate-y-1/2 translate-x-1/4 pointer-events-none" />
                    <div className="relative z-10">
                        <h1 className="text-3xl font-bold text-slate-900 font-display">{module.title}</h1>
                        <div className="flex items-center gap-3 mt-2">
                            <span className="text-xs font-mono text-cyan-700 bg-cyan-100 rounded-full px-2.5 py-0.5 border border-cyan-200">
                                {module.id.toUpperCase()}
                            </span>
                            <span className="text-xs font-bold text-amber-600 bg-amber-50 rounded-full px-2.5 py-0.5 border border-amber-200">
                                +{module.xp_reward} XP
                            </span>
                        </div>
                    </div>
                </div>

                <div className="p-8 md:p-12">
                    <AnimatePresence mode="wait">
                        {!quizMode ? (
                            <motion.div
                                key="content"
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                className="prose prose-slate prose-lg max-w-none"
                            >
                                <ReactMarkdown
                                    components={{
                                        code: ({ children, className }) => className ? (
                                            <div className="not-prose bg-[#0d1117] p-5 rounded-2xl border border-slate-700/50 font-mono text-sm text-slate-300 overflow-x-auto my-5 shadow-lg">
                                                {children}
                                            </div>
                                        ) : (
                                            <code className="bg-cyan-50 text-cyan-700 px-1.5 py-0.5 rounded text-sm font-mono">{children}</code>
                                        ),
                                        h1: ({ children }) => <h1 className="text-2xl font-bold text-slate-900 mb-6 font-display">{children}</h1>,
                                        h2: ({ children }) => (
                                            <h2 className="text-xl font-bold text-slate-800 flex items-center gap-3 mt-10 mb-4 font-display">
                                                <span className="w-1 h-6 bg-gradient-to-b from-cyan-400 to-blue-500 rounded-full" />
                                                {children}
                                            </h2>
                                        ),
                                    }}
                                >
                                    {module.content}
                                </ReactMarkdown>
                                <div className="mt-16 pt-8 border-t border-black/[0.04] flex justify-end">
                                    {isModuleCompleted ? (
                                        <div className="flex items-center gap-3 px-5 py-3 rounded-2xl bg-green-50 border border-green-200">
                                            <CheckCircle2 size={20} className="text-green-500" />
                                            <div>
                                                <p className="text-sm font-bold text-green-700">Module Completed</p>
                                                <p className="text-xs text-green-600">
                                                    Earned {completionInfo?.xp_awarded || 0} XP on {completionInfo?.completed_at ? new Date(completionInfo.completed_at).toLocaleDateString() : 'earlier'}
                                                </p>
                                            </div>
                                        </div>
                                    ) : (
                                        <button onClick={() => {
                                            recordSignal({ user_id: user.id, signal_type: 'quiz_started', topic: module.id, value: { module_id: module.id } }).catch(() => {});
                                            setQuizMode(true);
                                        }} className="btn-neo btn-neo-primary gap-2">
                                            Start Quiz
                                            <ChevronRight size={18} />
                                        </button>
                                    )}
                                </div>
                            </motion.div>
                        ) : (
                            <motion.div
                                key="quiz"
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0 }}
                                className="max-w-2xl mx-auto"
                            >
                                <div className="text-center mb-8">
                                    <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-purple-200 bg-purple-50 text-purple-600 text-xs font-bold tracking-wider uppercase mb-3">
                                        <Target size={12} />
                                        Knowledge Check
                                    </div>
                                    <h3 className="text-2xl font-bold text-slate-900 font-display mb-2">Quiz Time</h3>
                                    <p className="text-slate-500 text-sm">Answer all questions correctly to complete this module.</p>
                                </div>

                                {/* Quiz progress bar */}
                                <div className="mb-8">
                                    <div className="flex justify-between text-[10px] text-slate-500 font-mono mb-1">
                                        <span>{Object.keys(answers).length} / {module.quiz.length} answered</span>
                                        <span>{Math.round(quizProgress)}%</span>
                                    </div>
                                    <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                        <motion.div
                                            className="h-full rounded-full bg-gradient-to-r from-purple-400 to-cyan-400"
                                            animate={{ width: `${quizProgress}%` }}
                                            transition={{ duration: 0.3 }}
                                        />
                                    </div>
                                </div>

                                {/* Result Banner */}
                                <AnimatePresence>
                                    {result && (
                                        <motion.div
                                            initial={{ opacity: 0, y: -10, scale: 0.95 }}
                                            animate={{ opacity: 1, y: 0, scale: 1 }}
                                            exit={{ opacity: 0, scale: 0.95 }}
                                            className={`rounded-2xl p-5 mb-8 border ${
                                                result.passed
                                                    ? 'bg-gradient-to-r from-green-50 to-emerald-50 border-green-200'
                                                    : 'bg-gradient-to-r from-red-50 to-orange-50 border-red-200'
                                            }`}
                                        >
                                            <div className="flex items-start gap-3">
                                                <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
                                                    result.passed ? 'bg-green-500 text-white' : 'bg-red-500 text-white'
                                                }`}>
                                                    {result.passed ? <Trophy size={20} /> : <RotateCcw size={20} />}
                                                </div>
                                                <div>
                                                    <div className={`text-base font-bold mb-1 ${result.passed ? 'text-green-700' : 'text-red-600'}`}>
                                                        {result.passed ? 'Module Complete!' : 'Not quite there yet'}
                                                    </div>
                                                    <div className={`text-sm whitespace-pre-line ${result.passed ? 'text-green-600/80' : 'text-red-500/80'}`}>
                                                        {result.msg}
                                                    </div>
                                                    {result.passed && (
                                                        <div className="flex items-center gap-1 mt-2">
                                                            {[1,2,3].map(i => (
                                                                <motion.div
                                                                    key={i}
                                                                    initial={{ opacity: 0, scale: 0 }}
                                                                    animate={{ opacity: 1, scale: 1 }}
                                                                    transition={{ delay: 0.2 + i * 0.15, type: 'spring', stiffness: 500 }}
                                                                >
                                                                    <Star size={16} className="text-amber-400 fill-amber-400" />
                                                                </motion.div>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </motion.div>
                                    )}
                                </AnimatePresence>

                                {/* Quiz Questions */}
                                <div className="space-y-8">
                                    {module.quiz.map((q, qIdx) => {
                                        const isAnswered = answers[qIdx] !== undefined;
                                        const isCorrect = result && answers[qIdx] === q.correct;
                                        const isWrong = result && isAnswered && answers[qIdx] !== q.correct;

                                        return (
                                            <motion.div
                                                key={qIdx}
                                                initial={{ opacity: 0, y: 10 }}
                                                animate={{ opacity: 1, y: 0 }}
                                                transition={{ delay: qIdx * 0.05 }}
                                                className={`space-y-3 p-5 rounded-2xl border transition-all duration-300 ${
                                                    isCorrect ? 'bg-green-50/50 border-green-200' :
                                                    isWrong ? 'bg-red-50/50 border-red-200' :
                                                    'bg-white/50 border-black/[0.04]'
                                                }`}
                                            >
                                                <p className="font-bold text-base text-slate-800 font-display flex items-start gap-2">
                                                    <span className="text-sm text-slate-500 font-mono mt-0.5">{qIdx + 1}.</span>
                                                    {q.q}
                                                </p>
                                                <div className="space-y-2 pl-5">
                                                    {q.options.map((opt, oIdx) => {
                                                        const isSelected = answers[qIdx] === oIdx;
                                                        const showCorrect = result && oIdx === q.correct;
                                                        const showWrong = result && isSelected && oIdx !== q.correct;

                                                        return (
                                                            <motion.div
                                                                key={oIdx}
                                                                whileHover={!result?.passed ? { scale: 1.01 } : {}}
                                                                whileTap={!result?.passed ? { scale: 0.99 } : {}}
                                                                onClick={() => {
                                                                    if (result?.passed) return;
                                                                    if (result && !result.passed) {
                                                                        setResult(null);
                                                                        setAnswers({ [qIdx]: oIdx });
                                                                    } else {
                                                                        setAnswers({ ...answers, [qIdx]: oIdx });
                                                                    }
                                                                }}
                                                                className={clsx(
                                                                    "flex items-center gap-3 p-3.5 rounded-xl cursor-pointer transition-all duration-200 border",
                                                                    showCorrect ? "bg-green-50 border-green-300" :
                                                                    showWrong ? "bg-red-50 border-red-300" :
                                                                    isSelected ? "bg-cyan-50 border-cyan-300 shadow-sm" :
                                                                    "bg-white border-slate-100 hover:bg-slate-50 hover:border-slate-200"
                                                                )}
                                                            >
                                                                <div className={clsx(
                                                                    "w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-all",
                                                                    showCorrect ? "border-green-500 bg-green-500" :
                                                                    showWrong ? "border-red-500 bg-red-500" :
                                                                    isSelected ? "border-cyan-500" : "border-slate-300"
                                                                )}>
                                                                    {showCorrect && <CheckCircle2 size={12} className="text-white" />}
                                                                    {showWrong && <span className="text-white text-[10px] font-bold">✕</span>}
                                                                    {isSelected && !result && <div className="w-2.5 h-2.5 bg-cyan-500 rounded-full" />}
                                                                </div>
                                                                <span className={clsx(
                                                                    "text-sm",
                                                                    showCorrect ? "text-green-700 font-medium" :
                                                                    showWrong ? "text-red-600" :
                                                                    isSelected ? "text-cyan-800 font-medium" : "text-slate-600"
                                                                )}>{opt}</span>
                                                            </motion.div>
                                                        );
                                                    })}
                                                </div>
                                            </motion.div>
                                        );
                                    })}
                                </div>

                                <div className="mt-10 flex justify-end gap-3 border-t border-black/[0.04] pt-8">
                                    {!result?.passed ? (
                                        <>
                                            <button onClick={() => { setQuizMode(false); setAnswers({}); setResult(null); }} className="btn-neo btn-neo-ghost">
                                                <ArrowLeft size={14} className="mr-1" /> Back to Content
                                            </button>
                                            <button
                                                onClick={handleQuizSubmit}
                                                disabled={Object.keys(answers).length < module.quiz.length}
                                                className="btn-neo btn-neo-primary disabled:opacity-50 disabled:cursor-not-allowed"
                                            >
                                                Submit Answers
                                            </button>
                                        </>
                                    ) : (
                                        <button onClick={() => navigate('/dashboard/learn')} className="btn-neo btn-neo-primary w-full gap-2">
                                            <Trophy size={16} />
                                            Return to Learning Path
                                        </button>
                                    )}
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </div>
        </div>
    );
}
