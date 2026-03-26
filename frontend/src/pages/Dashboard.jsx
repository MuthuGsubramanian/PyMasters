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
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { useAuth } from '../context/AuthContext';
import { getModules, getModule, completeModule } from '../api';
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
                <p className="text-slate-500">Welcome back, {user.username}. Systems optimal.</p>
            </header>

            <div className="grid md:grid-cols-3 gap-6">
                <div className="md:col-span-2 space-y-6">
                    {/* Quick Stats */}
                    <div className="grid grid-cols-2 gap-4">
                        <div className="panel p-6 rounded-xl flex items-center justify-between">
                            <div>
                                <div className="text-sm text-slate-400 font-bold uppercase tracking-wider">Total XP</div>
                                <div className="text-3xl font-display font-bold text-slate-900 mt-1">{user.points}</div>
                            </div>
                            <div className="w-12 h-12 bg-cyan-50 rounded-lg flex items-center justify-center text-cyan-500">
                                <Trophy size={24} />
                            </div>
                        </div>
                        <div className="panel p-6 rounded-xl flex items-center justify-between">
                            <div>
                                <div className="text-sm text-slate-400 font-bold uppercase tracking-wider">Modules</div>
                                <div className="text-3xl font-display font-bold text-slate-900 mt-1">{(user.unlocked || []).length} / 12</div>
                            </div>
                            <div className="w-12 h-12 bg-purple-50 rounded-lg flex items-center justify-center text-purple-500">
                                <BookOpen size={24} />
                            </div>
                        </div>
                    </div>

                    {/* Continue Learning Banner */}
                    <div className="panel p-8 rounded-xl border-l-4 border-l-cyan-400 bg-gradient-to-r from-cyan-50 to-transparent">
                        <div className="flex justify-between items-center">
                            <div>
                                <h3 className="text-xl font-bold mb-2 text-slate-900">Continue Training</h3>
                                <p className="text-slate-500 text-sm mb-4">You are currently on Module {(user.unlocked || []).length}.</p>
                                <button onClick={() => navigate('/dashboard/learn')} className="btn-neo btn-neo-primary py-2 text-sm">Resume Path</button>
                            </div>
                            <div className="hidden sm:block text-slate-300">
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
                                <div className="text-slate-500">
                                    <span className="text-slate-800 font-bold">User_{900 + i}</span> just completed <span className="text-cyan-600">Advanced Recursion</span>.
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
            <header className="mb-10 flex justify-between items-end border-b border-black/[0.06] pb-6">
                <div>
                    <h2 className="text-3xl font-bold mb-2">Neural Learning Path</h2>
                    <p className="text-slate-500">Sequential knowledge acquisition protocol.</p>
                </div>
                <div className="text-right hidden sm:block">
                    <div className="text-xs text-slate-400 font-bold uppercase tracking-widest">Progress</div>
                    <div className="text-xl font-mono text-cyan-600">{Math.round(((user.unlocked || []).length / modules.length) * 100)}%</div>
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
                                    ? "bg-white border-black/[0.06] hover:border-cyan-300 hover:shadow-lg cursor-pointer"
                                    : "bg-slate-100 border-transparent opacity-50 grayscale cursor-not-allowed"
                            )}
                        >
                            <div className="flex items-center gap-6 relative z-10">
                                <div className={clsx(
                                    "flex items-center justify-center w-12 h-12 rounded-lg font-mono font-bold text-lg border",
                                    unlocked ? "bg-cyan-50 border-cyan-200 text-cyan-600" : "bg-slate-200 border-slate-300 text-slate-400"
                                )}>
                                    {idx + 1}
                                </div>
                                <div>
                                    <h3 className="text-xl font-bold text-slate-800 mb-1 group-hover:text-cyan-600 transition-colors">{mod.title}</h3>
                                    <p className="text-sm text-slate-500 max-w-xl">{mod.desc}</p>
                                </div>
                            </div>

                            <div className="flex items-center gap-4 relative z-10">
                                {unlocked ? (
                                    <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-green-50 text-green-600 text-xs font-bold uppercase tracking-wider border border-green-200">
                                        <CheckCircle2 size={14} /> Unlocked
                                    </div>
                                ) : (
                                    <Lock size={20} className="text-slate-400" />
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
            }
        } else {
            const remaining = module.quiz.length - correctCount;
            setResult({
                passed: false,
                msg: `You got ${correctCount} out of ${module.quiz.length} correct — ${remaining} ${remaining === 1 ? 'answer' : 'answers'} to fix. Review the material and try again. You need 100% to pass.`,
            });
        }
    };

    return (
        <div className="max-w-4xl mx-auto pb-20 animate-fade-in relative">
            <button onClick={() => navigate('/dashboard/learn')} className="mb-6 text-xs font-bold text-slate-400 hover:text-slate-700 uppercase tracking-widest flex items-center gap-2 transition-colors">
                <ChevronRight size={14} className="rotate-180" /> Back to Map
            </button>

            <div className="panel overflow-hidden rounded-2xl relative">
                {/* Header Graphic */}
                <div className="h-32 bg-gradient-to-r from-cyan-100 to-blue-100 border-b border-black/[0.06] p-8 flex items-end">
                    <div>
                        <h1 className="text-3xl font-bold text-slate-900 relative z-10">{module.title}</h1>
                        <p className="text-cyan-700 text-sm font-mono mt-2">{module.id.toUpperCase()} // REWARD: {module.xp_reward} XP</p>
                    </div>
                </div>

                <div className="p-8 md:p-12">
                    {!quizMode ? (
                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="prose prose-slate prose-lg max-w-none">
                            <ReactMarkdown
                                components={{
                                    code: ({ node, inline, className, children, ...props }) => (
                                        <div className="not-prose bg-[#0f172a] p-4 rounded-xl border border-slate-700 font-mono text-sm text-slate-300 overflow-x-auto my-4 shadow-inner">
                                            {children}
                                        </div>
                                    ),
                                    h1: ({ children }) => <h1 className="text-2xl font-bold text-slate-900 mb-6">{children}</h1>,
                                    h2: ({ children }) => <h2 className="text-xl font-bold text-cyan-800 flex items-center gap-3 mt-8 mb-4"><span className="w-1 h-6 bg-cyan-500 rounded-full"></span>{children}</h2>
                                }}
                            >
                                {module.content}
                            </ReactMarkdown>
                            <div className="mt-16 pt-8 border-t border-black/[0.06] flex justify-end">
                                <button onClick={() => setQuizMode(true)} className="btn-neo btn-neo-primary">
                                    Initialize Quiz Protocol <ChevronRight size={18} className="ml-2" />
                                </button>
                            </div>
                        </motion.div>
                    ) : (
                        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="max-w-2xl mx-auto">
                            <div className="text-center mb-10">
                                <h3 className="text-2xl font-bold text-slate-900 mb-2">Knowledge Verification</h3>
                                <p className="text-slate-500 text-sm">Pass with 100% accuracy to proceed.</p>
                            </div>

                            {result && (
                                <div className={`p-5 rounded-xl mb-8 text-center border ${result.passed ? 'bg-green-50 text-green-700 border-green-200' : 'bg-red-50 text-red-600 border-red-200'}`}>
                                    <div className={`text-lg font-bold mb-1 ${result.passed ? 'text-green-700' : 'text-red-600'}`}>
                                        {result.passed ? '✓ Module Complete!' : '✗ Not quite there yet'}
                                    </div>
                                    <div className={`text-sm whitespace-pre-line ${result.passed ? 'text-green-600' : 'text-red-500'}`}>
                                        {result.msg}
                                    </div>
                                </div>
                            )}

                            <div className="space-y-8">
                                {module.quiz.map((q, qIdx) => (
                                    <div key={qIdx} className="space-y-4">
                                        <p className="font-bold text-lg text-slate-800 font-display ml-1">{qIdx + 1}. {q.q}</p>
                                        <div className="space-y-2">
                                            {q.options.map((opt, oIdx) => (
                                                <div
                                                    key={oIdx}
                                                    onClick={() => !result?.passed && setAnswers({ ...answers, [qIdx]: oIdx })}
                                                    className={clsx(
                                                        "flex items-center gap-4 p-4 rounded-xl cursor-pointer transition-all border",
                                                        answers[qIdx] === oIdx
                                                            ? "bg-cyan-50 border-cyan-300"
                                                            : "bg-slate-50 border-transparent hover:bg-slate-100"
                                                    )}
                                                >
                                                    <div className={clsx(
                                                        "w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0",
                                                        answers[qIdx] === oIdx ? "border-cyan-500" : "border-slate-300"
                                                    )}>
                                                        {answers[qIdx] === oIdx && <div className="w-2.5 h-2.5 bg-cyan-500 rounded-full"></div>}
                                                    </div>
                                                    <span className={answers[qIdx] === oIdx ? 'text-cyan-800 font-medium' : 'text-slate-600'}>{opt}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                ))}
                            </div>

                            <div className="mt-12 flex justify-end gap-4 border-t border-black/[0.06] pt-8">
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
