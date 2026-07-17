import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { X, MessageCircle, Eraser, Terminal, Play } from 'lucide-react';
import VaathiyaarGlyph from '../assets/vaathiyaar-glyph.svg';
import { useAuth } from '../context/AuthContext';
import api, { getAuthHeaders } from '../api';
import ChatBar from './ChatBar';
import { parseSSELine, extractMessageFromJSON } from '../utils/streaming';

// Friendly page descriptions keyed by route — sent to Vaathiyaar as context so
// answers can reference what the learner is currently looking at.
const PAGE_LABELS = [
    ['/dashboard/playground', 'Playground — a live Python code terminal. You can DEMONSTRATE concepts here: include short, runnable Python code blocks in your answers and the student can run them in the terminal with one click'],
    ['/dashboard/paths', 'Evolution — the AI-personalised learning path'],
    ['/dashboard/knowledge', 'Knowledge Map — a live map of topics the student has mastered'],
    ['/dashboard/classroom', 'Classroom — AI-guided interactive Python lessons'],
    ['/dashboard/trending', 'Trending — daily AI & Python news and trends'],
    ['/dashboard/challenges', 'Challenges — weekly coding battles'],
    ['/dashboard/reference', 'Reference — quick Python cheat sheets'],
    ['/dashboard/community', 'Community — rankings and member leaderboard'],
    ['/dashboard/org-compete', 'Compete — organization challenges and leaderboard'],
    ['/dashboard/org', 'Admin Console — organization members, invites and analytics'],
    ['/dashboard/profile', 'Profile — account settings'],
    ['/dashboard/upgrade', 'Upgrade — plans and pricing'],
    ['/dashboard', 'Dashboard overview — the student\'s command center'],
];

function pageLabelFor(pathname) {
    const hit = PAGE_LABELS.find(([prefix]) => pathname === prefix || pathname.startsWith(prefix + '/'));
    return hit ? hit[1] : `the ${pathname} page`;
}

const OPEN_KEY = 'pm:vaathiyaar-panel-open';
const CONV_KEY = 'pm:vaathiyaar-panel-conv';

// On the Playground page python blocks get demo affordances: "Insert" loads the
// code into the live terminal, "Run demo" loads AND executes it — this is how
// Vaathiyaar demonstrates examples with the actual playground.
function buildMdComponents(onPlayground) {
    const inject = (codeText, run) =>
        window.dispatchEvent(new CustomEvent('pm:vaathiyaar-inject', { detail: { code: codeText, run } }));
    return {
        p: ({ children }) => <p className="text-sm text-text-secondary mb-2 leading-relaxed">{children}</p>,
        ul: ({ children }) => <ul className="list-disc list-inside text-sm text-text-secondary mb-2 space-y-1">{children}</ul>,
        ol: ({ children }) => <ol className="list-decimal list-inside text-sm text-text-secondary mb-2 space-y-1">{children}</ol>,
        strong: ({ children }) => <strong className="font-bold text-text-primary">{children}</strong>,
        code: ({ children, className }) => {
            if (!className) {
                return <code className="bg-accent-subtle text-accent-primary px-1.5 py-0.5 rounded text-xs font-mono">{children}</code>;
            }
            const codeText = String(children).replace(/\n$/, '');
            const isPython = /python|language-py/.test(className);
            return (
                <div className="my-2">
                    <pre className="surface-code p-3 rounded-xl text-xs font-mono overflow-x-auto border border-border-default">
                        <code>{children}</code>
                    </pre>
                    {onPlayground && isPython && (
                        <div className="flex items-center gap-1.5 mt-1.5">
                            <button
                                onClick={() => inject(codeText, false)}
                                title="Insert this example into the terminal"
                                className="flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-md bg-emerald-500/15 text-emerald-600 dark:text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/25 transition-all cursor-pointer"
                            >
                                <Terminal size={10} />
                                Insert
                            </button>
                            <button
                                onClick={() => inject(codeText, true)}
                                title="Insert into the terminal and run it now"
                                className="flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-md bg-green-500/15 text-green-600 dark:text-green-300 border border-green-500/30 hover:bg-green-500/25 transition-all cursor-pointer"
                            >
                                <Play size={10} />
                                Run demo
                            </button>
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
    const [open, setOpen] = useState(() => localStorage.getItem(OPEN_KEY) === '1');
    const [messages, setMessages] = useState([]);
    const [loading, setLoading] = useState(false);
    const [conversationId, setConversationId] = useState(() => sessionStorage.getItem(CONV_KEY) || null);
    const endRef = useRef(null);
    const controllerRef = useRef(null);

    // On Playground python blocks get "Insert"/"Run demo" affordances so
    // Vaathiyaar can demonstrate examples with the live terminal.
    const onPlayground = location.pathname.startsWith('/dashboard/playground');
    const pageLabel = pageLabelFor(location.pathname);
    const mdComponents = useMemo(() => buildMdComponents(onPlayground), [onPlayground]);

    useEffect(() => { localStorage.setItem(OPEN_KEY, open ? '1' : '0'); }, [open]);
    useEffect(() => {
        if (conversationId) sessionStorage.setItem(CONV_KEY, conversationId);
    }, [conversationId]);
    useEffect(() => () => controllerRef.current?.abort(), []);
    useEffect(() => {
        if (open) endRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages, loading, open]);

    // Esc closes the panel.
    useEffect(() => {
        if (!open) return;
        const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [open]);

    // Other surfaces (Playground "Send to Vaathiyaar" / "Ask AI for help")
    // hand a message to the panel via this event: open and send it.
    const handleSendRef = useRef(null);
    useEffect(() => {
        const onAsk = (e) => {
            const msg = e?.detail?.message;
            if (!msg) return;
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

    // Keep the ask-event listener pointed at the latest handleSend closure.
    useEffect(() => { handleSendRef.current = handleSend; }, [handleSend]);

    if (!user) return null;

    return (
        <>
            {/* Floating toggle */}
            {!open && (
                <button
                    onClick={() => setOpen(true)}
                    aria-label="Open Vaathiyaar chat"
                    title="Chat with Vaathiyaar"
                    className="fixed bottom-5 right-5 z-40 w-12 h-12 rounded-full bg-gradient-primary shadow-glow flex items-center justify-center cursor-pointer transition-transform duration-200 hover:scale-105 active:scale-95"
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
                        <div className="flex items-center gap-2.5 px-4 py-3 border-b border-border-default flex-shrink-0">
                            <div className="w-8 h-8 rounded-xl bg-gradient-primary flex items-center justify-center select-none shadow-glow flex-shrink-0">
                                <img src={VaathiyaarGlyph} alt="" aria-hidden="true" className="w-[60%] h-[60%]" />
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-bold text-text-primary font-display leading-tight">Vaathiyaar</p>
                                <p className="text-[10px] text-text-muted truncate" title={pageLabel}>
                                    Sees: {pageLabel.split('—')[0].trim()}
                                </p>
                            </div>
                            {messages.length > 0 && (
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

                        {/* Messages */}
                        <div className="flex-1 overflow-y-auto p-4 space-y-3 dark-scrollbar">
                            {messages.length === 0 && !loading && (
                                <div className="text-center py-10">
                                    <MessageCircle size={22} className="text-text-muted mx-auto mb-3" aria-hidden="true" />
                                    <p className="text-sm font-semibold text-text-primary mb-1">Ask Vaathiyaar anything</p>
                                    <p className="text-xs text-text-muted max-w-[240px] mx-auto leading-relaxed">
                                        I can see you're on {pageLabel.split('—')[0].trim()} — ask me about it, or anything Python.
                                    </p>
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
                    </motion.aside>
                )}
            </AnimatePresence>
        </>
    );
}
