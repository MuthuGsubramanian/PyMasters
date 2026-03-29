import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { motion, AnimatePresence } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import AnimationRenderer from '../components/animations/AnimationRenderer';
import ChatBar from '../components/ChatBar';
import api, { getAuthHeaders, requestModule, getCompletions, recordSignal } from '../api';
import VaathiyaarMessage from '../components/VaathiyaarMessage';
import {
    BookOpen, ChevronRight, Play, RotateCcw, Lock,
    Sparkles, Trophy, ArrowLeft, Zap, Star, Code2, Brain, Layers, MessageSquare,
    Bot, Gamepad2, Wrench, Globe2, Cpu, Volume2, VolumeX
} from 'lucide-react';
import ErrorBoundary from '../components/ErrorBoundary';
import ExecutionVisualizer from '../components/animations/ExecutionVisualizer';
import FlowDiagram from '../components/animations/FlowDiagram';
import LoopVisualizer from '../components/animations/LoopVisualizer';
import PythonEditor from '../components/PythonEditor';
import OutputPanel from '../components/OutputPanel';
import useTTS from '../hooks/useTTS';
import TTSControls from '../components/TTSControls';

// ──────────────────────────────────────────────────────────────────────────────
// Thinking bubble — animated dots while Vaathiyaar processes
// ──────────────────────────────────────────────────────────────────────────────
function ThinkingBubble() {
    return (
        <div className="flex items-center gap-1.5 px-4 py-3">
            <div className="w-2 h-2 bg-purple-400 rounded-full animate-bounce" style={{animationDelay: '0ms'}} />
            <div className="w-2 h-2 bg-purple-400 rounded-full animate-bounce" style={{animationDelay: '150ms'}} />
            <div className="w-2 h-2 bg-purple-400 rounded-full animate-bounce" style={{animationDelay: '300ms'}} />
            <span className="text-sm text-purple-500 ml-2">Vaathiyaar is thinking...</span>
        </div>
    );
}

// ──────────────────────────────────────────────────────────────────────────────
// Markdown components
// ──────────────────────────────────────────────────────────────────────────────
const markdownComponents = {
    h2: ({children}) => <h2 className="text-base font-bold text-slate-900 dark:text-slate-100 mt-3 mb-1">{children}</h2>,
    h3: ({children}) => <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200 mt-2 mb-1">{children}</h3>,
    p: ({children}) => <p className="text-sm text-slate-700 dark:text-slate-200 mb-2">{children}</p>,
    ul: ({children}) => <ul className="list-disc list-inside text-sm text-slate-700 dark:text-slate-200 mb-2 space-y-1">{children}</ul>,
    ol: ({children}) => <ol className="list-decimal list-inside text-sm text-slate-700 dark:text-slate-200 mb-2 space-y-1">{children}</ol>,
    code: ({children, className}) => className
        ? <pre className="bg-slate-800 text-slate-200 p-3 rounded-lg text-xs font-mono overflow-x-auto my-2"><code>{children}</code></pre>
        : <code className="bg-slate-100 dark:bg-slate-700 text-purple-700 dark:text-purple-300 px-1.5 py-0.5 rounded text-xs font-mono">{children}</code>,
    table: ({children}) => (
        <div className="overflow-x-auto my-3 rounded-lg border border-slate-200 dark:border-slate-700">
            <table className="text-sm w-full">{children}</table>
        </div>
    ),
    thead: ({children}) => <thead className="bg-purple-50 dark:bg-purple-900/30">{children}</thead>,
    tbody: ({children}) => <tbody className="divide-y divide-slate-100 dark:divide-slate-700">{children}</tbody>,
    tr: ({children}) => <tr className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">{children}</tr>,
    th: ({children}) => (
        <th className="px-3 py-2 text-left text-xs font-bold text-purple-700 dark:text-purple-300 uppercase tracking-wider">{children}</th>
    ),
    td: ({children}) => (
        <td className="px-3 py-2 text-sm text-slate-700 dark:text-slate-200">{children}</td>
    ),
    strong: ({children}) => <strong className="font-bold text-slate-900 dark:text-slate-100">{children}</strong>,
};

function resolveText(obj, language = 'en') {
    if (!obj) return '';
    if (typeof obj === 'string') return obj;
    return obj[language] || obj.en || Object.values(obj)[0] || '';
}

// ──────────────────────────────────────────────────────────────────────────────
// Track metadata
// ──────────────────────────────────────────────────────────────────────────────
const TRACK_META = {
    python_fundamentals: {
        name: 'Python Fundamentals',
        icon: <Code2 size={16} />,
        accent: '#06b6d4',
        gradient: 'from-cyan-500/10 to-blue-500/5',
    },
    ai_ml_foundations: {
        name: 'AI/ML Foundations',
        icon: <Brain size={16} />,
        accent: '#7c3aed',
        gradient: 'from-purple-500/10 to-violet-500/5',
    },
    deep_learning: {
        name: 'Deep Learning & Neural Networks',
        icon: <Layers size={16} />,
        accent: '#f59e0b',
        gradient: 'from-amber-500/10 to-orange-500/5',
    },
    fun_automation: {
        name: 'Fun & Automation',
        icon: <Wrench size={16} />,
        accent: '#f97316',
        gradient: 'from-orange-500/10 to-amber-500/5',
    },
    python_intermediate: {
        name: 'Python Intermediate',
        icon: <Code2 size={16} />,
        accent: '#8b5cf6',
        gradient: 'from-violet-500/10 to-purple-500/5',
    },
    web_development: {
        name: 'Web Development',
        icon: <Globe2 size={16} />,
        accent: '#3b82f6',
        gradient: 'from-blue-500/10 to-indigo-500/5',
    },
    dsa: {
        name: 'Data Structures & Algorithms',
        icon: <Cpu size={16} />,
        accent: '#ec4899',
        gradient: 'from-pink-500/10 to-rose-500/5',
    },
    ai_fundamentals: {
        name: 'AI Fundamentals',
        icon: <Bot size={16} />,
        accent: '#6366f1',
        gradient: 'from-indigo-500/10 to-violet-500/5',
    },
    machine_learning: {
        name: 'Machine Learning',
        icon: <Brain size={16} />,
        accent: '#7c3aed',
        gradient: 'from-purple-500/10 to-violet-500/5',
    },
    deep_learning_complete: {
        name: 'Deep Learning & Neural Networks',
        icon: <Layers size={16} />,
        accent: '#f59e0b',
        gradient: 'from-amber-500/10 to-orange-500/5',
    },
    testing_devops: {
        name: 'Testing & DevOps',
        icon: <Zap size={16} />,
        accent: '#10b981',
        gradient: 'from-emerald-500/10 to-green-500/5',
    },
    generated: {
        name: 'Custom Modules',
        icon: <Sparkles size={16} />,
        accent: '#10b981',
        gradient: 'from-emerald-500/10 to-green-500/5',
    },
};

const DEFAULT_TRACK_ORDER = [
    'python_fundamentals', 'python_intermediate', 'fun_automation',
    'web_development', 'dsa',
    'ai_fundamentals', 'ai_ml_foundations', 'machine_learning',
    'deep_learning', 'deep_learning_complete',
    'testing_devops', 'generated'
];

const PROFILE_WELCOME = {
    hobby: {
        title: 'Your Fun & Automation Lab',
        subtitle: 'Build cool scripts, automate boring stuff, and have fun with Python!',
        icon: <Gamepad2 size={14} />,
        color: 'border-orange-200 bg-orange-50 text-orange-600',
    },
    ai_ml: {
        title: 'Your AI & Data Science Path',
        subtitle: 'Master the tools that power intelligent machines and data analysis.',
        icon: <Bot size={14} />,
        color: 'border-purple-200 bg-purple-50 text-purple-600',
    },
    career: {
        title: 'Your Career Accelerator',
        subtitle: 'Build a rock-solid Python foundation for your professional growth.',
        icon: <Zap size={14} />,
        color: 'border-cyan-200 bg-cyan-50 text-cyan-600',
    },
    general: {
        title: 'Your Learning Journey',
        subtitle: 'Explore Python from fundamentals to advanced topics at your own pace.',
        icon: <BookOpen size={14} />,
        color: 'border-purple-200 bg-purple-50 text-purple-600',
    },
};

// ──────────────────────────────────────────────────────────────────────────────
// Phase: select — lesson list grouped by track
// ──────────────────────────────────────────────────────────────────────────────
function LessonSelect({ lessons, onSelectLesson, loading, language, profileHint = 'general', primaryTracks = null, completedLessons = new Set() }) {
    const [expandedTrack, setExpandedTrack] = useState(null);

    const grouped = {};
    lessons.forEach((lesson) => {
        const track = lesson.track || 'other';
        if (!grouped[track]) grouped[track] = [];
        grouped[track].push(lesson);
    });

    // Use backend-provided track order if available, otherwise default
    const trackOrder = primaryTracks && primaryTracks.length > 0
        ? [...primaryTracks, ...DEFAULT_TRACK_ORDER.filter(t => !primaryTracks.includes(t))]
        : DEFAULT_TRACK_ORDER;

    const presentTracks = trackOrder.filter((t) => grouped[t]?.length > 0);
    Object.keys(grouped).forEach((t) => {
        if (!presentTracks.includes(t)) presentTracks.push(t);
    });

    const welcome = PROFILE_WELCOME[profileHint] || PROFILE_WELCOME.general;

    // Auto-expand first track
    useEffect(() => {
        if (presentTracks.length > 0 && !expandedTrack) {
            setExpandedTrack(presentTracks[0]);
        }
    }, [presentTracks.length]);

    // Track description map for card subtitles
    const TRACK_DESCRIPTIONS = {
        python_fundamentals: 'Variables, loops, functions, and core syntax',
        python_intermediate: 'OOP, decorators, generators, and beyond',
        fun_automation: 'Scripts, bots, and automating daily tasks',
        web_development: 'Flask, APIs, HTML, and full-stack basics',
        dsa: 'Arrays, trees, graphs, and algorithm patterns',
        ai_fundamentals: 'Core AI concepts, search, and reasoning',
        ai_ml_foundations: 'Statistics, pandas, and ML pipelines',
        machine_learning: 'Regression, classification, and clustering',
        deep_learning: 'Neural networks, CNNs, and training loops',
        deep_learning_complete: 'Advanced architectures and fine-tuning',
        testing_devops: 'Pytest, CI/CD, Docker, and deployment',
        generated: 'Custom lessons created just for you',
    };

    return (
        <div className="animate-fade-in space-y-8 max-w-6xl mx-auto">
            <header className="space-y-3">
                <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full border text-xs font-bold tracking-wider uppercase ${welcome.color}`}>
                    {welcome.icon}
                    Classroom
                </div>
                <h1 className="text-3xl font-bold font-display text-slate-900">{welcome.title}</h1>
                <p className="text-slate-400">{welcome.subtitle}</p>
            </header>

            {loading ? (
                <div className="flex flex-col items-center justify-center h-40 gap-3">
                    <div className="w-10 h-10 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
                    <p className="text-sm text-slate-300">Loading your lessons...</p>
                </div>
            ) : lessons.length === 0 ? (
                <div className="panel rounded-2xl p-10 text-center space-y-3">
                    <BookOpen size={32} className="mx-auto text-purple-400" />
                    <p className="text-slate-600 dark:text-slate-200 font-medium">Your lessons are being prepared.</p>
                    <p className="text-slate-400 text-sm">Ask Vaathiyaar to teach you a topic using the chat below!</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                    {presentTracks.map((track) => {
                        const meta = TRACK_META[track] || { name: track, icon: <BookOpen size={16} />, accent: '#64748b', gradient: 'from-slate-100 to-slate-50' };
                        const isExpanded = expandedTrack === track;
                        const lessonsInTrack = grouped[track];
                        const trackDesc = TRACK_DESCRIPTIONS[track] || `${lessonsInTrack.length} lessons to explore`;
                        const completedCount = lessonsInTrack.filter(l => completedLessons.has(l.id)).length;

                        return (
                            <motion.div
                                key={track}
                                layout
                                className="rounded-2xl border border-white/[0.06] overflow-hidden bg-white/60 dark:bg-[#0f172a]/60 backdrop-blur-xl shadow-sm hover:shadow-md transition-shadow duration-300 flex flex-col"
                            >
                                {/* Gradient accent bar */}
                                <div className="h-[2px]" style={{ background: `linear-gradient(90deg, ${meta.accent}, ${meta.accent}66)` }} />

                                {/* Track card header - clickable */}
                                <button
                                    onClick={() => setExpandedTrack(isExpanded ? null : track)}
                                    className={`w-full px-5 py-4 text-left transition-all duration-300 hover:bg-white/80 dark:hover:bg-white/[0.04] ${
                                        isExpanded ? 'bg-white/80 dark:bg-white/[0.04]' : ''
                                    }`}
                                >
                                    <div className="flex items-center gap-3 mb-2">
                                        <div className="w-9 h-9 rounded-xl flex items-center justify-center shadow-sm"
                                            style={{ background: `${meta.accent}18`, color: meta.accent }}>
                                            {meta.icon}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <h2 className="text-sm font-bold text-slate-800 dark:text-slate-100 truncate">{meta.name}</h2>
                                        </div>
                                        <ChevronRight
                                            size={16}
                                            className={`text-slate-400 transition-transform duration-300 flex-shrink-0 ${isExpanded ? 'rotate-90' : ''}`}
                                        />
                                    </div>
                                    <p className="text-xs text-slate-400 dark:text-slate-400 line-clamp-2 mb-3">{trackDesc}</p>
                                    <div className="flex items-center gap-2">
                                        <span className="text-[10px] font-bold px-2.5 py-1 rounded-full"
                                            style={{ background: `${meta.accent}12`, color: meta.accent }}>
                                            {lessonsInTrack.length} lessons
                                        </span>
                                        {completedCount > 0 && (
                                            <span className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-green-50 text-green-600 border border-green-200">
                                                {completedCount}/{lessonsInTrack.length} done
                                            </span>
                                        )}
                                    </div>
                                </button>

                                {/* Lessons grid - collapsible inside card */}
                                <AnimatePresence>
                                    {isExpanded && (
                                        <motion.div
                                            initial={{ height: 0, opacity: 0 }}
                                            animate={{ height: 'auto', opacity: 1 }}
                                            exit={{ height: 0, opacity: 0 }}
                                            transition={{ duration: 0.3, ease: 'easeInOut' }}
                                            className="overflow-hidden border-t border-black/[0.04] dark:border-white/[0.06]"
                                        >
                                            <div className="p-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
                                                {lessonsInTrack.map((lesson, idx) => {
                                                    const isLocked = lesson.recommended === false;
                                                    const isCompleted = completedLessons.has(lesson.id);
                                                    return (
                                                        <motion.button
                                                            key={lesson.id}
                                                            initial={{ opacity: 0, y: 6 }}
                                                            animate={{ opacity: 1, y: 0 }}
                                                            transition={{ delay: idx * 0.03 }}
                                                            onClick={() => !isLocked && onSelectLesson(lesson)}
                                                            title={isLocked ? 'Complete earlier modules first' : resolveText(lesson.title, language)}
                                                            className={`relative text-left rounded-xl p-3 group transition-all duration-300 border ${
                                                                isLocked
                                                                    ? 'opacity-40 cursor-not-allowed border-slate-200/50 dark:border-white/[0.04]'
                                                                    : isCompleted
                                                                    ? 'border-green-200 dark:border-green-500/20 bg-green-50/50 dark:bg-green-500/5 hover:shadow-sm cursor-pointer'
                                                                    : lesson.recommended === true
                                                                    ? 'border-purple-200 dark:border-purple-500/20 bg-purple-50/40 dark:bg-purple-500/5 hover:shadow-sm cursor-pointer'
                                                                    : 'border-slate-200/60 dark:border-white/[0.06] bg-white/40 dark:bg-white/[0.02] hover:bg-white/80 dark:hover:bg-white/[0.04] hover:shadow-sm cursor-pointer'
                                                            }`}
                                                        >
                                                            <div className="flex items-start gap-2.5">
                                                                {/* Lesson number badge */}
                                                                <div className={`flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center text-[11px] font-bold ${
                                                                    isLocked
                                                                        ? 'bg-slate-100 dark:bg-slate-800 text-slate-400'
                                                                        : isCompleted
                                                                        ? 'bg-green-100 dark:bg-green-500/20 text-green-600'
                                                                        : 'text-white'
                                                                }`}
                                                                    style={!isLocked && !isCompleted ? { background: meta.accent } : {}}
                                                                >
                                                                    {isLocked ? <Lock size={12} /> : isCompleted ? '✓' : idx + 1}
                                                                </div>
                                                                <div className="flex-1 min-w-0">
                                                                    {/* Title */}
                                                                    <p className={`font-semibold text-xs leading-tight truncate ${
                                                                        isLocked ? 'text-slate-400' : 'text-slate-800 dark:text-slate-100 group-hover:text-purple-600'
                                                                    }`}>
                                                                        {resolveText(lesson.title, language)}
                                                                    </p>
                                                                    {/* Meta row: difficulty + XP */}
                                                                    <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                                                                        {lesson.difficulty && (
                                                                            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full border ${
                                                                                lesson.difficulty === 'easy' ? 'text-green-600 bg-green-50 border-green-200' :
                                                                                lesson.difficulty === 'medium' ? 'text-amber-600 bg-amber-50 border-amber-200' :
                                                                                'text-red-600 bg-red-50 border-red-200'
                                                                            }`}>
                                                                                {lesson.difficulty}
                                                                            </span>
                                                                        )}
                                                                        {lesson.xp_reward != null && (
                                                                            <span className={`text-[9px] font-bold rounded-full px-1.5 py-0.5 border ${
                                                                                isLocked
                                                                                    ? 'text-slate-400 bg-slate-50 border-slate-200'
                                                                                    : 'text-amber-600 bg-amber-50 border-amber-200'
                                                                            }`}>
                                                                                +{lesson.xp_reward} XP
                                                                            </span>
                                                                        )}
                                                                        {lesson.generated && (
                                                                            <span className="text-[9px] font-bold text-purple-600 bg-purple-50 border border-purple-200 rounded-full px-1.5 py-0.5">
                                                                                Custom
                                                                            </span>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                                {/* Start arrow / completed check */}
                                                                <div className="flex-shrink-0 mt-0.5">
                                                                    {isCompleted ? (
                                                                        <div className="w-6 h-6 rounded-full bg-green-100 dark:bg-green-500/20 flex items-center justify-center">
                                                                            <span className="text-green-600 text-xs font-bold">✓</span>
                                                                        </div>
                                                                    ) : !isLocked ? (
                                                                        <div className="w-6 h-6 rounded-full bg-slate-100 dark:bg-white/[0.06] flex items-center justify-center group-hover:bg-purple-100 dark:group-hover:bg-purple-500/20 transition-colors">
                                                                            <Play size={10} className="text-slate-400 group-hover:text-purple-500 transition-colors" />
                                                                        </div>
                                                                    ) : null}
                                                                </div>
                                                            </div>
                                                        </motion.button>
                                                    );
                                                })}
                                            </div>
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </motion.div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

// ──────────────────────────────────────────────────────────────────────────────
// Phase: intro — animated story sequence (DARK CINEMA MODE)
// ──────────────────────────────────────────────────────────────────────────────
function IntroPhase({ lesson, language, onComplete, username }) {
    const storyContent =
        lesson.active_story || resolveText(lesson.story_variants, language);

    const speedMultiplier = lesson.speed_multiplier ?? 1.0;
    const sequence = Array.isArray(lesson.animation_sequence) ? lesson.animation_sequence : [];

    // Animation replay key — increment to re-mount and replay all animations
    const [animKey, setAnimKey] = useState(0);
    const replayAnimations = () => setAnimKey(k => k + 1);

    // Extract visual flow components DIRECTLY (bypass AnimationRenderer)
    const visualFlowTypes = new Set(['ExecutionVisualizer', 'execution_visualizer', 'FlowDiagram', 'flow_diagram', 'LoopVisualizer', 'loop_visualizer']);
    const visualFlowItems = sequence.filter(s => visualFlowTypes.has(s.type));

    // Extract story/concept map for the left column
    const storyPrimitives = sequence.filter(s =>
        s.type === 'StoryCard' || s.type === 'ConceptMap'
    );

    // Legacy animation primitives (CodeStepper, VariableBox, etc.) — NOT visual flow
    const legacyAnimPrimitives = sequence.filter(s =>
        s.type !== 'StoryCard' && s.type !== 'ConceptMap' && s.type !== 'ParticleEffect'
        && !visualFlowTypes.has(s.type)
    );

    // Find specific visual flow items
    const executionViz = visualFlowItems.find(i => i.type === 'ExecutionVisualizer' || i.type === 'execution_visualizer');
    const flowDiagram = visualFlowItems.find(i => i.type === 'FlowDiagram' || i.type === 'flow_diagram');
    const loopViz = visualFlowItems.find(i => i.type === 'LoopVisualizer' || i.type === 'loop_visualizer');

    return (
        <div className="animate-fade-in space-y-6">
            {/* ── Row 1: Vaathiyaar — full width horizontal ── */}
            <div className="rounded-2xl bg-gradient-to-r from-slate-50 to-white dark:from-[#0f172a] dark:to-[#131c2e] p-5 lg:p-6">
                <div className="flex items-start gap-4">
                    <div className="flex-shrink-0 w-11 h-11 rounded-full bg-gradient-to-br from-purple-500 to-cyan-500 flex items-center justify-center text-lg shadow-lg shadow-purple-500/20">{'\u{1F9D1}\u200D\u{1F3EB}'}</div>
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-3 mb-2">
                            <span className="text-slate-900 dark:text-white font-bold text-sm">Vaathiyaar</span>
                            <span className="text-emerald-500 text-[10px] font-medium">Teaching</span>
                            <div className="ml-auto flex items-center gap-3">
                                <h2 className="text-sm font-bold font-display text-slate-900 dark:text-white hidden sm:block">
                                    {resolveText(lesson.active_title || lesson.title, language)}
                                </h2>
                                {lesson.xp_reward && (
                                    <span className="text-amber-500 text-[10px] font-bold bg-amber-50 dark:bg-amber-500/10 px-2.5 py-0.5 rounded-full">+{lesson.xp_reward} XP</span>
                                )}
                                <button onClick={replayAnimations} className="flex items-center gap-1 text-[10px] text-slate-400 hover:text-cyan-500 transition-colors">
                                    <RotateCcw size={12} /> Replay
                                </button>
                            </div>
                        </div>
                        <div className="text-sm text-slate-700 dark:text-slate-200 leading-relaxed max-h-[200px] overflow-y-auto pr-2">
                            {storyPrimitives.length > 0 ? (
                                <AnimationRenderer
                                    key={`story-${animKey}`}
                                    sequence={storyPrimitives}
                                    storyContent={storyContent}
                                    speedMultiplier={speedMultiplier}
                                    language={language}
                                />
                            ) : storyContent ? (
                                <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>{storyContent}</ReactMarkdown>
                            ) : null}
                        </div>
                    </div>
                </div>
            </div>

            {/* ── Row 2: Two columns — Code Execution + Flow ── */}
            <div className="flex flex-col lg:flex-row gap-6">

                {/* Left: Code & Step-by-Step Execution (bigger) */}
                <div className="flex-1 min-w-0">
                    <div className="rounded-xl bg-[#0d1117] overflow-hidden shadow-xl">
                        {/* Terminal header */}
                        <div className="flex items-center gap-2 px-4 py-2.5 bg-[#161b22]">
                            <span className="w-3 h-3 rounded-full bg-red-500/80" />
                            <span className="w-3 h-3 rounded-full bg-yellow-500/80" />
                            <span className="w-3 h-3 rounded-full bg-green-500/80" />
                            <span className="ml-3 text-[11px] text-slate-400 font-mono">step-by-step execution</span>
                            <span className="ml-auto flex items-center gap-1.5 text-green-400 text-[10px]">
                                <span className="relative flex h-1.5 w-1.5"><span className="animate-ping absolute h-full w-full rounded-full bg-green-400 opacity-60" /><span className="relative rounded-full h-1.5 w-1.5 bg-green-400" /></span>
                                running
                            </span>
                        </div>
                        <div className="p-5 overflow-y-auto max-h-[500px]">
                            {loopViz && (
                                <div className="mb-5">
                                    <LoopVisualizer
                                        key={`loop-${animKey}`}
                                        loopType={loopViz.loopType || 'for'}
                                        collection={loopViz.collection}
                                        variable={loopViz.variable || 'i'}
                                        rangeStart={loopViz.rangeStart ?? 0}
                                        rangeEnd={loopViz.rangeEnd ?? 5}
                                        rangeStep={loopViz.rangeStep ?? 1}
                                        iterations={loopViz.iterations || []}
                                        code={loopViz.code || ''}
                                        speed={loopViz.speed || 'normal'}
                                    />
                                </div>
                            )}
                            {executionViz && (
                                <div className="mb-5">
                                    <ExecutionVisualizer
                                        key={`exec-${animKey}`}
                                        code={executionViz.code || ''}
                                        executionSteps={executionViz.executionSteps || []}
                                        speed={executionViz.speed || 'normal'}
                                    />
                                </div>
                            )}
                            {legacyAnimPrimitives.length > 0 && (
                                <AnimationRenderer
                                    key={`legacy-${animKey}`}
                                    sequence={legacyAnimPrimitives}
                                    storyContent={storyContent}
                                    speedMultiplier={speedMultiplier}
                                    language={language}
                                />
                            )}
                            {!loopViz && !executionViz && legacyAnimPrimitives.length === 0 && storyContent && (
                                <div className="text-sm text-slate-300 leading-relaxed">
                                    <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>{storyContent}</ReactMarkdown>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Right: Execution Flow */}
                <div className="lg:w-[300px] lg:flex-shrink-0">
                    <div className="text-xs font-bold text-slate-600 dark:text-slate-400 uppercase tracking-widest mb-4">Execution Flow</div>
                    <div className="overflow-y-auto max-h-[500px] space-y-5">
                        {flowDiagram ? (
                            <FlowDiagram
                                key={`flow-${animKey}`}
                                nodes={flowDiagram.nodes || []}
                                edges={flowDiagram.edges || []}
                                executionPath={flowDiagram.executionPath || []}
                                variables={flowDiagram.variables || {}}
                                speed={flowDiagram.speed || 'normal'}
                            />
                        ) : (
                            <p className="text-xs text-slate-400 italic">No flow diagram for this lesson</p>
                        )}
                        {(executionViz || loopViz) && (
                            <div className="pt-3 border-t border-slate-200 dark:border-white/[0.06] space-y-1.5 text-xs text-slate-500 dark:text-slate-400">
                                {executionViz && <p>{(executionViz.executionSteps || []).length} execution steps</p>}
                                {loopViz && <p>{loopViz.loopType || 'for'} loop &middot; {(loopViz.iterations || []).length} iterations</p>}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* ── Start Practice ── */}
            <button
                onClick={onComplete}
                className="w-full py-3.5 text-sm font-bold rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 text-white shadow-lg shadow-cyan-500/20 hover:shadow-xl hover:scale-[1.01] transition-all duration-300 flex items-center justify-center gap-2"
            >
                <Play size={16} fill="currentColor" />
                Start Practice
            </button>
        </div>
    );
}

// ──────────────────────────────────────────────────────────────────────────────
// Phase: practice — code challenge
// ──────────────────────────────────────────────────────────────────────────────
function PracticePhase({
    lesson,
    language,
    code,
    setCode,
    output,
    hintIndex,
    onHint,
    onRun,
    running,
    chatMessages,
    executionTime,
    onClearOutput,
}) {
    const challenge = lesson?.practice_challenges?.[0] ?? null;
    const instruction = challenge
        ? resolveText(challenge?.instruction, language)
        : resolveText(lesson?.challenge_instruction, language) ||
          'Write your solution below.';

    return (
        <div className="animate-fade-in max-w-4xl mx-auto space-y-5">
            {/* Vaathiyaar instruction panel */}
            <div className="panel rounded-2xl p-5 border-l-4 border-l-purple-400 flex items-start gap-4">
                <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-cyan-500 flex items-center justify-center text-lg select-none shadow-lg shadow-purple-500/20">
                    {'\u{1F9D1}\u200D\u{1F3EB}'}
                </div>
                <div className="space-y-1 flex-1">
                    <div className="flex items-center gap-2">
                        <p className="text-xs font-bold uppercase tracking-widest text-purple-500">Challenge</p>
                        <Zap size={12} className="text-amber-400" />
                    </div>
                    <p className="text-slate-700 dark:text-slate-200 leading-relaxed">{instruction}</p>
                </div>
            </div>

            {/* Hint messages */}
            {chatMessages?.filter((m) => m.role === 'assistant' && m._isHint).map((m, i) => (
                <motion.div
                    key={i}
                    initial={{ opacity: 0, y: 6, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    className="panel rounded-xl p-4 border border-amber-200 bg-amber-50/80 flex items-start gap-3"
                >
                    <span className="text-amber-500 text-lg">💡</span>
                    <p className="text-slate-600 dark:text-slate-300 text-sm leading-relaxed">{m.content}</p>
                </motion.div>
            ))}

            {/* Code editor + output — same pattern as Playground */}
            <div className="rounded-2xl overflow-hidden border border-slate-700/30 bg-[#0d1117] shadow-xl">
                {/* Terminal header */}
                <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-700/50 bg-[#161b22]">
                    <div className="flex items-center gap-2">
                        <div className="flex items-center gap-1.5">
                            <span className="w-2.5 h-2.5 rounded-full bg-[#ff5f57]" />
                            <span className="w-2.5 h-2.5 rounded-full bg-[#febc2e]" />
                            <span className="w-2.5 h-2.5 rounded-full bg-[#28c840]" />
                        </div>
                        <span className="text-[11px] font-mono text-slate-400 ml-2">solution.py</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="text-[10px] text-slate-600 font-mono hidden sm:inline">Ctrl+Enter</span>
                        <button
                            onClick={onRun}
                            disabled={running || !code?.trim()}
                            className="flex items-center gap-1.5 text-[10px] font-bold text-white rounded-xl px-4 py-1.5 transition-all duration-300 bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-400 hover:to-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed border border-green-500/20"
                        >
                            {running ? (
                                <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                            ) : (
                                <Play size={11} fill="currentColor" />
                            )}
                            {running ? 'Running...' : 'Run Code'}
                        </button>
                    </div>
                </div>

                {/* Editor */}
                <PythonEditor
                    value={code || ''}
                    onChange={(val) => setCode(val)}
                    onRun={onRun}
                    height="220px"
                    placeholder="# Write your code here..."
                />

                {/* Output panel — always visible */}
                <div className="border-t border-slate-700/50" style={{ minHeight: '60px', maxHeight: '200px' }}>
                    <OutputPanel
                        output={output || ''}
                        error=""
                        running={running}
                        executionTime={executionTime}
                        onClear={onClearOutput || (() => {})}
                    />
                </div>
            </div>

            {/* Hint button */}
            {challenge?.hints?.length > 0 && (
                <div className="flex justify-end">
                    <button
                        onClick={onHint}
                        className="btn-neo btn-neo-ghost text-sm py-2 px-4 gap-1.5"
                    >
                        💡 Need a hint?
                        {hintIndex > 0 && (
                            <span className="ml-1.5 text-xs text-slate-400">
                                ({hintIndex}/{challenge.hints.length})
                            </span>
                        )}
                    </button>
                </div>
            )}
        </div>
    );
}

// ──────────────────────────────────────────────────────────────────────────────
// Phase: feedback — evaluation result with celebration
// ──────────────────────────────────────────────────────────────────────────────
function FeedbackPhase({ evalResult, language, onContinue, onRetry }) {
    const success = evalResult?.passed ?? evalResult?.success ?? false;
    const feedbackMsg =
        evalResult?.feedback?.message ||
        resolveText(evalResult?.feedback, language) ||
        (success ? 'Great job!' : 'Keep trying — you can do it!');

    const rawAnimation = evalResult?.feedback?.animation;
    const animationSeq = Array.isArray(rawAnimation) ? rawAnimation : null;

    return (
        <div className="animate-fade-in max-w-4xl mx-auto space-y-6">
            {animationSeq && animationSeq.length > 0 && (
                <AnimationRenderer
                    sequence={animationSeq}
                    storyContent=""
                    language={language}
                />
            )}

            {/* Success celebration or retry panel */}
            <motion.div
                initial={{ opacity: 0, y: 20, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ duration: 0.5, ease: 'backOut' }}
                className={`rounded-2xl overflow-hidden border ${
                    success
                        ? 'border-green-200 shadow-lg shadow-green-100/30'
                        : 'border-red-200 shadow-lg shadow-red-100/30'
                }`}
            >
                {/* Success/failure header */}
                <div className={`px-6 py-4 flex items-center gap-3 ${
                    success
                        ? 'bg-gradient-to-r from-green-50 to-emerald-50'
                        : 'bg-gradient-to-r from-red-50 to-orange-50'
                }`}>
                    {success ? (
                        <>
                            <div className="w-10 h-10 rounded-xl bg-green-500 flex items-center justify-center text-white shadow-lg shadow-green-500/30">
                                <Trophy size={20} />
                            </div>
                            <div>
                                <p className="font-bold text-green-700 font-display">Excellent Work!</p>
                                <p className="text-xs text-green-600/70">You nailed this challenge</p>
                            </div>
                            <div className="ml-auto flex items-center gap-1">
                                {[...Array(3)].map((_, i) => (
                                    <motion.div
                                        key={i}
                                        initial={{ opacity: 0, scale: 0 }}
                                        animate={{ opacity: 1, scale: 1 }}
                                        transition={{ delay: 0.3 + i * 0.15, type: 'spring', stiffness: 500 }}
                                    >
                                        <Star size={18} className="text-amber-400 fill-amber-400" />
                                    </motion.div>
                                ))}
                            </div>
                        </>
                    ) : (
                        <>
                            <div className="w-10 h-10 rounded-xl bg-red-500 flex items-center justify-center text-white shadow-lg shadow-red-500/30">
                                <RotateCcw size={20} />
                            </div>
                            <div>
                                <p className="font-bold text-red-700 font-display">Not Quite Right</p>
                                <p className="text-xs text-red-600/70">Review the feedback and try again</p>
                            </div>
                        </>
                    )}
                </div>

                {/* Feedback body */}
                <div className="panel border-0 rounded-none p-6 space-y-4">
                    <div className="flex items-start gap-3">
                        <div className="flex-shrink-0 w-9 h-9 rounded-xl bg-gradient-to-br from-purple-500 to-cyan-500 flex items-center justify-center text-sm select-none shadow-md">
                            {'\u{1F9D1}\u200D\u{1F3EB}'}
                        </div>
                        <div className="text-slate-700 dark:text-slate-200 leading-relaxed flex-1">
                            <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                                {feedbackMsg}
                            </ReactMarkdown>
                        </div>
                    </div>

                    {evalResult?.output && (
                        <pre className="p-3 bg-slate-800 rounded-lg font-mono text-xs text-slate-300 whitespace-pre-wrap max-h-32 overflow-auto border border-slate-700">
                            {evalResult.output}
                        </pre>
                    )}

                    <div className="flex gap-3 pt-2">
                        {success ? (
                            <button
                                onClick={onContinue}
                                className="btn-neo btn-neo-primary flex items-center gap-2 py-2.5"
                            >
                                Continue <ChevronRight size={16} />
                            </button>
                        ) : (
                            <button
                                onClick={onRetry}
                                className="btn-neo btn-neo-ghost flex items-center gap-2 py-2.5"
                            >
                                <RotateCcw size={15} /> Try Again
                            </button>
                        )}
                    </div>
                </div>
            </motion.div>
        </div>
    );
}

// ──────────────────────────────────────────────────────────────────────────────
// Main Classroom page
// ──────────────────────────────────────────────────────────────────────────────
export default function Classroom() {
    const { user } = useAuth();

    useEffect(() => { document.title = 'Classroom — PyMasters'; }, []);

    const [profile, setProfile] = useState(null);
    useEffect(() => {
        if (user?.id) {
            api
                .get(`/profile/${user.id}`)
                .then((r) => setProfile(r.data.profile || r.data))
                .catch(() => {});
        }
    }, [user]);

    const language =
        profile?.preferred_language ||
        user?.preferred_language ||
        'en';

    const [lessons, setLessons] = useState([]);
    const [lessonsLoading, setLessonsLoading] = useState(true);
    const [currentLesson, setCurrentLesson] = useState(null);
    const [phase, setPhase] = useState('select');
    const [profileHint, setProfileHint] = useState('general');
    const [primaryTracks, setPrimaryTracks] = useState(null);

    const [chatMessages, setChatMessages] = useState([]);
    const [chatLoading, setChatLoading] = useState(false);

    const [code, setCode] = useState('');
    const [output, setOutput] = useState('');
    const [executionTime, setExecutionTime] = useState(null);
    const [running, setRunning] = useState(false);
    const [hintIndex, setHintIndex] = useState(0);
    const [evalResult, setEvalResult] = useState(null);
    const [completedLessons, setCompletedLessons] = useState(new Set());

    const tts = useTTS();

    const chatEndRef = useRef(null);
    const streamControllerRef = useRef(null);

    useEffect(() => {
        return () => {
            if (streamControllerRef.current) streamControllerRef.current.abort();
        };
    }, []);

    useEffect(() => {
        const params = user?.id ? `?user_id=${user.id}` : '';
        api
            .get(`/classroom/lessons${params}`)
            .then((r) => {
                setLessons(r.data.lessons ?? r.data);
                if (r.data.profile_hint) setProfileHint(r.data.profile_hint);
                if (r.data.primary_tracks) setPrimaryTracks(r.data.primary_tracks);
            })
            .catch(() => setLessons([]))
            .finally(() => setLessonsLoading(false));
    }, [user]);

    useEffect(() => {
        if (user?.id) {
            getCompletions(user.id)
                .then(res => setCompletedLessons(new Set((res.data.completions || []).map(c => c.lesson_id))))
                .catch(() => {});
        }
    }, [user?.id]);

    useEffect(() => {
        chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [chatMessages]);

    const handleSelectLesson = async (lesson) => {
        try {
            const params = user?.id ? `?user_id=${user.id}` : '';
            const res = await api.get(`/classroom/lesson/${lesson.id}${params}`);
            const data = res.data.lesson ?? res.data;
            setCurrentLesson(data);
            recordSignal({
                user_id: user?.id,
                signal_type: 'lesson_viewed',
                topic: lesson.id,
                value: { lesson_id: lesson.id, track: lesson.track || '' },
            }).catch(() => {});
            setPhase('intro');
            setChatMessages([]);
            setCode('');
            setOutput('');
            setHintIndex(0);
            setEvalResult(null);
        } catch (err) {
            console.error('Failed to load lesson:', err);
        }
    };

    const handleIntroComplete = () => {
        setPhase('practice');
    };

    const handleRun = async () => {
        if (!code.trim() || running) return;
        setRunning(true);
        setOutput('');
        setExecutionTime(null);
        const startTime = performance.now();
        try {
            const challenge = currentLesson?.practice_challenges?.[0] ?? {};
            const res = await api.post('/classroom/evaluate', {
                code,
                expected_output: challenge.expected_output ?? '',
                topic: currentLesson?.topic ?? currentLesson?.id ?? '',
                user_id: user?.id,
                language,
            });
            const elapsed = Math.round(performance.now() - startTime);
            setExecutionTime(elapsed);
            const result = res.data?.result ?? res.data;
            setEvalResult(result);
            // Show output in the terminal
            const out = result?.output || '';
            const err = result?.error || '';
            setOutput(out + (err ? (out ? '\n' : '') + err : '') || '(no output)');
            setPhase('feedback');
        } catch (err) {
            const elapsed = Math.round(performance.now() - startTime);
            setExecutionTime(elapsed);
            const detail = err.response?.data?.detail || err.message || 'Unknown error';
            setOutput(`Execution error: ${detail}`);
            console.error('[Classroom handleRun]', err);
        } finally {
            setRunning(false);
        }
    };

    const handleHint = () => {
        const hints = currentLesson?.practice_challenges?.[0]?.hints ?? [];
        if (hints.length === 0) return;
        const idx = hintIndex % hints.length;
        const hintText = resolveText(hints[idx], language);
        setChatMessages((prev) => [
            ...prev,
            { role: 'assistant', content: hintText, _isHint: true },
        ]);
        setHintIndex((i) => i + 1);
    };

    const handleChat = async (message) => {
        const userMsg = { role: 'user', content: message };
        setChatMessages((prev) => [...prev, userMsg]);
        setChatLoading(true);

        const streamMsg = { role: 'assistant', content: '', _isStreaming: true };
        setChatMessages((prev) => [...prev, streamMsg]);

        try {
            if (streamControllerRef.current) streamControllerRef.current.abort();
            streamControllerRef.current = new AbortController();

            const { parseSSELine, extractMessageFromJSON } = await import('../utils/streaming');

            const response = await fetch(`${api.defaults.baseURL}/classroom/chat/stream`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
                body: JSON.stringify({
                    user_id: user?.id,
                    message,
                    lesson_context: currentLesson ? { topic: currentLesson.topic || currentLesson.id, lesson_id: currentLesson.id } : null,
                    phase,
                    language,
                    username: user?.name || user?.username,
                    history: chatMessages.filter(m => !m._isStreaming).slice(-5).map(m => ({ role: m.role, content: m.content })),
                }),
                signal: streamControllerRef.current.signal,
            });

            if (!response.ok) {
                throw new Error(`Server error: ${response.status}`);
            }

            if (!response.body) {
                throw new Error('Response body is empty');
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let rawText = '';

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                const chunk = decoder.decode(value, { stream: true });

                for (const line of chunk.split('\n')) {
                    const data = parseSSELine(line);
                    if (!data) continue;

                    if (data.token) {
                        rawText += data.token;
                        const display = extractMessageFromJSON(rawText) || '';
                        if (display) {
                            setChatMessages((prev) =>
                                prev.map((m) => m._isStreaming ? { ...m, content: display } : m)
                            );
                        }
                    }
                    if (data.done) {
                        const finalMsg = data.message || extractMessageFromJSON(rawText) || rawText;
                        setChatMessages((prev) =>
                            prev.map((m) => m._isStreaming ? { role: 'assistant', content: finalMsg } : m)
                        );
                        // Auto-speak Vaathiyaar's response via TTS
                        if (tts.enabled && finalMsg) {
                            tts.speak(finalMsg);
                        }
                        const learnPatterns = /(?:teach me|learn about|i want to learn|explain)\s+(.+)/i;
                        const topicMatch = message.match(learnPatterns);
                        if (topicMatch && topicMatch[1]) {
                            const requestedTopic = topicMatch[1].trim().replace(/[?.!]$/, '');
                            setChatMessages(prev => [...prev, {
                                role: 'system',
                                content: `Would you like Vaathiyaar to create a custom lesson module on "${requestedTopic}"?`,
                                _isModuleSuggestion: true,
                                _topic: requestedTopic,
                            }]);
                        }
                    }
                    if (data.error) {
                        setChatMessages((prev) =>
                            prev.map((m) => m._isStreaming ? { role: 'assistant', content: `Error: ${data.error}` } : m)
                        );
                    }
                }
            }
        } catch (err) {
            if (err.name === 'AbortError') return;
            setChatMessages((prev) => {
                const filtered = prev.filter((m) => !m._isStreaming);
                return [...filtered, { role: 'assistant', content: `Vaathiyaar is busy. (${err.message}). Try again.` }];
            });
        } finally {
            setChatLoading(false);
        }
    };

    const handleContinue = () => {
        setCurrentLesson(null);
        setPhase('select');
        setChatMessages([]);
        setCode('');
        setOutput('');
        setEvalResult(null);
        setHintIndex(0);
    };

    const handleRetry = () => {
        setOutput('');
        setEvalResult(null);
        setPhase('practice');
    };

    const handleBackToSelect = () => {
        setCurrentLesson(null);
        setPhase('select');
        setChatMessages([]);
        setCode('');
        setOutput('');
        setEvalResult(null);
        setHintIndex(0);
    };

    // Page transition variants
    const pageVariants = {
        initial: { opacity: 0, y: 16, scale: 0.99 },
        animate: { opacity: 1, y: 0, scale: 1 },
        exit: { opacity: 0, y: -16, scale: 0.99 },
    };

    return (
        <div className="min-h-screen pb-40">
            <div className="max-w-[1600px] mx-auto px-4 lg:px-8 py-6">
                <VaathiyaarMessage />
                {/* Back button when in a lesson */}
                {phase !== 'select' && (
                    <motion.button
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        onClick={handleBackToSelect}
                        className="flex items-center gap-2 text-sm text-slate-400 hover:text-slate-700 transition-colors mb-6 group"
                    >
                        <ArrowLeft size={16} className="group-hover:-translate-x-1 transition-transform" />
                        Back to lessons
                    </motion.button>
                )}

                <AnimatePresence mode="wait">
                    {phase === 'select' && (
                        <motion.div
                            key="select"
                            variants={pageVariants}
                            initial="initial"
                            animate="animate"
                            exit="exit"
                            transition={{ duration: 0.3, ease: 'easeOut' }}
                        >
                            <LessonSelect
                                lessons={lessons}
                                onSelectLesson={handleSelectLesson}
                                loading={lessonsLoading}
                                language={language}
                                profileHint={profileHint}
                                primaryTracks={primaryTracks}
                                completedLessons={completedLessons}
                            />
                        </motion.div>
                    )}

                    {phase === 'intro' && currentLesson && (
                        <motion.div
                            key="intro"
                            variants={pageVariants}
                            initial="initial"
                            animate="animate"
                            exit="exit"
                            transition={{ duration: 0.3, ease: 'easeOut' }}
                        >
                            <IntroPhase
                                lesson={currentLesson}
                                language={language}
                                onComplete={handleIntroComplete}
                                username={user?.name || user?.username}
                            />
                        </motion.div>
                    )}

                    {phase === 'practice' && currentLesson && (
                        <motion.div
                            key="practice"
                            variants={pageVariants}
                            initial="initial"
                            animate="animate"
                            exit="exit"
                            transition={{ duration: 0.3, ease: 'easeOut' }}
                        >
                            <ErrorBoundary><PracticePhase
                                lesson={currentLesson}
                                language={language}
                                code={code}
                                setCode={setCode}
                                output={output}
                                hintIndex={hintIndex}
                                onHint={handleHint}
                                onRun={handleRun}
                                running={running}
                                chatMessages={chatMessages}
                                executionTime={executionTime}
                                onClearOutput={() => { setOutput(''); setExecutionTime(null); }}
                            /></ErrorBoundary>
                        </motion.div>
                    )}

                    {phase === 'feedback' && evalResult && (
                        <motion.div
                            key="feedback"
                            variants={pageVariants}
                            initial="initial"
                            animate="animate"
                            exit="exit"
                            transition={{ duration: 0.3, ease: 'easeOut' }}
                        >
                            <ErrorBoundary><FeedbackPhase
                                evalResult={evalResult}
                                language={language}
                                onContinue={handleContinue}
                                onRetry={handleRetry}
                            /></ErrorBoundary>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* Chat messages */}
                {phase !== 'select' && chatMessages.filter((m) => !m._isHint).length > 0 && (
                    <div className="mt-8 space-y-3">
                        <p className="text-xs font-bold uppercase tracking-widest text-slate-300 mb-2 flex items-center gap-2">
                            <MessageSquare size={12} />
                            Chat with Vaathiyaar
                        </p>
                        {chatMessages
                            .filter((m) => !m._isHint)
                            .map((msg, idx) => (
                                <motion.div
                                    key={idx}
                                    initial={{ opacity: 0, y: 6 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ duration: 0.2 }}
                                    className={`flex ${
                                        msg.role === 'user' ? 'justify-end' : 'justify-start'
                                    }`}
                                >
                                    {msg._isModuleSuggestion ? (
                                        <div className="max-w-[80%] px-4 py-3 rounded-2xl panel text-slate-700 dark:text-slate-200 rounded-bl-none space-y-2">
                                            <p className="text-sm">{msg.content}</p>
                                            <button
                                                onClick={async () => {
                                                    try {
                                                        await requestModule(user.id, msg._topic);
                                                        setChatMessages(prev => prev.map(m =>
                                                            m === msg ? { role: 'assistant', content: `Great! I'm preparing a custom lesson on "${msg._topic}" for you. You'll get a notification when it's ready!` } : m
                                                        ));
                                                    } catch(e) {
                                                        console.error(e);
                                                    }
                                                }}
                                                className="btn-neo btn-neo-primary text-sm py-2 px-4"
                                            >
                                                Yes, create it!
                                            </button>
                                        </div>
                                    ) : (
                                        <div
                                            className={`max-w-[80%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${
                                                msg.role === 'user'
                                                    ? 'bg-gradient-to-r from-cyan-500 to-blue-500 text-white rounded-br-none shadow-lg shadow-cyan-500/20'
                                                    : 'panel text-slate-700 dark:text-slate-100 rounded-bl-none'
                                            }`}
                                        >
                                            {msg._isThinking ? (
                                                <ThinkingBubble />
                                            ) : msg.role === 'assistant' ? (
                                                <>
                                                    <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                                                        {msg.content}
                                                    </ReactMarkdown>
                                                    {msg._isStreaming && <span className="inline-block w-2 h-4 bg-purple-400 animate-pulse ml-0.5 rounded-sm" />}
                                                </>
                                            ) : (
                                                msg.content
                                            )}
                                        </div>
                                    )}
                                </motion.div>
                            ))}
                        <div ref={chatEndRef} />
                    </div>
                )}
            </div>

            {/* TTS Controls — bottom-right floating */}
            {phase !== 'select' && <TTSControls tts={tts} />}

            {/* Fixed chat bar */}
            {phase !== 'select' && (
                <div className="fixed bottom-0 left-0 right-0 z-50">
                    <div className="h-10 bg-gradient-to-t from-[#f0f4f8] to-transparent pointer-events-none" />
                    <div className="bg-[#f0f4f8] px-4 pb-4">
                        <div className="max-w-[1600px] mx-auto flex items-end gap-2">
                            <div className="flex-1">
                                <ChatBar
                                    onSend={handleChat}
                                    loading={chatLoading}
                                    placeholder="Ask Vaathiyaar anything..."
                                />
                            </div>
                            <button
                                onClick={() => tts.setEnabled(!tts.enabled)}
                                title={tts.enabled ? 'TTS enabled — click to mute' : 'TTS disabled — click to enable'}
                                className={`mb-1 p-2.5 rounded-xl border transition-all duration-200 ${
                                    tts.enabled
                                        ? 'bg-purple-50 border-purple-200 text-purple-600 hover:bg-purple-100'
                                        : 'bg-slate-50 border-slate-200 text-slate-400 hover:bg-slate-100'
                                }`}
                            >
                                {tts.enabled ? <Volume2 size={18} /> : <VolumeX size={18} />}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
