import { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
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
import { useProfile } from '../context/ProfileContext';
import { API_URL } from '../api';
import ReviewQueue from '../components/ReviewQueue';
import WarmUp from '../components/WarmUp';
import MisconceptionRadar from '../components/MisconceptionRadar';
import useAudience from '../hooks/useAudience';
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

// The backend `/trending` endpoint (content/trends.py) returns each topic with a
// category *key* (e.g. `ai_agents`, `python_latest`) and a *lowercase* difficulty
// (e.g. `intermediate`). The Trending-rail render (and its difficulty-badge colour,
// which compares against Title-case `Beginner`/`Intermediate`/`Advanced`) expects
// display-ready values. Without normalisation adopted topics render raw keys
// ("AI_AGENTS" after the badge's uppercase CSS) and lowercase difficulties whose
// badge always falls through to the red/`danger` colour. These helpers map a
// backend record onto the rail's expected shape; any already-display-ready value
// (the FALLBACK_TRENDS 'AI'/'Python' + Title-case difficulty, or an unknown key)
// passes through unchanged, so the transform is a safe idempotent no-op there.
const TREND_CATEGORY_LABEL = {
    ai_agents: 'AI Agents', ai_safety: 'AI Agents',
    rag: 'LLMs', fine_tuning: 'LLMs', prompt_engineering: 'LLMs', ai_coding: 'LLMs',
    computer_vision: 'Computer Vision', multimodal: 'Computer Vision',
    generative_ai: 'Computer Vision', ai_healthcare: 'Computer Vision',
    nlp: 'NLP',
    mlops: 'MLOps', devops: 'MLOps', ml_systems: 'MLOps',
    python_latest: 'Python', python_tools: 'Python', python_advanced: 'Python',
    web_development: 'Python',
    deep_learning: 'Deep Learning', model_architecture: 'Deep Learning', edge_ai: 'Deep Learning',
    data_science: 'Data Science', data_engineering: 'Data Science', vector_db: 'Data Science',
};

const normalizeTrendCategory = (c) =>
    (typeof c === 'string' && TREND_CATEGORY_LABEL[c]) ? TREND_CATEGORY_LABEL[c] : (c || 'AI');

const titleCaseTrendDifficulty = (d) =>
    (typeof d === 'string' && d)
        ? d.charAt(0).toUpperCase() + d.slice(1).toLowerCase()
        : 'Intermediate';

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
                className="relative p-4 sm:p-5 transition-colors duration-200 hover:border-border-strong overflow-hidden"
            >
                <div className="relative">
                    <div className="flex items-start justify-between gap-2 mb-3">
                        <span className="text-xs font-semibold uppercase tracking-wider leading-tight text-text-secondary">{label}</span>
                        <div className={clsx(
                            'w-9 h-9 shrink-0 rounded-xl flex items-center justify-center',
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
    const { setUserPersona } = useProfile();
    const audience = useAudience();
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
                    setTrends(topics.map((t) => ({
                        ...t,
                        category: normalizeTrendCategory(t.category),
                        difficulty: titleCaseTrendDifficulty(t.difficulty),
                        desc: t.desc ?? t.summary ?? '',
                    })));
                }
            } catch { /* ignore */ }

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
            {/* ─── Welcome Banner (Always First Above the Fold) ──────────── */}
            <motion.div variants={itemVariants}>
                <Card className="relative overflow-hidden shadow-sm">
                <div className="relative p-6 sm:p-8 flex flex-col gap-5">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                        <div className="flex-1 min-w-0">
                            <div className="flex flex-wrap items-center gap-2 text-xs text-text-secondary mb-2">
                                <Calendar size={12} aria-hidden="true" />
                                <span>{formatDate()}</span>
                                {audience.orgName && (
                                    <span className="font-semibold text-text-primary" data-testid="org-identity">&middot; {audience.orgName}</span>
                                )}
                            </div>
                            <h1 className="text-2xl sm:text-3xl font-bold font-display text-text-primary mb-2">
                                {getGreeting()}, {user.name || user.username}
                            </h1>
                            {audience.welcome ? (
                                // The organisation's own welcome (Console -> Branding), in place of a generic quote.
                                <p className="text-sm text-text-secondary max-w-lg" data-testid="org-welcome">{audience.welcome}</p>
                            ) : audience.mode !== 'professional' && (
                                <p className="text-sm text-text-secondary italic max-w-lg">
                                    &ldquo;{dailyQuote.text}&rdquo; <span className="not-italic text-text-secondary">&mdash; {dailyQuote.author}</span>
                                </p>
                            )}
                        </div>

                        {/* Streak badge */}
                        <motion.div
                            initial={{ scale: 0.8, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            transition={{ delay: 0.3, type: 'spring' }}
                            className="flex items-center gap-2.5 px-5 py-3 rounded-2xl bg-orange-500/12 border border-orange-500/25 shadow-sm self-start"
                        >
                            <Flame size={24} aria-hidden="true" className="text-orange-600 dark:text-orange-300" />
                            <div>
                                <div className="text-xl font-bold font-display text-orange-600 dark:text-orange-300">{streak}</div>
                                <div className="text-xs font-bold uppercase tracking-wider text-orange-700 dark:text-orange-300">day streak</div>
                            </div>
                        </motion.div>
                    </div>

                    {/* Stage / Persona Quick Switcher */}
                    <div className="pt-4 border-t border-border-default flex flex-wrap items-center justify-between gap-3">
                        <div className="flex flex-wrap items-center gap-2">
                            <span className="text-xs font-bold uppercase tracking-wider text-text-muted mr-1">
                                Learning Stage:
                            </span>
                            {[
                                { id: 'high_school_student', persona: 'school', label: '🌱 School (Class 6–12)' },
                                { id: 'college_student', persona: 'college', label: '🎓 College & Placements' },
                                { id: 'junior_developer', persona: 'professional', label: '🚀 Working Professional' },
                            ].map((st) => {
                                const active = audience.persona === st.persona;
                                return (
                                    <button
                                        key={st.id}
                                        type="button"
                                        onClick={() => setUserPersona?.(st.id)}
                                        className={clsx(
                                            'px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all',
                                            active
                                                ? 'border-cyan-500 bg-cyan-500/12 text-cyan-700 dark:text-cyan-300 shadow-sm'
                                                : 'border-border-default bg-bg-elevated text-text-secondary hover:border-border-strong'
                                        )}
                                    >
                                        {st.label}
                                    </button>
                                );
                            })}
                        </div>
                        <button
                            type="button"
                            onClick={() => navigate(`/dashboard/classroom?stage=${audience.persona || 'all'}`)}
                            className="text-xs font-semibold text-accent-primary hover:underline inline-flex items-center gap-1"
                        >
                            Browse {audience.personaInfo?.shortLabel || 'Stage'} Curriculum
                            <ArrowRight size={12} />
                        </button>
                    </div>
                </div>
                </Card>
            </motion.div>

            {/* ─── Daily Recommendation Card ─────────────────────── */}
            <motion.div variants={itemVariants}>
                <Card interactive className="relative overflow-hidden shadow-sm group">
                    <div className="relative p-6 sm:p-8">
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

            {/* ─── F8: Review queue & Warm-up (self-hides when nothing is due) ─── */}
            <ReviewQueue userId={user?.id} />
            <WarmUp lang={user?.preferred_language || 'en'} />
            <MisconceptionRadar />

            {/* ─── Stats Row ─────────────────────────────────────────────── */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
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
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Left Column (2/3) */}
                <div className="lg:col-span-2 min-w-0 space-y-6">
                    {/* Review queue moved to the top of the dashboard (F8). */}
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
                                    onClick={() => !loading && navigate(`/dashboard/classroom?topic=${encodeURIComponent(trend.title || '')}`)}
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
                <div className="min-w-0 space-y-6">
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
                                        <span className="text-xs text-text-secondary uppercase tracking-wider">to next rank</span>
                                    </div>
                                </div>
                            </div>

                            {/* Next Milestone */}
                            <div className="mb-5 p-3 rounded-xl bg-accent-subtle border border-accent-primary/20">
                                <div className="flex items-center gap-2 mb-2">
                                    <Rocket size={12} className="text-accent-primary" />
                                    <span className="text-xs font-bold text-accent-primary uppercase tracking-widest">Next Milestone</span>
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
                                <h4 className="text-xs font-bold text-text-secondary uppercase tracking-widest mb-3">Recent Activity</h4>
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
                                                {act.time && <span className="text-text-muted ml-auto text-xs flex-shrink-0">{act.time}</span>}
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
                                    text: 'text-cyan-700 dark:text-cyan-300',
                                },
                                {
                                    label: 'Daily Challenges',
                                    icon: <Trophy size={18} />,
                                    to: '/dashboard/challenges',
                                    colors: 'from-purple-500 to-violet-500',
                                    bg: 'bg-purple-500/10 hover:bg-purple-500/20',
                                    text: 'text-purple-700 dark:text-purple-300',
                                },
                                {
                                    label: 'Code Playground',
                                    icon: <Code2 size={18} />,
                                    to: '/dashboard/playground',
                                    colors: 'from-amber-500 to-orange-500',
                                    bg: 'bg-amber-500/10 hover:bg-amber-500/20',
                                    text: 'text-amber-700 dark:text-amber-300',
                                },
                                {
                                    label: 'View Profile',
                                    icon: <User size={18} />,
                                    to: '/dashboard/profile',
                                    colors: 'from-emerald-500 to-green-500',
                                    bg: 'bg-emerald-500/10 hover:bg-emerald-500/20',
                                    text: 'text-emerald-700 dark:text-emerald-300',
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
                    <span className="text-xs font-bold leading-tight text-center">{action.label}</span>
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
