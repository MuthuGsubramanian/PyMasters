import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import api from '../api';
import { useAuth } from '../context/AuthContext';
import PymastersGlyph from '../assets/pymasters-glyph.svg';
import VaathiyaarGlyph from '../assets/vaathiyaar-glyph.svg';
import LanguageSelector from '../components/LanguageSelector';

// ---------------------------------------------------------------------------
// Question definitions
// ---------------------------------------------------------------------------
const QUESTIONS = [
    {
        key: 'preferred_language',
        type: 'language',
        text: "Which language should Vaathiyaar speak with you?",
        hint: "You can change this anytime from your profile.",
    },
    {
        key: 'motivation',
        type: 'choice',
        multi: true,
        text: "What brings you to Python?",
        hint: "Pick all that apply.",
        options: [
            { value: 'career_switch', label: '💼 Career Switch' },
            { value: 'student',       label: '🎓 I\'m a Student' },
            { value: 'hobby',         label: '🎮 Just for Fun' },
            { value: 'ai_ml',         label: '🤖 AI / ML' },
            { value: 'work',          label: '🏢 Need it for Work' },
            { value: 'data_science',  label: '📊 Data Science' },
        ],
    },
    {
        key: 'user_type',
        text: "Tell me about yourself",
        hint: "This helps me tailor everything for you.",
        type: 'choice',
        multi: false,
        options: [
            { value: 'high_school_student', label: '🏫 High School Student', desc: 'Learning the ropes in school' },
            { value: 'college_student', label: '🎓 College / University Student', desc: 'Studying CS or a related field' },
            { value: 'junior_developer', label: '💻 Junior Developer', desc: 'Early in my dev career (0-2 yrs)' },
            { value: 'senior_developer', label: '🚀 Senior Developer', desc: 'Experienced dev (3+ years)' },
            { value: 'career_switcher', label: '🔄 Career Switcher', desc: 'Transitioning into tech' },
            { value: 'hobbyist', label: '🎮 Hobbyist / Enthusiast', desc: 'Learning for fun and curiosity' },
        ],
    },
    {
        key: 'prior_experience',
        type: 'choice',
        text: "How much coding experience do you have?",
        options: [
            { value: 'none',            label: '🌱 Total Beginner' },
            { value: 'some',            label: '📝 A Little Bit' },
            { value: 'other_language',  label: '🔄 Know Another Language' },
            { value: 'python',          label: '🐍 Already Know Some Python' },
        ],
    },
    {
        key: 'learning_style',
        type: 'choice',
        text: "How do you learn best?",
        options: [
            { value: 'visual',    label: '👁️ Visual — Charts & Diagrams' },
            { value: 'hands_on',  label: '🔧 Hands-On — Build Things' },
            { value: 'reading',   label: '📖 Reading — Theory First' },
            { value: 'projects',  label: '🚀 Project-Driven' },
        ],
    },
    {
        key: 'goal',
        type: 'choice',
        multi: true,
        text: "What do you want to build with Python?",
        hint: "Pick all that apply.",
        options: [
            { value: 'web',          label: '🌐 Web Development' },
            { value: 'data_science', label: '📊 Data Science' },
            { value: 'automation',   label: '⚙️ Automate Tasks' },
            { value: 'ai_ml',        label: '🤖 AI / Machine Learning' },
            { value: 'games',        label: '🎮 Game Development' },
            { value: 'unknown',      label: '🤷 Not Sure Yet' },
        ],
    },
    {
        key: 'time_commitment',
        type: 'choice',
        text: "How much time can you dedicate each day?",
        options: [
            { value: '15min',    label: '⚡ 15 minutes' },
            { value: '30min',    label: '🔥 30 minutes' },
            { value: '1hour',    label: '💪 1 hour' },
            { value: 'weekends', label: '📅 Weekends Only' },
        ],
    },
    {
        key: 'social_profiles',
        text: "Connect your professional profiles",
        hint: "Totally optional.",
        type: 'social',
    },
    {
        key: 'contact_preference',
        type: 'choice',
        text: "Want progress updates & learning reminders?",
        options: [
            { value: 'yes', label: '✅ Yes, keep me updated!' },
            { value: 'no',  label: '⏭️ Skip for now' },
        ],
    },
    {
        key: 'contact_details',
        type: 'contact',
        text: "How should I reach you?",
        hint: "Both are optional.",
        condition: 'contact_preference === yes',
    },
];

const ORG_QUESTIONS = [
    {
        key: 'preferred_language',
        type: 'language',
        text: "Which language should the platform use for your organization?",
        hint: "You can change this anytime.",
    },
    {
        key: 'org_size',
        type: 'choice',
        text: "How many learners will use PyMasters?",
        options: [
            { value: '1-10',   label: '👤 1-10 learners' },
            { value: '11-50',  label: '👥 11-50 learners' },
            { value: '51-200', label: '🏫 51-200 learners' },
            { value: '200+',   label: '🏢 200+ learners' },
        ],
    },
    {
        key: 'learner_profile',
        type: 'choice',
        text: "Who are your learners?",
        options: [
            { value: 'k12',          label: '🏫 K-12 Students' },
            { value: 'university',   label: '🎓 University Students' },
            { value: 'professional', label: '💼 Working Professionals' },
            { value: 'mixed',        label: '🌍 Mixed Group' },
        ],
    },
    {
        key: 'skill_level',
        type: 'choice',
        text: "What's their current Python level?",
        options: [
            { value: 'beginner', label: '🌱 Complete Beginners' },
            { value: 'some',     label: '📝 Some Experience' },
            { value: 'mixed',    label: '🔀 Mixed Levels' },
        ],
    },
    {
        key: 'learning_focus',
        type: 'choice',
        text: "What should they learn?",
        options: [
            { value: 'fundamentals',  label: '🐍 Python Fundamentals' },
            { value: 'ai_ml',         label: '🤖 AI & Machine Learning' },
            { value: 'web',           label: '🌐 Web Development' },
            { value: 'data_science',  label: '📊 Data Science' },
            { value: 'mixed',         label: '🎯 Mixed / All Topics' },
        ],
    },
    {
        key: 'structure_preference',
        type: 'choice',
        text: "How do you want to manage learning?",
        options: [
            { value: 'assigned',    label: '📋 Assign Specific Paths' },
            { value: 'free_choice', label: '🆓 Let Learners Choose' },
            { value: 'mix',         label: '🔀 Mix of Both' },
        ],
    },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function isAnswered(q, answers) {
    // Optional question types never block submission.
    if (q.type === 'social' || q.type === 'contact' || q.type === 'language') return true;
    const v = answers[q.key];
    if (q.multi) return Array.isArray(v) && v.length > 0;
    return !!v;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------
function OptionCard({ option, selected, onClick }) {
    return (
        <button
            type="button"
            onClick={onClick}
            aria-pressed={selected}
            className={`relative text-left px-4 py-3 rounded-xl border transition-all duration-200 ${
                selected
                    ? 'border-cyan-500 bg-cyan-500/15 shadow-sm shadow-cyan-500/20'
                    : 'border-border-default bg-bg-elevated hover:border-cyan-400/50 hover:bg-cyan-500/5'
            }`}
        >
            <div className="flex items-start gap-2">
                <span className={`text-sm font-semibold ${selected ? 'text-cyan-700 dark:text-cyan-200' : 'text-text-primary'}`}>
                    {option.label}
                </span>
                {selected && (
                    <span className="ml-auto flex-shrink-0 w-4 h-4 rounded-full bg-cyan-500 text-white text-[10px] flex items-center justify-center">✓</span>
                )}
            </div>
            {option.desc && (
                <p className="text-xs text-text-muted mt-1 leading-snug">{option.desc}</p>
            )}
        </button>
    );
}

function QuestionCard({ q, index, answers, setAnswers }) {
    const select = (value) => {
        setAnswers((prev) => {
            if (q.multi) {
                const cur = Array.isArray(prev[q.key]) ? prev[q.key] : [];
                const next = cur.includes(value) ? cur.filter((v) => v !== value) : [...cur, value];
                return { ...prev, [q.key]: next };
            }
            return { ...prev, [q.key]: value };
        });
    };

    const answered = isAnswered(q, answers);

    return (
        <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: Math.min(index * 0.04, 0.3) }}
            className="panel rounded-2xl border border-border-default p-5 sm:p-6"
        >
            <div className="flex items-start gap-3 mb-4">
                <div className={`flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
                    answered ? 'bg-cyan-500 text-white' : 'bg-bg-inset text-text-muted'
                }`}>
                    {answered ? '✓' : index}
                </div>
                <div>
                    <h3 className="text-base font-bold text-text-primary leading-snug">{q.text}</h3>
                    {q.hint && <p className="text-xs text-text-muted mt-0.5">{q.hint}</p>}
                </div>
            </div>

            {q.type === 'language' && (
                <LanguageSelector
                    currentLanguage={answers.preferred_language || 'en'}
                    onSelect={(code) => setAnswers((p) => ({ ...p, preferred_language: code }))}
                />
            )}

            {q.type === 'choice' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {q.options.map((opt) => (
                        <OptionCard
                            key={opt.value}
                            option={opt}
                            selected={q.multi ? (answers[q.key] || []).includes(opt.value) : answers[q.key] === opt.value}
                            onClick={() => select(opt.value)}
                        />
                    ))}
                </div>
            )}

            {q.type === 'social' && (
                <div className="space-y-3">
                    <div className="relative">
                        <div className="absolute left-3 top-1/2 -translate-y-1/2 text-blue-500">
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M19 3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14m-.5 15.5v-5.3a3.26 3.26 0 0 0-3.26-3.26c-.85 0-1.84.52-2.32 1.3v-1.11h-2.79v8.37h2.79v-4.93c0-.77.62-1.4 1.39-1.4a1.4 1.4 0 0 1 1.4 1.4v4.93h2.79M6.88 8.56a1.68 1.68 0 0 0 1.68-1.68c0-.93-.75-1.69-1.68-1.69a1.69 1.69 0 0 0-1.69 1.69c0 .93.76 1.68 1.69 1.68m1.39 9.94v-8.37H5.5v8.37h2.77z"/></svg>
                        </div>
                        <input
                            type="url"
                            placeholder="LinkedIn URL (optional)"
                            className="w-full pl-10 pr-4 py-3 rounded-xl bg-bg-elevated border border-border-default text-sm text-text-primary placeholder-text-muted focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition-all"
                            value={answers.linkedin_url || ''}
                            onChange={(e) => setAnswers((a) => ({ ...a, linkedin_url: e.target.value }))}
                        />
                    </div>
                    <div className="relative">
                        <div className="absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary">
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/></svg>
                        </div>
                        <input
                            type="url"
                            placeholder="GitHub URL (optional)"
                            className="w-full pl-10 pr-4 py-3 rounded-xl bg-bg-elevated border border-border-default text-sm text-text-primary placeholder-text-muted focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition-all"
                            value={answers.github_url || ''}
                            onChange={(e) => setAnswers((a) => ({ ...a, github_url: e.target.value }))}
                        />
                    </div>
                </div>
            )}

            {q.type === 'contact' && (
                <div className="space-y-3 max-w-sm">
                    <div className="flex items-center gap-2 bg-bg-elevated rounded-xl px-4 py-2.5 border border-border-default">
                        <span className="text-text-muted text-sm">@</span>
                        <input
                            type="email"
                            value={answers.email || ''}
                            onChange={(e) => setAnswers((a) => ({ ...a, email: e.target.value }))}
                            placeholder="Email address"
                            className="flex-1 bg-transparent text-sm text-text-primary placeholder-text-muted outline-none"
                        />
                    </div>
                    <div className="flex items-center gap-2 bg-bg-elevated rounded-xl px-4 py-2.5 border border-border-default">
                        <span className="text-text-muted text-sm">📱</span>
                        <input
                            type="tel"
                            value={answers.whatsapp || ''}
                            onChange={(e) => setAnswers((a) => ({ ...a, whatsapp: e.target.value }))}
                            placeholder="WhatsApp number"
                            className="flex-1 bg-transparent text-sm text-text-primary placeholder-text-muted outline-none"
                        />
                    </div>
                </div>
            )}
        </motion.div>
    );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
export default function Onboarding() {
    useEffect(() => { document.title = 'Welcome — PyMasters'; }, []);

    const { user, updateUser } = useAuth();
    const navigate = useNavigate();

    const username = user?.name || user?.username || '';
    const isOrg = user?.account_type === 'organization';
    const allQuestions = isOrg ? ORG_QUESTIONS : QUESTIONS;

    const storageKey = `pymasters_onboarding_cards_${user?.id || 'guest'}_${isOrg ? 'org' : 'ind'}`;
    const loadSaved = () => {
        try {
            const raw = localStorage.getItem(storageKey);
            return raw ? JSON.parse(raw) : {};
        } catch { return {}; }
    };

    const [answers, setAnswers] = useState(() => {
        const saved = loadSaved();
        return { preferred_language: 'en', ...saved };
    });
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState('');

    // Persist answers as the user fills the form so a refresh doesn't lose work.
    useEffect(() => {
        try { localStorage.setItem(storageKey, JSON.stringify(answers)); } catch { /* ignore */ }
    }, [answers, storageKey]);

    // Questions to render (hide conditional ones whose condition isn't met).
    const visibleQuestions = allQuestions.filter((q) => {
        if (!q.condition) return true;
        const [condKey, condVal] = q.condition.split('===').map((s) => s.trim());
        return answers[condKey] === condVal;
    });

    // Required = every visible 'choice' question is answered.
    const requiredQuestions = visibleQuestions.filter((q) => q.type === 'choice');
    const answeredCount = requiredQuestions.filter((q) => isAnswered(q, answers)).length;
    const allRequiredAnswered = answeredCount === requiredQuestions.length;
    const progressPct = requiredQuestions.length
        ? Math.round((answeredCount / requiredQuestions.length) * 100)
        : 100;

    const handleSubmit = async () => {
        if (submitting || !allRequiredAnswered) return;
        setSubmitting(true);
        setError('');

        // Flatten multi-select arrays to comma-joined strings for the backend
        // (matches the legacy payload shape).
        const payload = { ...answers };
        for (const q of allQuestions) {
            if (q.multi && Array.isArray(payload[q.key])) {
                payload[q.key] = payload[q.key].join(',');
            }
        }

        try {
            if (isOrg) {
                const { saveOrgOnboarding } = await import('../api');
                await saveOrgOnboarding({
                    user_id: user?.id,
                    preferred_language: payload.preferred_language || 'en',
                    org_size: payload.org_size || '',
                    learner_profile: payload.learner_profile || '',
                    skill_level: payload.skill_level || '',
                    learning_focus: payload.learning_focus || '',
                    structure_preference: payload.structure_preference || '',
                });
            } else {
                await api.post('/profile/onboarding', {
                    user_id: user?.id,
                    ...payload,
                    linkedin_url: payload.linkedin_url || undefined,
                    github_url: payload.github_url || undefined,
                });
            }
        } catch (err) {
            console.error('Onboarding submit failed:', err);
            setError('Something went wrong saving your answers. Please try again.');
            setSubmitting(false);
            return;
        }

        try { localStorage.removeItem(storageKey); } catch { /* ignore */ }
        updateUser({ onboarding_completed: true, preferred_language: payload.preferred_language || 'en' });

        if (isOrg) {
            navigate('/dashboard/org');
            return;
        }

        // Individual: try to route straight into the recommended path.
        try {
            const recRes = await api.get(`/paths/recommend?user_id=${user?.id}`);
            const rec = recRes.data?.recommended || null;
            if (rec && rec.id) {
                try { await api.post(`/paths/${rec.id}/start`, { user_id: user?.id }); } catch { /* non-fatal */ }
                navigate(`/dashboard/paths/${rec.id}`);
                return;
            }
        } catch (e) {
            console.log('Path recommendation not available:', e);
        }
        navigate('/dashboard/classroom');
    };

    const handleSkip = () => {
        updateUser({ onboarding_completed: true });
        api.post('/profile/onboarding/skip').catch(() => {});
        navigate(isOrg ? '/dashboard/org' : '/dashboard/classroom');
    };

    return (
        <div className="min-h-screen flex flex-col" style={{ background: 'var(--bg-deep)' }}>
            {/* Header */}
            <header className="flex-shrink-0 px-6 py-4 flex items-center gap-3 border-b border-border-default sticky top-0 z-20 bg-bg-deep/90 backdrop-blur">
                <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-purple-600 to-cyan-500 flex items-center justify-center shadow-md shadow-purple-500/20 border border-white/10">
                    <img src={PymastersGlyph} alt="PyMasters" className="w-[18px] h-[18px]" />
                </div>
                <div>
                    <p className="text-xs font-bold uppercase tracking-widest text-purple-600 dark:text-purple-400">PyMasters</p>
                    <p className="text-[11px] text-text-muted">Set up with Vaathiyaar</p>
                </div>
                <button
                    type="button"
                    onClick={handleSkip}
                    className="ml-auto text-[11px] font-semibold text-text-muted hover:text-purple-600 dark:hover:text-purple-400 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400/60 rounded px-2 py-1"
                    title="You can finish this later from your profile"
                >
                    Skip setup →
                </button>
            </header>

            {/* Sticky progress bar */}
            <div className="sticky top-[65px] z-10 px-4 sm:px-8 pt-3 pb-2 bg-bg-deep/90 backdrop-blur">
                <div className="max-w-2xl w-full mx-auto">
                    <div className="flex items-center justify-between mb-1.5">
                        <span className="text-[11px] text-text-muted">{answeredCount} of {requiredQuestions.length} answered</span>
                        <span className="text-[11px] font-semibold text-cyan-600 dark:text-cyan-400">{progressPct}%</span>
                    </div>
                    <div className="w-full h-1.5 rounded-full bg-bg-inset overflow-hidden">
                        <motion.div
                            className="h-full rounded-full bg-gradient-to-r from-purple-500 to-cyan-500"
                            initial={false}
                            animate={{ width: `${progressPct}%` }}
                            transition={{ type: 'spring', stiffness: 200, damping: 30 }}
                        />
                    </div>
                </div>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto px-4 sm:px-8 py-6">
                <div className="max-w-2xl w-full mx-auto space-y-5">
                    {/* Vaathiyaar greeting */}
                    <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.35 }}
                        className="flex items-start gap-3"
                    >
                        <div className="flex-shrink-0 w-10 h-10 rounded-full bg-gradient-to-br from-purple-500 to-cyan-500 flex items-center justify-center select-none shadow-md shadow-purple-300/20">
                            <img src={VaathiyaarGlyph} alt="" aria-hidden="true" className="w-[60%] h-[60%]" />
                        </div>
                        <div className="panel rounded-2xl rounded-tl-sm px-5 py-3.5 border-l-2 border-purple-500/60">
                            <p className="text-sm text-text-primary leading-relaxed">
                                {username ? `Vanakkam, ${username}! 🙏 ` : 'Vanakkam! 🙏 '}
                                {isOrg
                                    ? "I'm Vaathiyaar. Set up your organization's learning environment below — answer them all in one go, then hit Finish."
                                    : "I'm Vaathiyaar, your personal Python guide. Fill in the cards below — pick everything in one go, then hit Finish and I'll tailor your path."}
                            </p>
                        </div>
                    </motion.div>

                    {/* Question cards */}
                    {visibleQuestions.map((q, i) => (
                        <QuestionCard
                            key={q.key}
                            q={q}
                            index={q.type === 'choice'
                                ? requiredQuestions.findIndex((rq) => rq.key === q.key) + 1
                                : i + 1}
                            answers={answers}
                            setAnswers={setAnswers}
                        />
                    ))}

                    {error && (
                        <div className="bg-red-500/10 border border-red-500/20 text-red-500 p-3.5 rounded-xl text-sm">
                            {error}
                        </div>
                    )}
                </div>
            </div>

            {/* Sticky footer: submit */}
            <footer className="flex-shrink-0 px-4 sm:px-8 py-4 border-t border-border-default bg-bg-deep/90 backdrop-blur">
                <div className="max-w-2xl w-full mx-auto flex items-center gap-4">
                    <p className="text-[11px] text-text-muted hidden sm:block">
                        {allRequiredAnswered
                            ? 'All set — finish whenever you like.'
                            : `Answer ${requiredQuestions.length - answeredCount} more to continue.`}
                    </p>
                    <button
                        type="button"
                        onClick={handleSubmit}
                        disabled={!allRequiredAnswered || submitting}
                        className={`ml-auto px-7 py-3 rounded-xl text-sm font-bold text-white transition-all duration-200 flex items-center gap-2 ${
                            allRequiredAnswered && !submitting
                                ? 'bg-gradient-to-r from-purple-600 to-cyan-500 hover:scale-[1.02] shadow-lg shadow-purple-500/25'
                                : 'bg-slate-500/50 cursor-not-allowed'
                        }`}
                    >
                        {submitting ? 'Saving…' : (isOrg ? 'Finish Setup 🚀' : 'Finish & Start Learning 🚀')}
                    </button>
                </div>
            </footer>
        </div>
    );
}
