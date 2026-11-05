import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { loginUser, registerUser, getMe, getLinkedInConfig, startLinkedIn, getGitHubConfig, startGitHub } from '../api';
import { safeErrorMsg } from '../utils/errorUtils';
import { motion, AnimatePresence } from 'framer-motion';
import { User, Lock, Mail, ArrowRight, Loader2, AlertCircle, Eye, EyeOff, Sparkles, Building2, GraduationCap, School, Briefcase, Users, ChevronLeft, Linkedin, Github } from 'lucide-react';
import clsx from 'clsx';
import PymastersGlyph from '../assets/pymasters-glyph.svg';
import { rememberReturnTo, takeReturnTo } from '../utils/returnTo';

export default function Login() {
    useEffect(() => { document.title = 'Sign In — PyMasters'; }, []);

    const [isLogin, setIsLogin] = useState(true);
    const [loading, setLoading] = useState(false);
    const [username, setUsername] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState(false);
    const [accountType, setAccountType] = useState(null); // null | 'individual' | 'organization'
    const [orgName, setOrgName] = useState('');
    const [orgType, setOrgType] = useState(''); // school | university | enterprise | other
    const [orgDomain, setOrgDomain] = useState('');
    const [orgStep, setOrgStep] = useState(0); // 0=type select, 1=org details, 2=admin account
    const [linkedinEnabled, setLinkedinEnabled] = useState(false);
    const [githubEnabled, setGithubEnabled] = useState(false);
    const { login } = useAuth();
    const navigate = useNavigate();

    // Handle social OAuth return and probe availability. Both providers bounce
    // back to /login with a provider-prefixed token/error pair:
    //   LinkedIn -> ?li_token / ?li_error
    //   GitHub   -> ?gh_token / ?gh_error
    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        // OAuth results arrive in the URL fragment (#gh_token=...) so the token never reaches server logs;
        // merge them in (query still read for backward compatibility).
        new URLSearchParams((window.location.hash || '').replace(/^#/, '')).forEach((v, k) => params.set(k, v));
        if (params.get('next')) rememberReturnTo(params.get('next'));
        // Deep-link into signup mode: /login?mode=signup (target of the /signup
        // and /register redirect routes). Param absent = exactly today's behavior.
        if (params.get('mode') === 'signup') {
            setIsLogin(false);
            window.history.replaceState({}, '', '/login');
        }
        const oauthErr = params.get('li_error') || params.get('gh_error');
        const oauthToken = params.get('li_token') || params.get('gh_token');
        const providerLabel = params.get('gh_token') || params.get('gh_error') ? 'GitHub' : 'LinkedIn';
        if (oauthErr) {
            setError(oauthErr);
            window.history.replaceState({}, '', '/login');
        } else if (oauthToken) {
            (async () => {
                setLoading(true);
                try {
                    localStorage.setItem('pm_user', JSON.stringify({ token: oauthToken }));
                    const me = await getMe();
                    const data = { ...me.data, token: oauthToken };
                    setSuccess(true);
                    await new Promise((r) => setTimeout(r, 250));
                    login(data);
                    window.history.replaceState({}, '', '/login');
                    navigate(data.onboarding_completed ? takeReturnTo('/dashboard') : '/onboarding');
                } catch {
                    localStorage.removeItem('pm_user');
                    setError(`Could not complete ${providerLabel} sign-in. Please try again.`);
                    setLoading(false);
                }
            })();
        }
        getLinkedInConfig().then((r) => setLinkedinEnabled(!!r.data?.enabled)).catch(() => {});
        getGitHubConfig().then((r) => setGithubEnabled(!!r.data?.enabled)).catch(() => {});
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const handleLinkedIn = async () => {
        setError('');
        try {
            const r = await startLinkedIn();
            if (r.data?.authorize_url) window.location.href = r.data.authorize_url;
        } catch {
            setError('LinkedIn sign-in is unavailable right now.');
        }
    };

    const handleGitHub = async () => {
        setError('');
        try {
            const r = await startGitHub();
            if (r.data?.authorize_url) window.location.href = r.data.authorize_url;
        } catch {
            setError('GitHub sign-in is unavailable right now.');
        }
    };

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
                const orgPayload = accountType === 'organization' && orgName
                    ? { name: orgName, type: orgType, domain: orgDomain }
                    : null;
                const res = await registerUser(
                    username, password, username,
                    accountType === 'organization' ? 'organization' : 'individual',
                    email,
                    orgPayload,
                );
                data = res.data;
                if (!data.token) data.token = `mock-jwt-${data.id}`;
                if (!data.account_type) data.account_type = accountType === 'organization' ? 'organization' : 'individual';
                // Backend now creates the org atomically with the user and returns it as `organization`.
                if (data.organization && !data.org) data.org = data.organization;
                isNewUser = true;
            }

            // Persist the token now so JWT-protected calls below are signed.
            try { localStorage.setItem('pm_user', JSON.stringify(data)); } catch { /* ignore */ }

            // Success animation before navigating
            setSuccess(true);
            await new Promise(r => setTimeout(r, 300));

            login(data);
            if (isNewUser || !data.onboarding_completed) {
                navigate('/onboarding');
            } else {
                navigate(takeReturnTo('/dashboard'));
            }
        } catch (err) {
            console.error("Auth Fail", err);
            if (err.response) {
                const detail = safeErrorMsg(err, '');
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
        setAccountType(null);
        setOrgStep(0);
        setOrgName('');
        setOrgType('');
        setOrgDomain('');
    };

    // Determine header text
    const getHeaderText = () => {
        if (isLogin) return { title: 'Welcome Back', subtitle: 'Sign in to continue your Python journey' };
        if (accountType === null) return { title: 'Join PyMasters', subtitle: 'Choose how you want to learn' };
        if (accountType === 'organization' && orgStep === 0) return { title: 'Register Organization', subtitle: "Set up your team's learning space" };
        if (accountType === 'organization' && orgStep === 1) return { title: 'Create Admin Account', subtitle: `This account will manage ${orgName}` };
        return { title: 'Create Account', subtitle: 'Start learning Python with Vaathiyaar' };
    };

    const header = getHeaderText();

    // Determine submit button text
    const getSubmitText = () => {
        if (isLogin) return 'Sign In';
        if (accountType === 'organization') return 'Create Organization & Account';
        return 'Create Account';
    };

    // Whether to show the username/password form
    const showCredentialsForm = isLogin || accountType === 'individual' || (accountType === 'organization' && orgStep === 1);


    // Theme tokens (index.css), so Login follows the light/dark toggle like the rest of the app (redesign I11).
    const inputCls = 'input-neo pl-12 pr-5';
    const labelCls = 'text-xs uppercase font-bold text-text-muted tracking-wider';
    const backCls = 'min-h-11 -ml-2 px-2 inline-flex items-center gap-1.5 text-sm text-text-muted hover:text-text-primary transition-colors rounded-lg';
    const fieldIcon = 'absolute left-4 top-1/2 -translate-y-1/2 text-text-muted group-focus-within:text-accent-primary transition-colors duration-300';
    const solidBtn = 'bg-purple-600 hover:bg-purple-700 text-white';
    const waitBtn = 'bg-bg-inset text-text-muted';

    return (
        <div className="min-h-screen flex items-center justify-center p-4 bg-bg-base text-text-secondary">
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
                        className="inline-block mb-6"
                    >
                        <div className="w-16 h-16 rounded-2xl bg-purple-600 flex items-center justify-center shadow-elegant">
                            <img src={PymastersGlyph} alt="PyMasters" className="w-9 h-9" />
                        </div>
                    </motion.div>

                    <AnimatePresence mode="wait">
                        <motion.div
                            key={`${isLogin}-${accountType}-${orgStep}`}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                            transition={{ duration: 0.3 }}
                        >
                            <h2 className="text-3xl font-bold mb-2 tracking-tight text-text-primary font-display">
                                {header.title}
                            </h2>
                            <p className="text-text-secondary">
                                {header.subtitle}
                            </p>
                        </motion.div>
                    </AnimatePresence>
                </div>

                {/* Card */}
                <div className="relative rounded-2xl border border-border-default bg-bg-surface p-6 sm:p-8 shadow-elegant">
                    <AnimatePresence mode="wait">
                        {error && (
                            <motion.div
                                role="alert"
                                initial={{ opacity: 0, height: 0, marginBottom: 0 }}
                                animate={{ opacity: 1, height: 'auto', marginBottom: 24 }}
                                exit={{ opacity: 0, height: 0, marginBottom: 0 }}
                                className="bg-red-500/10 border border-red-500/30 text-red-700 dark:text-red-300 p-3.5 rounded-xl text-sm flex items-start gap-3 overflow-hidden"
                            >
                                <AlertCircle size={16} className="flex-shrink-0 mt-0.5" aria-hidden="true" />
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
                                className="absolute inset-0 z-20 flex items-center justify-center rounded-2xl bg-bg-base/90"
                            >
                                <motion.div
                                    initial={{ scale: 0 }}
                                    animate={{ scale: 1 }}
                                    transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                                    className="flex flex-col items-center gap-3"
                                >
                                    <div className="w-16 h-16 rounded-full bg-green-700 flex items-center justify-center">
                                        <Sparkles size={28} className="text-white" aria-hidden="true" />
                                    </div>
                                    <p className="text-text-primary font-bold font-display text-lg">Welcome!</p>
                                </motion.div>
                            </motion.div>
                        )}
                    </AnimatePresence>

                    <AnimatePresence mode="wait">
                        {/* Account Type Selector — shown when signing up and no type chosen */}
                        {!isLogin && accountType === null && (
                            <motion.div
                                key="account-type-selector"
                                initial={{ opacity: 0, x: 20 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: -20 }}
                                transition={{ duration: 0.3 }}
                            >
                                <div className="space-y-4">
                                    <p className="text-sm text-text-secondary text-center mb-6">How would you like to use PyMasters?</p>

                                    {[
                                        { key: 'individual', icon: User, title: 'Individual Learner', desc: 'Learn Python & AI at your own pace', onClick: () => setAccountType('individual') },
                                        { key: 'organization', icon: Building2, title: 'Organization / School / Enterprise', desc: 'Manage teams, track progress, assign paths', onClick: () => { setAccountType('organization'); setOrgStep(0); } },
                                    ].map(({ key, icon: Icon, title, desc, onClick }) => (
                                        <button
                                            key={key}
                                            onClick={onClick}
                                            className="w-full p-5 rounded-2xl border border-border-default bg-bg-elevated hover:border-accent-primary transition-colors duration-200 text-left group"
                                        >
                                            <div className="flex items-center gap-4">
                                                <div className="w-12 h-12 rounded-xl bg-accent-subtle text-accent-primary flex items-center justify-center flex-shrink-0">
                                                    <Icon size={24} aria-hidden="true" />
                                                </div>
                                                <div className="min-w-0">
                                                    <h3 className="text-text-primary font-bold text-sm">{title}</h3>
                                                    <p className="text-text-muted text-xs mt-0.5">{desc}</p>
                                                </div>
                                                <ArrowRight size={16} className="text-text-muted ml-auto flex-shrink-0 group-hover:text-accent-primary transition-colors" aria-hidden="true" />
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            </motion.div>
                        )}

                        {/* Org Details — step 0 */}
                        {!isLogin && accountType === 'organization' && orgStep === 0 && (
                            <motion.div
                                key="org-details"
                                initial={{ opacity: 0, x: 20 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: -20 }}
                                transition={{ duration: 0.3 }}
                            >
                                <div className="space-y-5">
                                    <button onClick={() => setAccountType(null)} className={backCls}>
                                        <ChevronLeft size={16} aria-hidden="true" /> Back
                                    </button>

                                    <div className="space-y-1.5">
                                        <label htmlFor="org-name" className={labelCls}>Organization Name *</label>
                                        <input
                                            id="org-name"
                                            type="text"
                                            value={orgName}
                                            onChange={e => setOrgName(e.target.value)}
                                            className="input-neo"
                                            placeholder="e.g., Stanford University, Google, Lincoln High"
                                            required
                                        />
                                    </div>

                                    <div className="space-y-1.5">
                                        <p className={labelCls}>Organization Type *</p>
                                        <div className="grid grid-cols-2 gap-2">
                                            {[
                                                { value: 'school', label: 'School', icon: School },
                                                { value: 'university', label: 'University', icon: GraduationCap },
                                                { value: 'enterprise', label: 'Enterprise', icon: Briefcase },
                                                { value: 'training_center', label: 'Training Center', icon: Briefcase },
                                                { value: 'other', label: 'Other', icon: Users },
                                            ].map(opt => (
                                                <button
                                                    key={opt.value}
                                                    type="button"
                                                    aria-pressed={orgType === opt.value}
                                                    onClick={() => setOrgType(opt.value)}
                                                    className={clsx(
                                                        "min-h-11 p-3 rounded-xl border text-left transition-colors duration-200 flex items-center gap-2.5",
                                                        orgType === opt.value
                                                            ? "border-accent-primary bg-accent-subtle text-text-primary"
                                                            : "border-border-default bg-bg-elevated text-text-secondary hover:border-border-strong"
                                                    )}
                                                >
                                                    <opt.icon size={16} aria-hidden="true" />
                                                    <span className="text-sm font-medium">{opt.label}</span>
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    <div className="space-y-1.5">
                                        <label htmlFor="org-domain" className={labelCls}>Domain <span className="normal-case font-medium">(optional)</span></label>
                                        <input
                                            id="org-domain"
                                            type="text"
                                            value={orgDomain}
                                            onChange={e => setOrgDomain(e.target.value)}
                                            className="input-neo"
                                            placeholder="e.g., stanford.edu, company.com"
                                        />
                                    </div>

                                    <button
                                        onClick={() => setOrgStep(1)}
                                        disabled={!orgName || !orgType}
                                        className={clsx(
                                            "w-full min-h-11 py-3.5 rounded-xl font-bold text-sm transition-colors duration-200 flex items-center justify-center gap-2",
                                            orgName && orgType ? solidBtn : `${waitBtn} cursor-not-allowed`
                                        )}
                                    >
                                        Next: Create Admin Account <ArrowRight size={16} aria-hidden="true" />
                                    </button>
                                </div>
                            </motion.div>
                        )}

                        {/* Credentials form — login, individual signup, or org admin account (step 1) */}
                        {showCredentialsForm && (
                            <motion.div
                                key={`credentials-${accountType}-${orgStep}`}
                                initial={{ opacity: 0, x: 20 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: -20 }}
                                transition={{ duration: 0.3 }}
                            >
                                {/* Back button for individual signup */}
                                {!isLogin && accountType === 'individual' && (
                                    <button onClick={() => setAccountType(null)} className={`${backCls} mb-4`}>
                                        <ChevronLeft size={16} aria-hidden="true" /> Back
                                    </button>
                                )}

                                {/* Back button and org badge for org admin step */}
                                {!isLogin && accountType === 'organization' && orgStep === 1 && (
                                    <>
                                        <button onClick={() => setOrgStep(0)} className={`${backCls} mb-4`}>
                                            <ChevronLeft size={16} aria-hidden="true" /> Back to org details
                                        </button>
                                        <div className="mb-5 p-3 rounded-xl bg-accent-subtle border border-border-default flex items-center gap-3">
                                            <Building2 size={16} className="text-accent-primary flex-shrink-0" aria-hidden="true" />
                                            <div className="min-w-0">
                                                <p className="text-sm text-text-primary font-bold truncate">{orgName}</p>
                                                <p className="text-xs text-text-secondary">You'll be the Super Admin</p>
                                            </div>
                                        </div>
                                    </>
                                )}

                                <form onSubmit={handleSubmit} className="space-y-5">
                                    <div className="space-y-1.5">
                                        <label htmlFor="username" className={labelCls}>Username</label>
                                        <div className="relative group">
                                            <User className={fieldIcon} size={18} aria-hidden="true" />
                                            <input
                                                id="username"
                                                type="text"
                                                value={username}
                                                onChange={e => setUsername(e.target.value)}
                                                autoComplete="username"
                                                className={inputCls}
                                                placeholder="Enter your username"
                                                required
                                            />
                                        </div>
                                    </div>

                                    {!isLogin && (
                                        <div className="space-y-1.5">
                                            <label htmlFor="email" className={labelCls}>Email <span className="normal-case font-medium">(for password recovery)</span></label>
                                            <div className="relative group">
                                                <Mail className={fieldIcon} size={18} aria-hidden="true" />
                                                <input
                                                    id="email"
                                                    type="email"
                                                    value={email}
                                                    onChange={e => setEmail(e.target.value)}
                                                    autoComplete="email"
                                                    className={inputCls}
                                                    placeholder="you@example.com"
                                                />
                                            </div>
                                        </div>
                                    )}

                                    <div className="space-y-1.5">
                                        <div className="flex items-center justify-between">
                                            <label htmlFor="password" className={labelCls}>Password</label>
                                            {isLogin && (
                                                <Link to="/forgot-password" className="min-h-11 -my-3 inline-flex items-center px-1 text-sm font-semibold text-accent-primary hover:underline">Forgot?</Link>
                                            )}
                                        </div>
                                        <div className="relative group">
                                            <Lock className={fieldIcon} size={18} aria-hidden="true" />
                                            <input
                                                id="password"
                                                type={showPassword ? 'text' : 'password'}
                                                value={password}
                                                onChange={e => setPassword(e.target.value)}
                                                autoComplete={isLogin ? "current-password" : "new-password"}
                                                className="input-neo pl-12 pr-12"
                                                placeholder={isLogin ? 'Enter your password' : 'At least 8 characters'}
                                                minLength={isLogin ? undefined : 8}
                                                required
                                            />
                                            <button
                                                type="button"
                                                onClick={() => setShowPassword(!showPassword)}
                                                aria-label={showPassword ? "Hide password" : "Show password"}
                                                className="absolute right-1 top-1/2 -translate-y-1/2 w-11 h-11 flex items-center justify-center rounded-lg text-text-muted hover:text-text-primary transition-colors"
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
                                                    const hasNum = /\d/.test(password);
                                                    const hasSpecial = /[^a-zA-Z0-9]/.test(password);
                                                    const checks = [password.length >= 4, password.length >= 6, hasUpper || hasSpecial, password.length >= 8 && (hasNum || hasSpecial)];
                                                    const strength = checks.filter(Boolean).length;
                                                    const colors = ['bg-red-400', 'bg-orange-400', 'bg-amber-400', 'bg-green-400'];
                                                    const labels = ['Weak', 'Fair', 'Good', 'Strong'];
                                                    return (
                                                        <>
                                                            <div className="flex gap-1" aria-hidden="true">
                                                                {[0,1,2,3].map(i => (
                                                                    <div key={i} className={`h-1 flex-1 rounded-full transition-all duration-300 ${
                                                                        i < strength ? colors[strength - 1] : 'bg-bg-inset'
                                                                    }`} />
                                                                ))}
                                                            </div>
                                                            <p className="text-xs mt-1 text-text-muted">{labels[strength - 1] || 'Too short'}</p>
                                                        </>
                                                    );
                                                })()}
                                            </motion.div>
                                        )}
                                    </div>

                                    <button
                                        disabled={loading}
                                        className={clsx(
                                            "w-full mt-6 min-h-11 py-3.5 rounded-xl font-bold text-sm transition-colors duration-200 flex items-center justify-center gap-2",
                                            loading ? `${waitBtn} cursor-wait` : solidBtn
                                        )}
                                    >
                                        {loading ? (
                                            <>
                                                <Loader2 className="animate-spin" size={18} aria-hidden="true" />
                                                <span>Authenticating...</span>
                                            </>
                                        ) : (
                                            <>
                                                <span>{getSubmitText()}</span>
                                                <ArrowRight size={18} aria-hidden="true" />
                                            </>
                                        )}
                                    </button>

                                    {(linkedinEnabled || githubEnabled) && (isLogin || accountType === 'individual') && (
                                        <>
                                            <div className="flex items-center gap-3 my-1">
                                                <div className="h-px flex-1 bg-border-default" />
                                                <span className="text-xs uppercase tracking-wider text-text-muted">or</span>
                                                <div className="h-px flex-1 bg-border-default" />
                                            </div>
                                            {githubEnabled && (
                                                <button
                                                    type="button"
                                                    onClick={handleGitHub}
                                                    className="w-full min-h-11 py-3 rounded-xl font-bold text-sm text-white bg-[#24292f] hover:bg-[#1b1f24] border border-border-default transition-colors flex items-center justify-center gap-2"
                                                >
                                                    <Github size={18} aria-hidden="true" /> Continue with GitHub
                                                </button>
                                            )}
                                            {linkedinEnabled && (
                                                <button
                                                    type="button"
                                                    onClick={handleLinkedIn}
                                                    className="w-full min-h-11 py-3 rounded-xl font-bold text-sm text-white bg-[#0a66c2] hover:bg-[#004182] transition-colors flex items-center justify-center gap-2"
                                                >
                                                    <Linkedin size={18} aria-hidden="true" /> Continue with LinkedIn
                                                </button>
                                            )}
                                        </>
                                    )}
                                </form>
                            </motion.div>
                        )}
                    </AnimatePresence>
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
                        className="min-h-11 px-3 text-sm font-medium text-text-secondary hover:text-text-primary transition-colors rounded-lg"
                    >
                        {isLogin ? (
                            <>Don't have an account? <span className="text-accent-primary font-semibold">Sign up</span></>
                        ) : (
                            <>Already have an account? <span className="text-accent-primary font-semibold">Sign in</span></>
                        )}
                    </button>
                </motion.div>
            </motion.div>
        </div>
    );
}
