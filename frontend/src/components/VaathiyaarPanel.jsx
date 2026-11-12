import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { X, MessageCircle, Eraser, Terminal, Play, Sparkles, Zap, CheckCircle2, HelpCircle } from 'lucide-react';
import VaathiyaarGlyph from '../assets/vaathiyaar-glyph.svg';
import { useAuth } from '../context/AuthContext';
import api, { getAuthHeaders } from '../api';
import ChatBar from './ChatBar';
import { parseSSELine, extractMessageFromJSON } from '../utils/streaming';
import { registerAndroidBackHandler } from '../lib/androidBack';
import { safeErrorMsg } from '../utils/errorUtils';

// Friendly page descriptions keyed by route — sent to Vaathiyaar as context so
// answers can reference what the learner is currently looking at.
const PAGE_LABELS = [
    ['/dashboard/playground', 'Playground — a live Python code terminal. You can DEMONSTRATE concepts here: include short, runnable Python code blocks in your answers and the student can run them in the terminal with one click'],
    ['/dashboard/play', 'Play — short concept games (Output Oracle: predict what a snippet prints; Gradient Golf: choose a learning rate to sink the ball in the loss minimum). The student may be asking about an item they just got wrong — explain the underlying rule, not just the answer'],
    ['/dashboard/paths', 'Paths — structured AI-personalised Python & AI learning roadmaps'],
    ['/dashboard/knowledge', 'Knowledge Map — a live map of topics the student has mastered'],
    ['/dashboard/classroom', 'Classroom — AI-guided interactive Python lessons'],
    ['/dashboard/trending', 'Trending — daily AI & Python news and trends'],
    ['/dashboard/challenges', 'Challenges — weekly coding battles'],
    ['/dashboard/reference', 'Reference — quick Python cheat sheets'],
    ['/dashboard/explains', 'Explains — visual, scroll-driven essays that build Python, ML, and AI concepts step by step'],
    ['/dashboard/community', 'Community — rankings and member leaderboard'],
    ['/dashboard/org-compete', 'Compete — organization challenges and leaderboard'],
    ['/dashboard/org', 'Admin Console — organization members, invites and analytics'],
    ['/dashboard/profile', 'Profile — account settings'],
    ['/dashboard/upgrade', 'Upgrade — plans and pricing'],
    ['/dashboard', "Dashboard overview — the student's command center"],
];

const STARTER_CHIPS_BY_ROUTE = [
    ['/dashboard/playground', [
        'Show me a runnable decorator example',
        'Explain list comprehensions vs generators',
        'Debug a common mutable default bug',
    ]],
    ['/dashboard/paths', [
        'Which Learning Path fits me best?',
        'What should I master before async Python?',
        'How do I earn a Path Credential?',
    ]],
    ['/dashboard/knowledge', [
        'Which topic gap should I tackle next?',
        'Quiz me on Python data structures',
        'Connect functions to OOP concepts',
    ]],
    ['/dashboard/challenges', [
        'Give me a strategy without spoiling code',
        'What is the time complexity target here?',
        'Show edge cases I should test',
    ]],
    ['/dashboard/explains', [
        'Summarize gradient descent intuitively',
        'Give me a 5-line Python demo of this concept',
        'Test my understanding with one question',
    ]],
    ['/dashboard/reference', [
        'When should I use dict.setdefault vs defaultdict?',
        'Show idiomatic slicing tricks in Python',
        'Explain *args and **kwargs with an example',
    ]],
    ['/dashboard', [
        'What should I practice in the next 15 minutes?',
        'Explain Python generators with a tiny example',
        'Quiz me on a core Python interview topic',
    ]],
];

function pageLabelFor(pathname) {
    const hit = PAGE_LABELS.find(([prefix]) => pathname === prefix || pathname.startsWith(prefix + '/'));
    return hit ? hit[1] : `the ${pathname} page`;
}

function starterChipsFor(pathname) {
    const hit = STARTER_CHIPS_BY_ROUTE.find(([prefix]) => pathname === prefix || pathname.startsWith(prefix + '/'));
    return hit ? hit[1] : STARTER_CHIPS_BY_ROUTE[STARTER_CHIPS_BY_ROUTE.length - 1][1];
}

const OPEN_KEY = 'pm:vaathiyaar-panel-open';
const CONV_KEY = 'pm:vaathiyaar-panel-conv';

// On the Playground page python blocks get "Insert" / "Run demo" affordances;
// on every other page python blocks get "Open in Playground".
function buildMdComponents(onPlayground, onOpenPlayground) {
    const inject = (codeText, run) =>
        window.dispatchEvent(new CustomEvent('pm:vaathiyaar-inject', { detail: { code: codeText, run } }));
    return {
        p: ({ children }) => <p className="text-sm text-text-secondary mb-2 leading-relaxed">{children}</p>,
        ul: ({ children }) => <ul className="list-disc list-inside text-sm text-text-secondary mb-2 space-y-1">{children}</ul>,
        ol: ({ children }) => <ol className="list-decimal list-inside text-sm text-text-secondary mb-2 space-y-1">{children}</ol>,
        strong: ({ children }) => <strong className="font-bold text-text-primary">{children}</strong>,
        code: ({ children, className }) => {
            const codeText = String(children).replace(/\n$/, '');
            if (!className && !codeText.includes('\n')) {
                return <code className="bg-accent-subtle text-accent-primary px-1.5 py-0.5 rounded text-xs font-mono">{children}</code>;
            }
            const isPython = !className || /python|language-py/.test(className);
            return (
                <div className="my-2">
                    <pre className="surface-code p-3 rounded-xl text-xs font-mono overflow-x-auto border border-border-default">
                        <code>{codeText}</code>
                    </pre>
                    {isPython && (
                        <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                            {onPlayground ? (
                                <>
                                    <button
                                        type="button"
                                        onClick={() => inject(codeText, false)}
                                        title="Insert this example into the terminal"
                                        className="flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-md bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/25 transition-all cursor-pointer"
                                    >
                                        <Terminal size={11} />
                                        Insert
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => inject(codeText, true)}
                                        title="Insert into the terminal and run it now"
                                        className="flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-md bg-green-500/15 text-green-700 dark:text-green-300 border border-green-500/30 hover:bg-green-500/25 transition-all cursor-pointer"
                                    >
                                        <Play size={11} />
                                        Run demo
                                    </button>
                                </>
                            ) : (
                                <button
                                    type="button"
                                    onClick={() => onOpenPlayground(codeText)}
                                    title="Open this snippet in the Python Playground"
                                    className="flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-md bg-accent-subtle text-accent-primary border border-border-strong hover:bg-bg-elevated transition-all cursor-pointer"
                                >
                                    <Play size={11} />
                                    Open in Playground
                                </button>
                            )}
                        </div>
                    )}
                </div>
            );
        },
    };
}

export default function VaathiyaarPanel() {
    const { user } = useAuth();
    const location = useLocation();
    const navigate = useNavigate();
    const [open, setOpen] = useState(() => localStorage.getItem(OPEN_KEY) === '1');
    const [mode, setMode] = useState('chat'); // 'chat' | 'teach-back'
    const [messages, setMessages] = useState([]);
    const [loading, setLoading] = useState(false);
    const [conversationId, setConversationId] = useState(() => sessionStorage.getItem(CONV_KEY) || null);

    // Teach-It-Back state
    const [tbConcept, setTbConcept] = useState('');
    const [tbExplanation, setTbExplanation] = useState('');
    const [tbLoading, setTbLoading] = useState(false);
    const [tbResult, setTbResult] = useState(null);
    const [tbError, setTbError] = useState('');

    const endRef = useRef(null);
    const controllerRef = useRef(null);

    const onPlayground = location.pathname.startsWith('/dashboard/playground');
    const pageLabel = pageLabelFor(location.pathname);
    const starterChips = useMemo(() => starterChipsFor(location.pathname), [location.pathname]);

    const handleOpenPlayground = useCallback(
        (codeText) => {
            navigate(`/dashboard/playground?code=${encodeURIComponent(codeText)}`);
        },
        [navigate]
    );

    const mdComponents = useMemo(
        () => buildMdComponents(onPlayground, handleOpenPlayground),
        [onPlayground, handleOpenPlayground]
    );

    useEffect(() => { localStorage.setItem(OPEN_KEY, open ? '1' : '0'); }, [open]);
    useEffect(() => {
        if (conversationId) sessionStorage.setItem(CONV_KEY, conversationId);
    }, [conversationId]);
    useEffect(() => () => controllerRef.current?.abort(), []);
    useEffect(() => {
        if (open && mode === 'chat') endRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages, loading, open, mode]);

    // Esc or Android System Back closes the panel.
    useEffect(() => {
        if (!open) return undefined;
        const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
        window.addEventListener('keydown', onKey);
        const unregisterBack = registerAndroidBackHandler(() => {
            setOpen(false);
            return true;
        });
        return () => {
            window.removeEventListener('keydown', onKey);
            unregisterBack();
        };
    }, [open]);

    const handleSendRef = useRef(null);
    useEffect(() => {
        const onAsk = (e) => {
            const msg = e?.detail?.message;
            if (!msg) return;
            setMode('chat');
            setOpen(true);
            handleSendRef.current?.(msg);
        };
        window.addEventListener('pm:vaathiyaar-ask', onAsk);
        return () => window.removeEventListener('pm:vaathiyaar-ask', onAsk);
    }, []);

    const handleSend = useCallback(async (message) => {
        if (!message.trim() || loading || !user?.id) return;
        setMessages((prev) => [...prev, { role: 'user', content: message }, { role: 'assistant', content: '', _isStreaming: true }]);
        setLoading(true);
        try {
            controllerRef.current?.abort();
            controllerRef.current = new AbortController();
            const response = await fetch(`${api.defaults.baseURL}/playground/chat/stream`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
                body: JSON.stringify({
                    user_id: user.id,
                    message,
                    username: user?.name || user?.username || '',
                    time_of_day: (() => { const h = new Date().getHours(); return h < 12 ? 'morning' : h < 17 ? 'afternoon' : 'evening'; })(),
                    language: user?.preferred_language || 'en',
                    conversation_id: conversationId,
                    page_context: pageLabel,
                }),
                signal: controllerRef.current.signal,
            });

            if (response.status === 403) {
                setMessages((prev) => [...prev.filter((m) => !m._isStreaming),
                    { role: 'assistant', content: "You've used all your prompts! Complete more lessons to earn XP and unlock more." }]);
                return;
            }
            if (response.status === 402) {
                setMessages((prev) => prev.filter((m) => !m._isStreaming));
                if (window.location.pathname !== '/dashboard/upgrade') window.location.href = '/dashboard/upgrade';
                return;
            }
            if (!response.ok || !response.body) throw new Error(`Server error: ${response.status}`);

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let rawText = '';
            let buffer = '';
            const processLine = (line) => {
                const data = parseSSELine(line);
                if (!data) return;
                if (data.token) {
                    rawText += data.token;
                    const display = extractMessageFromJSON(rawText) || '';
                    if (display) setMessages((prev) => prev.map((m) => (m._isStreaming ? { ...m, content: display } : m)));
                }
                if (data.done) {
                    const finalMsg = data.message || extractMessageFromJSON(rawText) || rawText;
                    setMessages((prev) => prev.map((m) => (m._isStreaming ? { role: 'assistant', content: finalMsg } : m)));
                    if (data.conversation_id) setConversationId(data.conversation_id);
                }
                if (data.error) {
                    setMessages((prev) => prev.map((m) => (m._isStreaming ? { role: 'assistant', content: `Error: ${data.error}` } : m)));
                }
            };
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop();
                for (const line of lines) processLine(line);
            }
            if (buffer) processLine(buffer);
        } catch (err) {
            if (err.name !== 'AbortError') {
                setMessages((prev) => [...prev.filter((m) => !m._isStreaming),
                    { role: 'assistant', content: `Sorry, something went wrong. (${err.message}). Try again in a moment.` }]);
            }
        } finally {
            setLoading(false);
        }
    }, [loading, user, conversationId, pageLabel]);

    useEffect(() => { handleSendRef.current = handleSend; }, [handleSend]);

    const handleTeachBackSubmit = async (e) => {
        e.preventDefault();
        const concept = tbConcept.trim();
        const explanation = tbExplanation.trim();
        if (!concept || explanation.length < 10 || tbLoading) return;
        setTbLoading(true);
        setTbError('');
        try {
            const lessonMatch = location.pathname.match(/^\/dashboard\/classroom\/([^/]+)/);
            const res = await api.post('/classroom/teach-back', {
                concept,
                explanation,
                lesson_id: lessonMatch ? decodeURIComponent(lessonMatch[1]) : '',
            });
            setTbResult(res.data || null);
            if (res.data?.xp_awarded > 0) {
                window.dispatchEvent(new CustomEvent('pm:xp-earned'));
            }
        } catch (err) {
            setTbError(safeErrorMsg(err, 'Could not evaluate your explanation right now.'));
        } finally {
            setTbLoading(false);
        }
    };

    if (!user) return null;

    return (
        <>
            {/* Floating toggle */}
            {!open && (
                <button
                    onClick={() => setOpen(true)}
                    aria-label="Open Vaathiyaar chat"
                    title="Chat with Vaathiyaar"
                    className="fixed bottom-20 right-4 lg:bottom-5 lg:right-5 z-40 w-12 h-12 rounded-full bg-gradient-primary shadow-glow flex items-center justify-center cursor-pointer transition-transform duration-200 hover:scale-105 active:scale-95"
                >
                    <img src={VaathiyaarGlyph} alt="" aria-hidden="true" className="w-[55%] h-[55%]" />
                </button>
            )}

            <AnimatePresence>
                {open && (
                    <motion.aside
                        initial={{ x: 420, opacity: 0.6 }}
                        animate={{ x: 0, opacity: 1 }}
                        exit={{ x: 420, opacity: 0.6 }}
                        transition={{ type: 'spring', stiffness: 380, damping: 34 }}
                        role="complementary"
                        aria-label="Vaathiyaar chat panel"
                        className="fixed top-0 right-0 z-50 h-full w-full sm:w-[400px] flex flex-col bg-bg-surface backdrop-blur-2xl border-l border-border-default shadow-elegant"
                    >
                        {/* Header */}
                        <div className="px-4 py-3 border-b border-border-default flex-shrink-0 space-y-2.5">
                            <div className="flex items-center gap-2.5">
                                <div className="w-8 h-8 rounded-xl bg-gradient-primary flex items-center justify-center select-none shadow-glow flex-shrink-0">
                                    <img src={VaathiyaarGlyph} alt="" aria-hidden="true" className="w-[60%] h-[60%]" />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-bold text-text-primary font-display leading-tight">Vaathiyaar</p>
                                    <p className="text-xs text-text-muted truncate" title={pageLabel}>
                                        Sees: {pageLabel.split('—')[0].trim()}
                                    </p>
                                </div>
                                {mode === 'chat' && messages.length > 0 && (
                                    <button
                                        onClick={() => { setMessages([]); setConversationId(null); sessionStorage.removeItem(CONV_KEY); }}
                                        aria-label="Clear conversation"
                                        title="Clear conversation"
                                        className="p-2 rounded-lg text-text-muted hover:text-text-secondary hover:bg-bg-elevated transition-colors cursor-pointer"
                                    >
                                        <Eraser size={15} />
                                    </button>
                                )}
                                <button
                                    onClick={() => setOpen(false)}
                                    aria-label="Close Vaathiyaar chat"
                                    className="p-2 rounded-lg text-text-muted hover:text-text-secondary hover:bg-bg-elevated transition-colors cursor-pointer"
                                >
                                    <X size={16} />
                                </button>
                            </div>

                            {/* Mode Switcher Pills */}
                            <div className="grid grid-cols-2 gap-1.5 p-1 rounded-xl bg-bg-elevated border border-border-default" role="tablist" aria-label="Vaathiyaar mode">
                                <button
                                    type="button"
                                    role="tab"
                                    aria-selected={mode === 'chat'}
                                    onClick={() => setMode('chat')}
                                    className={`py-1.5 px-3 rounded-lg text-xs font-bold transition-colors flex items-center justify-center gap-1.5 ${
                                        mode === 'chat'
                                            ? 'bg-bg-surface text-accent-primary shadow-sm border border-border-default'
                                            : 'text-text-muted hover:text-text-primary'
                                    }`}
                                >
                                    <MessageCircle size={13} />
                                    <span>Ask Tutor</span>
                                </button>
                                <button
                                    type="button"
                                    role="tab"
                                    aria-selected={mode === 'teach-back'}
                                    onClick={() => setMode('teach-back')}
                                    className={`py-1.5 px-3 rounded-lg text-xs font-bold transition-colors flex items-center justify-center gap-1.5 ${
                                        mode === 'teach-back'
                                            ? 'bg-bg-surface text-accent-primary shadow-sm border border-border-default'
                                            : 'text-text-muted hover:text-text-primary'
                                    }`}
                                >
                                    <Sparkles size={13} />
                                    <span>Teach It Back</span>
                                </button>
                            </div>
                        </div>

                        {mode === 'chat' ? (
                            <>
                                {/* Messages */}
                                <div className="flex-1 overflow-y-auto p-4 space-y-3 dark-scrollbar">
                                    {messages.length === 0 && !loading && (
                                        <div className="py-6 space-y-5">
                                            <div className="text-center">
                                                <MessageCircle size={22} className="text-text-muted mx-auto mb-3" aria-hidden="true" />
                                                <p className="text-sm font-semibold text-text-primary mb-1">Ask Vaathiyaar anything</p>
                                                <p className="text-xs text-text-muted max-w-[260px] mx-auto leading-relaxed">
                                                    I can see you're on {pageLabel.split('—')[0].trim()} — pick a prompt below or ask any Python question.
                                                </p>
                                            </div>
                                            <div className="space-y-2">
                                                {starterChips.map((chip) => (
                                                    <button
                                                        key={chip}
                                                        type="button"
                                                        onClick={() => handleSend(chip)}
                                                        className="w-full text-left px-3.5 py-2.5 rounded-xl border border-border-default bg-bg-elevated hover:border-accent-primary hover:bg-accent-subtle text-xs font-medium text-text-secondary hover:text-text-primary transition-colors"
                                                    >
                                                        {chip}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                    {messages.map((msg, idx) => (
                                        <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                            {msg.role === 'assistant' ? (
                                                <div className="flex items-start gap-2 max-w-[95%]">
                                                    <div className="flex-shrink-0 w-6 h-6 rounded-lg bg-gradient-primary flex items-center justify-center select-none mt-1">
                                                        <img src={VaathiyaarGlyph} alt="" aria-hidden="true" className="w-[60%] h-[60%]" />
                                                    </div>
                                                    <div className="panel rounded-2xl rounded-tl-sm px-3.5 py-2.5 border-l-2 border-accent-primary/40 text-sm min-w-0">
                                                        <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>
                                                            {msg.content || (msg._isStreaming ? '…' : '')}
                                                        </ReactMarkdown>
                                                    </div>
                                                </div>
                                            ) : (
                                                <div className="max-w-[85%] bg-gradient-primary text-white rounded-2xl rounded-br-sm px-3.5 py-2 text-sm leading-relaxed">
                                                    {msg.content}
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                    <div ref={endRef} />
                                </div>

                                {/* Input */}
                                <div className="flex-shrink-0 p-3 border-t border-border-default">
                                    <ChatBar onSend={handleSend} loading={loading} placeholder="Ask about this page, or anything…" />
                                </div>
                            </>
                        ) : (
                            /* Teach It Back Mode */
                            <div className="flex-1 overflow-y-auto p-4 space-y-4 dark-scrollbar">
                                <div className="rounded-xl border border-border-default bg-bg-elevated p-3.5 space-y-1">
                                    <p className="text-xs font-bold uppercase tracking-wider text-accent-primary">
                                        Protégé Mode · Teach Vaathiyaar
                                    </p>
                                    <p className="text-xs text-text-secondary leading-relaxed">
                                        Explain any Python or AI concept in 2–3 clear sentences as if teaching a classmate. Earn <strong className="text-text-primary">+15 XP</strong> per new concept!
                                    </p>
                                </div>

                                <form onSubmit={handleTeachBackSubmit} className="space-y-3">
                                    <div className="space-y-1">
                                        <label htmlFor="tb-concept" className="text-xs font-bold uppercase tracking-wider text-text-muted">
                                            Concept Name
                                        </label>
                                        <input
                                            id="tb-concept"
                                            type="text"
                                            value={tbConcept}
                                            onChange={(e) => setTbConcept(e.target.value)}
                                            placeholder="e.g., Python Generators, Cosine Similarity"
                                            maxLength={200}
                                            required
                                            className="w-full min-h-11 px-3.5 py-2 rounded-xl bg-bg-elevated border border-border-default text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-border-focus"
                                        />
                                    </div>

                                    <div className="space-y-1">
                                        <label htmlFor="tb-explanation" className="text-xs font-bold uppercase tracking-wider text-text-muted">
                                            Your Explanation (2–3 sentences)
                                        </label>
                                        <textarea
                                            id="tb-explanation"
                                            rows={4}
                                            value={tbExplanation}
                                            onChange={(e) => setTbExplanation(e.target.value)}
                                            placeholder="Explain what it does, why it matters, and give a quick mental model or example..."
                                            minLength={10}
                                            maxLength={4000}
                                            required
                                            className="w-full px-3.5 py-2.5 rounded-xl bg-bg-elevated border border-border-default text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-border-focus resize-y"
                                        />
                                    </div>

                                    <button
                                        type="submit"
                                        disabled={tbLoading || !tbConcept.trim() || tbExplanation.trim().length < 10}
                                        className="w-full min-h-11 py-2.5 px-4 rounded-xl bg-gradient-primary text-white text-sm font-bold disabled:opacity-50 transition-opacity cursor-pointer"
                                    >
                                        {tbLoading ? 'Evaluating clarity…' : 'Check My Explanation'}
                                    </button>
                                </form>

                                {tbError && (
                                    <p role="alert" className="text-xs text-red-600 dark:text-red-400">
                                        {tbError}
                                    </p>
                                )}

                                {tbResult && (
                                    <div className="rounded-2xl border border-border-strong bg-bg-elevated p-4 space-y-3">
                                        <div className="flex items-center justify-between gap-2 flex-wrap">
                                            <span className="inline-flex items-center gap-1.5 text-xs font-bold text-text-primary">
                                                <CheckCircle2 size={14} className="text-emerald-500" />
                                                Clarity: {tbResult.clarity_score}/5 · {tbResult.verdict}
                                            </span>
                                            {tbResult.xp_awarded > 0 && (
                                                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-700 dark:text-amber-300 text-xs font-bold">
                                                    <Zap size={11} />
                                                    +{tbResult.xp_awarded} XP
                                                </span>
                                            )}
                                        </div>

                                        {tbResult.what_landed && (
                                            <div className="text-xs text-text-secondary leading-relaxed">
                                                <span className="font-bold text-emerald-700 dark:text-emerald-300">What landed: </span>
                                                {tbResult.what_landed}
                                            </div>
                                        )}

                                        {tbResult.follow_up_question && (
                                            <div className="rounded-xl border border-border-default bg-bg-surface p-3 text-xs text-text-secondary space-y-1">
                                                <div className="font-bold text-accent-primary flex items-center gap-1">
                                                    <HelpCircle size={12} />
                                                    <span>Follow-up Question</span>
                                                </div>
                                                <p>{tbResult.follow_up_question}</p>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        )}
                    </motion.aside>
                )}
            </AnimatePresence>
        </>
    );
}
