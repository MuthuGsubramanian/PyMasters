import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { motion, AnimatePresence } from 'framer-motion';
import AnimationRenderer from '../components/animations/AnimationRenderer';
import ChatBar from '../components/ChatBar';
import api from '../api';
import { BookOpen, ChevronRight, Play, RotateCcw } from 'lucide-react';

// ──────────────────────────────────────────────────────────────────────────────
// Helper: resolve a localised string from an object or return as-is
// ──────────────────────────────────────────────────────────────────────────────
function resolveText(obj, language = 'en') {
    if (!obj) return '';
    if (typeof obj === 'string') return obj;
    return obj[language] || obj.en || Object.values(obj)[0] || '';
}

// ──────────────────────────────────────────────────────────────────────────────
// Phase: select — lesson list
// ──────────────────────────────────────────────────────────────────────────────
function LessonSelect({ lessons, onSelectLesson, loading }) {
    return (
        <div className="animate-fade-in space-y-8 max-w-2xl mx-auto">
            <header className="space-y-2">
                <h1 className="text-3xl font-bold font-display text-white">Classroom</h1>
                <p className="text-slate-400">
                    Choose a lesson. Vaathiyaar will guide you step by step.
                </p>
            </header>

            {loading ? (
                <div className="flex items-center justify-center h-40">
                    <div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
                </div>
            ) : lessons.length === 0 ? (
                <div className="panel rounded-xl p-10 text-center text-slate-500">
                    No lessons available yet. Check back soon!
                </div>
            ) : (
                <div className="space-y-3">
                    {lessons.map((lesson) => (
                        <button
                            key={lesson.id}
                            onClick={() => onSelectLesson(lesson)}
                            className="w-full text-left panel panel-hover rounded-xl p-5 flex items-center gap-4 group transition-all duration-300"
                        >
                            <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400 group-hover:bg-purple-500/20 transition-colors">
                                <BookOpen size={18} />
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="font-bold text-white group-hover:text-purple-300 transition-colors truncate">
                                    {lesson.title}
                                </div>
                                {lesson.description && (
                                    <div className="text-sm text-slate-400 truncate mt-0.5">
                                        {lesson.description}
                                    </div>
                                )}
                            </div>
                            <div className="flex items-center gap-3 flex-shrink-0">
                                {lesson.xp_reward != null && (
                                    <span className="text-xs font-bold text-yellow-400 bg-yellow-400/10 border border-yellow-400/20 rounded-full px-2.5 py-0.5">
                                        +{lesson.xp_reward} XP
                                    </span>
                                )}
                                <ChevronRight
                                    size={18}
                                    className="text-slate-500 group-hover:text-purple-400 group-hover:translate-x-0.5 transition-all"
                                />
                            </div>
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}

// ──────────────────────────────────────────────────────────────────────────────
// Phase: intro — animated story sequence
// ──────────────────────────────────────────────────────────────────────────────
function IntroPhase({ lesson, language, onComplete }) {
    const storyContent =
        lesson.active_story || resolveText(lesson.story_variants, language);

    const speedMultiplier = lesson.speed_multiplier ?? 1.0;
    const sequence = lesson.animation_sequence ?? [];

    return (
        <div className="animate-fade-in max-w-2xl mx-auto space-y-6">
            <header className="space-y-1">
                <p className="text-xs font-bold uppercase tracking-widest text-purple-400">
                    Lesson Introduction
                </p>
                <h2 className="text-2xl font-bold text-white">{lesson.title}</h2>
            </header>

            {sequence.length > 0 ? (
                <AnimationRenderer
                    sequence={sequence}
                    storyContent={storyContent}
                    speedMultiplier={speedMultiplier}
                    language={language}
                    onSequenceComplete={onComplete}
                />
            ) : (
                // Fallback when no animation sequence exists
                <div className="panel rounded-xl p-8 space-y-6">
                    {storyContent && (
                        <p className="text-slate-300 leading-relaxed">{storyContent}</p>
                    )}
                    <button
                        onClick={onComplete}
                        className="btn-neo btn-neo-primary flex items-center gap-2"
                    >
                        <Play size={16} fill="currentColor" />
                        Start Practice
                    </button>
                </div>
            )}
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
}) {
    const challenge = lesson.practice_challenges?.[0] ?? null;
    const instruction = challenge
        ? resolveText(challenge.instruction, language)
        : resolveText(lesson.challenge_instruction, language) ||
          'Write your solution below.';

    return (
        <div className="animate-fade-in max-w-2xl mx-auto space-y-5">
            {/* Vaathiyaar instruction panel */}
            <div className="panel rounded-xl p-5 border-l-4 border-l-purple-500 flex items-start gap-4">
                <div className="flex-shrink-0 w-9 h-9 rounded-full bg-purple-600/30 border border-purple-500/40 flex items-center justify-center text-lg select-none">
                    🧑‍🏫
                </div>
                <div className="space-y-1">
                    <p className="text-xs font-bold uppercase tracking-widest text-purple-400">
                        Challenge
                    </p>
                    <p className="text-slate-200 leading-relaxed">{instruction}</p>
                </div>
            </div>

            {/* Hint messages from chat */}
            {chatMessages.filter((m) => m.role === 'assistant' && m._isHint).map((m, i) => (
                <motion.div
                    key={i}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="panel rounded-xl p-4 border border-yellow-500/20 bg-yellow-500/5 flex items-start gap-3"
                >
                    <span className="text-yellow-400 text-lg">💡</span>
                    <p className="text-slate-300 text-sm leading-relaxed">{m.content}</p>
                </motion.div>
            ))}

            {/* Code editor */}
            <div className="panel rounded-xl overflow-hidden">
                <div className="h-9 bg-black/30 border-b border-white/5 flex items-center justify-between px-4">
                    <span className="text-xs font-mono text-slate-500">solution.py</span>
                    <button
                        onClick={onRun}
                        disabled={running}
                        className="flex items-center gap-1.5 text-[10px] font-bold bg-green-500/10 text-green-400 px-3 py-1 rounded hover:bg-green-500/20 transition-colors uppercase tracking-wider disabled:opacity-50"
                    >
                        {running ? (
                            <div className="w-3 h-3 border border-green-400 border-t-transparent rounded-full animate-spin" />
                        ) : (
                            <Play size={11} fill="currentColor" />
                        )}
                        {running ? 'Running…' : 'Run'}
                    </button>
                </div>
                <textarea
                    className="w-full bg-[#020617] text-slate-300 font-mono text-sm p-4 resize-none focus:outline-none leading-relaxed min-h-[180px]"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    spellCheck={false}
                    placeholder="# Write your code here…"
                />
            </div>

            {/* Output */}
            {output && (
                <div className="panel rounded-xl overflow-hidden">
                    <div className="bg-black/30 px-4 py-2 text-[10px] uppercase font-bold tracking-widest text-slate-500 border-b border-white/5">
                        Output
                    </div>
                    <pre className="p-4 font-mono text-sm text-slate-300 whitespace-pre-wrap bg-[#020617] max-h-40 overflow-auto">
                        {output}
                    </pre>
                </div>
            )}

            {/* Hint button */}
            {challenge?.hints?.length > 0 && (
                <div className="flex justify-end">
                    <button
                        onClick={onHint}
                        className="btn-neo btn-neo-ghost text-sm py-2 px-4"
                    >
                        💡 Need a hint?
                        {hintIndex > 0 && (
                            <span className="ml-1.5 text-xs text-slate-500">
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
// Phase: feedback — evaluation result
// ──────────────────────────────────────────────────────────────────────────────
function FeedbackPhase({ evalResult, language, onContinue, onRetry }) {
    const success = evalResult?.passed ?? evalResult?.success ?? false;
    const feedbackMsg =
        evalResult?.feedback?.message ||
        resolveText(evalResult?.feedback, language) ||
        (success ? 'Great job!' : 'Keep trying — you can do it!');

    const animationSeq = evalResult?.feedback?.animation;

    return (
        <div className="animate-fade-in max-w-2xl mx-auto space-y-6">
            {/* Animated feedback if available */}
            {animationSeq && (
                <AnimationRenderer
                    sequence={animationSeq}
                    storyContent=""
                    language={language}
                />
            )}

            {/* Result panel */}
            <div
                className={`panel rounded-xl p-6 border-l-4 ${
                    success
                        ? 'border-l-green-400 bg-green-500/5'
                        : 'border-l-red-400 bg-red-500/5'
                } flex items-start gap-4`}
            >
                <div className="flex-shrink-0 w-9 h-9 rounded-full bg-purple-600/30 border border-purple-500/40 flex items-center justify-center text-lg select-none">
                    🧑‍🏫
                </div>
                <div className="space-y-3 flex-1">
                    <p
                        className={`font-bold text-sm uppercase tracking-wider ${
                            success ? 'text-green-400' : 'text-red-400'
                        }`}
                    >
                        {success ? 'Success!' : 'Not quite right'}
                    </p>
                    <p className="text-slate-200 leading-relaxed">{feedbackMsg}</p>

                    {evalResult?.output && (
                        <pre className="mt-3 p-3 bg-black/30 rounded-lg font-mono text-xs text-slate-400 whitespace-pre-wrap max-h-32 overflow-auto border border-white/5">
                            {evalResult.output}
                        </pre>
                    )}

                    <div className="flex gap-3 pt-1">
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
            </div>
        </div>
    );
}

// ──────────────────────────────────────────────────────────────────────────────
// Main Classroom page
// ──────────────────────────────────────────────────────────────────────────────
export default function Classroom() {
    const { user } = useAuth();

    // Profile — try ProfileContext if wired up, otherwise fetch directly
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

    // ── Core state ──────────────────────────────────────────────────────────
    const [lessons, setLessons] = useState([]);
    const [lessonsLoading, setLessonsLoading] = useState(true);
    const [currentLesson, setCurrentLesson] = useState(null);
    const [phase, setPhase] = useState('select'); // 'select'|'intro'|'practice'|'feedback'

    const [chatMessages, setChatMessages] = useState([]);
    const [chatLoading, setChatLoading] = useState(false);

    const [code, setCode] = useState('');
    const [output, setOutput] = useState('');
    const [running, setRunning] = useState(false);
    const [hintIndex, setHintIndex] = useState(0);
    const [evalResult, setEvalResult] = useState(null);

    const chatEndRef = useRef(null);

    // ── Fetch lesson list ───────────────────────────────────────────────────
    useEffect(() => {
        api
            .get('/classroom/lessons')
            .then((r) => setLessons(r.data.lessons ?? r.data))
            .catch(() => setLessons([]))
            .finally(() => setLessonsLoading(false));
    }, []);

    // ── Auto-scroll chat ────────────────────────────────────────────────────
    useEffect(() => {
        chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [chatMessages]);

    // ── Select a lesson ─────────────────────────────────────────────────────
    const handleSelectLesson = async (lesson) => {
        try {
            const params = user?.id ? `?user_id=${user.id}` : '';
            const res = await api.get(`/classroom/lesson/${lesson.id}${params}`);
            const data = res.data.lesson ?? res.data;
            setCurrentLesson(data);
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

    // ── Intro complete → practice ───────────────────────────────────────────
    const handleIntroComplete = () => {
        setPhase('practice');
    };

    // ── Run & evaluate code ─────────────────────────────────────────────────
    const handleRun = async () => {
        if (!code.trim() || running) return;
        setRunning(true);
        setOutput('');
        try {
            const challenge = currentLesson?.practice_challenges?.[0] ?? {};
            const res = await api.post('/classroom/evaluate', {
                code,
                expected_output: challenge.expected_output ?? '',
                topic: currentLesson?.topic ?? currentLesson?.id ?? '',
                user_id: user?.id,
                language,
            });
            const result = res.data.result ?? res.data;
            setEvalResult(result);
            if (result?.output) setOutput(result.output);
            setPhase('feedback');
        } catch (err) {
            setOutput('Error running code. Please try again.');
            console.error(err);
        } finally {
            setRunning(false);
        }
    };

    // ── Hint ────────────────────────────────────────────────────────────────
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

    // ── Chat with Vaathiyaar ────────────────────────────────────────────────
    const handleChat = async (message) => {
        const userMsg = { role: 'user', content: message };
        setChatMessages((prev) => [...prev, userMsg]);
        setChatLoading(true);
        try {
            const res = await api.post('/classroom/chat', {
                user_id: user?.id,
                message,
                lesson_context: currentLesson?.id ?? '',
                phase,
                language,
            });
            const reply = res.data.response ?? res.data.message ?? 'No response.';
            setChatMessages((prev) => [
                ...prev,
                { role: 'assistant', content: reply },
            ]);
        } catch (err) {
            setChatMessages((prev) => [
                ...prev,
                {
                    role: 'assistant',
                    content: 'Sorry, I could not reach Vaathiyaar right now.',
                },
            ]);
        } finally {
            setChatLoading(false);
        }
    };

    // ── Feedback actions ────────────────────────────────────────────────────
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

    // ── Render ──────────────────────────────────────────────────────────────
    return (
        <div className="min-h-screen bg-[#020617] pb-40">
            <div className="max-w-2xl mx-auto px-4 py-10">
                {/* Phase: select */}
                <AnimatePresence mode="wait">
                    {phase === 'select' && (
                        <motion.div
                            key="select"
                            initial={{ opacity: 0, y: 12 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -12 }}
                            transition={{ duration: 0.25 }}
                        >
                            <LessonSelect
                                lessons={lessons}
                                onSelectLesson={handleSelectLesson}
                                loading={lessonsLoading}
                            />
                        </motion.div>
                    )}

                    {/* Phase: intro */}
                    {phase === 'intro' && currentLesson && (
                        <motion.div
                            key="intro"
                            initial={{ opacity: 0, y: 12 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -12 }}
                            transition={{ duration: 0.25 }}
                        >
                            <IntroPhase
                                lesson={currentLesson}
                                language={language}
                                onComplete={handleIntroComplete}
                            />
                        </motion.div>
                    )}

                    {/* Phase: practice */}
                    {phase === 'practice' && currentLesson && (
                        <motion.div
                            key="practice"
                            initial={{ opacity: 0, y: 12 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -12 }}
                            transition={{ duration: 0.25 }}
                        >
                            <PracticePhase
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
                            />
                        </motion.div>
                    )}

                    {/* Phase: feedback */}
                    {phase === 'feedback' && evalResult && (
                        <motion.div
                            key="feedback"
                            initial={{ opacity: 0, y: 12 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -12 }}
                            transition={{ duration: 0.25 }}
                        >
                            <FeedbackPhase
                                evalResult={evalResult}
                                language={language}
                                onContinue={handleContinue}
                                onRetry={handleRetry}
                            />
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* Chat messages (non-hint) — visible in non-select phases */}
                {phase !== 'select' && chatMessages.filter((m) => !m._isHint).length > 0 && (
                    <div className="mt-8 space-y-3">
                        <p className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-2">
                            Chat
                        </p>
                        {chatMessages
                            .filter((m) => !m._isHint)
                            .map((msg, idx) => (
                                <div
                                    key={idx}
                                    className={`flex ${
                                        msg.role === 'user' ? 'justify-end' : 'justify-start'
                                    }`}
                                >
                                    <div
                                        className={`max-w-[80%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${
                                            msg.role === 'user'
                                                ? 'bg-purple-600/30 text-white rounded-br-none'
                                                : 'panel text-slate-200 rounded-bl-none'
                                        }`}
                                    >
                                        {msg.content}
                                    </div>
                                </div>
                            ))}
                        <div ref={chatEndRef} />
                    </div>
                )}
            </div>

            {/* ── Fixed chat bar (visible outside select phase) ── */}
            {phase !== 'select' && (
                <div className="fixed bottom-0 left-0 right-0 z-50">
                    {/* Gradient fade */}
                    <div className="h-10 bg-gradient-to-t from-[#020617] to-transparent pointer-events-none" />
                    <div className="bg-[#020617] px-4 pb-4">
                        <div className="max-w-2xl mx-auto">
                            <ChatBar
                                onSend={handleChat}
                                loading={chatLoading}
                                placeholder="Ask Vaathiyaar anything…"
                            />
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
