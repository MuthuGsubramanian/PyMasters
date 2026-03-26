import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { motion, AnimatePresence } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import ChatBar from '../components/ChatBar';
import api from '../api';
import { Sparkles, Zap } from 'lucide-react';

// ──────────────────────────────────────────────────────────────────────────────
// Thinking bubble
// ──────────────────────────────────────────────────────────────────────────────
function ThinkingBubble() {
    return (
        <div className="flex items-start gap-3 max-w-[85%]">
            <div className="flex-shrink-0 w-9 h-9 rounded-full bg-purple-100 border border-purple-200 flex items-center justify-center text-lg select-none mt-1">
                🧑‍🏫
            </div>
            <div className="panel rounded-2xl rounded-tl-sm px-5 py-3 border-l-2 border-purple-500/60">
                <div className="flex items-center gap-1.5">
                    <div className="w-2 h-2 bg-purple-400 rounded-full animate-bounce" style={{animationDelay: '0ms'}} />
                    <div className="w-2 h-2 bg-purple-400 rounded-full animate-bounce" style={{animationDelay: '150ms'}} />
                    <div className="w-2 h-2 bg-purple-400 rounded-full animate-bounce" style={{animationDelay: '300ms'}} />
                    <span className="text-sm text-purple-500 ml-2">Vaathiyaar is thinking...</span>
                </div>
            </div>
        </div>
    );
}

// ──────────────────────────────────────────────────────────────────────────────
// Markdown components
// ──────────────────────────────────────────────────────────────────────────────
const markdownComponents = {
    h2: ({children}) => <h2 className="text-base font-bold text-slate-900 mt-3 mb-1">{children}</h2>,
    h3: ({children}) => <h3 className="text-sm font-bold text-slate-800 mt-2 mb-1">{children}</h3>,
    p: ({children}) => <p className="text-sm text-slate-700 mb-2">{children}</p>,
    ul: ({children}) => <ul className="list-disc list-inside text-sm text-slate-700 mb-2 space-y-1">{children}</ul>,
    ol: ({children}) => <ol className="list-decimal list-inside text-sm text-slate-700 mb-2 space-y-1">{children}</ol>,
    code: ({inline, children}) => inline
        ? <code className="bg-slate-100 text-purple-700 px-1.5 py-0.5 rounded text-xs font-mono">{children}</code>
        : <pre className="bg-slate-800 text-slate-200 p-3 rounded-lg text-xs font-mono overflow-x-auto my-2"><code>{children}</code></pre>,
    table: ({children}) => (
        <div className="overflow-x-auto my-2">
            <table className="text-xs border-collapse w-full min-w-[300px]">{children}</table>
        </div>
    ),
    th: ({children}) => <th className="border border-slate-300 bg-slate-100 px-2 py-1 text-left font-bold text-slate-700">{children}</th>,
    td: ({children}) => <td className="border border-slate-200 px-2 py-1 text-slate-600">{children}</td>,
    strong: ({children}) => <strong className="font-bold text-slate-900">{children}</strong>,
};

// ──────────────────────────────────────────────────────────────────────────────
// Main Playground page
// ──────────────────────────────────────────────────────────────────────────────
export default function Playground() {
    const { user } = useAuth();
    const chatEndRef = useRef(null);

    const [messages, setMessages] = useState([]);
    const [loading, setLoading] = useState(false);
    const [credits, setCredits] = useState(null);
    const [creditsLoading, setCreditsLoading] = useState(true);

    // Fetch credits on mount
    useEffect(() => {
        if (user?.id) {
            api.get(`/playground/credits/${user.id}`)
                .then((r) => setCredits(r.data))
                .catch(() => setCredits({ xp: 0, total_prompts: 0, used_prompts: 0, remaining_prompts: 0 }))
                .finally(() => setCreditsLoading(false));
        }
    }, [user]);

    // Auto-scroll
    useEffect(() => {
        chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages, loading]);

    const handleSend = async (message) => {
        if (!message.trim() || loading) return;
        if (credits && credits.remaining_prompts <= 0) return;

        const userMsg = { role: 'user', content: message };
        setMessages((prev) => [...prev, userMsg]);
        setLoading(true);

        // Add empty assistant message that we'll stream into
        const streamMsg = { role: 'assistant', content: '', _isStreaming: true };
        setMessages((prev) => [...prev, streamMsg]);

        try {
            const response = await fetch(`${api.defaults.baseURL}/playground/chat/stream`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    user_id: user?.id,
                    message,
                    language: user?.preferred_language || 'en',
                }),
            });

            if (response.status === 403) {
                setMessages((prev) => {
                    const filtered = prev.filter((m) => !m._isStreaming);
                    return [...filtered, { role: 'assistant', content: "You've used all your prompts! Complete more lessons to earn XP and unlock more." }];
                });
                return;
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let fullText = '';

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                const chunk = decoder.decode(value, { stream: true });
                const lines = chunk.split('\n');

                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        try {
                            const data = JSON.parse(line.slice(6));
                            if (data.token) {
                                fullText += data.token;
                                setMessages((prev) =>
                                    prev.map((m) => m._isStreaming ? { ...m, content: fullText } : m)
                                );
                            }
                            if (data.done) {
                                setMessages((prev) =>
                                    prev.map((m) => m._isStreaming ? { role: 'assistant', content: fullText } : m)
                                );
                            }
                        } catch (e) {
                            // ignore parse errors on partial chunks
                        }
                    }
                }
            }

            // Refresh credits after streaming completes
            if (user?.id) {
                api.get(`/playground/credits/${user.id}`)
                    .then((r) => setCredits(r.data))
                    .catch(() => {});
            }
        } catch (err) {
            setMessages((prev) => {
                const filtered = prev.filter((m) => !m._isStreaming);
                return [...filtered, { role: 'assistant', content: `Sorry, something went wrong. (${err.message}). Try again in a moment.` }];
            });
        } finally {
            setLoading(false);
        }
    };

    const remaining = credits?.remaining_prompts ?? 0;
    const total = credits?.total_prompts ?? 0;
    const usedPct = total > 0 ? Math.min(((total - remaining) / total) * 100, 100) : 100;
    const exhausted = credits && remaining <= 0 && !creditsLoading;

    return (
        <div className="min-h-screen pb-40 flex flex-col">
            {/* Header */}
            <header className="space-y-4 mb-6">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center text-white shadow-lg">
                            <Sparkles size={20} />
                        </div>
                        <div>
                            <h1 className="text-2xl font-bold font-display text-slate-900">Playground</h1>
                            <p className="text-sm text-slate-500">Free-form chat with Vaathiyaar</p>
                        </div>
                    </div>

                    {!creditsLoading && credits && (
                        <div className="flex items-center gap-4">
                            <div className="flex items-center gap-1.5 text-sm font-bold text-amber-600 bg-amber-50 border border-amber-200 rounded-full px-3 py-1.5">
                                <Zap size={14} />
                                {credits.xp} XP
                            </div>
                            <div className="text-sm font-mono text-slate-500">
                                {remaining} prompts left
                            </div>
                        </div>
                    )}
                </div>

                {/* Progress bar */}
                {!creditsLoading && credits && total > 0 && (
                    <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden">
                        <div
                            className="h-full bg-gradient-to-r from-amber-400 to-orange-500 transition-all duration-500"
                            style={{ width: `${100 - usedPct}%` }}
                        />
                    </div>
                )}
            </header>

            {/* Exhausted banner */}
            {exhausted && (
                <div className="panel rounded-xl p-6 border-l-4 border-l-amber-400 bg-amber-50/80 mb-6 flex items-start gap-4">
                    <div className="flex-shrink-0 w-9 h-9 rounded-full bg-amber-100 border border-amber-200 flex items-center justify-center text-lg select-none">
                        🔒
                    </div>
                    <div>
                        <p className="font-bold text-amber-700 text-sm">No prompts remaining</p>
                        <p className="text-slate-600 text-sm mt-1">
                            You've used all your prompts! Complete more lessons to earn XP and unlock more.
                            Each XP gives you 100 prompts.
                        </p>
                    </div>
                </div>
            )}

            {/* Chat messages */}
            <div className="flex-1 space-y-4 max-w-2xl mx-auto w-full px-4">
                {messages.length === 0 && !loading && (
                    <div className="text-center py-20">
                        <div className="w-16 h-16 rounded-2xl bg-purple-100 border border-purple-200 flex items-center justify-center text-3xl mx-auto mb-4 select-none">
                            🧑‍🏫
                        </div>
                        <h2 className="text-lg font-bold text-slate-800 mb-2">Ask Vaathiyaar anything!</h2>
                        <p className="text-sm text-slate-500 max-w-md mx-auto">
                            This is your free-form playground. Ask about Python concepts, debug code,
                            explore ideas, or just have a conversation about programming.
                        </p>
                    </div>
                )}

                <AnimatePresence initial={false}>
                    {messages.map((msg, idx) => (
                        <motion.div
                            key={idx}
                            initial={{ opacity: 0, y: 8 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.25 }}
                            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                        >
                            {msg.role === 'assistant' ? (
                                <div className="flex items-start gap-3 max-w-[85%]">
                                    <div className="flex-shrink-0 w-9 h-9 rounded-full bg-purple-100 border border-purple-200 flex items-center justify-center text-lg select-none mt-1">
                                        🧑‍🏫
                                    </div>
                                    <div className="panel rounded-2xl rounded-tl-sm px-5 py-3 border-l-2 border-purple-500/60 text-slate-800 text-sm leading-relaxed">
                                        <ReactMarkdown components={markdownComponents}>
                                            {msg.content}
                                        </ReactMarkdown>
                                        {msg._isStreaming && <span className="inline-block w-2 h-4 bg-purple-400 animate-pulse ml-0.5" />}
                                    </div>
                                </div>
                            ) : (
                                <div className="max-w-[75%] bg-cyan-500 text-white rounded-2xl rounded-br-none px-5 py-3 text-sm leading-relaxed">
                                    {msg.content}
                                </div>
                            )}
                        </motion.div>
                    ))}

                    {loading && (
                        <motion.div
                            key="thinking"
                            initial={{ opacity: 0, y: 8 }}
                            animate={{ opacity: 1, y: 0 }}
                        >
                            <ThinkingBubble />
                        </motion.div>
                    )}
                </AnimatePresence>

                <div ref={chatEndRef} />
            </div>

            {/* Fixed chat bar */}
            <div className="fixed bottom-0 left-0 right-0 z-50">
                <div className="h-10 bg-gradient-to-t from-[#f0f4f8] to-transparent pointer-events-none" />
                <div className="bg-[#f0f4f8] px-4 pb-4">
                    <div className="max-w-2xl mx-auto">
                        {exhausted ? (
                            <div className="panel rounded-2xl px-5 py-3 border border-slate-200 text-center text-sm text-slate-500">
                                No prompts remaining. Earn more XP in the Classroom!
                            </div>
                        ) : (
                            <ChatBar
                                onSend={handleSend}
                                loading={loading}
                                placeholder="Ask Vaathiyaar anything..."
                            />
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
