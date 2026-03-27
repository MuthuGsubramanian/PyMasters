import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
    ArrowLeft,
    ChevronRight,
    CheckCircle2,
    Lock,
    Play,
    Sparkles,
    Zap,
    Trophy,
    Clock,
    Filter,
    Map,
    Star,
    BookOpen,
    Target,
    TrendingUp,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import clsx from 'clsx';
import { useAuth } from '../context/AuthContext';
import api, { recordSignal } from '../api';
import KnowledgeMap from '../components/KnowledgeMap';

// ─── Animated Number Counter ────────────────────────────────────────────────
function AnimatedNumber({ value, duration = 1200 }) {
    const [display, setDisplay] = useState(0);
    useEffect(() => {
        let start = null;
        const step = (ts) => {
            if (!start) start = ts;
            const progress = Math.min((ts - start) / duration, 1);
            const eased = 1 - Math.pow(1 - progress, 3);
            setDisplay(Math.floor(eased * value));
            if (progress < 1) requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
    }, [value, duration]);
    return display;
}

// ─── Progress Ring ──────────────────────────────────────────────────────────
function ProgressRing({ progress, size = 80, strokeWidth = 6, color = '#06b6d4' }) {
    const radius = (size - strokeWidth) / 2;
    const circumference = 2 * Math.PI * radius;
    const offset = circumference - (progress / 100) * circumference;

    return (
        <svg width={size} height={size} className="transform -rotate-90">
            <circle cx={size / 2} cy={size / 2} r={radius} fill="none"
                stroke="currentColor" strokeWidth={strokeWidth}
                className="text-slate-100" />
            <motion.circle
                cx={size / 2} cy={size / 2} r={radius} fill="none"
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

// ─── Difficulty badge ───────────────────────────────────────────────────────
function DifficultyBadge({ level }) {
    const config = {
        beginner: { bg: 'bg-green-50', text: 'text-green-600', border: 'border-green-200' },
        intermediate: { bg: 'bg-amber-50', text: 'text-amber-600', border: 'border-amber-200' },
        advanced: { bg: 'bg-red-50', text: 'text-red-600', border: 'border-red-200' },
    };
    const c = config[level] || config.beginner;
    return (
        <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${c.bg} ${c.text} ${c.border}`}>
            {level}
        </span>
    );
}

// ─── Path Card ──────────────────────────────────────────────────────────────
function PathCard({ path, index, onClick, isRecommended }) {
    const progress = path.progress_pct ?? 0;
    const started = progress > 0;

    const iconMap = {
        python: '🐍', data: '📊', web: '🌐', ai: '🤖', ml: '🧠',
        automation: '⚙️', default: '📚',
    };
    const icon = iconMap[path.icon] || iconMap[path.category?.toLowerCase()] || iconMap.default;

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.05 }}
            onClick={onClick}
            className="group relative rounded-2xl border border-black/[0.04] bg-white/80 backdrop-blur-sm overflow-hidden hover:border-cyan-200 hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300 cursor-pointer"
        >
            <div className="h-1 bg-gradient-to-r from-cyan-400 via-blue-500 to-purple-500 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
            <div className="p-5">
                {isRecommended && (
                    <div className="flex items-center gap-1.5 mb-3 px-2.5 py-1.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-700">
                        <Sparkles size={12} className="text-amber-500 flex-shrink-0" />
                        <span className="text-[10px] font-bold tracking-wide">Vaathiyaar recommends this for you!</span>
                    </div>
                )}
                <div className="flex items-start justify-between mb-3">
                    <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-cyan-50 to-blue-50 border border-cyan-100 flex items-center justify-center text-xl select-none group-hover:scale-110 transition-transform duration-300">
                        {icon}
                    </div>
                    {started && (
                        <div className="relative">
                            <ProgressRing progress={progress} size={40} strokeWidth={3} />
                            <div className="absolute inset-0 flex items-center justify-center">
                                <span className="text-[9px] font-bold text-slate-600">{progress}%</span>
                            </div>
                        </div>
                    )}
                </div>

                <h3 className="text-sm font-bold text-slate-800 group-hover:text-cyan-600 transition-colors font-display mb-1 line-clamp-1">
                    {path.name || path.title}
                </h3>

                <div className="flex items-center gap-3 text-[10px] text-slate-400 mb-3">
                    <span className="flex items-center gap-1">
                        <BookOpen size={10} />
                        <AnimatedNumber value={path.lesson_count || path.lessons?.length || 0} /> lessons
                    </span>
                    <span className="flex items-center gap-1">
                        <Clock size={10} />
                        {path.estimated_hours || '—'}h
                    </span>
                </div>

                <div className="flex items-center justify-between">
                    <DifficultyBadge level={path.difficulty || 'beginner'} />
                    <button className="text-xs font-bold text-cyan-600 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-0.5">
                        {started ? 'Continue' : 'Start'} <ChevronRight size={12} />
                    </button>
                </div>
            </div>

            <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none bg-gradient-to-r from-cyan-500/[0.02] to-blue-500/[0.02]" />
        </motion.div>
    );
}

// ─── Skeleton ───────────────────────────────────────────────────────────────
function Skeleton({ className }) {
    return (
        <div className={`animate-pulse bg-gradient-to-r from-slate-100 via-slate-200 to-slate-100 rounded-lg ${className}`}
            style={{ backgroundSize: '200% 100%', animation: 'shimmer 1.5s ease-in-out infinite' }}
        />
    );
}

// ═══════════════════════════════════════════════════════════════════════════════
// PATH LIST VIEW
// ═══════════════════════════════════════════════════════════════════════════════
function PathList() {
    const { user } = useAuth();
    const navigate = useNavigate();
    const [paths, setPaths] = useState([]);
    const [activePath, setActivePath] = useState(null);
    const [recommended, setRecommended] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState('all');

    useEffect(() => {
        const params = user?.id ? `?user_id=${user.id}` : '';
        Promise.all([
            api.get(`/paths/${params}`).catch(() => ({ data: [] })),
            api.get(`/paths/active${params}`).catch(() => ({ data: null })),
            api.get(`/paths/recommend${params}`).catch(() => ({ data: [] })),
        ]).then(([pathsRes, activeRes, recRes]) => {
            const pathData = pathsRes.data?.paths || pathsRes.data || [];
            setPaths(Array.isArray(pathData) ? pathData : []);
            setActivePath(activeRes.data?.path || activeRes.data || null);
            const recData = recRes.data?.paths || recRes.data || [];
            setRecommended(Array.isArray(recData) ? recData : []);
        }).finally(() => setLoading(false));
    }, [user]);

    const filteredPaths = filter === 'all'
        ? paths
        : paths.filter(p => p.difficulty === filter);

    return (
        <div className="animate-fade-in space-y-8">
            {/* Header */}
            <header className="flex items-center justify-between">
                <div>
                    <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-cyan-200 bg-cyan-50 text-cyan-600 text-xs font-bold tracking-wider uppercase mb-3">
                        <Map size={12} />
                        Evolution
                    </div>
                    <motion.h1
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="text-3xl font-bold mb-1 font-display"
                    >
                        Evolution
                    </motion.h1>
                    <p className="text-slate-500">Your AI learning journey, tailored to your goals.</p>
                </div>
            </header>

            {/* Active Path Banner */}
            <AnimatePresence>
                {activePath && (
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="rounded-2xl overflow-hidden border border-black/[0.04] bg-white/80 backdrop-blur-sm shadow-sm group hover:shadow-lg transition-all duration-500"
                    >
                        <div className="h-1 bg-gradient-to-r from-cyan-400 via-blue-500 to-purple-500" />
                        <div className="p-6 flex justify-between items-center">
                            <div>
                                <div className="flex items-center gap-2 mb-2">
                                    <TrendingUp size={16} className="text-cyan-500" />
                                    <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Active Path</span>
                                </div>
                                <h3 className="text-xl font-bold text-slate-900 font-display mb-1">
                                    {activePath.name || activePath.title}
                                </h3>
                                <p className="text-sm text-slate-500 mb-4">
                                    {activePath.completed_lessons || 0} of {activePath.total_lessons || activePath.lesson_count || 0} lessons completed
                                </p>
                                <button
                                    onClick={() => navigate(`/dashboard/paths/${activePath.id}`)}
                                    className="btn-neo btn-neo-primary py-2.5 text-sm group/btn"
                                >
                                    Continue Path
                                    <ChevronRight size={16} className="ml-1 group-hover/btn:translate-x-0.5 transition-transform" />
                                </button>
                            </div>
                            <div className="hidden sm:block relative">
                                <ProgressRing
                                    progress={activePath.progress_pct || 0}
                                    size={90}
                                    strokeWidth={7}
                                />
                                <div className="absolute inset-0 flex items-center justify-center">
                                    <span className="text-lg font-bold text-slate-700 font-display">
                                        {activePath.progress_pct || 0}%
                                    </span>
                                </div>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Recommended */}
            {recommended.length > 0 && (
                <section>
                    <div className="flex items-center gap-2 mb-4">
                        <Sparkles size={16} className="text-amber-500" />
                        <h2 className="text-lg font-bold text-slate-800 font-display">Recommended For You</h2>
                    </div>
                    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                        {recommended.slice(0, 3).map((path, idx) => (
                            <PathCard
                                key={path.id}
                                path={path}
                                index={idx}
                                isRecommended={idx === 0}
                                onClick={() => navigate(`/dashboard/paths/${path.id}`)}
                            />
                        ))}
                    </div>
                </section>
            )}

            {/* All Paths */}
            <section>
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-bold text-slate-800 font-display">All Paths</h2>
                    <div className="flex items-center gap-2">
                        <Filter size={14} className="text-slate-400" />
                        {['all', 'beginner', 'intermediate', 'advanced'].map(f => (
                            <button
                                key={f}
                                onClick={() => setFilter(f)}
                                className={clsx(
                                    'text-xs font-bold px-3 py-1.5 rounded-lg transition-all duration-200',
                                    filter === f
                                        ? 'bg-cyan-50 text-cyan-700 border border-cyan-200'
                                        : 'text-slate-400 hover:text-slate-600 hover:bg-slate-50 border border-transparent'
                                )}
                            >
                                {f === 'all' ? 'All' : f.charAt(0).toUpperCase() + f.slice(1)}
                            </button>
                        ))}
                    </div>
                </div>

                {loading ? (
                    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                        {[1, 2, 3, 4, 5, 6].map(i => (
                            <Skeleton key={i} className="h-48 w-full rounded-2xl" />
                        ))}
                    </div>
                ) : filteredPaths.length === 0 ? (
                    <div className="text-center py-16">
                        <Map size={32} className="text-slate-300 mx-auto mb-3" />
                        <p className="text-sm text-slate-400">No paths found for this filter.</p>
                    </div>
                ) : (
                    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                        {filteredPaths.map((path, idx) => (
                            <PathCard
                                key={path.id}
                                path={path}
                                index={idx}
                                onClick={() => navigate(`/dashboard/paths/${path.id}`)}
                            />
                        ))}
                    </div>
                )}
            </section>

            <style>{`
                @keyframes shimmer {
                    0% { background-position: 200% 0; }
                    100% { background-position: -200% 0; }
                }
            `}</style>
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════════
// PATH DETAIL VIEW
// ═══════════════════════════════════════════════════════════════════════════════
function PathDetail() {
    const { pathId } = useParams();
    const { user } = useAuth();
    const navigate = useNavigate();

    const [path, setPath] = useState(null);
    const [progress, setProgress] = useState(null);
    const [mapData, setMapData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [starting, setStarting] = useState(false);

    useEffect(() => {
        const params = user?.id ? `?user_id=${user.id}` : '';
        Promise.all([
            api.get(`/paths/${pathId}`).catch(() => ({ data: null })),
            api.get(`/paths/${pathId}/progress${params}`).catch(() => ({ data: null })),
            user?.id ? api.get(`/graph/user-map/${user.id}`).catch(() => ({ data: null })) : Promise.resolve({ data: null }),
        ]).then(([pathRes, progressRes, mapRes]) => {
            setPath(pathRes.data?.path || pathRes.data);
            setProgress(progressRes.data?.progress || progressRes.data);
            setMapData(mapRes.data);
        }).finally(() => setLoading(false));
    }, [pathId, user]);

    const handleStart = async () => {
        if (!user?.id) return;
        setStarting(true);
        try {
            await api.post(`/paths/${pathId}/start`, { user_id: user.id });
            recordSignal({
                user_id: user?.id,
                signal_type: 'path_started',
                topic: pathId,
                value: { path_id: pathId },
            }).catch(() => {});
            // Reload progress
            const res = await api.get(`/paths/${pathId}/progress?user_id=${user.id}`);
            setProgress(res.data?.progress || res.data);
        } catch (err) {
            console.error('Failed to start path:', err);
        } finally {
            setStarting(false);
        }
    };

    if (loading) {
        return (
            <div className="animate-fade-in space-y-6 max-w-4xl mx-auto">
                <Skeleton className="h-8 w-48" />
                <Skeleton className="h-40 w-full rounded-2xl" />
                <div className="space-y-3">
                    {[1, 2, 3, 4].map(i => (
                        <Skeleton key={i} className="h-20 w-full rounded-2xl" />
                    ))}
                </div>
            </div>
        );
    }

    if (!path) {
        return (
            <div className="text-center py-20">
                <Map size={40} className="text-slate-300 mx-auto mb-4" />
                <h2 className="text-xl font-bold text-slate-700 font-display mb-2">Path not found</h2>
                <button
                    onClick={() => navigate('/dashboard/paths')}
                    className="btn-neo btn-neo-ghost mt-4"
                >
                    <ArrowLeft size={14} className="mr-1" /> Back to Paths
                </button>
            </div>
        );
    }

    const lessons = path.lessons || [];
    const completedIds = new Set(progress?.completed_lessons || []);
    const nextLessonId = progress?.next_lesson_id;
    const progressPct = progress?.progress_pct || (lessons.length > 0 ? Math.round((completedIds.size / lessons.length) * 100) : 0);
    const remainingHours = path.estimated_hours
        ? Math.max(0, path.estimated_hours - (path.estimated_hours * progressPct / 100)).toFixed(1)
        : null;
    const isStarted = completedIds.size > 0 || progress?.started;

    return (
        <div className="animate-fade-in pb-20 max-w-4xl mx-auto">
            {/* Back */}
            <button
                onClick={() => navigate('/dashboard/paths')}
                className="mb-6 flex items-center gap-2 text-sm text-slate-400 hover:text-slate-700 transition-colors group"
            >
                <ArrowLeft size={16} className="group-hover:-translate-x-1 transition-transform" />
                Back to Evolution
            </button>

            {/* Header */}
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="rounded-2xl overflow-hidden border border-black/[0.04] bg-white/80 backdrop-blur-sm shadow-sm mb-8"
            >
                <div className="relative h-36 bg-gradient-to-r from-cyan-50 via-blue-50 to-purple-50 border-b border-black/[0.04] p-8 flex items-end overflow-hidden">
                    <div className="absolute top-0 right-0 w-60 h-60 bg-gradient-to-br from-cyan-200/20 to-blue-200/20 rounded-full blur-3xl -translate-y-1/2 translate-x-1/4 pointer-events-none" />
                    <div className="relative z-10 flex-1">
                        <h1 className="text-3xl font-bold text-slate-900 font-display">{path.name || path.title}</h1>
                        <p className="text-sm text-slate-500 mt-1 max-w-2xl line-clamp-2">{path.description}</p>
                        <div className="flex items-center gap-3 mt-2">
                            <DifficultyBadge level={path.difficulty || 'beginner'} />
                            <span className="text-xs font-mono text-slate-400 flex items-center gap-1">
                                <BookOpen size={12} />
                                {lessons.length} lessons
                            </span>
                            {path.estimated_hours && (
                                <span className="text-xs font-mono text-slate-400 flex items-center gap-1">
                                    <Clock size={12} />
                                    {path.estimated_hours}h total
                                </span>
                            )}
                        </div>
                    </div>
                    <div className="relative hidden sm:block">
                        <ProgressRing progress={progressPct} size={90} strokeWidth={7} />
                        <div className="absolute inset-0 flex items-center justify-center">
                            <span className="text-lg font-bold text-slate-700 font-display">{progressPct}%</span>
                        </div>
                    </div>
                </div>

                {/* Progress bar */}
                <div className="px-8 py-4 flex items-center justify-between">
                    <div className="flex-1 mr-6">
                        <div className="flex justify-between text-[10px] font-mono text-slate-400 mb-1">
                            <span>{completedIds.size} / {lessons.length} completed</span>
                            {remainingHours && <span>~{remainingHours}h remaining</span>}
                        </div>
                        <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                            <motion.div
                                initial={{ width: 0 }}
                                animate={{ width: `${progressPct}%` }}
                                transition={{ duration: 1, ease: 'easeOut' }}
                                className="h-full rounded-full bg-gradient-to-r from-cyan-400 via-blue-500 to-purple-500"
                            />
                        </div>
                    </div>
                    {!isStarted && (
                        <button
                            onClick={handleStart}
                            disabled={starting}
                            className="btn-neo btn-neo-primary py-2.5 text-sm disabled:opacity-50"
                        >
                            {starting ? 'Starting...' : 'Start Path'}
                            <Play size={14} className="ml-1" />
                        </button>
                    )}
                </div>
            </motion.div>

            {/* Timeline */}
            <section className="mb-10">
                <h2 className="text-lg font-bold text-slate-800 font-display mb-4 flex items-center gap-2">
                    <Target size={18} className="text-cyan-500" />
                    Lesson Timeline
                </h2>
                <div className="space-y-3 relative">
                    {/* Vertical line */}
                    <div className="absolute left-[1.35rem] top-6 bottom-6 w-[2px] bg-slate-100" />

                    {lessons.map((lesson, idx) => {
                        const isCompleted = completedIds.has(lesson.id);
                        const isNext = lesson.id === nextLessonId || (!nextLessonId && !isCompleted && idx === completedIds.size);
                        const isLocked = !isCompleted && !isNext;
                        const isInserted = lesson.inserted || lesson.personalized;

                        return (
                            <motion.div
                                key={lesson.id || idx}
                                initial={{ opacity: 0, x: -10 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ delay: idx * 0.04 }}
                                className={clsx(
                                    'group relative flex items-center gap-4 p-4 rounded-2xl border transition-all duration-300',
                                    isCompleted
                                        ? 'bg-green-50/50 border-green-200/60'
                                        : isNext
                                        ? 'bg-white/80 border-cyan-200 shadow-sm cursor-pointer hover:shadow-md hover:-translate-y-0.5'
                                        : 'bg-slate-50/50 border-transparent opacity-60'
                                )}
                                onClick={isNext ? () => navigate(`/dashboard/classroom`) : undefined}
                            >
                                {/* Status icon */}
                                <div className={clsx(
                                    'relative z-10 w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 border transition-all duration-300',
                                    isCompleted
                                        ? 'bg-green-500 border-green-500 text-white shadow-md shadow-green-200'
                                        : isNext
                                        ? 'bg-cyan-50 border-cyan-300 text-cyan-600 group-hover:bg-cyan-500 group-hover:text-white group-hover:border-cyan-500 group-hover:shadow-md group-hover:shadow-cyan-200'
                                        : 'bg-slate-100 border-slate-200 text-slate-400'
                                )}>
                                    {isCompleted ? <CheckCircle2 size={18} /> :
                                     isNext ? <Play size={16} /> :
                                     <Lock size={14} />}
                                </div>

                                {/* Content */}
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                        <h3 className={clsx(
                                            'text-sm font-bold font-display transition-colors',
                                            isCompleted ? 'text-green-700' :
                                            isNext ? 'text-slate-800 group-hover:text-cyan-600' :
                                            'text-slate-500'
                                        )}>
                                            {lesson.title || lesson.name || `Lesson ${idx + 1}`}
                                        </h3>
                                        {isInserted && (
                                            <span className="inline-flex items-center gap-0.5 text-[9px] font-bold text-purple-600 bg-purple-50 border border-purple-200 rounded-full px-1.5 py-0.5">
                                                <Sparkles size={8} /> Personalized
                                            </span>
                                        )}
                                    </div>
                                    {lesson.description && (
                                        <p className="text-xs text-slate-400 mt-0.5 line-clamp-1">{lesson.description}</p>
                                    )}
                                </div>

                                {/* XP + Status */}
                                <div className="flex items-center gap-3 flex-shrink-0">
                                    {lesson.xp_reward && (
                                        <span className={clsx(
                                            'text-[10px] font-bold rounded-full px-2.5 py-1 border',
                                            isCompleted
                                                ? 'text-green-600 bg-green-50 border-green-200'
                                                : 'text-amber-600 bg-amber-50 border-amber-200'
                                        )}>
                                            +{lesson.xp_reward} XP
                                        </span>
                                    )}
                                    {isCompleted && (
                                        <Star size={14} className="text-amber-400 fill-amber-400" />
                                    )}
                                    {isNext && (
                                        <ChevronRight size={16} className="text-cyan-400 group-hover:translate-x-0.5 transition-transform" />
                                    )}
                                </div>
                            </motion.div>
                        );
                    })}
                </div>
            </section>

            {/* Knowledge Map */}
            {mapData && (
                <section>
                    <KnowledgeMap data={mapData} />
                </section>
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

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN EXPORT — routes between list and detail
// ═══════════════════════════════════════════════════════════════════════════════
export default function Paths() {
    useEffect(() => { document.title = 'Learning Paths — PyMasters'; }, []);
    const { pathId } = useParams();
    return pathId ? <PathDetail /> : <PathList />;
}
