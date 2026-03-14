import { useState, useEffect } from 'react';
import { useNavigate, useParams, Outlet, Navigate, useLocation } from 'react-router-dom';
import {
    BookOpen,
    Code2,
    Cpu,
    Play,
    Send,
    Lock,
    CheckCircle2,
    Trophy,
    Award,
    Terminal as TerminalIcon,
    ChevronRight,
    Activity
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { useAuth } from '../context/AuthContext';
import { runCode, chatAI, getModules, getModule, completeModule } from '../api';
import { motion } from 'framer-motion';
import clsx from 'clsx';

// --- SUB-VIEWS ---

export function Overview() {
    const { user } = useAuth();
    const navigate = useNavigate();

    return (
        <div className="animate-fade-in space-y-8">
            <header>
                <h1 className="text-3xl font-bold mb-2">Command Center</h1>
                <p className="text-slate-400">Welcome back, {user.username}. Systems optimal.</p>
            </header>

            <div className="grid md:grid-cols-3 gap-6">
                <div className="md:col-span-2 space-y-6">
                    {/* Quick Stats */}
                    <div className="grid grid-cols-2 gap-4">
                        <div className="panel p-6 rounded-xl flex items-center justify-between">
                            <div>
                                <div className="text-sm text-slate-500 font-bold uppercase tracking-wider">Total XP</div>
                                <div className="text-3xl font-display font-bold text-white mt-1">{user.points}</div>
                            </div>
                            <div className="w-12 h-12 bg-cyan-500/10 rounded-lg flex items-center justify-center text-cyan-400">
                                <Trophy size={24} />
                            </div>
                        </div>
                        <div className="panel p-6 rounded-xl flex items-center justify-between">
                            <div>
                                <div className="text-sm text-slate-500 font-bold uppercase tracking-wider">Modules</div>
                                <div className="text-3xl font-display font-bold text-white mt-1">{(user.unlocked || []).length} / 12</div>
                            </div>
                            <div className="w-12 h-12 bg-purple-500/10 rounded-lg flex items-center justify-center text-purple-400">
                                <BookOpen size={24} />
                            </div>
                        </div>
                    </div>

                    {/* Continue Learning Banner */}
                    <div className="panel p-8 rounded-xl border-l-4 border-l-cyan-400 bg-gradient-to-r from-cyan-900/10 to-transparent">
                        <div className="flex justify-between items-center">
                            <div>
                                <h3 className="text-xl font-bold mb-2 text-white">Continue Training</h3>
                                <p className="text-slate-400 text-sm mb-4">You are currently on Module {(user.unlocked || []).length}.</p>
                                <button onClick={() => navigate('/dashboard/learn')} className="btn-neo btn-neo-primary py-2 text-sm">Resume Path</button>
                            </div>
                            <div className="hidden sm:block opacity-50">
                                <Cpu size={80} />
                            </div>
                        </div>
                    </div>
                </div>

                {/* Social / Leaderboard (Placeholder) */}
                <div className="panel p-6 rounded-xl h-full">
                    <h3 className="font-bold text-sm text-slate-400 uppercase tracking-widest mb-4">Live Feed</h3>
                    <div className="space-y-4">
                        {[1, 2, 3].map(i => (
                            <div key={i} className="flex gap-3 text-sm items-start">
                                <div className="w-2 h-2 mt-1.5 rounded-full bg-green-500 shrink-0 animate-pulse"></div>
                                <div className="text-slate-400">
                                    <span className="text-white font-bold">User_{900 + i}</span> just completed <span className="text-cyan-400">Advanced Recursion</span>.
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    )
}

export function LearningMap() {
    const { user } = useAuth();
    const [modules, setModules] = useState([]);
    const navigate = useNavigate();

    useEffect(() => {
        getModules().then(res => setModules(res.data)).catch(err => console.error(err));
    }, []);

    const isUnlocked = (id) => (user.unlocked || []).includes(id) || id === "module_1";

    return (
        <div className="animate-fade-in pb-20 max-w-5xl mx-auto">
            <header className="mb-10 flex justify-between items-end border-b border-white/5 pb-6">
                <div>
                    <h2 className="text-3xl font-bold mb-2">Neural Learning Path</h2>
                    <p className="text-slate-400">Sequential knowledge acquisition protocol.</p>
                </div>
                <div className="text-right hidden sm:block">
                    <div className="text-xs text-slate-500 font-bold uppercase tracking-widest">Progress</div>
                    <div className="text-xl font-mono text-cyan-400">{Math.round(((user.unlocked || []).length / modules.length) * 100)}%</div>
                </div>
            </header>

            <div className="space-y-4">
                {modules.map((mod, idx) => {
                    const unlocked = isUnlocked(mod.id);
                    return (
                        <div
                            key={mod.id}
                            onClick={() => unlocked && navigate(`/dashboard/learn/${mod.id}`)}
                            className={clsx(
                                "group relative overflow-hidden rounded-xl border transition-all duration-300 p-6 flex items-center justify-between",
                                unlocked
                                    ? "bg-[#0f172a] border-white/10 hover:border-cyan-500/50 hover:bg-[#1e293b] cursor-pointer"
                                    : "bg-[#0b101b] border-transparent opacity-50 grayscale cursor-not-allowed"
                            )}
                        >
                            <div className="flex items-center gap-6 relative z-10">
                                <div className={clsx(
                                    "fex items-center justify-center w-12 h-12 rounded-lg font-mono font-bold text-lg border",
                                    unlocked ? "bg-cyan-500/10 border-cyan-500/20 text-cyan-400" : "bg-white/5 border-white/5 text-slate-600"
                                )}>
                                    {idx + 1}
                                </div>
                                <div>
                                    <h3 className="text-xl font-bold text-white mb-1 group-hover:text-cyan-400 transition-colors">{mod.title}</h3>
                                    <p className="text-sm text-slate-400 max-w-xl">{mod.desc}</p>
                                </div>
                            </div>

                            <div className="flex items-center gap-4 relative z-10">
                                {unlocked ? (
                                    <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-green-500/10 text-green-400 text-xs font-bold uppercase tracking-wider">
                                        <CheckCircle2 size={14} /> Unlocked
                                    </div>
                                ) : (
                                    <Lock size={20} className="text-slate-600" />
                                )}
                                <ChevronRight size={20} className={clsx("transition-transform duration-300", unlocked ? "text-slate-400 group-hover:translate-x-1" : "text-transparent")} />
                            </div>
                        </div>
                    )
                })}
            </div>
        </div>
    );
}

export function ModuleViewer() {
    const { id } = useParams();
    const { user, updateProgress } = useAuth();
    const navigate = useNavigate();
    const [module, setModule] = useState(null);
    const [quizMode, setQuizMode] = useState(false);
    const [answers, setAnswers] = useState({});
    const [result, setResult] = useState(null);

    useEffect(() => {
        getModule(id).then(res => setModule(res.data)).catch(() => navigate('/dashboard/learn'));
    }, [id, navigate]);

    if (!module) return <div className="flex items-center justify-center h-64"><div className="animate-spin w-8 h-8 border-2 border-cyan-500 border-t-transparent rounded-full"></div></div>;

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
                    setResult({ passed: true, msg: `Module Complete! +${module.xp_reward} XP` });
                }
            } catch (err) {
                console.error(err);
            }
        } else {
            setResult({ passed: false, msg: `Score: ${correctCount}/${module.quiz.length}. Retake required.` });
        }
    };

    return (
        <div className="max-w-4xl mx-auto pb-20 animate-fade-in relative">
            <button onClick={() => navigate('/dashboard/learn')} className="mb-6 text-xs font-bold text-slate-500 hover:text-white uppercase tracking-widest flex items-center gap-2 transition-colors">
                <ChevronRight size={14} className="rotate-180" /> Back to Map
            </button>

            <div className="panel overflow-hidden rounded-2xl relative">
                {/* Header Graphic */}
                <div className="h-32 bg-gradient-to-r from-cyan-900/20 to-blue-900/20 border-b border-white/5 p-8 flex items-end">
                    <div>
                        <h1 className="text-3xl font-bold text-white relative z-10">{module.title}</h1>
                        <p className="text-cyan-200/80 text-sm font-mono mt-2">{module.id.toUpperCase()} // REWARD: {module.xp_reward} XP</p>
                    </div>
                </div>

                <div className="p-8 md:p-12">
                    {!quizMode ? (
                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="prose prose-invert prose-lg max-w-none">
                            <ReactMarkdown
                                components={{
                                    code: ({ node, inline, className, children, ...props }) => (
                                        <div className="not-prose bg-[#0b101b] p-4 rounded-xl border border-white/5 font-mono text-sm text-slate-300 overflow-x-auto my-4 shadow-inner">
                                            {children}
                                        </div>
                                    ),
                                    h1: ({ children }) => <h1 className="text-2xl font-bold text-white mb-6">{children}</h1>,
                                    h2: ({ children }) => <h2 className="text-xl font-bold text-cyan-100 flex items-center gap-3 mt-8 mb-4"><span className="w-1 h-6 bg-cyan-500 rounded-full"></span>{children}</h2>
                                }}
                            >
                                {module.content}
                            </ReactMarkdown>
                            <div className="mt-16 pt-8 border-t border-white/5 flex justify-end">
                                <button onClick={() => setQuizMode(true)} className="btn-neo btn-neo-primary">
                                    Initialize Quiz Protocol <ArrowRight size={18} className="ml-2" />
                                </button>
                            </div>
                        </motion.div>
                    ) : (
                        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="max-w-2xl mx-auto">
                            <div className="text-center mb-10">
                                <h3 className="text-2xl font-bold text-white mb-2">Knowledge Verification</h3>
                                <p className="text-slate-400 text-sm">Pass with 100% accuracy to proceed.</p>
                            </div>

                            {result && (
                                <div className={`p-4 rounded-xl mb-8 text-center font-bold border ${result.passed ? 'bg-green-500/10 text-green-200 border-green-500/20' : 'bg-red-500/10 text-red-200 border-red-500/20'}`}>
                                    <div className="text-lg">{result.msg}</div>
                                </div>
                            )}

                            <div className="space-y-8">
                                {module.quiz.map((q, qIdx) => (
                                    <div key={qIdx} className="space-y-4">
                                        <p className="font-bold text-lg text-white font-display ml-1">{qIdx + 1}. {q.q}</p>
                                        <div className="space-y-2">
                                            {q.options.map((opt, oIdx) => (
                                                <div
                                                    key={oIdx}
                                                    onClick={() => !result?.passed && setAnswers({ ...answers, [qIdx]: oIdx })}
                                                    className={clsx(
                                                        "flex items-center gap-4 p-4 rounded-xl cursor-pointer transition-all border",
                                                        answers[qIdx] === oIdx
                                                            ? "bg-cyan-500/10 border-cyan-500/50"
                                                            : "bg-white/5 border-transparent hover:bg-white/10"
                                                    )}
                                                >
                                                    <div className={clsx(
                                                        "w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0",
                                                        answers[qIdx] === oIdx ? "border-cyan-400" : "border-slate-600"
                                                    )}>
                                                        {answers[qIdx] === oIdx && <div className="w-2.5 h-2.5 bg-cyan-400 rounded-full"></div>}
                                                    </div>
                                                    <span className={answers[qIdx] === oIdx ? 'text-cyan-100 font-medium' : 'text-slate-400'}>{opt}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                ))}
                            </div>

                            <div className="mt-12 flex justify-end gap-4 border-t border-white/5 pt-8">
                                {!result?.passed ? (
                                    <>
                                        <button onClick={() => setQuizMode(false)} className="btn-neo btn-neo-ghost">Abort</button>
                                        <button onClick={handleQuizSubmit} className="btn-neo btn-neo-primary">Submit Analysis</button>
                                    </>
                                ) : (
                                    <button onClick={() => navigate('/dashboard/learn')} className="btn-neo btn-neo-primary w-full">Return to Map</button>
                                )}
                            </div>
                        </motion.div>
                    )}
                </div>
            </div>
        </div>
    );
}

export function StudioView() {
    const [code, setCode] = useState('print("Hello from PyMasters!")\n');
    const [output, setOutput] = useState('');
    const [loading, setLoading] = useState(false);
    const [input, setInput] = useState('');
    const [messages, setMessages] = useState([
        { role: 'assistant', content: 'Neural Link established. I am ready to assist with your Python code.' }
    ]);
    const [chatLoading, setChatLoading] = useState(false);

    // ... (Keep existing Run/Chat logic, styling updated below) ...
    const handleRun = async () => {
        setLoading(true);
        setOutput('');
        try {
            const res = await runCode(code);
            if (res.data.error) {
                setOutput(`Error:\n${res.data.error}`);
            } else {
                setOutput(res.data.output || '(No output)');
            }
        } catch (err) {
            setOutput('Failed to execute code. Connection error?');
        } finally {
            setLoading(false);
        }
    };

    const handleChat = async (e) => {
        e.preventDefault();
        if (!input.trim()) return;

        const userMsg = { role: 'user', content: input };
        setMessages(prev => [...prev, userMsg]);
        setInput('');
        setChatLoading(true);

        try {
            const res = await chatAI(userMsg.content, code);
            setMessages((prev) => [...prev, { role: 'assistant', content: res.data.response }]);
        } catch (err) {
            setMessages((prev) => [...prev, { role: 'assistant', content: 'Uplink Failed. Check Local AI Server.' }]);
        } finally {
            setChatLoading(false);
        }
    };

    return (
        <div className="h-[calc(100vh-8rem)] grid grid-cols-1 lg:grid-cols-12 gap-6 animate-fade-in">
            {/* Editor */}
            <div className="lg:col-span-8 flex flex-col h-full gap-4">
                <div className="flex-1 panel rounded-xl overflow-hidden flex flex-col">
                    {/* Toolbar */}
                    <div className="h-10 border-b border-white/5 bg-[#0b101b] flex items-center justify-between px-4">
                        <div className="flex items-center gap-2 text-xs font-mono text-slate-500">
                            <TerminalIcon size={14} />
                            <span>main.py</span>
                        </div>
                        <button
                            onClick={handleRun}
                            disabled={loading}
                            className="flex items-center gap-1.5 text-[10px] font-bold bg-green-500/10 text-green-400 px-3 py-1 rounded hover:bg-green-500/20 transition-colors uppercase tracking-wider"
                        >
                            {loading ? <Activity size={12} className="animate-spin" /> : <Play size={12} fill="currentColor" />}
                            {loading ? 'Compiling' : 'Execute'}
                        </button>
                    </div>
                    {/* Code Area */}
                    <textarea
                        className="flex-1 bg-[#0b101b] text-slate-300 font-mono text-sm p-4 resize-none focus:outline-none leading-relaxed"
                        value={code}
                        onChange={(e) => setCode(e.target.value)}
                        spellCheck="false"
                    />
                </div>

                <div className="h-[30%] panel rounded-xl overflow-hidden flex flex-col">
                    <div className="bg-white/5 px-4 py-2 text-[10px] uppercase font-bold tracking-widest text-slate-500 border-b border-white/5 flex justify-between items-center">
                        <span>Console Output</span>
                    </div>
                    <pre className="flex-1 p-4 font-mono text-sm text-slate-300 overflow-auto whitespace-pre-wrap bg-[#020617]">
                        {output || <span className="text-slate-700 italic">// Waiting for execution...</span>}
                    </pre>
                </div>
            </div>

            {/* AI Sidebar */}
            <div className="lg:col-span-4 h-full flex flex-col panel rounded-xl overflow-hidden">
                <div className="p-4 border-b border-white/5 bg-white/5 flex items-center gap-2">
                    <Cpu size={16} className="text-purple-400" />
                    <span className="text-sm font-bold text-white">Neural Assistant</span>
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-[#0b101b]">
                    {messages.map((msg, idx) => (
                        <div key={idx} className={clsx("flex flex-col max-w-[90%]", msg.role === 'user' ? "ml-auto items-end" : "mr-auto items-start")}>
                            <div className={clsx(
                                "p-3 rounded-2xl text-sm mb-1",
                                msg.role === 'user' ? "bg-cyan-500 text-white rounded-br-none" : "bg-white/10 text-slate-200 rounded-bl-none"
                            )}>
                                {msg.content}
                            </div>
                            <span className="text-[9px] text-slate-600 uppercase font-bold">{msg.role}</span>
                        </div>
                    ))}
                </div>

                <div className="p-4 border-t border-white/5 bg-[#0b101b]">
                    <form onSubmit={handleChat} className="relative">
                        <input
                            className="input-neo pr-10"
                            placeholder="Request assistance..."
                            value={input}
                            onChange={e => setInput(e.target.value)}
                        />
                        <button className="absolute right-2 top-2.5 text-slate-500 hover:text-cyan-400 transition-colors">
                            <Send size={16} />
                        </button>
                    </form>
                </div>
            </div>
        </div>
    );
}
