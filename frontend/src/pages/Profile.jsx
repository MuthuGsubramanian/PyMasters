import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
    User, Mail, Phone, FileText, Globe, BookOpen, Clock, Target,
    Volume2, VolumeX, Play, Zap, Trophy, Award, Flame, Star,
    Timer, CheckCircle2, Download, Trash2, RotateCcw, Save,
    ChevronDown, Shield, Sparkles, TrendingUp, ArrowLeft, AlertTriangle,
    Settings, Eye, Lightbulb, Mic, Lock, ExternalLink, Link,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { getProfile, recordSignal } from '../api';
import api from '../api';
import clsx from 'clsx';

// ─── Constants ────────────────────────────────────────────────────────────────

const LANGUAGES = [
    { value: 'en', label: 'English' },
    { value: 'ta', label: 'Tamil' },
    { value: 'hi', label: 'Hindi' },
    { value: 'te', label: 'Telugu' },
    { value: 'kn', label: 'Kannada' },
    { value: 'ml', label: 'Malayalam' },
    { value: 'es', label: 'Spanish' },
    { value: 'fr', label: 'French' },
];

const LEARNING_STYLES = [
    { value: 'visual', label: 'Visual', icon: Eye },
    { value: 'reading', label: 'Reading', icon: BookOpen },
    { value: 'hands_on', label: 'Hands-on', icon: Settings },
    { value: 'mixed', label: 'Mixed', icon: Sparkles },
];

const DAILY_GOALS = [
    { value: '15', label: '15 min' },
    { value: '30', label: '30 min' },
    { value: '60', label: '1 hr' },
    { value: '120', label: '2 hr' },
];

const DIFFICULTY_LEVELS = [
    { value: 'beginner', label: 'Beginner' },
    { value: 'intermediate', label: 'Intermediate' },
    { value: 'advanced', label: 'Advanced' },
];

const VOICE_OPTIONS = [
    { value: 'default', label: 'Default' },
    { value: 'alloy', label: 'Alloy' },
    { value: 'echo', label: 'Echo' },
    { value: 'fable', label: 'Fable' },
    { value: 'onyx', label: 'Onyx' },
    { value: 'nova', label: 'Nova' },
    { value: 'shimmer', label: 'Shimmer' },
];

const ACHIEVEMENTS = [
    { id: 'first_login',       label: 'First Login',              icon: Star,         xpReq: 0,    color: 'from-yellow-400 to-amber-500' },
    { id: 'first_module',      label: 'First Module Complete',     icon: CheckCircle2, xpReq: 0,    color: 'from-green-400 to-emerald-500' },
    { id: 'streak_7',          label: '7-Day Streak',              icon: Flame,        xpReq: 0,    color: 'from-orange-400 to-red-500' },
    { id: 'xp_100',            label: '100 XP',                    icon: Zap,          xpReq: 100,  color: 'from-cyan-400 to-blue-500' },
    { id: 'xp_500',            label: '500 XP',                    icon: Trophy,       xpReq: 500,  color: 'from-purple-400 to-violet-500' },
    { id: 'xp_1000',           label: '1000 XP',                   icon: Award,        xpReq: 1000, color: 'from-pink-400 to-rose-500' },
    { id: 'all_modules',       label: 'All Modules Complete',      icon: Sparkles,     xpReq: 0,    color: 'from-indigo-400 to-purple-500' },
];

// ─── Utility Helpers ──────────────────────────────────────────────────────────

function getInitials(name) {
    if (!name) return '?';
    return name.split(' ').map(w => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();
}

function getRankInfo(xp) {
    if (xp >= 5000) return { rank: 'Master', color: 'from-amber-400 to-yellow-500', next: null };
    if (xp >= 2000) return { rank: 'Expert', color: 'from-purple-400 to-violet-500', next: 5000 };
    if (xp >= 1000) return { rank: 'Advanced', color: 'from-blue-400 to-cyan-500', next: 2000 };
    if (xp >= 500)  return { rank: 'Intermediate', color: 'from-green-400 to-emerald-500', next: 1000 };
    if (xp >= 100)  return { rank: 'Apprentice', color: 'from-teal-400 to-cyan-500', next: 500 };
    return { rank: 'Novice', color: 'from-slate-400 to-slate-500', next: 100 };
}

function formatDate(dateStr) {
    if (!dateStr) return 'N/A';
    return new Date(dateStr).toLocaleDateString('en-US', {
        year: 'numeric', month: 'long', day: 'numeric',
    });
}

function formatDuration(minutes) {
    if (!minutes || minutes < 1) return '0m';
    const h = Math.floor(minutes / 60);
    const m = Math.round(minutes % 60);
    if (h === 0) return `${m}m`;
    if (m === 0) return `${h}h`;
    return `${h}h ${m}m`;
}

// ─── Animation Variants ───────────────────────────────────────────────────────

const sectionVariant = {
    hidden: { opacity: 0, y: 24 },
    visible: (i) => ({
        opacity: 1,
        y: 0,
        transition: { delay: i * 0.08, duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] },
    }),
};

const cardHover = {
    rest: { scale: 1 },
    hover: { scale: 1.02, transition: { duration: 0.2 } },
};

// ─── Reusable Sub-components ──────────────────────────────────────────────────

function GlassCard({ children, className = '', index = 0, ...rest }) {
    return (
        <motion.div
            custom={index}
            variants={sectionVariant}
            initial="hidden"
            animate="visible"
            className={clsx(
                'bg-white/80 backdrop-blur-xl rounded-2xl border border-black/[0.05] shadow-sm p-6',
                className,
            )}
            {...rest}
        >
            {children}
        </motion.div>
    );
}

function SectionHeading({ icon: Icon, title, subtitle }) {
    return (
        <div className="flex items-center gap-3 mb-5">
            <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 text-white">
                <Icon size={18} />
            </div>
            <div>
                <h2 className="text-lg font-semibold text-slate-800">{title}</h2>
                {subtitle && <p className="text-xs text-slate-500">{subtitle}</p>}
            </div>
        </div>
    );
}

function InputField({ label, value, onChange, type = 'text', placeholder, icon: Icon, disabled }) {
    return (
        <label className="block">
            <span className="text-sm font-medium text-slate-600 mb-1.5 block">{label}</span>
            <div className="relative">
                {Icon && (
                    <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                        <Icon size={16} />
                    </div>
                )}
                <input
                    type={type}
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    placeholder={placeholder}
                    disabled={disabled}
                    className={clsx(
                        'w-full rounded-xl border border-slate-200 bg-white/60 px-4 py-2.5 text-sm text-slate-700',
                        'placeholder:text-slate-400 transition-all duration-200',
                        'focus:outline-none focus:ring-2 focus:ring-cyan-500/30 focus:border-cyan-400',
                        'disabled:opacity-50 disabled:cursor-not-allowed',
                        Icon && 'pl-10',
                    )}
                />
            </div>
        </label>
    );
}

function SelectField({ label, value, onChange, options, icon: Icon }) {
    return (
        <label className="block">
            <span className="text-sm font-medium text-slate-600 mb-1.5 block">{label}</span>
            <div className="relative">
                {Icon && (
                    <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                        <Icon size={16} />
                    </div>
                )}
                <select
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    className={clsx(
                        'w-full rounded-xl border border-slate-200 bg-white/60 px-4 py-2.5 text-sm text-slate-700',
                        'appearance-none transition-all duration-200',
                        'focus:outline-none focus:ring-2 focus:ring-cyan-500/30 focus:border-cyan-400',
                        Icon && 'pl-10',
                    )}
                >
                    {options.map((opt) => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                </select>
                <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            </div>
        </label>
    );
}

function ToggleSwitch({ label, checked, onChange, description }) {
    return (
        <div className="flex items-center justify-between gap-4">
            <div>
                <p className="text-sm font-medium text-slate-700">{label}</p>
                {description && <p className="text-xs text-slate-500 mt-0.5">{description}</p>}
            </div>
            <button
                type="button"
                role="switch"
                aria-checked={checked}
                onClick={() => onChange(!checked)}
                className={clsx(
                    'relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200',
                    checked ? 'bg-gradient-to-r from-cyan-500 to-blue-600' : 'bg-slate-200',
                )}
            >
                <span
                    className={clsx(
                        'pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-sm ring-0 transition-transform duration-200',
                        checked ? 'translate-x-5' : 'translate-x-0',
                    )}
                />
            </button>
        </div>
    );
}

function Skeleton({ className }) {
    return (
        <div
            className={clsx('animate-pulse bg-gradient-to-r from-slate-100 via-slate-200 to-slate-100 rounded-lg', className)}
            style={{ backgroundSize: '200% 100%', animation: 'shimmer 1.5s ease-in-out infinite' }}
        />
    );
}

function Toast({ message, type = 'success', onClose }) {
    useEffect(() => {
        const timer = setTimeout(onClose, 3500);
        return () => clearTimeout(timer);
    }, [onClose]);

    return (
        <motion.div
            initial={{ opacity: 0, y: -20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.95 }}
            className={clsx(
                'fixed top-6 right-6 z-50 flex items-center gap-3 px-5 py-3 rounded-xl shadow-lg text-sm font-medium',
                type === 'success' && 'bg-emerald-500 text-white',
                type === 'error' && 'bg-red-500 text-white',
                type === 'warning' && 'bg-amber-500 text-white',
            )}
        >
            {type === 'success' && <CheckCircle2 size={18} />}
            {type === 'error' && <AlertTriangle size={18} />}
            {type === 'warning' && <AlertTriangle size={18} />}
            {message}
        </motion.div>
    );
}

// ─── Main Profile Page ────────────────────────────────────────────────────────

export default function Profile() {
    const { user, updateUser, logout } = useAuth();
    const navigate = useNavigate();

    // Loading & error state
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [toast, setToast] = useState(null);
    const [confirmAction, setConfirmAction] = useState(null);

    // Profile data from server
    const [profileData, setProfileData] = useState(null);

    // ─── Personal Info ──────────────────────────────────────────────────────
    const [displayName, setDisplayName] = useState('');
    const [email, setEmail] = useState('');
    const [whatsapp, setWhatsapp] = useState('');
    const [bio, setBio] = useState('');

    // ─── Social Profiles ──────────────────────────────────────────────────
    const [linkedinUrl, setLinkedinUrl] = useState('');
    const [githubUrl, setGithubUrl] = useState('');
    const [twitterUrl, setTwitterUrl] = useState('');
    const [websiteUrl, setWebsiteUrl] = useState('');

    // ─── Learning Preferences ───────────────────────────────────────────────
    const [preferredLang, setPreferredLang] = useState('en');
    const [learningStyle, setLearningStyle] = useState('mixed');
    const [dailyGoal, setDailyGoal] = useState('30');
    const [difficulty, setDifficulty] = useState('beginner');

    // ─── Vaathiyaar Settings ────────────────────────────────────────────────
    const [voiceMode, setVoiceMode] = useState(false);
    const [voiceSpeed, setVoiceSpeed] = useState(1.0);
    const [voiceSelection, setVoiceSelection] = useState('default');
    const [autoPlayAnimations, setAutoPlayAnimations] = useState(true);
    const [hintLevel, setHintLevel] = useState(2);

    // ─── Stats ──────────────────────────────────────────────────────────────
    const [stats, setStats] = useState({
        totalXp: 0,
        modulesCompleted: 0,
        currentStreak: 0,
        timeSpent: 0,
    });

    // ─── Achievements ───────────────────────────────────────────────────────
    const [unlockedBadges, setUnlockedBadges] = useState([]);

    // ─── Dirty tracking ─────────────────────────────────────────────────────
    const [isDirty, setIsDirty] = useState(false);

    // ─── Load profile on mount ──────────────────────────────────────────────

    useEffect(() => {
        if (!user?.id) {
            navigate('/login');
            return;
        }

        let cancelled = false;

        async function loadProfile() {
            try {
                setLoading(true);
                const res = await getProfile(user.id);
                const p = res.data;

                if (cancelled) return;
                setProfileData(p);

                // Personal info
                setDisplayName(p.name || p.username || '');
                setEmail(p.email || '');
                setWhatsapp(p.whatsapp || '');
                setBio(p.bio || '');

                // Social profiles
                setLinkedinUrl(p.linkedin_url || '');
                setGithubUrl(p.github_url || '');
                setTwitterUrl(p.twitter_url || '');
                setWebsiteUrl(p.website_url || '');

                // Preferences
                const prefs = p.preferences || {};
                setPreferredLang(prefs.preferred_language || 'en');
                setLearningStyle(prefs.learning_style || 'mixed');
                setDailyGoal(String(prefs.daily_goal || '30'));
                setDifficulty(prefs.difficulty || 'beginner');

                // Vaathiyaar settings
                const vs = prefs.vaathiyaar || {};
                setVoiceMode(vs.voice_mode ?? false);
                setVoiceSpeed(vs.voice_speed ?? 1.0);
                setVoiceSelection(vs.voice_selection || 'default');
                setAutoPlayAnimations(vs.auto_play_animations ?? true);
                setHintLevel(vs.hint_level ?? 2);

                // Stats
                setStats({
                    totalXp: p.points || p.xp || 0,
                    modulesCompleted: p.modules_completed ?? p.completions?.length ?? 0,
                    currentStreak: p.streak || 0,
                    timeSpent: p.time_spent || 0,
                });

                // Achievements
                setUnlockedBadges(p.badges || p.achievements || []);

                setIsDirty(false);
            } catch (err) {
                if (!cancelled) {
                    console.error('Failed to load profile:', err);
                    setToast({ message: 'Failed to load profile data', type: 'error' });
                }
            } finally {
                if (!cancelled) setLoading(false);
            }
        }

        loadProfile();
        return () => { cancelled = true; };
    }, [user?.id, navigate]);

    // ─── Mark dirty on field changes ────────────────────────────────────────

    const markDirty = useCallback((setter) => {
        return (val) => {
            setter(val);
            setIsDirty(true);
        };
    }, []);

    // ─── Save profile ───────────────────────────────────────────────────────

    const handleSave = async () => {
        if (!user?.id) return;
        setSaving(true);
        try {
            const payload = {
                name: displayName,
                email,
                whatsapp,
                bio,
                linkedin_url: linkedinUrl,
                github_url: githubUrl,
                twitter_url: twitterUrl,
                website_url: websiteUrl,
                preferences: {
                    preferred_language: preferredLang,
                    learning_style: learningStyle,
                    daily_goal: parseInt(dailyGoal, 10),
                    difficulty,
                    vaathiyaar: {
                        voice_mode: voiceMode,
                        voice_speed: voiceSpeed,
                        voice_selection: voiceSelection,
                        auto_play_animations: autoPlayAnimations,
                        hint_level: hintLevel,
                    },
                },
            };

            await api.put(`/profile/${user.id}/settings`, payload);
            updateUser({ name: displayName, email });
            recordSignal({ user_id: user.id, signal: 'profile_updated' }).catch(() => {});
            setIsDirty(false);
            setToast({ message: 'Profile saved successfully', type: 'success' });
        } catch (err) {
            console.error('Failed to save profile:', err);
            setToast({ message: 'Failed to save profile. Please try again.', type: 'error' });
        } finally {
            setSaving(false);
        }
    };

    // ─── Account actions ────────────────────────────────────────────────────

    const handleExportData = async () => {
        try {
            const res = await api.get(`/profile/${user.id}/export`);
            const blob = new Blob([JSON.stringify(res.data, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `pymasters-data-${user.id}.json`;
            a.click();
            URL.revokeObjectURL(url);
            setToast({ message: 'Data exported successfully', type: 'success' });
        } catch {
            setToast({ message: 'Failed to export data', type: 'error' });
        }
    };

    const handleResetProgress = async () => {
        try {
            await api.post(`/profile/${user.id}/reset`);
            setStats({ totalXp: 0, modulesCompleted: 0, currentStreak: 0, timeSpent: 0 });
            setUnlockedBadges([]);
            setToast({ message: 'Progress has been reset', type: 'warning' });
            setConfirmAction(null);
        } catch {
            setToast({ message: 'Failed to reset progress', type: 'error' });
        }
    };

    const handleDeleteAccount = async () => {
        try {
            await api.delete(`/profile/${user.id}`);
            logout();
            navigate('/');
        } catch {
            setToast({ message: 'Failed to delete account', type: 'error' });
        }
    };

    // ─── Derived values ─────────────────────────────────────────────────────

    const rankInfo = getRankInfo(stats.totalXp);
    const xpProgress = rankInfo.next
        ? Math.min(100, Math.round((stats.totalXp / rankInfo.next) * 100))
        : 100;

    // ─── Loading Skeleton ───────────────────────────────────────────────────

    if (loading) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-slate-50 via-cyan-50/30 to-blue-50/20">
                <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
                    <Skeleton className="h-48 w-full rounded-2xl" />
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <Skeleton className="h-64 rounded-2xl" />
                        <Skeleton className="h-64 rounded-2xl" />
                    </div>
                    <Skeleton className="h-48 rounded-2xl" />
                    <Skeleton className="h-64 rounded-2xl" />
                </div>
            </div>
        );
    }

    // ─── Render ─────────────────────────────────────────────────────────────

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 via-cyan-50/30 to-blue-50/20">
            {/* Toast Notification */}
            <AnimatePresence>
                {toast && (
                    <Toast
                        message={toast.message}
                        type={toast.type}
                        onClose={() => setToast(null)}
                    />
                )}
            </AnimatePresence>

            {/* Confirmation Modal */}
            <AnimatePresence>
                {confirmAction && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
                        onClick={() => setConfirmAction(null)}
                    >
                        <motion.div
                            initial={{ scale: 0.9, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.9, opacity: 0 }}
                            className="bg-white rounded-2xl shadow-2xl p-6 max-w-sm w-full"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <div className="flex items-center gap-3 mb-4">
                                <div className="flex items-center justify-center w-10 h-10 rounded-full bg-red-100">
                                    <AlertTriangle size={20} className="text-red-600" />
                                </div>
                                <h3 className="text-lg font-semibold text-slate-800">{confirmAction.title}</h3>
                            </div>
                            <p className="text-sm text-slate-600 mb-6">{confirmAction.message}</p>
                            <div className="flex gap-3 justify-end">
                                <button
                                    onClick={() => setConfirmAction(null)}
                                    className="px-4 py-2 text-sm font-medium text-slate-600 bg-slate-100 rounded-xl hover:bg-slate-200 transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={confirmAction.onConfirm}
                                    className="px-4 py-2 text-sm font-medium text-white bg-red-500 rounded-xl hover:bg-red-600 transition-colors"
                                >
                                    {confirmAction.confirmLabel}
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
                {/* ─── Back nav + save bar ──────────────────────────────────── */}
                <motion.div
                    initial={{ opacity: 0, y: -12 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex items-center justify-between"
                >
                    <button
                        onClick={() => navigate(-1)}
                        className="flex items-center gap-2 text-sm font-medium text-slate-500 hover:text-slate-700 transition-colors"
                    >
                        <ArrowLeft size={18} />
                        Back
                    </button>

                    <AnimatePresence>
                        {isDirty && (
                            <motion.button
                                initial={{ opacity: 0, scale: 0.9 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.9 }}
                                onClick={handleSave}
                                disabled={saving}
                                className={clsx(
                                    'flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white',
                                    'bg-gradient-to-r from-cyan-500 to-blue-600 shadow-lg shadow-cyan-500/25',
                                    'hover:shadow-xl hover:shadow-cyan-500/30 transition-all duration-200',
                                    'disabled:opacity-60 disabled:cursor-not-allowed',
                                )}
                            >
                                <Save size={16} />
                                {saving ? 'Saving...' : 'Save Changes'}
                            </motion.button>
                        )}
                    </AnimatePresence>
                </motion.div>

                {/* ═══════════════════════════════════════════════════════════ */}
                {/* 1. Profile Header                                         */}
                {/* ═══════════════════════════════════════════════════════════ */}
                <GlassCard index={0} className="relative overflow-hidden">
                    {/* Decorative gradient band */}
                    <div className="absolute inset-x-0 top-0 h-24 bg-gradient-to-r from-cyan-500 via-blue-500 to-purple-500 opacity-90" />

                    <div className="relative pt-10 flex flex-col sm:flex-row items-center sm:items-end gap-5">
                        {/* Avatar with gradient ring */}
                        <div className="relative">
                            <div className="w-24 h-24 rounded-full p-[3px] bg-gradient-to-br from-cyan-400 via-blue-500 to-purple-500 shadow-lg">
                                <div className="w-full h-full rounded-full bg-white flex items-center justify-center">
                                    <span className="text-2xl font-bold bg-gradient-to-br from-cyan-600 to-blue-600 bg-clip-text text-transparent">
                                        {getInitials(displayName || user?.username)}
                                    </span>
                                </div>
                            </div>
                            {/* Rank badge overlay */}
                            <div className={clsx(
                                'absolute -bottom-1 -right-1 px-2 py-0.5 rounded-full text-[10px] font-bold text-white shadow-md',
                                `bg-gradient-to-r ${rankInfo.color}`,
                            )}>
                                {rankInfo.rank}
                            </div>
                        </div>

                        {/* User info */}
                        <div className="text-center sm:text-left flex-1 pb-1">
                            <h1 className="text-xl font-bold text-slate-800">
                                {displayName || user?.username || 'Learner'}
                            </h1>
                            <p className="text-sm text-slate-500">
                                @{user?.username} &middot; Member since {formatDate(profileData?.created_at || user?.created_at)}
                            </p>

                            {/* XP Progress Bar */}
                            <div className="mt-3 max-w-xs mx-auto sm:mx-0">
                                <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
                                    <span>{stats.totalXp.toLocaleString()} XP</span>
                                    {rankInfo.next && <span>{rankInfo.next.toLocaleString()} XP</span>}
                                </div>
                                <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
                                    <motion.div
                                        className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-blue-600"
                                        initial={{ width: 0 }}
                                        animate={{ width: `${xpProgress}%` }}
                                        transition={{ duration: 1.2, ease: 'easeOut', delay: 0.3 }}
                                    />
                                </div>
                            </div>
                        </div>
                    </div>
                </GlassCard>

                {/* ═══════════════════════════════════════════════════════════ */}
                {/* 2 & 3. Personal Info + Learning Preferences (two-col)     */}
                {/* ═══════════════════════════════════════════════════════════ */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Personal Info */}
                    <GlassCard index={1}>
                        <SectionHeading icon={User} title="Personal Info" subtitle="Your public profile details" />
                        <div className="space-y-4">
                            <InputField
                                label="Display Name"
                                value={displayName}
                                onChange={markDirty(setDisplayName)}
                                placeholder="Your name"
                                icon={User}
                            />
                            <InputField
                                label="Email"
                                value={email}
                                onChange={markDirty(setEmail)}
                                type="email"
                                placeholder="you@example.com"
                                icon={Mail}
                            />
                            <InputField
                                label="WhatsApp Number"
                                value={whatsapp}
                                onChange={markDirty(setWhatsapp)}
                                type="tel"
                                placeholder="+91 XXXXX XXXXX"
                                icon={Phone}
                            />
                            <label className="block">
                                <span className="text-sm font-medium text-slate-600 mb-1.5 block">Bio / About Me</span>
                                <div className="relative">
                                    <div className="absolute left-3 top-3 text-slate-400"><FileText size={16} /></div>
                                    <textarea
                                        value={bio}
                                        onChange={(e) => { setBio(e.target.value); setIsDirty(true); }}
                                        rows={3}
                                        maxLength={280}
                                        placeholder="Tell us about yourself..."
                                        className={clsx(
                                            'w-full rounded-xl border border-slate-200 bg-white/60 pl-10 pr-4 py-2.5 text-sm text-slate-700',
                                            'placeholder:text-slate-400 resize-none transition-all duration-200',
                                            'focus:outline-none focus:ring-2 focus:ring-cyan-500/30 focus:border-cyan-400',
                                        )}
                                    />
                                    <span className="absolute bottom-2 right-3 text-xs text-slate-400">
                                        {bio.length}/280
                                    </span>
                                </div>
                            </label>
                        </div>
                    </GlassCard>

                    {/* Learning Preferences */}
                    <GlassCard index={2}>
                        <SectionHeading icon={BookOpen} title="Learning Preferences" subtitle="Customize your experience" />
                        <div className="space-y-4">
                            <SelectField
                                label="Preferred Language"
                                value={preferredLang}
                                onChange={markDirty(setPreferredLang)}
                                options={LANGUAGES}
                                icon={Globe}
                            />

                            {/* Learning Style - visual selector */}
                            <div>
                                <span className="text-sm font-medium text-slate-600 mb-2 block">Learning Style</span>
                                <div className="grid grid-cols-2 gap-2">
                                    {LEARNING_STYLES.map(({ value, label, icon: StyleIcon }) => (
                                        <button
                                            key={value}
                                            type="button"
                                            onClick={() => { setLearningStyle(value); setIsDirty(true); }}
                                            className={clsx(
                                                'flex items-center gap-2 px-3 py-2.5 rounded-xl border text-sm font-medium transition-all duration-200',
                                                learningStyle === value
                                                    ? 'border-cyan-400 bg-cyan-50 text-cyan-700 shadow-sm'
                                                    : 'border-slate-200 bg-white/60 text-slate-600 hover:border-slate-300',
                                            )}
                                        >
                                            <StyleIcon size={16} />
                                            {label}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <SelectField
                                label="Daily Goal"
                                value={dailyGoal}
                                onChange={markDirty(setDailyGoal)}
                                options={DAILY_GOALS}
                                icon={Target}
                            />

                            {/* Difficulty - pill selector */}
                            <div>
                                <span className="text-sm font-medium text-slate-600 mb-2 block">Difficulty Preference</span>
                                <div className="flex gap-2">
                                    {DIFFICULTY_LEVELS.map(({ value, label }) => (
                                        <button
                                            key={value}
                                            type="button"
                                            onClick={() => { setDifficulty(value); setIsDirty(true); }}
                                            className={clsx(
                                                'flex-1 py-2 rounded-xl border text-sm font-medium transition-all duration-200',
                                                difficulty === value
                                                    ? 'border-cyan-400 bg-cyan-50 text-cyan-700 shadow-sm'
                                                    : 'border-slate-200 bg-white/60 text-slate-600 hover:border-slate-300',
                                            )}
                                        >
                                            {label}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </GlassCard>
                </div>

                {/* ═══════════════════════════════════════════════════════════ */}
                {/* Social Profiles                                           */}
                {/* ═══════════════════════════════════════════════════════════ */}
                <GlassCard index={2.5}>
                    <SectionHeading icon={Link} title="Social Profiles" subtitle="Connect your professional presence" />
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <InputField
                            label="LinkedIn URL"
                            value={linkedinUrl}
                            onChange={markDirty(setLinkedinUrl)}
                            type="url"
                            placeholder="https://linkedin.com/in/username"
                            icon={ExternalLink}
                        />
                        <InputField
                            label="GitHub URL"
                            value={githubUrl}
                            onChange={markDirty(setGithubUrl)}
                            type="url"
                            placeholder="https://github.com/username"
                            icon={ExternalLink}
                        />
                        <InputField
                            label="Twitter / X URL"
                            value={twitterUrl}
                            onChange={markDirty(setTwitterUrl)}
                            type="url"
                            placeholder="https://x.com/username"
                            icon={ExternalLink}
                        />
                        <InputField
                            label="Personal Website"
                            value={websiteUrl}
                            onChange={markDirty(setWebsiteUrl)}
                            type="url"
                            placeholder="https://yoursite.com"
                            icon={Globe}
                        />
                    </div>
                </GlassCard>

                {/* ═══════════════════════════════════════════════════════════ */}
                {/* 4. Vaathiyaar Settings                                    */}
                {/* ═══════════════════════════════════════════════════════════ */}
                <GlassCard index={3}>
                    <SectionHeading icon={Mic} title="Vaathiyaar Settings" subtitle="Customize your AI tutor's behavior" />
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-5">
                        {/* Left column */}
                        <div className="space-y-5">
                            <ToggleSwitch
                                label="Voice Mode"
                                description="Enable spoken responses from Vaathiyaar"
                                checked={voiceMode}
                                onChange={(v) => { setVoiceMode(v); setIsDirty(true); }}
                            />

                            <SelectField
                                label="Voice Selection"
                                value={voiceSelection}
                                onChange={markDirty(setVoiceSelection)}
                                options={VOICE_OPTIONS}
                                icon={Volume2}
                            />

                            <ToggleSwitch
                                label="Auto-play Animations"
                                description="Automatically play code visualizations"
                                checked={autoPlayAnimations}
                                onChange={(v) => { setAutoPlayAnimations(v); setIsDirty(true); }}
                            />
                        </div>

                        {/* Right column */}
                        <div className="space-y-5">
                            {/* Voice Speed Slider */}
                            <div>
                                <div className="flex items-center justify-between mb-2">
                                    <span className="text-sm font-medium text-slate-600">Voice Speed</span>
                                    <span className="text-sm font-semibold text-cyan-600">{voiceSpeed.toFixed(1)}x</span>
                                </div>
                                <input
                                    type="range"
                                    min="0.5"
                                    max="2"
                                    step="0.1"
                                    value={voiceSpeed}
                                    onChange={(e) => { setVoiceSpeed(parseFloat(e.target.value)); setIsDirty(true); }}
                                    className="w-full h-2 bg-slate-200 rounded-full appearance-none cursor-pointer accent-cyan-500
                                        [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4
                                        [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-gradient-to-br
                                        [&::-webkit-slider-thumb]:from-cyan-500 [&::-webkit-slider-thumb]:to-blue-600
                                        [&::-webkit-slider-thumb]:shadow-md [&::-webkit-slider-thumb]:cursor-pointer"
                                />
                                <div className="flex justify-between text-xs text-slate-500 mt-1">
                                    <span>0.5x</span>
                                    <span>1.0x</span>
                                    <span>1.5x</span>
                                    <span>2.0x</span>
                                </div>
                            </div>

                            {/* Hint Level */}
                            <div>
                                <div className="flex items-center justify-between mb-2">
                                    <span className="text-sm font-medium text-slate-600">Hint Level</span>
                                    <span className="text-sm font-semibold text-cyan-600">Level {hintLevel}</span>
                                </div>
                                <div className="flex gap-2">
                                    {[1, 2, 3, 4].map((level) => (
                                        <button
                                            key={level}
                                            type="button"
                                            onClick={() => { setHintLevel(level); setIsDirty(true); }}
                                            className={clsx(
                                                'flex-1 py-2.5 rounded-xl border text-sm font-medium transition-all duration-200 flex flex-col items-center gap-0.5',
                                                hintLevel === level
                                                    ? 'border-cyan-400 bg-cyan-50 text-cyan-700 shadow-sm'
                                                    : 'border-slate-200 bg-white/60 text-slate-500 hover:border-slate-300',
                                            )}
                                        >
                                            <Lightbulb size={14} className={hintLevel === level ? 'text-cyan-500' : 'text-slate-400'} />
                                            <span>{level}</span>
                                        </button>
                                    ))}
                                </div>
                                <p className="text-xs text-slate-500 mt-1.5">
                                    {hintLevel === 1 && 'Minimal hints -- figure it out yourself'}
                                    {hintLevel === 2 && 'Gentle nudges in the right direction'}
                                    {hintLevel === 3 && 'Detailed hints with examples'}
                                    {hintLevel === 4 && 'Full explanations and walkthroughs'}
                                </p>
                            </div>
                        </div>
                    </div>
                </GlassCard>

                {/* ═══════════════════════════════════════════════════════════ */}
                {/* 5. Stats Dashboard                                        */}
                {/* ═══════════════════════════════════════════════════════════ */}
                <GlassCard index={4}>
                    <SectionHeading icon={TrendingUp} title="Stats Dashboard" subtitle="Your learning journey at a glance" />
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        {[
                            {
                                label: 'Total XP',
                                value: stats.totalXp.toLocaleString(),
                                icon: Zap,
                                gradient: 'from-cyan-500 to-blue-600',
                                bg: 'bg-cyan-50',
                            },
                            {
                                label: 'Modules Done',
                                value: stats.modulesCompleted,
                                icon: CheckCircle2,
                                gradient: 'from-green-500 to-emerald-600',
                                bg: 'bg-green-50',
                            },
                            {
                                label: 'Day Streak',
                                value: stats.currentStreak,
                                icon: Flame,
                                gradient: 'from-orange-500 to-red-500',
                                bg: 'bg-orange-50',
                            },
                            {
                                label: 'Time Spent',
                                value: formatDuration(stats.timeSpent),
                                icon: Timer,
                                gradient: 'from-purple-500 to-violet-600',
                                bg: 'bg-purple-50',
                            },
                        ].map((stat) => (
                            <motion.div
                                key={stat.label}
                                variants={cardHover}
                                initial="rest"
                                whileHover="hover"
                                className={clsx(
                                    'relative rounded-xl border border-black/[0.05] p-4 overflow-hidden',
                                    stat.bg,
                                )}
                            >
                                <div className={clsx(
                                    'absolute top-3 right-3 w-8 h-8 rounded-lg flex items-center justify-center',
                                    'bg-gradient-to-br text-white',
                                    stat.gradient,
                                )}>
                                    <stat.icon size={16} />
                                </div>
                                <p className="text-2xl font-bold text-slate-800 mt-1">{stat.value}</p>
                                <p className="text-xs text-slate-500 mt-0.5">{stat.label}</p>
                            </motion.div>
                        ))}
                    </div>
                </GlassCard>

                {/* ═══════════════════════════════════════════════════════════ */}
                {/* 6. Achievements                                           */}
                {/* ═══════════════════════════════════════════════════════════ */}
                <GlassCard index={5}>
                    <SectionHeading icon={Trophy} title="Achievements" subtitle={`${unlockedBadges.length} of ${ACHIEVEMENTS.length} unlocked`} />
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                        {ACHIEVEMENTS.map((badge) => {
                            const isUnlocked = unlockedBadges.includes(badge.id)
                                || (badge.xpReq > 0 && stats.totalXp >= badge.xpReq);
                            const BadgeIcon = badge.icon;

                            return (
                                <motion.div
                                    key={badge.id}
                                    variants={cardHover}
                                    initial="rest"
                                    whileHover={isUnlocked ? 'hover' : 'rest'}
                                    className={clsx(
                                        'relative flex flex-col items-center gap-2 p-4 rounded-xl border transition-all duration-300',
                                        isUnlocked
                                            ? 'border-black/[0.05] bg-white/60'
                                            : 'border-dashed border-slate-200 bg-slate-50/50',
                                    )}
                                >
                                    <div className={clsx(
                                        'w-12 h-12 rounded-full flex items-center justify-center transition-all duration-300',
                                        isUnlocked
                                            ? `bg-gradient-to-br ${badge.color} text-white shadow-lg`
                                            : 'bg-slate-200 text-slate-400',
                                    )}>
                                        <BadgeIcon size={22} />
                                    </div>
                                    <span className={clsx(
                                        'text-xs font-medium text-center leading-tight',
                                        isUnlocked ? 'text-slate-700' : 'text-slate-400',
                                    )}>
                                        {badge.label}
                                    </span>
                                    {!isUnlocked && (
                                        <Lock size={12} className="absolute top-2 right-2 text-slate-300" />
                                    )}
                                </motion.div>
                            );
                        })}
                    </div>
                </GlassCard>

                {/* ═══════════════════════════════════════════════════════════ */}
                {/* 7. Account Actions                                        */}
                {/* ═══════════════════════════════════════════════════════════ */}
                <GlassCard index={6}>
                    <SectionHeading icon={Shield} title="Account Actions" />
                    <div className="flex flex-wrap gap-3">
                        <button
                            onClick={handleExportData}
                            className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-200 bg-white/60 text-sm font-medium text-slate-600 hover:border-slate-300 hover:bg-white transition-all duration-200"
                        >
                            <Download size={16} />
                            Export My Data
                        </button>

                        <button
                            onClick={() => setConfirmAction({
                                title: 'Reset Progress',
                                message: 'This will reset all your XP, streaks, completions, and achievements. This action cannot be undone.',
                                confirmLabel: 'Reset Everything',
                                onConfirm: handleResetProgress,
                            })}
                            className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-amber-200 bg-amber-50 text-sm font-medium text-amber-700 hover:border-amber-300 hover:bg-amber-100 transition-all duration-200"
                        >
                            <RotateCcw size={16} />
                            Reset Progress
                        </button>

                        <button
                            onClick={() => setConfirmAction({
                                title: 'Delete Account',
                                message: 'This will permanently delete your account and all associated data. This action cannot be undone.',
                                confirmLabel: 'Delete Account',
                                onConfirm: handleDeleteAccount,
                            })}
                            className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-red-200 bg-red-50 text-sm font-medium text-red-600 hover:border-red-300 hover:bg-red-100 transition-all duration-200"
                        >
                            <Trash2 size={16} />
                            Delete Account
                        </button>
                    </div>
                </GlassCard>

                {/* ─── Floating save button (mobile) ─────────────────────── */}
                <AnimatePresence>
                    {isDirty && (
                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: 20 }}
                            className="fixed bottom-6 left-1/2 -translate-x-1/2 md:hidden z-40"
                        >
                            <button
                                onClick={handleSave}
                                disabled={saving}
                                className={clsx(
                                    'flex items-center gap-2 px-6 py-3 rounded-2xl text-sm font-semibold text-white',
                                    'bg-gradient-to-r from-cyan-500 to-blue-600 shadow-xl shadow-cyan-500/30',
                                    'disabled:opacity-60',
                                )}
                            >
                                <Save size={16} />
                                {saving ? 'Saving...' : 'Save Changes'}
                            </button>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </div>
    );
}
