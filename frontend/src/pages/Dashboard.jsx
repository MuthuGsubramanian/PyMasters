import { useState, useEffect, useMemo, useRef } from 'react';
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
import ReviewQueue from '../components/ReviewQueue';
import { Badge, Card, Button } from '../components/ui';
import { motion, AnimatePresence } from 'framer-motion';
import axios from 'axios';
import clsx from 'clsx';

// ─── Animated Number Counter ───────────────────────────────────────────────
function AnimatedNumber({ value, duration = 1200 }) {
    // `display` is what's rendered; `fromRef` tracks the baseline the current
    // tween animates from. The count-up uses requestAnimationFrame for a smooth
    // ramp, but rAF is PAUSED whenever the tab is backgrounded or heavily
    // throttled — so relying on it alone left the card frozen on a stale partial
    // frame (observed live: 15 / 35 instead of the real 50) any time rAF stalled
    // before reaching completion. Committing the target only on completion/cleanup
    // (the previous fix) doesn't help while the user is staring at a stuck card,
    // because neither fires: the component stays mounted and `value` is unchanged.
    // We now also (a) arm a duration-based timeout as a guaranteed fallback that
    // snaps to the true target even if rAF never completes, (b) snap to target
    // when the tab becomes visible again, and (c) guard against a non-finite value.
    const [display, setDisplay] = useState(0);
    const fromRef = useRef(0);
    const rafRef = useRef(null);
    const timeoutRef = useRef(null);
    useEffect(() => {
        const from = fromRef.current;
        const to = value;
        const commit = () => { fromRef.current = to; setDisplay(to); };
        // If we mount/update while the tab is hidden (e.g. opened in a background
        // tab), rAF AND the setTimeout fallback below are both throttled, and
        // visibilitychange only fires on re-show — so the count-up could paint a
        // partial frame and stay there until focus. Skip the animation entirely
        // when hidden and show the true value immediately.
        if (from === to || !Number.isFinite(to) || document.hidden) {
            commit();
            return;
        }
        let start = null;
        const step = (ts) => {
            if (start === null) start = ts;
            const progress = Math.min((ts - start) / duration, 1);
            const eased = 1 - Math.pow(1 - progress, 3);
            setDisplay(Math.round(from + (to - from) * eased));
            if (progress < 1) {
                rafRef.current = requestAnimationFrame(step);
            } else {
                commit();
            }
        };
        rafRef.current = requestAnimationFrame(step);
        // Guaranteed fallback: even if rAF is paused (hidden/throttled tab) and
        // never reaches its completion frame, snap to the true target shortly
        // after the animation's nominal duration so the number can't stay stuck.
        timeoutRef.current = setTimeout(commit, duration + 120);
        // If the tab is re-shown mid-animation, jump straight to the target
        // instead of resuming a half-finished (and possibly long-stalled) ramp.
        const onVisible = () => { if (!document.hidden) commit(); };
        document.addEventListener('visibilitychange', onVisible);
        return () => {
            if (rafRef.current) cancelAnimationFrame(rafRef.current);
            if (timeoutRef.current) clearTimeout(timeoutRef.current);
            document.removeEventListener('visibilitychange', onVisible);
            // Commit the target we were heading toward, so the number snaps to
            // its true value whenever the effect re-runs (value changed) or the
            // component unmounts, instead of staying stuck on an intermediate frame.
            commit();
        };
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
                className="text-bg-inset" />
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
        <div className={`animate-pulse bg-gradient-to-r from-bg-inset via-bg-elevated to-bg-inset rounded-lg ${className}`}
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
// `accent` is a tint class pair (e.g. 'bg-amber-500/12 text-amber-600 dark:text-amber-300')
// applied to the icon chip; the card surface itself uses theme tokens so it works in dark mode.
function StatCard({ label, value, suffix, icon, accent, delay, children }) {
    return (
        <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay, type: 'spring', stiffness: 260, damping: 20 }}
        >
            <Card
                interactive
                className="relative p-5 transition-all duration-300 hover:shadow-xl hover:-translate-y-1 group overflow-hidden"
            >
                {/* Subtle glow on hover */}
                <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none bg-gradient-to-br from-accent-primary/10 to-transparent" />
                <div className="relative z-10">
                    <div className="flex items-center justify-between mb-3">
                        <span className="text-[10px] font-bold uppercase tracking-widest text-text-secondary">{label}</span>
                        <div className={clsx(
                            'w-10 h-10 rounded-xl flex items-center justify-center transition-transform duration-300 group-hover:scale-110 group-hover:rotate-3',
                            accent || 'bg-accent-subtle text-accent-primary',
                        )}>
                            {icon}
                        </div>
                    </div>
                    <div className="text-2xl font-display font-bold text-text-primary">
                        {children || (
                            <>
                                <AnimatedNumber value={value} />
                                {suffix && <span className="text-text-muted text-lg ml-0.5">{suffix}</span>}
                            </>
                        )}
                    </div>
                </div>
            </Card>
        </motion.div>
    );
}

// Progress (0–100) toward the NEXT RANK, using the canonical rank tiers from
// the Profile page's getRankInfo: Novice 0–100, Apprentice 100–500,
// Intermediate 500–1000, Advanced 1000–2000, Expert 2000–5000, Master 5000+.
// The dashboard "Learning Progress" ring is labelled "to next rank" but used to
// compute `totalXp % 100`, which only matches true rank progress below 100 XP
// and reads a misleading 0% for e.g. an Apprentice at 300 XP (really 50% of the
// way to 500). Returns the real percentage within the current band; Master
// (no higher rank) is a full 100%. For xp < 100 this equals the old value, so
// brand-new/Novice users are unchanged.
function rankProgressPct(xp) {
    const bands = [
        { floor: 5000, next: null },
        { floor: 2000, next: 5000 },
        { floor: 1000, next: 2000 },
        { floor: 500,  next: 1000 },
        { floor: 100,  next: 500 },
        { floor: 0,    next: 100 },
    ];
    const b = bands.find((band) => xp >= band.floor) || bands[bands.length - 1];
    if (b.next === null) return 100;
    return Math.min(100, Math.max(0, Math.round(((xp - b.floor) / (b.next - b.floor)) * 100)));
}

// ─── Overview ──────────────────────────────────────────────────────────────
export function Overview() {
    const { user } = useAuth();
    const navigate = useNavigate();

    const [loading, setLoading] = useState(true);
    const [stats, setStats] = useState(null);
    const [recommendation, setRecommendation] = useState(null);
    const [trends, setTrends] = useState(FALLBACK_TRENDS);

    const lessonsCompleted = stats?.lessons_completed ?? 0;
    // total_xp from the /stats endpoint (users.points) is authoritative. The
    // auth-context user.points can be stale (it isn't refreshed after XP is
    // earned), which made the "Total XP" card show 0/14 while the profile,
    // community leaderboard and header all showed the real 50. Prefer stats.
    const totalXp = stats?.total_xp ?? (user.points || 0);
    // The "Learning Progress" ring is labelled "to next rank", so it must track
    // real rank bands (see rankProgressPct), not `totalXp % 100`. Below 100 XP
    // the two are identical; above it the old value was wrong (e.g. 0% for an
    // Apprentice at 300 XP). The separate "Next Milestone" bar still uses the
    // 100-XP mark via nextMilestone.progress, so that display is unaffected.
    const progressPct = rankProgressPct(totalXp); // % toward the NEXT RANK

    const dailyQuote = useMemo(() => {
        const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0)) / 86400000);
        return QUOTES[dayOfYear % QUOTES.length];
    }, []);

    useEffect(() => { document.title = 'Dashboard \u2014 PyMasters'; }, []);

    useEffect(() => {
        const fetchAll = async () => {
            setLoading(true);

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

            // Fetch trends (graceful fallback). Endpoint is /trending and returns
            // { topics: [...] }; topics use `summary`, the UI expects `desc`.
            try {
                const res = await axios.get(`${API_URL}/trending`, {
                    headers: { Authorization: `Bearer ${user?.token}` },
                });
                const topics = res.data?.topics;
                if (Array.isArray(topics) && topics.length > 0) {
                    setTrends(topics.map((t) => ({ ...t, desc: t.desc ?? t.summary ?? '' })));
                }
            } catch {}

            setLoading(false);
        };
        fetchAll();
    }, [user?.id, user?.token]);

    // The /stats endpoint returns current_streak / total_time_minutes — the
    // previous stats?.streak / stats?.learning_minutes keys never matched, so
    // these silently fell back to the (stale) user object. Read the real keys.
    const streak = stats?.current_streak ?? (user.streak || 0);
    const learningMinutes = stats?.total_time_minutes ?? 0;
    const recentActivity = stats?.recent_activity ?? [];
    // "Next Milestone" must be the next UNREACHED 100-XP mark. The old
    // `Math.ceil(totalXp/100)*100` returned an already-achieved value at every
    // exact multiple of 100 — most visibly "0 XP" for a brand-new user (0 XP)
    // and "100 XP" for someone sitting exactly on 100 — with a 0% bar. Using
    // `(floor(totalXp/100)+1)*100` always yields the next unreached mark
    // (0->100, 100->200, 500->600) while staying byte-identical for every XP
    // value that isn't a multiple of 100. `progress` (totalXp % 100) is
    // unchanged and correct (0% just after crossing a mark). Still prefers a
    // server-supplied `next_milestone` if the /stats endpoint ever adds one.
    const nextMilestone = stats?.next_milestone ?? { label: `${(Math.floor(totalXp / 100) + 1) * 100} XP`, progress: (totalXp % 100) };

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
            <motion.div variants={itemVariants}>
                <Card className="relative overflow-hidden shadow-sm">
                {/* Top gradient bar */}
                <div className="h-1.5 bg-gradient-primary" />

                {/* Background decoration */}
                <div className="absolute top-0 right-0 w-80 h-80 bg-gradient-to-br from-cyan-200/10 via-blue-200/10 to-purple-200/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/4 pointer-events-none" />
                <div className="absolute bottom-0 left-0 w-40 h-40 bg-gradient-to-tr from-purple-200/10 to-cyan-200/10 rounded-full blur-2xl translate-y-1/2 -translate-x-1/4 pointer-events-none" />

                <div className="relative z-10 p-6 sm:p-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 text-xs text-text-secondary mb-2">
                            <Calendar size={12} />
                            <span>{formatDate()}</span>
                        </div>
                        <h1 className="text-2xl sm:text-3xl font-bold font-display text-text-primary mb-2">
                            {getGreeting()}, <span className="text-gradient">{user.username}</span>!
                        </h1>
                        <p className="text-sm text-text-secondary italic max-w-lg">
                            &ldquo;{dailyQuote.text}&rdquo; <span className="not-italic text-text-secondary">&mdash; {dailyQuote.author}</span>
                        </p>
                    </div>

                    {/* Streak badge */}
                    <motion.div
                        initial={{ scale: 0.8, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        transition={{ delay: 0.3, type: 'spring' }}
                        className="flex items-center gap-2.5 px-5 py-3 rounded-2xl bg-orange-500/12 border border-orange-500/25 shadow-sm self-start"
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
                            <div className="text-xl font-bold font-display text-orange-600 dark:text-orange-300">{streak}</div>
                            <div className="text-[10px] font-bold uppercase tracking-widest text-orange-500/80 dark:text-orange-400">day streak</div>
                        </div>
                    </motion.div>
                </div>
                </Card>
            </motion.div>

            {/* ─── Stats Row ─────────────────────────────────────────────── */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <StatCard
                    label="Total XP"
                    icon={<Trophy size={20} />}
                    accent="bg-amber-500/12 text-amber-600 dark:text-amber-300"
                    delay={0.1}
                >
                    {/* Show a skeleton until /stats first resolves rather than
                        briefly rendering the stale auth-context user.points. That
                        fallback made the Total XP card flash a wrong value (e.g.
                        35 -> 50) on first paint, since user.points isn't refreshed
                        after XP is earned. Mirrors the Learning Time card pattern. */}
                    {loading && !stats ? <Skeleton className="h-7 w-16 inline-block" /> : <AnimatedNumber value={totalXp} />}
                </StatCard>
                <StatCard
                    label="Lessons Completed"
                    value={lessonsCompleted}
                    icon={<BookOpen size={20} />}
                    accent="bg-cyan-500/12 text-cyan-600 dark:text-cyan-300"
                    delay={0.15}
                >
                    <AnimatedNumber value={lessonsCompleted} />
                </StatCard>
                <StatCard
                    label="Current Streak"
                    icon={<Flame size={20} />}
                    accent="bg-orange-500/12 text-orange-600 dark:text-orange-300"
                    delay={0.2}
                >
                    <div className="flex items-center gap-2">
                        <AnimatedNumber value={streak} />
                        <span className="text-text-muted text-lg">days</span>
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
                    accent="bg-purple-500/12 text-purple-600 dark:text-purple-300"
                    delay={0.25}
                >
                    <span className="text-2xl font-display font-bold text-text-primary">
                        {loading ? <Skeleton className="h-7 w-16 inline-block" /> : formatLearningTime(learningMinutes)}
                    </span>
                </StatCard>
            </div>

            {/* ─── Main Content Grid ─────────────────────────────────────── */}
            <div className="grid lg:grid-cols-3 gap-6">
                {/* Left Column (2/3) */}
                <div className="lg:col-span-2 space-y-6">
                    {/* ─── Spaced-repetition review queue (renders only when due) ─ */}
                    <ReviewQueue userId={user?.id} />

                    {/* ─── Daily Recommendation Card ─────────────────────── */}
                    <motion.div variants={itemVariants}>
                    <Card interactive className="relative overflow-hidden shadow-sm group hover:shadow-xl transition-all duration-500">
                        <div className="h-1 bg-gradient-primary" />
                        <div className="absolute top-0 right-0 w-60 h-60 bg-gradient-to-bl from-cyan-100/20 to-transparent rounded-full blur-3xl pointer-events-none" />
                        <div className="relative z-10 p-6 sm:p-8">
                            <div className="flex items-center gap-3 mb-4">
                                <div className="w-10 h-10 rounded-xl bg-accent-subtle flex items-center justify-center">
                                    <Lightbulb size={20} className="text-accent-primary" />
                                </div>
                                <div>
                                    <h3 className="text-lg font-bold text-text-primary font-display">Today&apos;s Recommended Lesson</h3>
                                    <p className="text-xs text-text-muted">Personalized for your learning path</p>
                                </div>
                                {(recommendation?.trending) && (
                                    <Badge variant="danger" className="ml-auto px-2.5 py-1 uppercase tracking-wider">
                                        <TrendingUp size={10} />
                                        Trending
                                    </Badge>
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
                                    <h4 className="text-xl font-bold text-text-primary font-display mb-2">
                                        {recommendation?.title || recommendation?.recommended_lesson?.title || 'Continue in the Classroom'}
                                    </h4>
                                    <p className="text-sm text-text-secondary mb-3 leading-relaxed">
                                        {recommendation?.description || 'Jump into hands-on lessons across every track in the Classroom.'}
                                    </p>
                    {recommendation?.reason && (
                                        <div className="flex items-start gap-2 mb-5 p-3 rounded-xl bg-accent-subtle border border-accent-primary/20">
                                            <Sparkles size={14} className="text-accent-primary mt-0.5 flex-shrink-0" />
                                            <p className="text-xs text-text-secondary">{recommendation.reason}</p>
                                        </div>
                                    )}
                                    <Button
                                        variant="primary"
                                        onClick={() => navigate(recommendation?.link || '/dashboard/classroom')}
                                        className="py-2.5 text-sm group/btn"
                                    >
                                        <Play size={14} />
                                        Start Learning
                                        <ArrowRight size={14} className="group-hover/btn:translate-x-0.5 transition-transform" />
                                    </Button>
                                </>
                            )}
                        </div>
                    </Card>
                    </motion.div>

                    {/* ─── Trending in AI/Python ──────────────────────────── */}
                    <motion.div variants={itemVariants}>
                        <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center gap-2">
                                <TrendingUp size={16} className="text-accent-primary" />
                                <h3 className="text-sm font-bold text-text-secondary uppercase tracking-wider">Trending in AI & Python</h3>
                            </div>
                        </div>
                        <div className="flex gap-4 overflow-x-auto pb-2 scrollbar-thin scrollbar-thumb-border-default scrollbar-track-transparent -mx-1 px-1">
                            {(loading ? Array(5).fill(null) : trends).map((trend, idx) => (
                                <motion.div
                                    key={trend?.id || idx}
                                    initial={{ opacity: 0, x: 20 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    transition={{ delay: 0.3 + idx * 0.05 }}
                                    className="flex-shrink-0 w-60"
                                >
                                <Card
                                    interactive
                                    onClick={() => !loading && navigate('/dashboard/classroom')}
                                    className="p-5 cursor-pointer hover:shadow-lg hover:-translate-y-1 transition-all duration-300 group"
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
                                                <Badge
                                                    variant={trend.category === 'AI' ? 'primary' : 'info'}
                                                    className="px-2 py-0.5 uppercase tracking-wider"
                                                >
                                                    {trend.category}
                                                </Badge>
                                                <Badge
                                                    variant={trend.difficulty === 'Beginner' ? 'success'
                                                        : trend.difficulty === 'Intermediate' ? 'warning'
                                                        : 'danger'}
                                                    className="px-2 py-0.5"
                                                >
                                                    {trend.difficulty}
                                                </Badge>
                                            </div>
                                            <h4 className="text-sm font-bold text-text-primary mb-1.5 group-hover:text-accent-primary transition-colors font-display line-clamp-2">
                                                {trend.title}
                                            </h4>
                                            <p className="text-xs text-text-secondary line-clamp-2">{trend.desc}</p>
                                        </>
                                    )}
                                </Card>
                                </motion.div>
                            ))}
                        </div>
                    </motion.div>
                </div>

                {/* Right Column (1/3) */}
                <div className="space-y-6">
                    {/* ─── Learning Progress ─────────────────────────────── */}
                    <motion.div variants={itemVariants}>
                    <Card className="shadow-sm overflow-hidden">
                        <div className="px-5 py-3.5 border-b border-border-default">
                            <h3 className="font-bold text-xs text-text-secondary uppercase tracking-widest">Learning Progress</h3>
                        </div>
                        <div className="p-5">
                            {/* Progress Ring */}
                            <div className="flex items-center justify-center mb-5">
                                <div className="relative">
                                    <ProgressRing progress={progressPct} size={100} strokeWidth={8} color="#06b6d4" />
                                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                                        <span className="text-2xl font-bold text-text-primary font-display">{progressPct}%</span>
                                        <span className="text-[10px] text-text-secondary uppercase tracking-wider">to next rank</span>
                                    </div>
                                </div>
                            </div>

                            {/* Next Milestone */}
                            <div className="mb-5 p-3 rounded-xl bg-accent-subtle border border-accent-primary/20">
                                <div className="flex items-center gap-2 mb-2">
                                    <Rocket size={12} className="text-accent-primary" />
                                    <span className="text-[10px] font-bold text-accent-primary uppercase tracking-widest">Next Milestone</span>
                                </div>
                                <p className="text-sm font-bold text-text-secondary font-display">{nextMilestone.label}</p>
                                <div className="mt-2 h-1.5 bg-bg-inset rounded-full overflow-hidden">
                                    <motion.div
                                        initial={{ width: 0 }}
                                        animate={{ width: `${Math.min(nextMilestone.progress, 100)}%` }}
                                        transition={{ duration: 1.2, ease: 'easeOut', delay: 0.5 }}
                                        className="h-full rounded-full bg-gradient-primary"
                                    />
                                </div>
                            </div>

                            {/* Recent Activity */}
                            <div>
                                <h4 className="text-[10px] font-bold text-text-secondary uppercase tracking-widest mb-3">Recent Activity</h4>
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
                                                <div className="w-1.5 h-1.5 rounded-full bg-accent-primary flex-shrink-0" />
                                                <span className="text-text-secondary truncate">{act.label || act}</span>
                                                {act.time && <span className="text-text-muted ml-auto text-[10px] flex-shrink-0">{act.time}</span>}
                                            </motion.div>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="text-center py-4">
                                        <p className="text-xs text-text-muted">Start learning to see your activity here</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    </Card>
                    </motion.div>

                    {/* ─── Quick Actions ──────────────────────────────────── */}
                    <motion.div variants={itemVariants}>
                    <Card className="shadow-sm overflow-hidden">
                        <div className="px-5 py-3.5 border-b border-border-default">
                            <h3 className="font-bold text-xs text-text-secondary uppercase tracking-widest">Quick Actions</h3>
                        </div>
                        <div className="p-4 grid grid-cols-2 gap-3">
                            {[
                                {
                                    label: 'Continue Learning',
                                    icon: <Play size={18} />,
                                    to: '/dashboard/classroom',
                                    colors: 'from-cyan-500 to-blue-500',
                                    bg: 'bg-cyan-500/10 hover:bg-cyan-500/20',
                                    text: 'text-cyan-600 dark:text-cyan-300',
                                },
                                {
                                    label: 'Practice Mode',
                                    icon: <Code2 size={18} />,
                                    to: '/dashboard/classroom',
                                    colors: 'from-purple-500 to-violet-500',
                                    bg: 'bg-purple-500/10 hover:bg-purple-500/20',
                                    text: 'text-purple-600 dark:text-purple-300',
                                },
                                {
                                    label: 'Ask Vaathiyaar',
                                    icon: <MessageCircle size={18} />,
                                    to: '/dashboard/classroom',
                                    colors: 'from-amber-500 to-orange-500',
                                    bg: 'bg-amber-500/10 hover:bg-amber-500/20',
                                    text: 'text-amber-600 dark:text-amber-300',
                                },
                                {
                                    label: 'View Profile',
                                    icon: <User size={18} />,
                                    to: '/dashboard/profile',
                                    colors: 'from-emerald-500 to-green-500',
                                    bg: 'bg-emerald-500/10 hover:bg-emerald-500/20',
                                    text: 'text-emerald-600 dark:text-emerald-300',
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
                                        'hover:border-border-default hover:shadow-sm',
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
                    </Card>
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
                .scrollbar-thin::-webkit-scrollbar-thumb { background: rgb(148 163 184 / 0.4); border-radius: 4px; }
                .scrollbar-thin::-webkit-scrollbar-thumb:hover { background: rgb(148 163 184 / 0.6); }
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
            <header className="mb-10 flex justify-between items-end border-b border-border-default pb-6">
                <div>
                    <Badge variant="info" className="px-3 py-1 tracking-wider uppercase mb-3 text-xs">
                        <TrendingUp size={12} />
                        Learning Path
                    </Badge>
                    <h2 className="text-3xl font-bold mb-2 font-display">Module Progression</h2>
                    <p className="text-text-secondary">Complete each module sequentially to unlock the next.</p>
                </div>
                <div className="text-right hidden sm:block">
                    <div className="text-xs text-text-secondary font-bold uppercase tracking-widest mb-1">Progress</div>
                    <div className="text-3xl font-bold font-display text-gradient">
                        {progressPct}%
                    </div>
                    <div className="w-32 h-1.5 bg-bg-inset rounded-full overflow-hidden mt-2">
                        <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${progressPct}%` }}
                            transition={{ duration: 1, ease: 'easeOut' }}
                            className="h-full rounded-full bg-gradient-primary"
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
                                role="button"
                                tabIndex={unlocked ? 0 : -1}
                                aria-disabled={!unlocked || undefined}
                                onKeyDown={(e) => {
                                    if (unlocked && (e.key === 'Enter' || e.key === ' ')) {
                                        e.preventDefault();
                                        navigate(`/dashboard/learn/${mod.id}`);
                                    }
                                }}
                                className={clsx(
                                    "group relative overflow-hidden rounded-2xl border transition-all duration-300 p-5 flex items-center justify-between",
                                    unlocked
                                        ? "bg-bg-surface backdrop-blur-sm border-border-default hover:border-accent-primary/40 hover:shadow-lg hover:-translate-y-0.5 cursor-pointer"
                                        : isNext
                                        ? "bg-bg-surface/60 border-dashed border-accent-primary/40 opacity-70 cursor-not-allowed"
                                        : "bg-bg-elevated/50 border-transparent opacity-40 cursor-not-allowed"
                                )}
                            >
                                {/* Connection line to next module */}
                                {idx < modules.length - 1 && (
                                    <div className="absolute left-[2.15rem] top-full w-[2px] h-3 bg-bg-inset -translate-x-1/2 z-0" />
                                )}

                                <div className="flex items-center gap-5 relative z-10">
                                    <div className={clsx(
                                        "flex items-center justify-center w-11 h-11 rounded-xl font-mono font-bold text-base border transition-all duration-300",
                                        unlocked
                                            ? "bg-accent-subtle border-accent-primary/30 text-accent-primary group-hover:shadow-md group-hover:scale-105"
                                            : isNext
                                            ? "bg-accent-subtle/50 border-accent-primary/30 text-accent-primary/70"
                                            : "bg-bg-elevated border-border-default text-text-muted"
                                    )}>
                                        {isCompleted(mod.id) ? <CheckCircle2 size={18} className="text-green-500" /> : unlocked ? <span className="text-sm">{idx + 1}</span> : idx + 1}
                                    </div>
                                    <div>
                                        <h3 className={clsx(
                                            "text-lg font-bold mb-0.5 transition-colors font-display",
                                            unlocked ? "text-text-primary group-hover:text-accent-primary" : "text-text-muted"
                                        )}>{mod.title}</h3>
                                        <p className="text-sm text-text-secondary max-w-xl line-clamp-1">{mod.desc}</p>
                                    </div>
                                </div>

                                <div className="flex items-center gap-3 relative z-10">
                                    {mod.xp_reward && (
                                        unlocked ? (
                                            <Badge variant="warning" className="px-2.5 py-1">+{mod.xp_reward} XP</Badge>
                                        ) : (
                                            <Badge variant="neutral" className="px-2.5 py-1">+{mod.xp_reward} XP</Badge>
                                        )
                                    )}
                                    {isCompleted(mod.id) && (
                                        <Badge variant="success" className="px-2.5 py-1">Completed</Badge>
                                    )}
                                    {unlocked ? (
                                        <ChevronRight size={18} className="text-text-muted group-hover:text-accent-primary group-hover:translate-x-0.5 transition-all" />
                                    ) : isNext ? (
                                        <Lock size={16} className="text-accent-primary/60" />
                                    ) : (
                                        <Lock size={16} className="text-text-muted" />
                                    )}
                                </div>

                                {/* Hover glow */}
                                {unlocked && (
                                    <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none bg-gradient-to-r from-accent-primary/[0.04] to-transparent" />
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
            <div className="w-10 h-10 border-2 border-accent-primary border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-text-muted">Loading module...</p>
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
                className="mb-6 flex items-center gap-2 text-sm text-text-muted hover:text-text-secondary transition-colors group"
            >
                <ArrowLeft size={16} className="group-hover:-translate-x-1 transition-transform" />
                Back to Learning Path
            </button>

            <Card className="overflow-hidden shadow-sm">
                {/* Header */}
                <div className="relative h-36 bg-accent-subtle border-b border-border-default p-8 flex items-end overflow-hidden">
                    <div className="absolute top-0 right-0 w-60 h-60 bg-gradient-to-br from-cyan-200/20 to-blue-200/20 rounded-full blur-3xl -translate-y-1/2 translate-x-1/4 pointer-events-none" />
                    <div className="relative z-10">
                        <h1 className="text-3xl font-bold text-text-primary font-display">{module.title}</h1>
                        <div className="flex items-center gap-3 mt-2">
                            <Badge variant="primary" className="font-mono px-2.5 py-0.5 text-xs">
                                {module.id.toUpperCase()}
                            </Badge>
                            <Badge variant="warning" className="px-2.5 py-0.5 text-xs">
                                +{module.xp_reward} XP
                            </Badge>
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
                                            <div className="not-prose surface-code p-5 rounded-2xl font-mono text-sm overflow-x-auto my-5 shadow-lg">
                                                {children}
                                            </div>
                                        ) : (
                                            <code className="bg-accent-subtle text-accent-primary px-1.5 py-0.5 rounded text-sm font-mono">{children}</code>
                                        ),
                                        h1: ({ children }) => <h1 className="text-2xl font-bold text-text-primary mb-6 font-display">{children}</h1>,
                                        h2: ({ children }) => (
                                            <h2 className="text-xl font-bold text-text-primary flex items-center gap-3 mt-10 mb-4 font-display">
                                                <span className="w-1 h-6 bg-gradient-primary rounded-full" />
                                                {children}
                                            </h2>
                                        ),
                                    }}
                                >
                                    {module.content}
                                </ReactMarkdown>
                                <div className="mt-16 pt-8 border-t border-border-default flex justify-end">
                                    {isModuleCompleted ? (
                                        <div className="flex items-center gap-3 px-5 py-3 rounded-2xl bg-green-500/12 border border-green-500/25">
                                            <CheckCircle2 size={20} className="text-green-500" />
                                            <div>
                                                <p className="text-sm font-bold text-green-600 dark:text-green-300">Module Completed</p>
                                                <p className="text-xs text-green-600/80 dark:text-green-400">
                                                    Earned {completionInfo?.xp_awarded || 0} XP on {completionInfo?.completed_at ? new Date(completionInfo.completed_at).toLocaleDateString() : 'earlier'}
                                                </p>
                                            </div>
                                        </div>
                                    ) : (
                                        <Button variant="primary" onClick={() => {
                                            recordSignal({ user_id: user.id, signal_type: 'quiz_started', topic: module.id, value: { module_id: module.id } }).catch(() => {});
                                            setQuizMode(true);
                                        }}>
                                            Start Quiz
                                            <ChevronRight size={18} />
                                        </Button>
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
                                    <Badge variant="primary" className="px-3 py-1 tracking-wider uppercase mb-3 text-xs">
                                        <Target size={12} />
                                        Knowledge Check
                                    </Badge>
                                    <h3 className="text-2xl font-bold text-text-primary font-display mb-2">Quiz Time</h3>
                                    <p className="text-text-muted text-sm">Answer all questions correctly to complete this module.</p>
                                </div>

                                {/* Quiz progress bar */}
                                <div className="mb-8">
                                    <div className="flex justify-between text-[10px] text-text-muted font-mono mb-1">
                                        <span>{Object.keys(answers).length} / {module.quiz.length} answered</span>
                                        <span>{Math.round(quizProgress)}%</span>
                                    </div>
                                    <div className="h-1.5 bg-bg-inset rounded-full overflow-hidden">
                                        <motion.div
                                            className="h-full rounded-full bg-gradient-primary"
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
                                                    ? 'bg-green-500/10 border-green-500/25'
                                                    : 'bg-red-500/10 border-red-500/25'
                                            }`}
                                        >
                                            <div className="flex items-start gap-3">
                                                <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
                                                    result.passed ? 'bg-green-500 text-white' : 'bg-red-500 text-white'
                                                }`}>
                                                    {result.passed ? <Trophy size={20} /> : <RotateCcw size={20} />}
                                                </div>
                                                <div>
                                                    <div className={`text-base font-bold mb-1 ${result.passed ? 'text-green-600 dark:text-green-300' : 'text-red-600 dark:text-red-300'}`}>
                                                        {result.passed ? 'Module Complete!' : 'Not quite there yet'}
                                                    </div>
                                                    <div className={`text-sm whitespace-pre-line ${result.passed ? 'text-green-600/80 dark:text-green-400' : 'text-red-500/80 dark:text-red-400'}`}>
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
                                                    isCorrect ? 'bg-green-500/10 border-green-500/25' :
                                                    isWrong ? 'bg-red-500/10 border-red-500/25' :
                                                    'bg-bg-surface/50 border-border-default'
                                                }`}
                                            >
                                                <p className="font-bold text-base text-text-primary font-display flex items-start gap-2">
                                                    <span className="text-sm text-text-muted font-mono mt-0.5">{qIdx + 1}.</span>
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
                                                                    showCorrect ? "bg-green-500/12 border-green-500/40" :
                                                                    showWrong ? "bg-red-500/12 border-red-500/40" :
                                                                    isSelected ? "bg-accent-subtle border-accent-primary/50 shadow-sm" :
                                                                    "bg-bg-surface border-border-default hover:bg-bg-elevated hover:border-border-strong"
                                                                )}
                                                            >
                                                                <div className={clsx(
                                                                    "w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-all",
                                                                    showCorrect ? "border-green-500 bg-green-500" :
                                                                    showWrong ? "border-red-500 bg-red-500" :
                                                                    isSelected ? "border-accent-primary" : "border-border-default"
                                                                )}>
                                                                    {showCorrect && <CheckCircle2 size={12} className="text-white" />}
                                                                    {showWrong && <span className="text-white text-[10px] font-bold">✕</span>}
                                                                    {isSelected && !result && <div className="w-2.5 h-2.5 bg-accent-primary rounded-full" />}
                                                                </div>
                                                                <span className={clsx(
                                                                    "text-sm",
                                                                    showCorrect ? "text-green-600 dark:text-green-300 font-medium" :
                                                                    showWrong ? "text-red-600 dark:text-red-300" :
                                                                    isSelected ? "text-accent-primary font-medium" : "text-text-secondary"
                                                                )}>{opt}</span>
                                                            </motion.div>
                                                        );
                                                    })}
                                                </div>
                                            </motion.div>
                                        );
                                    })}
                                </div>

                                <div className="mt-10 flex justify-end gap-3 border-t border-border-default pt-8">
                                    {!result?.passed ? (
                                        <>
                                            <Button variant="ghost" onClick={() => { setQuizMode(false); setAnswers({}); setResult(null); }}>
                                                <ArrowLeft size={14} className="mr-1" /> Back to Content
                                            </Button>
                                            <Button
                                                variant="primary"
                                                onClick={handleQuizSubmit}
                                                disabled={Object.keys(answers).length < module.quiz.length}
                                            >
                                                Submit Answers
                                            </Button>
                                        </>
                                    ) : (
                                        <Button variant="primary" onClick={() => navigate('/dashboard/learn')} className="w-full">
                                            <Trophy size={16} />
                                            Return to Learning Path
                                        </Button>
                                    )}
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </Card>
        </div>
    );
}
