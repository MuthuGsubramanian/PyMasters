import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { motion, AnimatePresence } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import ChatBar from '../components/ChatBar';
import api from '../api';
import { Sparkles, Zap, Plus, MessageSquare, ChevronLeft, Clock, Copy, Check } from 'lucide-react';

// ──────────────────────────────────────────────────────────────────────────────
// Enhanced thinking bubble with waveform
// ──────────────────────────────────────────────────────────────────────────────
function ThinkingBubble() {
    return (
        <div className="flex items-start gap-3 max-w-[85%]">
            <div className="flex-shrink-0 w-9 h-9 rounded-xl bg-gradient-to-br from-purple-500 to-cyan-500 flex items-center justify-center text-sm select-none mt-1 shadow-md shadow-purple-300/20">
                {'🧑‍🏫'}
            </div>
            <div className="panel rounded-2xl rounded-tl-sm px-5 py-3.5 border-l-2 border-purple-500/40">
                <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1">
                        {[0, 1, 2, 3, 4].map(i => (
                            <div
                                key={i}
                                className="w-1 bg-purple-400 rounded-full"
                                style={{
                                    height: `${8 + Math.sin(i * 1.2) * 6}px`,
                                    animation: `waveform 1.2s ease-in-out ${i * 0.1}s infinite alternate`,
                                }}
                            />
                        ))}
                    </div>
                    <span className="text-xs text-purple-400 ml-1">Vaathiyaar is thinking...</span>
                </div>
            </div>
            <style>{`
                @keyframes waveform {
                    0% { height: 4px; opacity: 0.4; }
                    50% { height: 16px; opacity: 1; }
                    100% { height: 4px; opacity: 0.4; }
                }
            `}</style>
        </div>
    );
}

// ──────────────────────────────────────────────────────────────────────────────
// Copy button for code blocks
// ──────────────────────────────────────────────────────────────────────────────
function CopyButton({ text }) {
    const [copied, setCopied] = useState(false);
    const handleCopy = () => {
        navigator.clipboard.writeText(text).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        });
    };
    return (
        <button
            onClick={handleCopy}
            className="absolute top-2 right-2 p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-slate-400 hover:text-slate-200 transition-all duration-200"
        >
            {copied ? <Check size={12} className="text-green-400" /> : <Copy size={12} />}
        </button>
    );
}

// ──────────────────────────────────────────────────────────────────────────────
// Markdown components with copy-able code blocks
// ──────────────────────────────────────────────────────────────────────────────
const markdownComponents = {
    h2: ({children}) => <h2 className="text-base font-bold text-slate-900 mt-3 mb-1">{children}</h2>,
    h3: ({children}) => <h3 className="text-sm font-bold text-slate-800 mt-2 mb-1">{children}</h3>,
    p: ({children}) => <p className="text-sm text-slate-700 mb-2 leading-relaxed">{children}</p>,
    ul: ({children}) => <ul className="list-disc list-inside text-sm text-slate-700 mb-2 space-y-1">{children}</ul>,
    ol: ({children}) => <ol className="list-decimal list-inside text-sm text-slate-700 mb-2 space-y-1">{children}</ol>,
    code: ({children, className}) => className
        ? (
            <div className="relative group my-3">
                <pre className="bg-[#0d1117] text-slate-300 p-4 rounded-xl text-xs font-mono overflow-x-auto border border-slate-700/50 shadow-lg">
                    <code>{children}</code>
                </pre>
                <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                    <CopyButton text={String(children)} />
                </div>
            </div>
        ) : <code className="bg-purple-50 text-purple-700 px-1.5 py-0.5 rounded text-xs font-mono">{children}</code>,
    table: ({children}) => (
        <div className="overflow-x-auto my-3 rounded-xl border border-slate-200 shadow-sm">
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

    useEffect(() => {
        if (user?.id) {
            api.get(`/playground/credits/${user.id}`)
                .then((r) => setCredits(r.data))
                .catch(() => setCredits({ xp: 0, total_prompts: 0, used_prompts: 0, remaining_prompts: 0 }))
                .finally(() => setCreditsLoading(false));

            api.get(`/playground/conversations/${user.id}`)
                .then((r) => {
                    setConversations(r.data);
                    if (r.data.length > 0) {
                        loadConversation(r.data[0].id);
                    }
                })
                .catch(() => {});
        }
    }, [user]);

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
                        } catch (e) {}
                    }
                }
            }

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
    const remainingPct = total > 0 ? Math.min((remaining / total) * 100, 100) : 0;
    const exhausted = credits && remaining <= 0 && !creditsLoading;

    return (
        <div className="min-h-screen pb-40 flex flex-col">
            {/* Header */}
            <header className="space-y-4 mb-6">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center text-white shadow-lg shadow-amber-400/20">
                            <Sparkles size={20} />
                        </div>
                        <div>
                            <h1 className="text-2xl font-bold font-display text-slate-900">Playground</h1>
                            <p className="text-sm text-slate-500">Free-form chat with Vaathiyaar</p>
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        <button
                            onClick={startNewChat}
                            className="flex items-center gap-1.5 text-xs font-bold text-purple-600 bg-purple-50 border border-purple-200 rounded-xl px-3 py-2 hover:bg-purple-100 transition-all duration-300 hover:scale-[1.02] active:scale-[0.98]"
                        >
                            <Plus size={14} />
                            New Chat
                        </button>
                        <button
                            onClick={() => setShowSidebar(!showSidebar)}
                            className="flex items-center gap-1.5 text-xs font-bold text-slate-600 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 hover:bg-slate-100 transition-all duration-300"
                        >
                            <MessageSquare size={14} />
                            History
                        </button>
                    </div>
                </div>

                {/* Credits bar */}
                {!creditsLoading && credits && (
                    <div className="flex items-center gap-4">
                        <div className="flex-1 bg-slate-100 h-2 rounded-full overflow-hidden">
                            <motion.div
                                initial={{ width: 0 }}
                                animate={{ width: `${remainingPct}%` }}
                                transition={{ duration: 1, ease: 'easeOut' }}
                                className={`h-full rounded-full transition-colors duration-500 ${
                                    remainingPct > 50 ? 'bg-gradient-to-r from-emerald-400 to-green-500' :
                                    remainingPct > 20 ? 'bg-gradient-to-r from-amber-400 to-orange-500' :
                                    'bg-gradient-to-r from-red-400 to-red-500'
                                }`}
                            />
                        </div>
                        <div className="flex items-center gap-3 flex-shrink-0">
                            <span className="text-xs font-bold text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1 flex items-center gap-1">
                                <Zap size={12} />
                                {credits.xp} XP
                            </span>
                            <span className="text-xs font-mono text-slate-500">
                                {remaining}/{total} prompts
                            </span>
                        </div>
                    </div>
                )}
            </header>

            {/* Conversation History Sidebar */}
            <AnimatePresence>
                {showSidebar && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="fixed inset-0 z-50 flex"
                    >
                        <motion.div
                            initial={{ x: -20, opacity: 0 }}
                            animate={{ x: 0, opacity: 1 }}
                            exit={{ x: -20, opacity: 0 }}
                            transition={{ duration: 0.25 }}
                            className="w-80 bg-white/95 backdrop-blur-xl shadow-2xl border-r border-black/[0.04] flex flex-col h-full"
                        >
                            <div className="flex items-center justify-between p-4 border-b border-black/[0.04]">
                                <h2 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                                    <Clock size={14} className="text-slate-400" />
                                    Chat History
                                </h2>
                                <button
                                    onClick={() => setShowSidebar(false)}
                                    className="text-slate-400 hover:text-slate-600 transition-colors p-1 rounded-lg hover:bg-slate-100"
                                >
                                    <ChevronLeft size={18} />
                                </button>
                            </div>
                            <div className="flex-1 overflow-y-auto p-2 space-y-1">
                                {conversations.length === 0 ? (
                                    <div className="text-center py-12">
                                        <MessageSquare size={24} className="text-slate-300 mx-auto mb-3" />
                                        <p className="text-sm text-slate-400">No conversations yet</p>
                                        <p className="text-xs text-slate-400 mt-1">Start chatting to see history here</p>
                                    </div>
                                ) : (
                                    conversations.map((conv, idx) => (
                                        <motion.button
                                            key={conv.id}
                                            initial={{ opacity: 0, x: -10 }}
                                            animate={{ opacity: 1, x: 0 }}
                                            transition={{ delay: idx * 0.03 }}
                                            onClick={() => loadConversation(conv.id)}
                                            className={`w-full text-left px-3 py-3 rounded-xl text-sm transition-all duration-200 ${
                                                conversationId === conv.id
                                                    ? 'bg-purple-50 text-purple-700 border border-purple-200 shadow-sm'
                                                    : 'text-slate-700 hover:bg-slate-50 border border-transparent'
                                            }`}
                                        >
                                            <p className="font-medium truncate">{conv.title}</p>
                                            <p className="text-[10px] text-slate-400 mt-0.5 flex items-center gap-1">
                                                <Clock size={10} />
                                                {new Date(conv.updated_at).toLocaleDateString()}
                                            </p>
                                        </motion.button>
                                    ))
                                )}
                            </div>
                        </motion.div>
                        <div className="flex-1 bg-black/10 backdrop-blur-sm" onClick={() => setShowSidebar(false)} />
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Exhausted banner */}
            {exhausted && (
                <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="rounded-2xl p-5 bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 mb-6 flex items-start gap-4"
                >
                    <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-amber-100 border border-amber-200 flex items-center justify-center text-lg select-none">
                        {'🔒'}
                    </div>
                    <div>
                        <p className="font-bold text-amber-700 text-sm">No prompts remaining</p>
                        <p className="text-slate-600 text-sm mt-1 leading-relaxed">
                            You've used all your prompts! Complete more lessons to earn XP and unlock more.
                            Each 100 XP gives you more prompts.
                        </p>
                    </div>
                </motion.div>
            )}

            {/* Chat messages */}
            <div className="flex-1 space-y-4 max-w-2xl mx-auto w-full px-4">
                {messages.length === 0 && !loading && (
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="text-center py-20"
                    >
                        <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-purple-100 to-cyan-100 border border-purple-200/50 flex items-center justify-center text-4xl mx-auto mb-5 select-none shadow-lg shadow-purple-100/50">
                            {'🧑‍🏫'}
                        </div>
                        <h2 className="text-xl font-bold text-slate-800 mb-2 font-display">
                            {user?.name || user?.username
                                ? `Hey ${user.name || user.username}, ask me anything!`
                                : 'Ask Vaathiyaar anything!'}
                        </h2>
                        <p className="text-sm text-slate-500 max-w-md mx-auto mb-6 leading-relaxed">
                            This is your free-form playground. Ask about Python concepts, debug code,
                            explore ideas, or just have a conversation about programming.
                        </p>
                        {/* Quick start suggestions */}
                        <div className="flex flex-wrap justify-center gap-2 max-w-lg mx-auto">
                            {[
                                'Explain list comprehensions',
                                'How do decorators work?',
                                'Debug my code',
                                'Python vs JavaScript',
                            ].map(suggestion => (
                                <button
                                    key={suggestion}
                                    onClick={() => handleSend(suggestion)}
                                    className="text-xs font-medium text-purple-600 bg-purple-50 border border-purple-200 rounded-full px-3 py-1.5 hover:bg-purple-100 transition-all duration-200 hover:scale-[1.02]"
                                >
                                    {suggestion}
                                </button>
                            ))}
                        </div>
                    </motion.div>
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
                                    <div className="flex-shrink-0 w-9 h-9 rounded-xl bg-gradient-to-br from-purple-500 to-cyan-500 flex items-center justify-center text-sm select-none mt-1 shadow-md shadow-purple-300/20">
                                        {'🧑‍🏫'}
                                    </div>
                                    <div className="panel rounded-2xl rounded-tl-sm px-5 py-3.5 border-l-2 border-purple-500/40 text-slate-800 text-sm leading-relaxed">
                                        <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                                            {msg.content}
                                        </ReactMarkdown>
                                        {msg._isStreaming && (
                                            <span className="inline-block w-[2px] h-4 bg-purple-400 ml-0.5 align-middle"
                                                style={{ animation: 'blink 0.8s steps(2) infinite' }}
                                            />
                                        )}
                                    </div>
                                </div>
                            ) : (
                                <div className="max-w-[75%] bg-gradient-to-r from-cyan-500 to-blue-500 text-white rounded-2xl rounded-br-none px-5 py-3 text-sm leading-relaxed shadow-lg shadow-cyan-500/20">
                                    {msg.content}
                                </div>
                            )}
                        </motion.div>
                    ))}

                    {loading && !messages.some(m => m._isStreaming) && (
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
                            <div className="panel rounded-2xl px-5 py-3.5 border border-amber-200 bg-amber-50/50 text-center text-sm text-amber-700 font-medium">
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

            <style>{`
                @keyframes blink {
                    0%, 49% { opacity: 1; }
                    50%, 100% { opacity: 0; }
                }
            `}</style>
        </div>
    );
}
