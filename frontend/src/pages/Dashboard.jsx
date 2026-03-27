import { useState, useEffect } from 'react';
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
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { useAuth } from '../context/AuthContext';
import { getModules, getModule, completeModule } from '../api';
import { motion, AnimatePresence } from 'framer-motion';
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

// ─── Overview ──────────────────────────────────────────────────────────────
export function Overview() {
    const { user } = useAuth();
    const navigate = useNavigate();

    const [totalModules, setTotalModules] = useState(4);
    const modulesUnlocked = (user.unlocked || []).length;
    const progressPct = totalModules > 0 ? Math.round((modulesUnlocked / totalModules) * 100) : 0;

    useEffect(() => { document.title = 'Dashboard — PyMasters'; }, []);
    useEffect(() => {
        getModules().then(res => setTotalModules(res.data.length)).catch(() => {});
    }, []);

    return (
        <div className="animate-fade-in space-y-8">
            <header className="flex items-center justify-between">
                <div>
                    <motion.h1
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="text-3xl font-bold mb-1 font-display"
                    >
                        Command Center
                    </motion.h1>
                    <p className="text-slate-500">Welcome back, <span className="text-slate-700 font-medium">{user.username}</span>. Systems optimal.</p>
                </div>
                <motion.div
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.2 }}
                    className="hidden sm:flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-cyan-50 to-blue-50 border border-cyan-100"
                >
                    <Zap size={16} className="text-cyan-500" />
                    <span className="text-sm font-bold text-cyan-700">{user.points} XP</span>
                </motion.div>
            </header>

            <div className="grid md:grid-cols-3 gap-6">
                <div className="md:col-span-2 space-y-6">
                    {/* Stat Cards with animations */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        {[
                            {
                                label: 'Total XP',
                                value: user.points,
                                icon: <Trophy size={20} />,
                                color: 'from-amber-50 to-orange-50',
                                iconBg: 'bg-amber-100 text-amber-600',
                                border: 'border-amber-100',
                            },
                            {
                                label: 'Modules',
                                value: modulesUnlocked,
                                suffix: ` / ${totalModules}`,
                                icon: <BookOpen size={20} />,
                                color: 'from-cyan-50 to-blue-50',
                                iconBg: 'bg-cyan-100 text-cyan-600',
                                border: 'border-cyan-100',
                            },
                            {
                                label: 'Completion',
                                value: progressPct,
                                suffix: '%',
                                icon: <Target size={20} />,
                                color: 'from-purple-50 to-violet-50',
                                iconBg: 'bg-purple-100 text-purple-600',
                                border: 'border-purple-100',
                            },
                        ].map((stat, idx) => (
                            <motion.div
                                key={stat.label}
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: idx * 0.1 }}
                                className={`rounded-2xl p-5 bg-gradient-to-br ${stat.color} border ${stat.border} transition-all duration-300 hover:shadow-lg hover:-translate-y-0.5 group`}
                            >
                                <div className="flex items-center justify-between mb-3">
                                    <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{stat.label}</span>
                                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${stat.iconBg} transition-transform duration-300 group-hover:scale-110`}>
                                        {stat.icon}
                                    </div>
                                </div>
                                <div className="text-2xl font-display font-bold text-slate-900">
                                    <AnimatedNumber value={stat.value} />
                                    {stat.suffix && <span className="text-slate-400 text-lg">{stat.suffix}</span>}
                                </div>
                            </motion.div>
                        ))}
                    </div>

                    {/* Continue Learning Banner */}
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.3 }}
                        className="rounded-2xl overflow-hidden border border-black/[0.04] bg-white/80 backdrop-blur-sm shadow-sm group hover:shadow-lg transition-all duration-500"
                    >
                        <div className="h-1 bg-gradient-to-r from-cyan-400 via-blue-500 to-purple-500" />
                        <div className="p-8 flex justify-between items-center">
                            <div>
                                <div className="flex items-center gap-2 mb-2">
                                    <GraduationCap size={18} className="text-cyan-500" />
                                    <h3 className="text-xl font-bold text-slate-900 font-display">Continue Training</h3>
                                </div>
                                <p className="text-slate-500 text-sm mb-5">
                                    {modulesUnlocked >= totalModules
                                        ? "You've completed all modules. Amazing work!"
                                        : `You are on Module ${modulesUnlocked + 1}. Keep the momentum going!`
                                    }
                                </p>
                                <div className="flex items-center gap-3">
                                    <button
                                        onClick={() => navigate('/dashboard/learn')}
                                        className="btn-neo btn-neo-primary py-2.5 text-sm group/btn"
                                    >
                                        Resume Path
                                        <ChevronRight size={16} className="ml-1 group-hover/btn:translate-x-0.5 transition-transform" />
                                    </button>
                                    <button
                                        onClick={() => navigate('/dashboard/classroom')}
                                        className="btn-neo btn-neo-ghost py-2.5 text-sm"
                                    >
                                        <Sparkles size={14} className="mr-1" />
                                        AI Classroom
                                    </button>
                                </div>
                            </div>
                            <div className="hidden sm:block relative">
                                <ProgressRing progress={progressPct} size={90} strokeWidth={7} />
                                <div className="absolute inset-0 flex items-center justify-center">
                                    <span className="text-lg font-bold text-slate-700 font-display">{progressPct}%</span>
                                </div>
                            </div>
                        </div>
                    </motion.div>
                </div>

                {/* Activity Feed */}
                <motion.div
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.4 }}
                    className="rounded-2xl bg-white/80 backdrop-blur-sm border border-black/[0.04] shadow-sm overflow-hidden"
                >
                    <div className="px-5 py-3.5 border-b border-black/[0.04] flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                        <h3 className="font-bold text-xs text-slate-400 uppercase tracking-widest">Live Feed</h3>
                    </div>
                    <div className="p-5 space-y-4">
                        {[
                            { user: 'Arjun_K', topic: 'Advanced Recursion', time: '2m ago' },
                            { user: 'Priya_S', topic: 'Neural Networks', time: '5m ago' },
                            { user: 'Karthik_R', topic: 'List Comprehensions', time: '8m ago' },
                            { user: 'Meera_V', topic: 'Pandas DataFrames', time: '12m ago' },
                        ].map((item, i) => (
                            <motion.div
                                key={i}
                                initial={{ opacity: 0, x: -10 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ delay: 0.5 + i * 0.1 }}
                                className="flex gap-3 text-sm items-start"
                            >
                                <div className="w-7 h-7 rounded-full bg-gradient-to-br from-cyan-100 to-blue-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                                    <span className="text-[10px] font-bold text-cyan-600">{item.user[0]}</span>
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-slate-600">
                                        <span className="text-slate-800 font-semibold">{item.user}</span> completed{' '}
                                        <span className="text-cyan-600 font-medium">{item.topic}</span>
                                    </p>
                                    <p className="text-[10px] text-slate-400 mt-0.5">{item.time}</p>
                                </div>
                            </motion.div>
                        ))}
                    </div>
                </motion.div>
            </div>

            <style>{`
                @keyframes shimmer {
                    0% { background-position: 200% 0; }
                    100% { background-position: -200% 0; }
                }
            `}</style>
        </div>
    );
}

// ─── Learning Map ──────────────────────────────────────────────────────────
export function LearningMap() {
    const { user } = useAuth();
    const [modules, setModules] = useState([]);
    const [loading, setLoading] = useState(true);
    const navigate = useNavigate();

    useEffect(() => { document.title = 'Learning Path — PyMasters'; }, []);
    useEffect(() => {
        getModules()
            .then(res => setModules(res.data))
            .catch(err => console.error(err))
            .finally(() => setLoading(false));
    }, []);

    const isUnlocked = (id) => (user.unlocked || []).includes(id) || id === "module_1";
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
                    <p className="text-slate-500">Complete each module sequentially to unlock the next.</p>
                </div>
                <div className="text-right hidden sm:block">
                    <div className="text-xs text-slate-400 font-bold uppercase tracking-widest mb-1">Progress</div>
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
                                        {unlocked ? <CheckCircle2 size={18} /> : idx + 1}
                                    </div>
                                    <div>
                                        <h3 className={clsx(
                                            "text-lg font-bold mb-0.5 transition-colors font-display",
                                            unlocked ? "text-slate-800 group-hover:text-cyan-600" : "text-slate-500"
                                        )}>{mod.title}</h3>
                                        <p className="text-sm text-slate-400 max-w-xl line-clamp-1">{mod.desc}</p>
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
    const [quizMode, setQuizMode] = useState(false);
    const [answers, setAnswers] = useState({});
    const [result, setResult] = useState(null);

    useEffect(() => {
        getModule(id).then(res => {
            setModule(res.data);
            document.title = res.data.title + ' — PyMasters';
        }).catch(() => navigate('/dashboard/learn'));
    }, [id, navigate]);

    if (!module) return (
        <div className="flex flex-col items-center justify-center h-64 gap-3">
            <div className="w-10 h-10 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-slate-400">Loading module...</p>
        </div>
    );

    const handleQuizSubmit = async () => {
        let correctCount = 0;
        module.quiz.forEach((q, idx) => {
            if (answers[idx] === q.correct) correctCount++;
        });

        const passed = correctCount === module.quiz.length;

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
                className="mb-6 flex items-center gap-2 text-sm text-slate-400 hover:text-slate-700 transition-colors group"
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
                                    <button onClick={() => setQuizMode(true)} className="btn-neo btn-neo-primary gap-2">
                                        Start Quiz
                                        <ChevronRight size={18} />
                                    </button>
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
                                    <div className="flex justify-between text-[10px] text-slate-400 font-mono mb-1">
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
                                                    <span className="text-sm text-slate-400 font-mono mt-0.5">{qIdx + 1}.</span>
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
