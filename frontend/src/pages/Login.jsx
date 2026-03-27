import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { loginUser, registerUser } from '../api';
import { motion, AnimatePresence } from 'framer-motion';
import { User, Lock, ArrowRight, Loader2, AlertCircle, Eye, EyeOff, Sparkles } from 'lucide-react';
import clsx from 'clsx';
import PymastersIcon from '../assets/pymasters-icon.svg';

export default function Login() {
    useEffect(() => { document.title = 'Sign In — PyMasters'; }, []);

    const [isLogin, setIsLogin] = useState(true);
    const [loading, setLoading] = useState(false);
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState(false);
    const { login } = useAuth();
    const navigate = useNavigate();

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        try {
            let data;
            let isNewUser = false;
            if (isLogin) {
                const res = await loginUser(username, password);
                data = res.data;
            } else {
                const res = await registerUser(username, password, username);
                data = res.data;
                if (!data.token) data.token = `mock-jwt-${data.id}`;
                isNewUser = true;
            }

            // Success animation before navigating
            setSuccess(true);
            await new Promise(r => setTimeout(r, 300));

            login(data);
            if (isNewUser || !data.onboarding_completed) {
                navigate('/onboarding');
            } else {
                navigate('/dashboard');
            }
        } catch (err) {
            console.error("Auth Fail", err);
            if (err.response) {
                const detail = err.response.data.detail || '';
                if (detail.includes('already taken')) {
                    setError('This username is already taken. Try a different one or login instead.');
                } else if (detail.includes('Invalid credentials')) {
                    setError('Invalid username or password. Please try again.');
                } else {
                    setError(detail || 'Something went wrong. Please try again.');
                }
            } else {
                setError('Could not connect to server. Please check your connection.');
            }
        } finally {
            setLoading(false);
        }
    };

    const switchMode = () => {
        setIsLogin(!isLogin);
        setError('');
        setSuccess(false);
    };

    return (
        <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden bg-[#020617]">
            {/* Animated background */}
            <div className="absolute inset-0 z-0">
                <div className="absolute top-[-30%] right-[-20%] w-[700px] h-[700px] bg-purple-700/15 rounded-full blur-[140px] animate-pulse" style={{ animationDuration: '8s' }} />
                <div className="absolute bottom-[-20%] left-[-10%] w-[500px] h-[500px] bg-cyan-600/10 rounded-full blur-[120px] animate-pulse" style={{ animationDuration: '10s', animationDelay: '2s' }} />
                <div className="absolute top-[50%] left-[50%] -translate-x-1/2 -translate-y-1/2 w-[300px] h-[300px] bg-violet-600/8 rounded-full blur-[80px] animate-pulse" style={{ animationDuration: '6s', animationDelay: '1s' }} />

                {/* Grid overlay */}
                <div className="absolute inset-0 opacity-[0.03]" style={{
                    backgroundImage: 'linear-gradient(rgba(124,58,237,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(124,58,237,0.5) 1px, transparent 1px)',
                    backgroundSize: '60px 60px',
                }} />
            </div>

            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, ease: 'easeOut' }}
                className="w-full max-w-md relative z-10"
            >
                {/* Logo & Header */}
                <div className="text-center mb-8">
                    <motion.div
                        initial={{ scale: 0.8, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        transition={{ duration: 0.5, delay: 0.1 }}
                        className="relative inline-block mb-6"
                    >
                        <div className="absolute inset-0 bg-purple-600/30 blur-[40px] rounded-full scale-150" />
                        <div className="relative w-20 h-20 rounded-2xl bg-gradient-to-br from-purple-600 to-cyan-500 flex items-center justify-center shadow-2xl shadow-purple-500/30 border border-white/10">
                            <img src={PymastersIcon} alt="PyMasters" className="w-12 h-12" style={{ filter: 'brightness(2)' }} />
                        </div>
                    </motion.div>

                    <AnimatePresence mode="wait">
                        <motion.div
                            key={isLogin ? 'login' : 'register'}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                            transition={{ duration: 0.3 }}
                        >
                            <h2 className="text-3xl font-bold mb-2 tracking-tight text-white font-display">
                                {isLogin ? 'Welcome Back' : 'Create Account'}
                            </h2>
                            <p className="text-slate-400">
                                {isLogin
                                    ? 'Sign in to continue your Python journey'
                                    : 'Start learning Python with Vaathiyaar'
                                }
                            </p>
                        </motion.div>
                    </AnimatePresence>
                </div>

                {/* Card */}
                <div className="relative rounded-2xl border border-white/[0.06] bg-white/[0.03] backdrop-blur-xl p-8 shadow-2xl shadow-black/20">
                    <AnimatePresence mode="wait">
                        {error && (
                            <motion.div
                                initial={{ opacity: 0, height: 0, marginBottom: 0 }}
                                animate={{ opacity: 1, height: 'auto', marginBottom: 24 }}
                                exit={{ opacity: 0, height: 0, marginBottom: 0 }}
                                className="bg-red-500/10 border border-red-500/20 text-red-400 p-3.5 rounded-xl text-sm flex items-start gap-3 overflow-hidden"
                            >
                                <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
                                <span>{error}</span>
                            </motion.div>
                        )}
                    </AnimatePresence>

                    {/* Success overlay */}
                    <AnimatePresence>
                        {success && (
                            <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                className="absolute inset-0 z-20 flex items-center justify-center rounded-2xl bg-[#020617]/80 backdrop-blur-sm"
                            >
                                <motion.div
                                    initial={{ scale: 0 }}
                                    animate={{ scale: 1 }}
                                    transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                                    className="flex flex-col items-center gap-3"
                                >
                                    <div className="w-16 h-16 rounded-full bg-green-500 flex items-center justify-center shadow-xl shadow-green-500/30">
                                        <Sparkles size={28} className="text-white" />
                                    </div>
                                    <p className="text-white font-bold font-display text-lg">Welcome!</p>
                                </motion.div>
                            </motion.div>
                        )}
                    </AnimatePresence>

                    <form onSubmit={handleSubmit} className="space-y-5">
                        <div className="space-y-1.5">
                            <label htmlFor="username" className="text-xs uppercase font-bold text-slate-500 tracking-wider">Username</label>
                            <div className="relative group">
                                <User className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-cyan-400 transition-colors duration-300" size={18} />
                                <input
                                    id="username"
                                    type="text"
                                    value={username}
                                    onChange={e => setUsername(e.target.value)}
                                    autoComplete="username"
                                    className="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl pl-12 pr-5 py-3.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-cyan-500/40 focus:ring-1 focus:ring-cyan-500/30 focus:bg-white/[0.06] transition-all duration-300 font-medium"
                                    placeholder="Enter your username"
                                    required
                                />
                            </div>
                        </div>

                        <div className="space-y-1.5">
                            <label htmlFor="password" className="text-xs uppercase font-bold text-slate-500 tracking-wider">Password</label>
                            <div className="relative group">
                                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-cyan-400 transition-colors duration-300" size={18} />
                                <input
                                    id="password"
                                    type={showPassword ? 'text' : 'password'}
                                    value={password}
                                    onChange={e => setPassword(e.target.value)}
                                    autoComplete={isLogin ? "current-password" : "new-password"}
                                    className="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl pl-12 pr-12 py-3.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-cyan-500/40 focus:ring-1 focus:ring-cyan-500/30 focus:bg-white/[0.06] transition-all duration-300 font-medium"
                                    placeholder="Enter your password"
                                    required
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(!showPassword)}
                                    aria-label={showPassword ? "Hide password" : "Show password"}
                                    className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
                                >
                                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                                </button>
                            </div>

                            {/* Password strength indicator for registration */}
                            {!isLogin && password.length > 0 && (
                                <motion.div
                                    initial={{ opacity: 0, height: 0 }}
                                    animate={{ opacity: 1, height: 'auto' }}
                                    className="pt-1.5"
                                >
                                    {(() => {
                                        const hasUpper = /[A-Z]/.test(password);
                                        const hasLower = /[a-z]/.test(password);
                                        const hasNum = /\d/.test(password);
                                        const hasSpecial = /[^a-zA-Z0-9]/.test(password);
                                        const checks = [password.length >= 4, password.length >= 6, hasUpper || hasSpecial, password.length >= 8 && (hasNum || hasSpecial)];
                                        const strength = checks.filter(Boolean).length;
                                        const colors = ['bg-red-400', 'bg-orange-400', 'bg-amber-400', 'bg-green-400'];
                                        const labels = ['Weak', 'Fair', 'Good', 'Strong'];
                                        return (
                                            <>
                                                <div className="flex gap-1">
                                                    {[0,1,2,3].map(i => (
                                                        <div key={i} className={`h-1 flex-1 rounded-full transition-all duration-300 ${
                                                            i < strength ? colors[strength - 1] : 'bg-white/[0.06]'
                                                        }`} />
                                                    ))}
                                                </div>
                                                <p className="text-[10px] mt-1 text-slate-500">{labels[strength - 1] || 'Too short'}</p>
                                            </>
                                        );
                                    })()}
                                </motion.div>
                            )}
                        </div>

                        <button
                            disabled={loading}
                            className={clsx(
                                "w-full mt-6 py-3.5 rounded-xl font-bold text-sm text-white transition-all duration-300 flex items-center justify-center gap-2 relative overflow-hidden",
                                loading
                                    ? "bg-slate-700 cursor-wait"
                                    : "bg-gradient-to-r from-purple-600 to-cyan-500 hover:scale-[1.02] active:scale-[0.98] shadow-lg shadow-purple-500/25 hover:shadow-xl hover:shadow-purple-500/30"
                            )}
                        >
                            {loading ? (
                                <>
                                    <Loader2 className="animate-spin" size={18} />
                                    <span>Authenticating...</span>
                                </>
                            ) : (
                                <>
                                    <span>{isLogin ? 'Sign In' : 'Create Account'}</span>
                                    <ArrowRight size={18} />
                                </>
                            )}
                            {!loading && (
                                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent translate-x-[-100%] hover:translate-x-[100%] transition-transform duration-700" />
                            )}
                        </button>
                    </form>
                </div>

                {/* Footer */}
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.4 }}
                    className="mt-8 text-center"
                >
                    <button
                        onClick={switchMode}
                        className="text-sm font-medium text-slate-500 hover:text-slate-300 transition-colors"
                    >
                        {isLogin ? (
                            <>Don't have an account? <span className="text-cyan-400 font-semibold">Sign up</span></>
                        ) : (
                            <>Already have an account? <span className="text-cyan-400 font-semibold">Sign in</span></>
                        )}
                    </button>
                </motion.div>
            </motion.div>
        </div>
    );
}
