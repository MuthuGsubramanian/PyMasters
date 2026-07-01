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
import { useProfile } from '../context/ProfileContext';
import { getProfile, recordSignal, changePassword } from '../api';
import api from '../api';
import clsx from 'clsx';
import LanguageSelector from '../components/LanguageSelector';
import { Card, StatCard, Button, Badge, Avatar, FormField } from '../components/ui';

// ─── Constants ────────────────────────────────────────────────────────────────

// The "Preferred Language" dropdown MUST match the canonical supported-language
// set (backend `routes/language.py` SUPPORTED_LANGUAGES + frontend `i18n/index.js`
// SUPPORTED_LANGUAGES): en, ta, te, ml, fr, es, it, ko. Previously this list had
// drifted and offered two invalid options: `hi` (Hindi) — which is EXPLICITLY
// BLOCKED product-wide (onboarding 400s it, `/api/languages/check/hi` 400s it, and
// the Vaathiyaar LanguageSelector on this very page shows a "not supported" block
// message) — and `kn` (Kannada), which is not supported anywhere. Because
// `handleSave` PUTs the chosen code to `/settings`, a user could persist a
// blocked/unsupported language the rest of the app forbids. This list is now the
// supported set (English labels kept for continuity with the prior UX); `it`/`ko`
// were also missing and are now included. Keep in sync with the canonical source.
const LANGUAGES = [
    { value: 'en', label: 'English' },
    { value: 'ta', label: 'Tamil' },
    { value: 'te', label: 'Telugu' },
    { value: 'ml', label: 'Malayalam' },
    { value: 'fr', label: 'French' },
    { value: 'es', label: 'Spanish' },
    { value: 'it', label: 'Italian' },
    { value: 'ko', label: 'Korean' },
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

// Each badge carries a short `desc` used as a native hover tooltip so learners
// can see WHAT a badge means / requires without guessing from the icon (the
// grid otherwise shows only a label). Phrased as the goal so the same text
// reads correctly whether the badge is earned or still locked. These mirror the
// backend ACHIEVEMENT_DEFINITIONS descriptions (profile.py); purely presentational.
const ACHIEVEMENTS = [
    { id: 'first_login',       label: 'First Login',              icon: Star,         xpReq: 0,    color: 'from-yellow-400 to-amber-500', desc: 'Welcome to PyMasters — you took the first step.' },
    // Relabelled "First Module Complete" -> "First Lesson Complete": the backend earns this
    // badge on lessons_done > 0 (profile.py get_user_achievements), while the dashboard
    // "Modules Done" stat counts mastered modules (mastery>=0.5). The old label made a user
    // with 1 lesson / 0 mastered modules see "Modules Done 0" yet "First Module Complete" earned.
    { id: 'first_module',      label: 'First Lesson Complete',     icon: CheckCircle2, xpReq: 0,    color: 'from-green-400 to-emerald-500', desc: 'Complete your first lesson.' },
    { id: 'streak_7',          label: '7-Day Streak',              icon: Flame,        xpReq: 0,    color: 'from-orange-400 to-red-500', desc: 'Maintain a 7-day learning streak.' },
    { id: 'xp_100',            label: '100 XP',                    icon: Zap,          xpReq: 100,  color: 'from-cyan-400 to-blue-500', desc: 'Earn 100 or more XP.' },
    { id: 'xp_500',            label: '500 XP',                    icon: Trophy,       xpReq: 500,  color: 'from-purple-400 to-violet-500', desc: 'Earn 500 or more XP.' },
    { id: 'xp_1000',           label: '1000 XP',                   icon: Award,        xpReq: 1000, color: 'from-pink-400 to-rose-500', desc: 'Earn 1000 or more XP — true mastery!' },
    // NOTE: removed the 'all_modules' ("All Modules Complete") badge — the backend
    // ACHIEVEMENT_DEFINITIONS (profile.py) never emits it, so it was permanently locked and
    // wrongly inflated the "X of N unlocked" denominator (showed "of 7", only 6 earnable).
];

// ─── Utility Helpers ──────────────────────────────────────────────────────────

function getInitials(name) {
    if (!name) return '?';
    return name.split(' ').map(w => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();
}

function getRankInfo(xp) {
    // `floor` is the current tier's lower XP bound. It is required to draw the
    // XP progress bar as progress *within the current tier* (floor → next),
    // not as an absolute fraction of `next`. Without it a user who has only just
    // reached a rank (e.g. 1000 XP = Advanced, next 2000) would show ~50% filled
    // instead of ~0%, overstating progress at every tier. `next` and the other
    // fields are unchanged; `floor` is purely additive.
    if (xp >= 5000) return { rank: 'Master', color: 'from-amber-400 to-yellow-500', floor: 5000, next: null };
    if (xp >= 2000) return { rank: 'Expert', color: 'from-purple-400 to-violet-500', floor: 2000, next: 5000 };
    if (xp >= 1000) return { rank: 'Advanced', color: 'from-blue-400 to-cyan-500', floor: 1000, next: 2000 };
    if (xp >= 500)  return { rank: 'Intermediate', color: 'from-green-400 to-emerald-500', floor: 500, next: 1000 };
    if (xp >= 100)  return { rank: 'Apprentice', color: 'from-teal-400 to-cyan-500', floor: 100, next: 500 };
    return { rank: 'Novice', color: 'from-slate-400 to-slate-500', floor: 0, next: 100 };
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

const MotionCard = motion(Card);

function GlassCard({ children, className = '', index = 0, ...rest }) {
    return (
        <MotionCard
            custom={index}
            variants={sectionVariant}
            initial="hidden"
            animate="visible"
            className={clsx('shadow-sm p-6', className)}
            {...rest}
        >
            {children}
        </MotionCard>
    );
}

function SectionHeading({ icon: Icon, title, subtitle }) {
    return (
        <div className="flex items-center gap-3 mb-5">
            <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-gradient-primary text-white">
                <Icon size={18} />
            </div>
            <div>
                <h2 className="text-lg font-semibold text-text-primary">{title}</h2>
                {subtitle && <p className="text-xs text-text-muted">{subtitle}</p>}
            </div>
        </div>
    );
}

function InputField({ label, value, onChange, type = 'text', placeholder, icon: Icon, disabled }) {
    return (
        <label className="block">
            <span className="text-sm font-medium text-text-secondary mb-1.5 block">{label}</span>
            <div className="relative">
                {Icon && (
                    <div className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted">
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
                        'w-full rounded-xl border border-border-default bg-bg-inset px-4 py-2.5 text-sm text-text-secondary',
                        'placeholder:text-text-muted transition-all duration-200',
                        'focus:outline-none focus:ring-2 focus:ring-accent-primary/30 focus:border-accent-primary',
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
            <span className="text-sm font-medium text-text-secondary mb-1.5 block">{label}</span>
            <div className="relative">
                {Icon && (
                    <div className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted">
                        <Icon size={16} />
                    </div>
                )}
                <select
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    className={clsx(
                        'w-full rounded-xl border border-border-default bg-bg-inset px-4 py-2.5 text-sm text-text-secondary',
                        'appearance-none transition-all duration-200',
                        'focus:outline-none focus:ring-2 focus:ring-accent-primary/30 focus:border-accent-primary',
                        Icon && 'pl-10',
                    )}
                >
                    {options.map((opt) => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                </select>
                <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
            </div>
        </label>
    );
}

function ToggleSwitch({ label, checked, onChange, description }) {
    return (
        <div className="flex items-center justify-between gap-4">
            <div>
                <p className="text-sm font-medium text-text-primary">{label}</p>
                {description && <p className="text-xs text-text-muted mt-0.5">{description}</p>}
            </div>
            <button
                type="button"
                role="switch"
                aria-checked={checked}
                onClick={() => onChange(!checked)}
                className={clsx(
                    'relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200',
                    checked ? 'bg-gradient-primary' : 'bg-bg-elevated',
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
            className={clsx('animate-pulse bg-gradient-to-r from-bg-elevated via-bg-inset to-bg-elevated rounded-lg', className)}
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
    useEffect(() => { document.title = 'Profile — PyMasters'; }, []);
    const { user, updateUser, logout } = useAuth();
    const { language, setLanguage } = useProfile();
    const navigate = useNavigate();

    // Loading & error state
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [toast, setToast] = useState(null);
    const [confirmAction, setConfirmAction] = useState(null);

    // Change-password fields
    const [curPw, setCurPw] = useState('');
    const [newPw, setNewPw] = useState('');
    const [confirmPw, setConfirmPw] = useState('');
    const [pwSaving, setPwSaving] = useState(false);

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
                // Fetch the profile and achievements CONCURRENTLY. They are
                // independent reads, so awaiting achievements only after the
                // profile resolved added its round-trip (~300ms) to the tail of
                // the profile-page load path. Promise.all overlaps them. The
                // achievements call is allowed to fail softly (-> null) without
                // blocking the profile render.
                const [res, ar, sr] = await Promise.all([
                    getProfile(user.id),
                    api.get(`/profile/${user.id}/achievements`).catch(() => null),
                    // Stats (XP, modules, streak, time) live on a DEDICATED /stats
                    // endpoint — get_profile() does NOT return modules_completed,
                    // streak, or time_spent, so reading them off the profile object
                    // left "Modules Done / Day Streak / Time Spent" permanently 0.
                    // Fetch /stats in parallel and use it as the authoritative source.
                    // Allowed to fail softly (-> null) without blocking the render.
                    api.get(`/profile/${user.id}/stats`).catch(() => null),
                ]);
                // GET /profile/{id} returns { profile, onboarding_completed, created_at }.
                // Read the wrapped profile object (falling back to res.data for safety).
                const p = res.data?.profile || res.data;

                // The authoritative account-creation timestamp is the TOP-LEVEL
                // res.data.created_at (users.created_at). The inner
                // profile.created_at is the profile/settings-row timestamp, which
                // is (re)written whenever settings are saved — using it made
                // "Member since" jump to today after any profile save. Always
                // prefer the wrapper's created_at when present.
                if (p && res.data?.created_at) p.created_at = res.data.created_at;

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

                // Stats — prefer the authoritative /stats payload (sr), which the
                // backend computes from users.points, user_mastery, user_streaks and
                // time_spent learning signals. Fall back to the profile object / auth
                // context only when the stats request failed (sr === null).
                const st = sr?.data || {};
                setStats({
                    totalXp: st.total_xp ?? p.points ?? p.xp ?? user?.points ?? 0,
                    modulesCompleted: st.modules_completed ?? p.modules_completed ?? p.completions?.length ?? 0,
                    currentStreak: st.current_streak ?? p.streak ?? 0,
                    timeSpent: st.total_time_minutes ?? p.time_spent ?? 0,
                });

                // Achievements — fetched from the dedicated endpoint (above, in
                // parallel with the profile). getProfile() does NOT return badges,
                // so reading p.badges always left this empty. `ar` is null if the
                // achievements request failed.
                try {
                    const list = ar?.data?.achievements || (Array.isArray(ar?.data) ? ar.data : []);
                    setUnlockedBadges(list.filter((a) => a.earned).map((a) => a.id));
                } catch {
                    setUnlockedBadges([]);
                }

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

    // ─── Keep the "Preferred Language" dropdown in sync with the active language ─
    // The Vaathiyaar "Language" selector (LanguageSelector -> setLanguage) writes
    // `preferred_language` to the server IMMEDIATELY and updates the app-wide
    // context `language`. The separate "Preferred Language" dropdown here holds
    // its own `preferredLang` state, which previously never reacted to that
    // change. Two bugs resulted: (1) after using the Vaathiyaar selector the two
    // controls showed contradictory languages; (2) a subsequent "Save Changes"
    // sent the STALE `preferredLang` in the settings payload, silently reverting
    // the language the user had just chosen. Mirror context -> dropdown so they
    // can never disagree and Save always carries the active language.
    //
    // Guarded to codes the dropdown can actually render (LANGUAGES) so it never
    // introduces a blank/unmatched <select>; only adopts a value that differs
    // (no redundant setState); does NOT mark the form dirty (no phantom save
    // prompt). For users who never touch the Vaathiyaar selector, `language`
    // equals `preferredLang` from load, so this is a no-op — zero behaviour
    // change. Codes offered only by the Vaathiyaar selector (e.g. it/ko, absent
    // from LANGUAGES) are left as-is, exactly as today.
    useEffect(() => {
        if (!language) return;
        if (!LANGUAGES.some((l) => l.value === language)) return;
        setPreferredLang((prev) => (prev === language ? prev : language));
    }, [language]);

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
            recordSignal({ user_id: user.id, signal_type: 'profile_updated', topic: 'profile', value: {} }).catch(() => {});
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

    const handleChangePassword = async () => {
        if (!curPw || !newPw) { setToast({ message: 'Fill in all password fields', type: 'error' }); return; }
        if (newPw.length < 6) { setToast({ message: 'New password must be at least 6 characters', type: 'error' }); return; }
        if (newPw !== confirmPw) { setToast({ message: 'New passwords do not match', type: 'error' }); return; }
        setPwSaving(true);
        try {
            await changePassword(user.id, curPw, newPw);
            setToast({ message: 'Password updated successfully', type: 'success' });
            setCurPw(''); setNewPw(''); setConfirmPw('');
        } catch (e) {
            setToast({ message: e?.response?.data?.detail || 'Failed to update password', type: 'error' });
        } finally {
            setPwSaving(false);
        }
    };

    // ─── Derived values ─────────────────────────────────────────────────────

    const rankInfo = getRankInfo(stats.totalXp);
    // Progress is measured within the current tier (floor → next), so the bar
    // reads 0% just after a promotion and 100% on the cusp of the next rank.
    // Guard the span against div-by-zero and clamp to [0,100] for safety.
    const xpProgress = rankInfo.next
        ? Math.max(0, Math.min(100, Math.round(
              ((stats.totalXp - (rankInfo.floor || 0)) /
                  Math.max(1, rankInfo.next - (rankInfo.floor || 0))) * 100
          )))
        : 100;

    // ─── Loading Skeleton ───────────────────────────────────────────────────

    if (loading) {
        return (
            <div className="min-h-screen bg-gradient-hero">
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

    // Single source of truth for which badges are unlocked. The Achievements
    // render lit a badge via `unlockedBadges.includes(id) || (xpReq>0 && totalXp>=xpReq)`,
    // but the section subtitle counted only `unlockedBadges.length`. When the
    // /achievements request fails (unlockedBadges stays []) but /stats succeeds,
    // XP badges still rendered gold while the subtitle read "0 of N unlocked".
    // Derive one id set with the SAME predicate and use it for both the count
    // and the per-badge render so they can never disagree.
    const unlockedBadgeIds = ACHIEVEMENTS
        .filter((b) => unlockedBadges.includes(b.id) || (b.xpReq > 0 && stats.totalXp >= b.xpReq))
        .map((b) => b.id);

    return (
        <div className="min-h-screen bg-gradient-hero">
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
                            className="bg-bg-surface rounded-2xl shadow-2xl p-6 max-w-sm w-full"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <div className="flex items-center gap-3 mb-4">
                                <div className="flex items-center justify-center w-10 h-10 rounded-full bg-red-500/12">
                                    <AlertTriangle size={20} className="text-red-600 dark:text-red-300" />
                                </div>
                                <h3 className="text-lg font-semibold text-text-primary">{confirmAction.title}</h3>
                            </div>
                            <p className="text-sm text-text-secondary mb-6">{confirmAction.message}</p>
                            <div className="flex gap-3 justify-end">
                                <Button variant="ghost" size="md" onClick={() => setConfirmAction(null)}>
                                    Cancel
                                </Button>
                                <Button variant="danger" size="md" onClick={confirmAction.onConfirm}>
                                    {confirmAction.confirmLabel}
                                </Button>
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
                        className="flex items-center gap-2 text-sm font-medium text-text-muted hover:text-text-primary transition-colors"
                    >
                        <ArrowLeft size={18} />
                        Back
                    </button>

                    <AnimatePresence>
                        {isDirty && (
                            <Button
                                as={motion.button}
                                initial={{ opacity: 0, scale: 0.9 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.9 }}
                                onClick={handleSave}
                                disabled={saving}
                            >
                                <Save size={16} />
                                {saving ? 'Saving...' : 'Save Changes'}
                            </Button>
                        )}
                    </AnimatePresence>
                </motion.div>

                {/* ═══════════════════════════════════════════════════════════ */}
                {/* 1. Profile Header                                         */}
                {/* ═══════════════════════════════════════════════════════════ */}
                <GlassCard index={0} className="relative overflow-hidden">
                    {/* Decorative gradient band */}
                    <div className="absolute inset-x-0 top-0 h-24 bg-gradient-primary opacity-90" />

                    <div className="relative pt-10 flex flex-col sm:flex-row items-center sm:items-end gap-5">
                        {/* Avatar with gradient ring */}
                        <div className="relative">
                            <div className="w-24 h-24 rounded-full p-[3px] bg-gradient-primary shadow-lg">
                                <Avatar
                                    name={getInitials(displayName || user?.username)}
                                    className="w-full h-full text-2xl"
                                />
                            </div>
                            {/* Rank badge overlay */}
                            <Badge variant="primary" className="absolute -bottom-1 -right-1 shadow-md">
                                {rankInfo.rank}
                            </Badge>
                        </div>

                        {/* User info */}
                        <div className="text-center sm:text-left flex-1 pb-1">
                            <h1 className="text-xl font-bold text-text-primary">
                                {displayName || user?.username || 'Learner'}
                            </h1>
                            <p className="text-sm text-text-muted flex items-center justify-center sm:justify-start gap-2 flex-wrap">
                                <span>@{user?.username}</span>
                                {/* Only show the join date once the authoritative account-creation
                                    timestamp (wrapper res.data.created_at, stored on profileData.created_at)
                                    has loaded. The previous `|| user?.created_at` fallback used an
                                    auth-context timestamp that resolves to "today", causing "Member since"
                                    to briefly flash the current date on first load before settling to the
                                    real value. Render the badge only when the real date is available. */}
                                {profileData?.created_at && (
                                    <Badge variant="neutral">Member since {formatDate(profileData.created_at)}</Badge>
                                )}
                            </p>

                            {/* XP Progress Bar */}
                            <div className="mt-3 max-w-xs mx-auto sm:mx-0">
                                <div className="flex items-center justify-between text-xs text-text-muted mb-1">
                                    <span>{stats.totalXp.toLocaleString()} XP</span>
                                    {rankInfo.next && <span>{rankInfo.next.toLocaleString()} XP</span>}
                                </div>
                                <div className="h-2.5 bg-bg-inset rounded-full overflow-hidden">
                                    <motion.div
                                        className="h-full rounded-full bg-gradient-primary"
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
                                <span className="text-sm font-medium text-text-secondary mb-1.5 block">Bio / About Me</span>
                                <div className="relative">
                                    <div className="absolute left-3 top-3 text-text-muted"><FileText size={16} /></div>
                                    <textarea
                                        value={bio}
                                        onChange={(e) => { setBio(e.target.value); setIsDirty(true); }}
                                        rows={3}
                                        maxLength={280}
                                        placeholder="Tell us about yourself..."
                                        className={clsx(
                                            'w-full rounded-xl border border-border-default bg-bg-inset pl-10 pr-4 py-2.5 text-sm text-text-secondary',
                                            'placeholder:text-text-muted resize-none transition-all duration-200',
                                            'focus:outline-none focus:ring-2 focus:ring-accent-primary/30 focus:border-accent-primary',
                                        )}
                                    />
                                    <span className="absolute bottom-2 right-3 text-xs text-text-muted">
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
                                <span className="text-sm font-medium text-text-secondary mb-2 block">Learning Style</span>
                                <div className="grid grid-cols-2 gap-2">
                                    {LEARNING_STYLES.map(({ value, label, icon: StyleIcon }) => (
                                        <button
                                            key={value}
                                            type="button"
                                            onClick={() => { setLearningStyle(value); setIsDirty(true); }}
                                            className={clsx(
                                                'flex items-center gap-2 px-3 py-2.5 rounded-xl border text-sm font-medium transition-all duration-200',
                                                learningStyle === value
                                                    ? 'border-accent-primary bg-accent-subtle text-accent-primary shadow-sm'
                                                    : 'border-border-default bg-bg-elevated text-text-secondary hover:border-border-strong',
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
                                <span className="text-sm font-medium text-text-secondary mb-2 block">Difficulty Preference</span>
                                <div className="flex gap-2">
                                    {DIFFICULTY_LEVELS.map(({ value, label }) => (
                                        <button
                                            key={value}
                                            type="button"
                                            onClick={() => { setDifficulty(value); setIsDirty(true); }}
                                            className={clsx(
                                                'flex-1 py-2 rounded-xl border text-sm font-medium transition-all duration-200',
                                                difficulty === value
                                                    ? 'border-accent-primary bg-accent-subtle text-accent-primary shadow-sm'
                                                    : 'border-border-default bg-bg-elevated text-text-secondary hover:border-border-strong',
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
                    <div className="flex items-center justify-between gap-3 py-3 border-b border-border-default">
                        <div>
                            <div className="text-sm font-semibold text-text-primary">Language</div>
                            <div className="text-xs text-text-muted">Vaathiyaar and lessons appear in this language.</div>
                        </div>
                        <LanguageSelector currentLanguage={language} onSelect={setLanguage} />
                    </div>
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
                                    <span className="text-sm font-medium text-text-secondary">Voice Speed</span>
                                    <span className="text-sm font-semibold text-accent-primary">{voiceSpeed.toFixed(1)}x</span>
                                </div>
                                <input
                                    type="range"
                                    min="0.5"
                                    max="2"
                                    step="0.1"
                                    value={voiceSpeed}
                                    onChange={(e) => { setVoiceSpeed(parseFloat(e.target.value)); setIsDirty(true); }}
                                    className="w-full h-2 bg-bg-inset rounded-full appearance-none cursor-pointer accent-accent-primary
                                        [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4
                                        [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-gradient-primary
                                        [&::-webkit-slider-thumb]:shadow-md [&::-webkit-slider-thumb]:cursor-pointer"
                                />
                                <div className="flex justify-between text-xs text-text-muted mt-1">
                                    <span>0.5x</span>
                                    <span>1.0x</span>
                                    <span>1.5x</span>
                                    <span>2.0x</span>
                                </div>
                            </div>

                            {/* Hint Level */}
                            <div>
                                <div className="flex items-center justify-between mb-2">
                                    <span className="text-sm font-medium text-text-secondary">Hint Level</span>
                                    <span className="text-sm font-semibold text-accent-primary">Level {hintLevel}</span>
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
                                                    ? 'border-accent-primary bg-accent-subtle text-accent-primary shadow-sm'
                                                    : 'border-border-default bg-bg-elevated text-text-muted hover:border-border-strong',
                                            )}
                                        >
                                            <Lightbulb size={14} className={hintLevel === level ? 'text-accent-primary' : 'text-text-muted'} />
                                            <span>{level}</span>
                                        </button>
                                    ))}
                                </div>
                                <p className="text-xs text-text-muted mt-1.5">
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
                            { label: 'Total XP', value: stats.totalXp.toLocaleString(), icon: Zap },
                            { label: 'Modules Done', value: stats.modulesCompleted, icon: CheckCircle2 },
                            { label: 'Day Streak', value: stats.currentStreak, icon: Flame },
                            { label: 'Time Spent', value: formatDuration(stats.timeSpent), icon: Timer },
                        ].map((stat) => (
                            <motion.div
                                key={stat.label}
                                variants={cardHover}
                                initial="rest"
                                whileHover="hover"
                            >
                                <StatCard label={stat.label} value={stat.value} icon={stat.icon} />
                            </motion.div>
                        ))}
                    </div>
                </GlassCard>

                {/* ═══════════════════════════════════════════════════════════ */}
                {/* 6. Achievements                                           */}
                {/* ═══════════════════════════════════════════════════════════ */}
                <GlassCard index={5}>
                    <SectionHeading icon={Trophy} title="Achievements" subtitle={`${unlockedBadgeIds.length} of ${ACHIEVEMENTS.length} unlocked`} />
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                        {ACHIEVEMENTS.map((badge) => {
                            const isUnlocked = unlockedBadgeIds.includes(badge.id);
                            const BadgeIcon = badge.icon;

                            // Remaining XP for a still-locked XP-threshold badge, so the
                            // learner can see how close they are (purely derived from the
                            // XP already on screen; no new data dependency). Non-XP badges
                            // and unlocked badges yield null and render exactly as before.
                            const xpToGo = (!isUnlocked && badge.xpReq > 0)
                                ? Math.max(0, badge.xpReq - (stats.totalXp || 0))
                                : null;
                            // Native hover tooltip: goal description, plus the XP remaining
                            // when applicable. Falls back to the label if `desc` is absent
                            // (older bundle / safety), so it degrades gracefully.
                            const tip = xpToGo != null
                                ? `${badge.desc || badge.label} — ${xpToGo} XP to go`
                                : (badge.desc || badge.label);

                            return (
                                <motion.div
                                    key={badge.id}
                                    title={tip}
                                    variants={cardHover}
                                    initial="rest"
                                    whileHover={isUnlocked ? 'hover' : 'rest'}
                                    className={clsx(
                                        'relative flex flex-col items-center gap-2 p-4 rounded-xl border transition-all duration-300',
                                        isUnlocked
                                            ? 'border-border-default bg-bg-surface'
                                            : 'border-dashed border-border-default bg-bg-elevated',
                                    )}
                                >
                                    <div className={clsx(
                                        'w-12 h-12 rounded-full flex items-center justify-center transition-all duration-300',
                                        isUnlocked
                                            ? `bg-gradient-to-br ${badge.color} text-white shadow-lg`
                                            : 'bg-bg-inset text-text-muted',
                                    )}>
                                        <BadgeIcon size={22} />
                                    </div>
                                    <span className={clsx(
                                        'text-xs font-medium text-center leading-tight',
                                        isUnlocked ? 'text-text-secondary' : 'text-text-muted',
                                    )}>
                                        {badge.label}
                                    </span>
                                    {xpToGo != null && (
                                        <span className="text-[10px] font-medium text-text-muted leading-none">
                                            {xpToGo} XP to go
                                        </span>
                                    )}
                                    {!isUnlocked && (
                                        <Lock size={12} className="absolute top-2 right-2 text-text-muted" />
                                    )}
                                </motion.div>
                            );
                        })}
                    </div>
                </GlassCard>

                {/* ═══════════════════════════════════════════════════════════ */}
                {/* Change Password                                           */}
                {/* ═══════════════════════════════════════════════════════════ */}
                <GlassCard index={6}>
                    <SectionHeading icon={Lock} title="Change Password" subtitle="Update your account password" />
                    <div className="space-y-3 max-w-md">
                        <FormField label="Current Password">
                            {(id) => (
                                <input id={id} type="password" value={curPw} onChange={(e) => setCurPw(e.target.value)}
                                    placeholder="Current password" autoComplete="current-password" className="input-neo" />
                            )}
                        </FormField>
                        <FormField label="New Password" hint="At least 6 characters">
                            {(id) => (
                                <input id={id} type="password" value={newPw} onChange={(e) => setNewPw(e.target.value)}
                                    placeholder="New password (min 6 characters)" autoComplete="new-password" className="input-neo" />
                            )}
                        </FormField>
                        <FormField label="Confirm New Password">
                            {(id) => (
                                <input id={id} type="password" value={confirmPw} onChange={(e) => setConfirmPw(e.target.value)}
                                    placeholder="Confirm new password" autoComplete="new-password" className="input-neo" />
                            )}
                        </FormField>
                        <Button onClick={handleChangePassword} disabled={pwSaving}>
                            <Lock size={15} /> {pwSaving ? 'Updating…' : 'Update Password'}
                        </Button>
                    </div>
                </GlassCard>

                {/* ═══════════════════════════════════════════════════════════ */}
                {/* 7. Account Actions                                        */}
                {/* ═══════════════════════════════════════════════════════════ */}
                <GlassCard index={7}>
                    <SectionHeading icon={Shield} title="Account Actions" />
                    <div className="flex flex-wrap gap-3">
                        <Button variant="outline" onClick={handleExportData}>
                            <Download size={16} />
                            Export My Data
                        </Button>

                        <button
                            onClick={() => setConfirmAction({
                                title: 'Reset Progress',
                                message: 'This will reset all your XP, streaks, completions, and achievements. This action cannot be undone.',
                                confirmLabel: 'Reset Everything',
                                onConfirm: handleResetProgress,
                            })}
                            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl border border-amber-500/30 bg-amber-500/12 text-sm font-bold text-amber-600 dark:text-amber-300 hover:bg-amber-500/20 transition-all duration-200"
                        >
                            <RotateCcw size={16} />
                            Reset Progress
                        </button>

                        <Button
                            variant="danger"
                            onClick={() => setConfirmAction({
                                title: 'Delete Account',
                                message: 'This will permanently delete your account and all associated data. This action cannot be undone.',
                                confirmLabel: 'Delete Account',
                                onConfirm: handleDeleteAccount,
                            })}
                        >
                            <Trash2 size={16} />
                            Delete Account
                        </Button>
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
                            <Button
                                size="lg"
                                onClick={handleSave}
                                disabled={saving}
                                className="rounded-2xl shadow-xl"
                            >
                                <Save size={16} />
                                {saving ? 'Saving...' : 'Save Changes'}
                            </Button>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </div>
    );
}
