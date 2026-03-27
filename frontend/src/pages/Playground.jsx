import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { motion, AnimatePresence } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import ChatBar from '../components/ChatBar';
import api, { getAuthHeaders } from '../api';
import VaathiyaarMessage from '../components/VaathiyaarMessage';
import { Sparkles, Zap, Plus, MessageSquare, ChevronLeft, Clock, Copy, Check, Play, Trash2, Send, Terminal, ArrowRight, Loader2 } from 'lucide-react';

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
            className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-slate-400 hover:text-slate-200 transition-all duration-200"
            title="Copy code"
        >
            {copied ? <Check size={12} className="text-green-400" /> : <Copy size={12} />}
        </button>
    );
}

// ──────────────────────────────────────────────────────────────────────────────
// "Copy to Terminal" button for injecting code into the editor
// ──────────────────────────────────────────────────────────────────────────────
function CopyToTerminalButton({ text, onInject }) {
    const [injected, setInjected] = useState(false);
    const handleInject = () => {
        onInject(text);
        setInjected(true);
        setTimeout(() => setInjected(false), 2000);
    };
    return (
        <button
            onClick={handleInject}
            className="p-1.5 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 hover:text-emerald-300 transition-all duration-200 flex items-center gap-1"
            title="Copy to Terminal"
        >
            {injected ? <Check size={12} /> : <><Terminal size={12} /><span className="text-[10px] font-medium">Terminal</span></>}
        </button>
    );
}

// ──────────────────────────────────────────────────────────────────────────────
// "Apply Fix" button — replaces editor content with the suggested code
// ──────────────────────────────────────────────────────────────────────────────
function ApplyFixButton({ text, onInject }) {
    const [applied, setApplied] = useState(false);
    const handleApply = () => {
        onInject(text);
        setApplied(true);
        setTimeout(() => setApplied(false), 2000);
    };
    return (
        <button
            onClick={handleApply}
            className="p-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-400 hover:text-amber-300 transition-all duration-200 flex items-center gap-1"
            title="Apply Fix to Terminal"
        >
            {applied ? <Check size={12} /> : <><ArrowRight size={12} /><span className="text-[10px] font-medium">Apply Fix</span></>}
        </button>
    );
}

// ──────────────────────────────────────────────────────────────────────────────
// Build markdown components with code injection support
// ──────────────────────────────────────────────────────────────────────────────
function buildMarkdownComponents(onInjectCode, hasExistingCode) {
    return {
        h2: ({children}) => <h2 className="text-base font-bold text-slate-900 mt-3 mb-1">{children}</h2>,
        h3: ({children}) => <h3 className="text-sm font-bold text-slate-800 mt-2 mb-1">{children}</h3>,
        p: ({children}) => <p className="text-sm text-slate-700 mb-2 leading-relaxed">{children}</p>,
        ul: ({children}) => <ul className="list-disc list-inside text-sm text-slate-700 mb-2 space-y-1">{children}</ul>,
        ol: ({children}) => <ol className="list-decimal list-inside text-sm text-slate-700 mb-2 space-y-1">{children}</ol>,
        code: ({children, className}) => {
            const isPythonBlock = className && (className.includes('python') || className.includes('language-python') || className.includes('language-py'));
            const isCodeBlock = !!className;

            if (isCodeBlock) {
                const codeText = String(children).replace(/\n$/, '');
                return (
                    <div className="relative group my-3">
                        <pre className="bg-[#0d1117] text-slate-300 p-4 rounded-xl text-xs font-mono overflow-x-auto border border-slate-700/50 shadow-lg">
                            <code>{children}</code>
                        </pre>
                        <div className="absolute top-2 right-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <CopyButton text={codeText} />
                            {isPythonBlock && (
                                <>
                                    <CopyToTerminalButton text={codeText} onInject={onInjectCode} />
                                    {hasExistingCode && (
                                        <ApplyFixButton text={codeText} onInject={onInjectCode} />
                                    )}
                                </>
                            )}
                        </div>
                    </div>
                );
            }
            return <code className="bg-purple-50 text-purple-700 px-1.5 py-0.5 rounded text-xs font-mono">{children}</code>;
        },
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
}

// ──────────────────────────────────────────────────────────────────────────────
// Line numbers component for the code editor
// ──────────────────────────────────────────────────────────────────────────────
function LineNumbers({ code, scrollRef }) {
    const lineCount = Math.max(code.split('\n').length, 1);
    return (
        <div
            ref={scrollRef}
            className="select-none text-right pr-3 pt-4 pb-4 text-slate-600 text-xs font-mono leading-[1.625rem] min-w-[3rem] border-r border-slate-700/50 overflow-hidden"
        >
            {Array.from({ length: lineCount }, (_, i) => (
                <div key={i + 1}>{i + 1}</div>
            ))}
        </div>
    );
}

// ──────────────────────────────────────────────────────────────────────────────
// Main Playground page
// ──────────────────────────────────────────────────────────────────────────────
export default function Playground() {
    const { user } = useAuth();
    const chatEndRef = useRef(null);
    const editorRef = useRef(null);
    const lineNumbersRef = useRef(null);

    useEffect(() => { document.title = 'Playground — PyMasters'; }, []);

    // Chat state
    const [messages, setMessages] = useState([]);
    const [loading, setLoading] = useState(false);
    const [credits, setCredits] = useState(null);
    const [creditsLoading, setCreditsLoading] = useState(true);
    const [conversationId, setConversationId] = useState(null);
    const [conversations, setConversations] = useState([]);
    const [showSidebar, setShowSidebar] = useState(false);

    // Code terminal state
    const [code, setCode] = useState('# Write Python code here...\n\n');
    const [output, setOutput] = useState('');
    const [running, setRunning] = useState(false);

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
                headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
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

            if (!response.ok) {
                throw new Error(`Server error: ${response.status}`);
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

    // ── Code terminal actions ──────────────────────────────────────────────
    const handleRunCode = async () => {
        if (!code.trim() || running) return;
        setRunning(true);
        setOutput('>>> Running...\n');
        try {
            const res = await api.post('/playground/execute', {
                user_id: user?.id,
                code: code,
            });
            const result = res.data;
            let out = '';
            if (result.output) out += result.output;
            if (result.error) out += (out ? '\n' : '') + result.error;
            if (!out) out = '(no output)';
            setOutput(out);
        } catch (err) {
            setOutput(`Execution error: ${err.response?.data?.detail || err.message}`);
        } finally {
            setRunning(false);
        }
    };

    const handleClearTerminal = () => {
        if (code.trim() && code.trim() !== '# Write Python code here...') {
            if (!window.confirm('Clear all code? This cannot be undone.')) return;
        }
        setCode('# Write Python code here...\n\n');
        setOutput('');
    };

    const [installPkg, setInstallPkg] = useState('');
    const [installing, setInstalling] = useState(false);

    const handleInstallPackage = async () => {
        const pkg = installPkg.trim();
        if (!pkg || installing) return;
        setInstalling(true);
        setOutput(`>>> pip install ${pkg}...\n`);
        try {
            const res = await api.post('/playground/install-package', { package: pkg, user_id: user?.id });
            if (res.data.success) {
                setOutput(`Successfully installed ${pkg}\n${res.data.output || ''}`);
            } else {
                setOutput(`Failed to install ${pkg}:\n${res.data.error}`);
            }
        } catch (err) {
            setOutput(`Install error: ${err.response?.data?.detail || err.message}`);
        } finally {
            setInstalling(false);
            setInstallPkg('');
        }
    };

    const handleSendToVaathiyaar = () => {
        const codeContent = code.trim();
        if (!codeContent) return;
        const message = `Can you review this code?\n\`\`\`python\n${codeContent}\n\`\`\``;
        handleSend(message);
    };

    const handleInjectCode = useCallback((newCode) => {
        setCode(newCode);
        if (editorRef.current) {
            editorRef.current.focus();
        }
    }, []);

    // Handle Tab and Ctrl+Enter keys in editor
    const handleEditorKeyDown = (e) => {
        if (e.key === 'Tab') {
            e.preventDefault();
            const { selectionStart, selectionEnd } = e.target;
            const newCode = code.substring(0, selectionStart) + '    ' + code.substring(selectionEnd);
            setCode(newCode);
            requestAnimationFrame(() => {
                if (editorRef.current) {
                    editorRef.current.selectionStart = selectionStart + 4;
                    editorRef.current.selectionEnd = selectionStart + 4;
                }
            });
        }
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
            e.preventDefault();
            handleRunCode();
        }
    };

    const remaining = credits?.remaining_prompts ?? 0;
    const total = credits?.total_prompts ?? 0;
    const remainingPct = total > 0 ? Math.min((remaining / total) * 100, 100) : 0;
    const exhausted = credits && remaining <= 0 && !creditsLoading;

    const hasExistingCode = code.trim() !== '' && code.trim() !== '# Write Python code here...';

    const mdComponents = buildMarkdownComponents(handleInjectCode, hasExistingCode);

    return (
        <div className="h-[100dvh] flex flex-col overflow-hidden">
            <VaathiyaarMessage />

            {/* ── Header ────────────────────────────────────────────────────── */}
            <header className="flex-shrink-0 px-6 pt-4 pb-3 space-y-3">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center text-white shadow-lg shadow-amber-400/20">
                            <Sparkles size={20} />
                        </div>
                        <div>
                            <h1 className="text-2xl font-bold font-display text-slate-900">Playground</h1>
                            <p className="text-xs text-slate-500">Chat with Vaathiyaar + Live Code Terminal</p>
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

            {/* ── Conversation History Sidebar ─────────────────────────────── */}
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

            {/* ── Exhausted banner ─────────────────────────────────────────── */}
            {exhausted && (
                <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mx-6 rounded-2xl p-4 bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 mb-2 flex items-start gap-4 flex-shrink-0"
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

            {/* ── Main Content: 2-column layout ───────────────────────────── */}
            <div className="flex-1 grid grid-cols-1 lg:grid-cols-5 gap-4 px-6 pb-2 min-h-0 overflow-hidden">

                {/* ── Left Panel: Vaathiyaar Chat ────────────────────────── */}
                <div className="col-span-1 lg:col-span-2 flex flex-col min-h-0 rounded-2xl border border-slate-200/80 bg-white/60 backdrop-blur-sm shadow-sm overflow-hidden">
                    {/* Panel header with macOS dots */}
                    <div className="flex items-center gap-2 px-4 py-2.5 border-b border-slate-200/60 bg-slate-50/80 flex-shrink-0">
                        <div className="flex items-center gap-1.5">
                            <div className="w-3 h-3 rounded-full bg-red-400" />
                            <div className="w-3 h-3 rounded-full bg-amber-400" />
                            <div className="w-3 h-3 rounded-full bg-green-400" />
                        </div>
                        <span className="text-xs font-semibold text-slate-500 ml-2 flex items-center gap-1.5">
                            {'🧑‍🏫'} Vaathiyaar Chat
                        </span>
                    </div>

                    {/* Chat messages area */}
                    <div className="flex-1 overflow-y-auto p-4 space-y-4">
                        {messages.length === 0 && !loading && (
                            <motion.div
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="text-center py-12"
                            >
                                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-purple-100 to-cyan-100 border border-purple-200/50 flex items-center justify-center text-3xl mx-auto mb-4 select-none shadow-lg shadow-purple-100/50">
                                    {'🧑‍🏫'}
                                </div>
                                <h2 className="text-lg font-bold text-slate-800 mb-2 font-display">
                                    {user?.name || user?.username
                                        ? `Hey ${user.name || user.username}!`
                                        : 'Ask Vaathiyaar anything!'}
                                </h2>
                                <p className="text-xs text-slate-500 max-w-xs mx-auto mb-5 leading-relaxed">
                                    Ask about Python concepts, debug code, explore ideas, or send your code for review.
                                </p>
                                {/* Quick start suggestions */}
                                <div className="flex flex-wrap justify-center gap-2 max-w-sm mx-auto">
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
                                        <div className="flex items-start gap-2.5 max-w-[90%]">
                                            <div className="flex-shrink-0 w-8 h-8 rounded-xl bg-gradient-to-br from-purple-500 to-cyan-500 flex items-center justify-center text-xs select-none mt-1 shadow-md shadow-purple-300/20">
                                                {'🧑‍🏫'}
                                            </div>
                                            <div className="panel rounded-2xl rounded-tl-sm px-4 py-3 border-l-2 border-purple-500/40 text-slate-800 text-sm leading-relaxed min-w-0">
                                                <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>
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
                                        <div className="max-w-[80%] bg-gradient-to-r from-cyan-500 to-blue-500 text-white rounded-2xl rounded-br-none px-4 py-2.5 text-sm leading-relaxed shadow-lg shadow-cyan-500/20">
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
                </div>

                {/* ── Right Panel: Live Code Terminal ─────────────────────── */}
                <div className="col-span-1 lg:col-span-3 flex flex-col min-h-0 rounded-2xl border border-slate-700/30 bg-[#0d1117] shadow-xl overflow-hidden">
                    {/* Panel header with macOS dots */}
                    <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-700/50 bg-[#161b22] flex-shrink-0">
                        <div className="flex items-center gap-2">
                            <div className="flex items-center gap-1.5">
                                <div className="w-3 h-3 rounded-full bg-red-400" />
                                <div className="w-3 h-3 rounded-full bg-amber-400" />
                                <div className="w-3 h-3 rounded-full bg-green-400" />
                            </div>
                            <span className="text-xs font-semibold text-slate-400 ml-2 flex items-center gap-1.5">
                                <Terminal size={12} />
                                code.py
                            </span>
                        </div>
                        <div className="flex items-center gap-1.5">
                            <span className="text-[10px] text-slate-600 font-mono">Python 3</span>
                        </div>
                    </div>

                    {/* Code editor area */}
                    <div className="flex-1 flex flex-col min-h-0">
                        <div className="flex-1 flex min-h-0 overflow-hidden" style={{ minHeight: '40%' }}>
                            <LineNumbers code={code} scrollRef={lineNumbersRef} />
                            <textarea
                                ref={editorRef}
                                value={code}
                                onChange={(e) => setCode(e.target.value)}
                                onKeyDown={handleEditorKeyDown}
                                onScroll={(e) => {
                                    if (lineNumbersRef.current) {
                                        lineNumbersRef.current.scrollTop = e.target.scrollTop;
                                    }
                                }}
                                spellCheck={false}
                                className="flex-1 bg-transparent text-[#e6edf3] text-sm font-mono p-4 resize-none outline-none leading-[1.625rem] overflow-y-auto placeholder-slate-600"
                                style={{ caretColor: '#39d353', tabSize: 4 }}
                                placeholder="# Write Python code here...&#10;# Press Ctrl+Enter to run"
                            />
                        </div>

                        {/* Output panel */}
                        <div className="flex-shrink-0 border-t border-slate-700/50" style={{ maxHeight: '35%' }}>
                            <div className="flex items-center gap-2 px-4 py-1.5 bg-[#161b22] border-b border-slate-700/30">
                                <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Output</span>
                                {running && (
                                    <Loader2 size={10} className="text-green-400 animate-spin" />
                                )}
                            </div>
                            <div className="overflow-y-auto p-4 font-mono text-xs leading-relaxed" style={{ maxHeight: 'calc(100% - 28px)' }}>
                                {output ? (
                                    <pre className={`whitespace-pre-wrap break-words ${
                                        output.startsWith('Error') || output.startsWith('Execution error')
                                            ? 'text-red-400'
                                            : 'text-green-400'
                                    }`}>
                                        {output}
                                    </pre>
                                ) : (
                                    <span className="text-slate-600 italic">Run your code to see output here...</span>
                                )}
                            </div>
                        </div>

                        {/* Action buttons */}
                        <div className="flex items-center gap-2 px-4 py-2.5 border-t border-slate-700/50 bg-[#161b22] flex-shrink-0">
                            <button
                                onClick={handleRunCode}
                                disabled={running || !code.trim()}
                                className={`flex items-center gap-1.5 text-xs font-bold text-white rounded-xl px-4 py-2 transition-all duration-300 ${
                                    running
                                        ? 'bg-green-600 animate-pulse cursor-wait'
                                        : 'bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-400 hover:to-emerald-500 hover:scale-[1.02] active:scale-[0.98] shadow-lg shadow-green-500/20'
                                } disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100`}
                            >
                                {running ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
                                {running ? 'Running...' : 'Run Code'}
                            </button>
                            <span className="text-[10px] text-slate-600 font-mono hidden sm:inline">Ctrl+Enter</span>
                            <button
                                onClick={handleClearTerminal}
                                className="flex items-center gap-1.5 text-xs font-medium text-slate-400 bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 hover:bg-slate-700 hover:text-slate-300 transition-all duration-200"
                            >
                                <Trash2 size={13} />
                                Clear
                            </button>
                            <div className="flex-1" />
                            <button
                                onClick={handleSendToVaathiyaar}
                                disabled={!code.trim() || loading}
                                className="flex items-center gap-1.5 text-xs font-bold text-purple-300 bg-purple-500/10 border border-purple-500/30 rounded-xl px-3 py-2 hover:bg-purple-500/20 hover:text-purple-200 transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                                <Send size={13} />
                                Send to Vaathiyaar
                            </button>
                        </div>

                        {/* Package installer */}
                        <div className="flex items-center gap-2 mt-2 pt-2 border-t border-white/[0.04]">
                            <span className="text-[10px] text-slate-500 font-mono flex-shrink-0">pip install</span>
                            <input
                                type="text"
                                value={installPkg}
                                onChange={(e) => setInstallPkg(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && handleInstallPackage()}
                                placeholder="package-name"
                                className="flex-1 bg-white/[0.04] border border-white/[0.08] rounded-lg px-2.5 py-1.5 text-xs text-slate-300 placeholder-slate-600 font-mono focus:outline-none focus:border-green-500/40"
                            />
                            <button
                                onClick={handleInstallPackage}
                                disabled={!installPkg.trim() || installing}
                                className="text-[10px] font-bold text-green-300 bg-green-500/10 border border-green-500/30 rounded-lg px-3 py-1.5 hover:bg-green-500/20 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                                {installing ? 'Installing...' : 'Install'}
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {/* ── Chat Input Bar (full width) ─────────────────────────────── */}
            <div className="flex-shrink-0 px-6 py-3 bg-gradient-to-t from-[#f0f4f8] to-transparent">
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

            <style>{`
                @keyframes waveform {
                    0% { height: 4px; opacity: 0.4; }
                    50% { height: 16px; opacity: 1; }
                    100% { height: 4px; opacity: 0.4; }
                }
                @keyframes blink {
                    0%, 49% { opacity: 1; }
                    50%, 100% { opacity: 0; }
                }
            `}</style>
        </div>
    );
}
