import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { motion, AnimatePresence } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import ChatBar from '../components/ChatBar';
import api from '../api';
import { Sparkles, Zap, Plus, MessageSquare, ChevronLeft } from 'lucide-react';

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
        <div className="overflow-x-auto my-3 rounded-lg border border-slate-200">
            <table className="text-sm w-full">{children}</table>
        </div>
    ),
    thead: ({children}) => <thead className="bg-purple-50">{children}</thead>,
    tbody: ({children}) => <tbody className="divide-y divide-slate-100">{children}</tbody>,
    tr: ({children}) => <tr className="hover:bg-slate-50 transition-colors">{children}</tr>,
    th: ({children}) => (
        <th className="px-3 py-2 text-left text-xs font-bold text-purple-700 uppercase tracking-wider">{children}</th>
    ),
    td: ({children}) => (
        <td className="px-3 py-2 text-sm text-slate-700">{children}</td>
    ),
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
    const [conversationId, setConversationId] = useState(null);
    const [conversations, setConversations] = useState([]);
    const [showSidebar, setShowSidebar] = useState(false);

    // Fetch credits and conversations on mount
    useEffect(() => {
        if (user?.id) {
            api.get(`/playground/credits/${user.id}`)
                .then((r) => setCredits(r.data))
                .catch(() => setCredits({ xp: 0, total_prompts: 0, used_prompts: 0, remaining_prompts: 0 }))
                .finally(() => setCreditsLoading(false));

            api.get(`/playground/conversations/${user.id}`)
                .then((r) => {
                    setConversations(r.data);
                    // Resume the most recent conversation if exists
                    if (r.data.length > 0) {
                        loadConversation(r.data[0].id);
                    }
                })
                .catch(() => {});
        }
    }, [user]);

    // Auto-scroll
    useEffect(() => {
        chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages, loading]);

    const loadConversation = async (convId) => {
        if (!user?.id) return;
        try {
            const r = await api.get(`/playground/conversations/${user.id}/${convId}`);
            setMessages(r.data.map((m) => ({ role: m.role, content: m.content })));
            setConversationId(convId);
            setShowSidebar(false);
        } catch {
            // Conversation not found, start fresh
            setMessages([]);
            setConversationId(null);
        }
    };

    const startNewChat = () => {
        setMessages([]);
        setConversationId(null);
        setShowSidebar(false);
    };

    const refreshConversations = () => {
        if (user?.id) {
            api.get(`/playground/conversations/${user.id}`)
                .then((r) => setConversations(r.data))
                .catch(() => {});
        }
    };

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
                    conversation_id: conversationId,
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
            let rawText = '';

            const extractMessage = (text) => {
                const marker = '"message"';
                const idx = text.indexOf(marker);
                if (idx === -1) return null;
                const afterMarker = text.substring(idx + marker.length);
                const colonIdx = afterMarker.indexOf(':');
                if (colonIdx === -1) return null;
                const afterColon = afterMarker.substring(colonIdx + 1).trimStart();
                if (!afterColon.startsWith('"')) return null;
                let content = '';
                let i = 1;
                while (i < afterColon.length) {
                    if (afterColon[i] === '\\' && i + 1 < afterColon.length) {
                        const next = afterColon[i + 1];
                        if (next === 'n') content += '\n';
                        else if (next === 't') content += '\t';
                        else if (next === '"') content += '"';
                        else if (next === '\\') content += '\\';
                        else content += next;
                        i += 2;
                    } else if (afterColon[i] === '"') {
                        break;
                    } else {
                        content += afterColon[i];
                        i++;
                    }
                }
                return content || null;
            };

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
                                rawText += data.token;
                                const display = extractMessage(rawText) || '';
                                if (display) {
                                    setMessages((prev) =>
                                        prev.map((m) => m._isStreaming ? { ...m, content: display } : m)
                                    );
                                }
                            }
                            if (data.done) {
                                const finalMsg = data.message || extractMessage(rawText) || rawText;
                                setMessages((prev) =>
                                    prev.map((m) => m._isStreaming ? { role: 'assistant', content: finalMsg } : m)
                                );
                                // Capture conversation_id from response
                                if (data.conversation_id) {
                                    setConversationId(data.conversation_id);
                                    refreshConversations();
                                }
                            }
                            if (data.error) {
                                setMessages((prev) =>
                                    prev.map((m) => m._isStreaming ? { role: 'assistant', content: `Error: ${data.error}` } : m)
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

                    <div className="flex items-center gap-3">
                        {/* New Chat & History buttons */}
                        <button
                            onClick={startNewChat}
                            className="flex items-center gap-1.5 text-sm font-medium text-purple-600 bg-purple-50 border border-purple-200 rounded-full px-3 py-1.5 hover:bg-purple-100 transition-colors"
                        >
                            <Plus size={14} />
                            New Chat
                        </button>
                        <button
                            onClick={() => setShowSidebar(!showSidebar)}
                            className="flex items-center gap-1.5 text-sm font-medium text-slate-600 bg-slate-50 border border-slate-200 rounded-full px-3 py-1.5 hover:bg-slate-100 transition-colors"
                        >
                            <MessageSquare size={14} />
                            History
                        </button>

                        {!creditsLoading && credits && (
                            <>
                                <div className="flex items-center gap-1.5 text-sm font-bold text-amber-600 bg-amber-50 border border-amber-200 rounded-full px-3 py-1.5">
                                    <Zap size={14} />
                                    {credits.xp} XP
                                </div>
                                <div className="text-sm font-mono text-slate-500">
                                    {remaining} prompts left
                                </div>
                            </>
                        )}
                    </div>
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

            {/* Conversation History Sidebar */}
            <AnimatePresence>
                {showSidebar && (
                    <motion.div
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -20 }}
                        transition={{ duration: 0.2 }}
                        className="fixed inset-0 z-50 flex"
                    >
                        <div className="w-80 bg-white shadow-2xl border-r border-slate-200 flex flex-col h-full">
                            <div className="flex items-center justify-between p-4 border-b border-slate-200">
                                <h2 className="text-sm font-bold text-slate-800">Chat History</h2>
                                <button
                                    onClick={() => setShowSidebar(false)}
                                    className="text-slate-400 hover:text-slate-600 transition-colors"
                                >
                                    <ChevronLeft size={18} />
                                </button>
                            </div>
                            <div className="flex-1 overflow-y-auto p-2 space-y-1">
                                {conversations.length === 0 ? (
                                    <p className="text-sm text-slate-400 text-center py-8">No conversations yet</p>
                                ) : (
                                    conversations.map((conv) => (
                                        <button
                                            key={conv.id}
                                            onClick={() => loadConversation(conv.id)}
                                            className={`w-full text-left px-3 py-2.5 rounded-lg text-sm transition-colors ${
                                                conversationId === conv.id
                                                    ? 'bg-purple-50 text-purple-700 border border-purple-200'
                                                    : 'text-slate-700 hover:bg-slate-50'
                                            }`}
                                        >
                                            <p className="font-medium truncate">{conv.title}</p>
                                            <p className="text-xs text-slate-400 mt-0.5">
                                                {new Date(conv.updated_at).toLocaleDateString()}
                                            </p>
                                        </button>
                                    ))
                                )}
                            </div>
                        </div>
                        <div className="flex-1 bg-black/20" onClick={() => setShowSidebar(false)} />
                    </motion.div>
                )}
            </AnimatePresence>

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
                                        <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
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
