import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Play, Terminal, Cpu, ArrowRight, Zap, Code2, Globe } from 'lucide-react';

export default function Home() {
    const navigate = useNavigate();

    return (
        <div className="min-h-screen bg-[var(--bg-deep)] text-slate-700 relative overflow-hidden font-sans selection:bg-cyan-500/30">
            {/* Dynamic Background */}
            <div className="absolute inset-0 pointer-events-none">
                <div className="absolute top-[-20%] right-[-10%] w-[800px] h-[800px] bg-cyan-200/30 rounded-full blur-[120px] animate-pulse-slow" />
                <div className="absolute bottom-[-20%] left-[-10%] w-[600px] h-[600px] bg-blue-200/20 rounded-full blur-[100px]" />
                <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-10 brightness-100 contrast-150"></div>
            </div>

            {/* Navigation */}
            <nav className="relative z-50 px-6 py-6 border-b border-black/[0.06] bg-white/60 backdrop-blur-md">
                <div className="max-w-7xl mx-auto flex justify-between items-center">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-gradient-to-tr from-cyan-400 to-blue-600 rounded-lg flex items-center justify-center shadow-lg shadow-cyan-500/20">
                            <Terminal className="text-white" size={20} />
                        </div>
                        <span className="font-display font-bold text-xl tracking-tight text-slate-900">PYMASTERS</span>
                    </div>
                    <div className="flex items-center gap-6">
                        <button onClick={() => navigate('/login')} className="text-sm font-medium text-slate-500 hover:text-slate-800 transition-colors">Sign In</button>
                        <button onClick={() => navigate('/login')} className="btn-neo btn-neo-primary px-5 py-2 text-sm rounded-full">
                            Get Started
                        </button>
                    </div>
                </div>
            </nav>

            {/* Hero Section */}
            <main className="relative z-10 max-w-7xl mx-auto px-6 py-20 lg:py-32 grid lg:grid-cols-2 gap-12 items-center">
                <motion.div
                    initial={{ opacity: 0, x: -50 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.8, ease: "easeOut" }}
                >
                    <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-cyan-300 bg-cyan-50 text-cyan-700 text-xs font-bold tracking-wider uppercase mb-8">
                        <span className="relative flex h-2 w-2">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan-500"></span>
                        </span>
                        System v2.0 Online
                    </div>

                    <h1 className="text-5xl lg:text-7xl font-bold leading-[1.1] mb-6 text-slate-900">
                        Code the Future. <br />
                        <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-500 via-blue-500 to-purple-500">
                            Master Python.
                        </span>
                    </h1>

                    <p className="text-lg text-slate-500 mb-10 max-w-xl leading-relaxed">
                        An advanced neural coding environment designed to take you from novice to architect. Real-time AI feedback. Gamified progression. Cloud execution.
                    </p>

                    <div className="flex flex-col sm:flex-row gap-4">
                        <button onClick={() => navigate('/login')} className="btn-neo btn-neo-primary group">
                            <span className="mr-2">Initialize System</span>
                            <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />
                        </button>
                        <button onClick={() => navigate('/login')} className="btn-neo btn-neo-ghost">
                            <Play size={18} className="mr-2 text-cyan-500" fill="currentColor" /> Live Demo
                        </button>
                    </div>

                    <div className="mt-12 flex items-center gap-8 border-t border-black/[0.06] pt-8">
                        <Stat value="10k+" label="Active Users" />
                        <Stat value="500+" label="Modules" />
                        <Stat value="99.9%" label="Uptime" />
                    </div>
                </motion.div>

                {/* Visual Graphic */}
                <motion.div
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 1, delay: 0.2 }}
                    className="relative"
                >
                    <div className="relative z-10 bg-[#0f172a] rounded-2xl border border-slate-700 shadow-2xl overflow-hidden aspect-video group transform hover:scale-[1.02] transition-transform duration-500">
                        {/* Fake UI Header */}
                        <div className="h-10 border-b border-slate-700 bg-[#020617] flex items-center px-4 gap-2">
                            <div className="flex gap-1.5">
                                <div className="w-3 h-3 rounded-full bg-red-500/30 border border-red-500/50"></div>
                                <div className="w-3 h-3 rounded-full bg-yellow-500/30 border border-yellow-500/50"></div>
                                <div className="w-3 h-3 rounded-full bg-green-500/30 border border-green-500/50"></div>
                            </div>
                            <div className="mx-auto text-[10px] font-mono text-slate-500">main.py — PyMasters Studio</div>
                        </div>
                        {/* Fake UI Body */}
                        <div className="p-6 font-mono text-sm relative">
                            <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-b from-cyan-500/5 to-transparent pointer-events-none"></div>
                            <div className="text-purple-400 mb-2">import <span className="text-white">pymasters</span> as <span className="text-white">pm</span></div>
                            <div className="text-blue-400 mb-2">def <span className="text-yellow-300">init_neural_link</span>():</div>
                            <div className="ml-4 text-slate-300 mb-2">print(<span className="text-green-400">"Connecting to AI Mainframe..."</span>)</div>
                            <div className="ml-4 text-slate-300 mb-2">user = pm.<span className="text-cyan-400">NeuralUser</span>(rank=<span className="text-orange-400">"Architect"</span>)</div>
                            <div className="ml-4 text-slate-300">return user.connect()</div>

                            <div className="mt-8 pt-4 border-t border-dashed border-white/10 text-slate-500">
                        > Output: Connection Established. Welcome, User.
                                <span className="inline-block w-2 h-4 bg-cyan-500 align-middle ml-1 animate-pulse"></span>
                            </div>
                        </div>
                    </div>

                    {/* Glows behind graphic */}
                    <div className="absolute inset-0 bg-cyan-400/15 blur-[100px] z-0 -translate-y-10"></div>
                </motion.div>
            </main>

            {/* Feature Grid */}
            <section className="relative z-10 py-32 bg-white/50 border-t border-black/[0.06]">
                <div className="max-w-7xl mx-auto px-6">
                    <div className="text-center mb-16">
                        <h2 className="text-3xl lg:text-5xl font-bold mb-4 text-slate-900">Neural-Enhanced Learning</h2>
                        <p className="text-slate-500 max-w-2xl mx-auto">The world's first Python learning platform powered by a local Large Language Model.</p>
                    </div>

                    <div className="grid md:grid-cols-3 gap-8">
                        <Feature
                            icon={<Cpu size={32} className="text-cyan-500" />}
                            title="Local AI Inference"
                            desc="Fast, private, and intelligent feedback loop powered by custom fine-tuned models running directly on the metal."
                        />
                        <Feature
                            icon={<Zap size={32} className="text-amber-500" />}
                            title="Instant Execution Sandbox"
                            desc="Run untrusted code safely in our isolated micro-VMs. See results in milliseconds, not seconds."
                        />
                        <Feature
                            icon={<Globe size={32} className="text-purple-500" />}
                            title="Global Progression"
                            desc="Compete on the global leaderboard. Earn XP for clean code, optimized algorithms, and debugging efficiency."
                        />
                    </div>
                </div>
            </section>
        </div>
    );
}

function Stat({ value, label }) {
    return (
        <div>
            <div className="text-3xl font-bold text-slate-900 font-display">{value}</div>
            <div className="text-xs text-slate-400 uppercase tracking-widest font-bold">{label}</div>
        </div>
    )
}

function Feature({ icon, title, desc }) {
    return (
        <div className="group p-8 rounded-2xl bg-white border border-black/[0.06] hover:border-cyan-300 transition-all duration-300 hover:shadow-lg">
            <div className="mb-6 p-4 rounded-xl bg-slate-50 w-fit group-hover:scale-110 transition-transform duration-300 border border-black/[0.04]">{icon}</div>
            <h3 className="text-xl font-bold mb-3 font-display text-slate-800">{title}</h3>
            <p className="text-slate-500 leading-relaxed text-sm">{desc}</p>
        </div>
    )
}
