import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { loginUser, registerUser } from '../api';
import { motion, AnimatePresence } from 'framer-motion';
import { User, Lock, ArrowRight, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react';
import clsx from 'clsx';

export default function Login() {
    const [isLogin, setIsLogin] = useState(true);
    const [loading, setLoading] = useState(false);
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const { login } = useAuth();
    const navigate = useNavigate();

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        // Artificial delay for slick feeling
        await new Promise(r => setTimeout(r, 800));

        try {
            let data;
            let isNewUser = false;
            if (isLogin) {
                const res = await loginUser(username, password);
                data = res.data;
            } else {
                await registerUser(username, password, username);
                const loginRes = await loginUser(username, password);
                data = loginRes.data;
                isNewUser = true;
            }
            login(data);

            // New users → onboarding. Existing users who haven't onboarded → onboarding. Otherwise → dashboard.
            if (isNewUser || !data.onboarding_completed) {
                navigate('/onboarding');
            } else {
                navigate('/dashboard');
            }
        } catch (err) {
            console.error("Auth Fail", err);
            if (err.response) {
                setError(err.response.data.detail || 'Access Denied');
            } else {
                setError('Uplink Failed. Check System Connection.');
            }
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden bg-[var(--bg-deep)]">
            {/* Background Effects */}
            <div className="absolute inset-0 z-0">
                <div className="absolute top-[-50%] left-[-50%] w-[200%] h-[200%] bg-[radial-gradient(circle_at_center,_rgba(6,182,212,0.06)_0%,_transparent_50%)] animate-pulse-slow"></div>
                <div className="absolute inset-0 bg-grid-pattern opacity-[0.03]"></div>
            </div>

            <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.5 }}
                className="w-full max-w-md relative z-10"
            >
                {/* Header */}
                <div className="text-center mb-8">
                    <div className="w-16 h-16 bg-gradient-to-tr from-cyan-400 to-blue-600 rounded-2xl mx-auto flex items-center justify-center shadow-xl shadow-cyan-500/20 mb-6">
                        <Lock className="text-white" size={32} />
                    </div>
                    <h2 className="text-3xl font-bold mb-2 tracking-tight text-slate-900">
                        {isLogin ? 'Welcome Back, Pilot.' : 'New User Registration'}
                    </h2>
                    <p className="text-slate-500">Enter your credentials to access the mainframe.</p>
                </div>

                {/* Card */}
                <div className="bg-white/90 backdrop-blur-xl border border-black/[0.06] p-8 rounded-2xl shadow-xl">
                    <AnimatePresence mode="wait">
                        {error && (
                            <motion.div
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: 'auto' }}
                                exit={{ opacity: 0, height: 0 }}
                                className="bg-red-50 border border-red-200 text-red-600 p-3 rounded-lg text-sm mb-6 flex items-center gap-3"
                            >
                                <AlertCircle size={16} />
                                {error}
                            </motion.div>
                        )}
                    </AnimatePresence>

                    <form onSubmit={handleSubmit} className="space-y-5">
                        <div className="space-y-1.5">
                            <label className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Identity</label>
                            <div className="relative group">
                                <User className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-cyan-500 transition-colors" size={18} />
                                <input
                                    type="text"
                                    value={username}
                                    onChange={e => setUsername(e.target.value)}
                                    className="input-neo pl-12"
                                    placeholder="Username"
                                    required
                                />
                            </div>
                        </div>

                        <div className="space-y-1.5">
                            <label className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Passcode</label>
                            <div className="relative group">
                                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-cyan-500 transition-colors" size={18} />
                                <input
                                    type="password"
                                    value={password}
                                    onChange={e => setPassword(e.target.value)}
                                    className="input-neo pl-12"
                                    placeholder="••••••••"
                                    required
                                />
                            </div>
                        </div>

                        <button
                            disabled={loading}
                            className={clsx(
                                "w-full mt-6 btn-neo btn-neo-primary",
                                loading && "opacity-80 cursor-wait"
                            )}
                        >
                            {loading ? (
                                <><Loader2 className="animate-spin mr-2" size={18} /> Authenticating...</>
                            ) : (
                                <>{isLogin ? 'Initialize Session' : 'Create Record'} <ArrowRight size={18} className="ml-2" /></>
                            )}
                        </button>
                    </form>
                </div>

                {/* Footer */}
                <div className="mt-8 text-center">
                    <button
                        onClick={() => { setIsLogin(!isLogin); setError(''); }}
                        className="text-sm font-medium text-slate-500 hover:text-slate-800 transition-colors"
                    >
                        {isLogin ? (
                            <>Cannot access? <span className="text-cyan-600">Create new identity</span></>
                        ) : (
                            <>Already registered? <span className="text-cyan-600">Login now</span></>
                        )}
                    </button>
                </div>
            </motion.div>
        </div>
    );
}
