import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import api from '../api';
import { useAuth } from '../context/AuthContext';
import PymastersIcon from '../assets/pymasters-icon.svg';
import LanguageSelector from '../components/LanguageSelector';

// ---------------------------------------------------------------------------
// Question definitions
// ---------------------------------------------------------------------------
const QUESTIONS = [
    {
        key: 'preferred_language',
        type: 'language',
        text: "First things first — which language do you want Vaathiyaar to speak with you? 🌐",
    },
    {
        key: 'motivation',
        type: 'choice',
        multi: true,
        text: "Great! Now tell me — what brings you to Python? 🎯",
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
        text: "Tell me about yourself — this helps me tailor everything just for you! 🎯",
        type: 'choice',
        multi: false,
        options: [
            { value: 'high_school_student', label: '🏫 High School Student', desc: 'I\'m in school learning the ropes' },
            { value: 'college_student', label: '🎓 College / University Student', desc: 'Studying CS or related field' },
            { value: 'junior_developer', label: '💻 Junior Developer', desc: 'Early in my dev career (0-2 years)' },
            { value: 'senior_developer', label: '🚀 Senior Developer', desc: 'Experienced dev (3+ years)' },
            { value: 'career_switcher', label: '🔄 Career Switcher', desc: 'Transitioning into tech' },
            { value: 'hobbyist', label: '🎮 Hobbyist / Enthusiast', desc: 'Learning for fun and curiosity' },
        ],
    },
    {
        key: 'prior_experience',
        type: 'choice',
        text: "How much coding experience do you already have? 💻",
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
        text: "How do you learn best? I'll tailor lessons just for you. ✨",
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
        text: "What's the main thing you want to build or do with Python? 🏗️",
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
        text: "How much time can you dedicate each day? Consistency is the key! ⏱️",
        options: [
            { value: '15min',    label: '⚡ 15 minutes' },
            { value: '30min',    label: '🔥 30 minutes' },
            { value: '1hour',    label: '💪 1 hour' },
            { value: 'weekends', label: '📅 Weekends Only' },
        ],
    },
    {
        key: 'social_profiles',
        text: "Want to connect your professional profiles? This is totally optional! 🔗",
        type: 'social',
        multi: false,
        options: [],
    },
    {
        key: 'contact_preference',
        type: 'choice',
        text: "Would you like me to send you progress updates and learning reminders? 📬",
        options: [
            { value: 'yes', label: '✅ Yes, keep me updated!' },
            { value: 'no',  label: '⏭️ Skip for now' },
        ],
    },
    {
        key: 'contact_details',
        type: 'contact',
        text: "Great! How should I reach you? (Both are optional) 📧",
        condition: 'contact_preference === yes',
    },
];

// ---------------------------------------------------------------------------
// Vaathiyaar reaction map
// ---------------------------------------------------------------------------
const REACTIONS = {
    // user_type
    user_type: {
        high_school_student: "Wonderful! 🏫 I love working with young minds. I'll make sure everything is super clear and fun — we'll build cool stuff together!",
        college_student: "Excellent! 🎓 A fellow academic! I'll connect everything to the CS concepts you're studying and prepare you for those exams and projects.",
        junior_developer: "Great to meet a fellow developer! 💻 I'll focus on practical, job-ready skills and real-world patterns that'll level up your career.",
        senior_developer: "A seasoned developer! 🚀 Respect! We'll skip the basics and dive straight into Python's advanced features and architectural patterns.",
        career_switcher: "What a brave step! 🔄 I'll guide you through a structured path from zero to job-ready. You've got this, and I'm here every step of the way!",
        hobbyist: "A curious mind! 🎮 The best kind of learner! We'll focus on fun projects and creative experiments — learning should be enjoyable!",
    },
    // social_profiles
    social_profiles: {
        done: "Perfect! Those profiles will help me understand your background even better. Let's keep going! 🔗",
    },
    // motivation
    career_switch:   "Bold move! Python is the #1 language for career changers. 💪",
    student:         "Excellent! Python is the perfect companion for students — you're starting at the right time. 📚",
    hobby:           "I love the enthusiasm! Learning for fun is the best motivation of all. 😄",
    ai_ml:           "Ah, the world of intelligent machines! Python is the mother tongue of AI. 🤖",
    work:            "Smart thinking! Python will make you indispensable at work. 🏢",
    data_science:    "Data is the new oil — and Python is the refinery. You're on the right track! 📊",
    // prior_experience
    none:            "Welcome to your first adventure in code! I'll make sure every step is crystal-clear. 🌱",
    some:            "A little knowledge goes a long way! We'll build on what you know. 📝",
    other_language:  "Another language under your belt? You'll pick up Python faster than you think! 🔄",
    python:          "Excellent! You already speak my language. We'll fast-track you to the good stuff. 🐍",
    // learning_style
    visual:          "A visual learner! You'll love the animations and diagrams I've prepared. 👁️",
    hands_on:        "Now we're talking! The best way to learn is to build. Let's get our hands dirty. 🔧",
    reading:         "A scholar at heart! I respect that. Theory plus practice — the perfect combo. 📖",
    projects:        "Project-driven learning is the most powerful approach. We'll ship real things together. 🚀",
    // goal
    web:             "Web dev with Python? Flask and FastAPI await you — the internet is your canvas! 🌐",
    automation:      "Automating the boring stuff — saving hours one script at a time. I admire that! ⚙️",
    games:           "Games with Python? Pygame has entered the chat! 🎮",
    unknown:         "No worries! Exploring is how the best discoveries are made. We'll find your path together. 🤷",
    // time_commitment
    '15min':         "15 minutes a day adds up fast! Small steps, big results. ⚡",
    '30min':         "30 minutes is the sweet spot — enough to make real progress every single day. 🔥",
    '1hour':         "One full hour? You're going to level up faster than you can imagine. 💪",
    weekends:        "Weekend warrior mode activated! Focused sessions beat scattered ones every time. 📅",
    // contact_preference
    yes:             "Awesome! I'll make sure you never miss a milestone. 📬",
    no:              "No worries! You can always opt in later from your profile. 👍",
};

// ---------------------------------------------------------------------------
// Helper: message factory
// ---------------------------------------------------------------------------
let msgId = 0;
function makeMsg(role, content, meta = {}) {
    return { id: ++msgId, role, content, ...meta };
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function VaathiyaarBubble({ text }) {
    return (
        <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.35 }}
            className="flex items-start gap-3 max-w-[85%]"
        >
            {/* Avatar */}
            <div className="flex-shrink-0 w-9 h-9 rounded-full bg-purple-100 border border-purple-200 flex items-center justify-center text-lg select-none mt-1">
                🧑‍🏫
            </div>
            {/* Bubble */}
            <div className="panel rounded-2xl rounded-tl-sm px-5 py-3 border-l-2 border-purple-500/60 text-slate-800 text-sm leading-relaxed">
                {text}
            </div>
        </motion.div>
    );
}

function UserBubble({ text }) {
    return (
        <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.35 }}
            className="flex justify-end"
        >
            <div className="max-w-[75%] panel rounded-2xl rounded-tr-sm px-5 py-3 border-r-2 border-cyan-500/60 text-slate-800 text-sm leading-relaxed">
                {text}
            </div>
        </motion.div>
    );
}

function OptionPills({ options, onSelect, disabled }) {
    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.15 }}
            className="flex flex-wrap gap-2 pl-12"
        >
            {options.map((opt) => (
                <button
                    key={opt.value}
                    onClick={() => onSelect(opt)}
                    disabled={disabled}
                    className="px-4 py-2 rounded-full text-sm font-medium border border-cyan-500/30 bg-cyan-500/10 text-cyan-700 hover:bg-cyan-500/25 hover:border-cyan-400/60 hover:text-cyan-900 transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                    {opt.label}
                </button>
            ))}
        </motion.div>
    );
}

function MultiOptionPills({ options, onSelect, disabled }) {
    const [selected, setSelected] = useState([]);

    const toggle = (opt) => {
        setSelected((prev) =>
            prev.find((s) => s.value === opt.value)
                ? prev.filter((s) => s.value !== opt.value)
                : [...prev, opt]
        );
    };

    const handleContinue = () => {
        if (selected.length === 0) return;
        const label = selected.map((s) => s.label).join(', ');
        const value = selected.length === 1 ? selected[0].value : selected.map((s) => s.value).join(',');
        onSelect({ value, label });
    };

    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.15 }}
            className="flex flex-col gap-3 pl-12"
        >
            <div className="flex flex-wrap gap-2">
                {options.map((opt) => {
                    const isSelected = selected.find((s) => s.value === opt.value);
                    return (
                        <button
                            key={opt.value}
                            onClick={() => toggle(opt)}
                            disabled={disabled}
                            className={`px-4 py-2 rounded-full text-sm font-medium border transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed ${
                                isSelected
                                    ? 'bg-cyan-500 text-white border-cyan-500'
                                    : 'border-cyan-500/30 bg-cyan-500/10 text-cyan-700 hover:bg-cyan-500/25 hover:border-cyan-400/60 hover:text-cyan-900'
                            }`}
                        >
                            {isSelected && <span className="mr-1">✓</span>}
                            {opt.label}
                        </button>
                    );
                })}
            </div>
            {selected.length > 0 && (
                <button
                    onClick={handleContinue}
                    disabled={disabled}
                    className="self-start px-5 py-2 rounded-full text-sm font-bold border border-cyan-500/40 bg-cyan-500/15 text-cyan-700 hover:bg-cyan-500/30 hover:border-cyan-400 hover:text-cyan-900 transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                    Continue →
                </button>
            )}
        </motion.div>
    );
}

function LangPickerBlock({ onSelect, disabled }) {
    const [selected, setSelected] = useState('en');

    const handleSelect = (code) => {
        setSelected(code);
    };

    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.15 }}
            className="flex flex-col gap-3 pl-12"
        >
            <LanguageSelector currentLanguage={selected} onSelect={handleSelect} />
            <button
                onClick={() => onSelect({ value: selected, label: selected.toUpperCase() })}
                disabled={disabled}
                className="self-start px-5 py-2 rounded-full text-sm font-bold border border-cyan-500/40 bg-cyan-500/15 text-cyan-700 hover:bg-cyan-500/30 hover:border-cyan-400 hover:text-cyan-900 transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed"
            >
                Confirm Language ✓
            </button>
        </motion.div>
    );
}

function ContactInputBlock({ onSelect, disabled }) {
    const [email, setEmail] = useState('');
    const [whatsapp, setWhatsapp] = useState('');
    const [error, setError] = useState('');

    const handleSubmit = () => {
        if (email && !email.includes('@')) {
            setError('Please enter a valid email address');
            return;
        }
        setError('');
        const parts = [];
        if (email) parts.push(email);
        if (whatsapp) parts.push(whatsapp);
        const label = parts.length > 0 ? parts.join(', ') : 'Skipped';
        onSelect({ value: JSON.stringify({ email, whatsapp }), label, email, whatsapp });
    };

    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.15 }}
            className="flex flex-col gap-3 pl-12"
        >
            <div className="flex flex-col gap-2 max-w-sm">
                <div className="flex items-center gap-2 panel rounded-xl px-4 py-2.5 border border-slate-200">
                    <span className="text-slate-400 text-sm">@</span>
                    <input
                        type="email"
                        value={email}
                        onChange={(e) => { setEmail(e.target.value); setError(''); }}
                        placeholder="Email address"
                        disabled={disabled}
                        className="flex-1 bg-transparent text-sm text-slate-800 placeholder-slate-400 outline-none disabled:opacity-50"
                    />
                </div>
                <div className="flex items-center gap-2 panel rounded-xl px-4 py-2.5 border border-slate-200">
                    <span className="text-slate-400 text-sm">📱</span>
                    <input
                        type="tel"
                        value={whatsapp}
                        onChange={(e) => setWhatsapp(e.target.value)}
                        placeholder="WhatsApp number"
                        disabled={disabled}
                        className="flex-1 bg-transparent text-sm text-slate-800 placeholder-slate-400 outline-none disabled:opacity-50"
                    />
                </div>
                {error && <p className="text-xs text-red-500">{error}</p>}
            </div>
            <button
                onClick={handleSubmit}
                disabled={disabled}
                className="self-start px-5 py-2 rounded-full text-sm font-bold border border-cyan-500/40 bg-cyan-500/15 text-cyan-700 hover:bg-cyan-500/30 hover:border-cyan-400 hover:text-cyan-900 transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed"
            >
                Continue →
            </button>
        </motion.div>
    );
}

function ProgressDots({ total, current }) {
    return (
        <div className="flex items-center justify-center gap-2">
            {Array.from({ length: total }).map((_, i) => (
                <div
                    key={i}
                    className={`rounded-full transition-all duration-300 ${
                        i < current
                            ? 'w-2 h-2 bg-cyan-400'
                            : i === current
                            ? 'w-4 h-2 bg-purple-400'
                            : 'w-2 h-2 bg-slate-200'
                    }`}
                />
            ))}
        </div>
    );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
export default function Onboarding() {
    useEffect(() => { document.title = 'Welcome — PyMasters'; }, []);

    const { user, updateUser } = useAuth();
    const navigate = useNavigate();
    const bottomRef = useRef(null);

    const username = user?.name || user?.username || '';
    const greeting = username
        ? `Vanakkam, ${username}! 🙏 I'm Vaathiyaar — your personal Python guide. Before we dive in, I'd love to get to know you a little. Ready?`
        : "Vanakkam! 🙏 I'm Vaathiyaar — your personal Python guide. Before we dive in, I'd love to get to know you a little. Ready?";

    const [messages, setMessages] = useState([
        makeMsg('vaathiyaar', greeting),
        makeMsg('vaathiyaar', QUESTIONS[0].text, { questionIndex: 0 }),
    ]);
    const [currentStep, setCurrentStep] = useState(0);
    const [answers, setAnswers] = useState({});
    const [busy, setBusy] = useState(false);
    const [done, setDone] = useState(false);

    // Auto-scroll to bottom whenever messages change
    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const addMsg = (msg) => setMessages((prev) => [...prev, msg]);

    const handleAnswer = async (option) => {
        if (busy || done) return;
        setBusy(true);

        const question = QUESTIONS[currentStep];
        const newAnswers = { ...answers, [question.key]: option.value };

        // For contact_details, also store email/whatsapp at top level
        if (question.key === 'contact_details') {
            newAnswers.email = option.email || '';
            newAnswers.whatsapp = option.whatsapp || '';
        }

        setAnswers(newAnswers);

        // User message
        addMsg(makeMsg('user', option.label));

        // Reaction from Vaathiyaar (skip for contact type)
        if (question.type !== 'contact') {
            // Check for nested reactions first (e.g. REACTIONS.user_type.high_school_student)
            const nestedReaction = REACTIONS[question.key]?.[option.value];
            const reaction = nestedReaction || REACTIONS[option.value] || "Noted! Let's keep going. 😊";
            await delay(400);
            addMsg(makeMsg('vaathiyaar', reaction));
        }

        // Determine next step, skipping conditional questions that don't apply
        let nextStep = currentStep + 1;
        while (nextStep < QUESTIONS.length) {
            const nextQ = QUESTIONS[nextStep];
            if (nextQ.condition) {
                // Parse condition like 'contact_preference === yes'
                const [condKey, condVal] = nextQ.condition.split('===').map(s => s.trim());
                if (newAnswers[condKey] !== condVal) {
                    nextStep++;
                    continue;
                }
            }
            break;
        }

        if (nextStep < QUESTIONS.length) {
            // Next question after a short pause
            await delay(800);
            addMsg(makeMsg('vaathiyaar', QUESTIONS[nextStep].text, { questionIndex: nextStep }));
            setCurrentStep(nextStep);
            setBusy(false);
        } else {
            // All answered — submit
            await delay(800);
            try {
                await api.post('/profile/onboarding', {
                    user_id: user?.id,
                    ...newAnswers,
                    linkedin_url: newAnswers.linkedin_url || undefined,
                    github_url: newAnswers.github_url || undefined,
                });
            } catch (err) {
                console.error('Onboarding submit failed:', err);
            }

            // Mark onboarding complete in local user state
            updateUser({ onboarding_completed: true, preferred_language: newAnswers.preferred_language || 'en' });

            // Fetch path recommendation
            let recommendedPath = null;
            try {
                const recRes = await api.get(`/paths/recommend?user_id=${user?.id}`);
                recommendedPath = recRes.data;
            } catch (e) {
                console.log('Path recommendation not available:', e);
            }

            if (recommendedPath && recommendedPath.id) {
                addMsg(makeMsg('vaathiyaar', username
                    ? `${username}, based on everything you told me, I've found the perfect learning path for you! 🎯`
                    : "Based on everything you told me, I've found the perfect learning path for you! 🎯"
                ));
                await delay(600);
                const lessons = recommendedPath.lesson_sequence
                    ? JSON.parse(recommendedPath.lesson_sequence).length
                    : '?';
                addMsg(makeMsg('vaathiyaar',
                    `**${recommendedPath.name}**\n\n${recommendedPath.description || ''}\n\n` +
                    `📚 ${lessons} lessons · ⏱️ ~${recommendedPath.estimated_hours || '?'} hours · ` +
                    `${recommendedPath.difficulty_start} → ${recommendedPath.difficulty_end}`,
                    { isPathRecommendation: true, pathId: recommendedPath.id }
                ));
                setDone(true);
                setBusy(false);
            } else {
                addMsg(makeMsg('vaathiyaar', username
                    ? `${username}, you're all set! Let's begin your Python journey! 🚀`
                    : "You're all set! Let's begin your Python journey! 🚀"
                ));
                setDone(true);
                setBusy(false);
                await delay(1500);
                navigate('/dashboard/classroom');
            }
        }
    };

    // Determine which question block is currently active (last one added)
    const activeQuestionIndex = currentStep;

    return (
        <div
            className="min-h-screen flex flex-col"
            style={{ background: 'var(--bg-deep)' }}
        >
            {/* Header */}
            <header className="flex-shrink-0 px-6 py-4 flex items-center gap-3 border-b border-slate-200">
                <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-purple-600 to-cyan-500 flex items-center justify-center shadow-md shadow-purple-500/20 border border-white/10">
                    <img src={PymastersIcon} alt="PyMasters" className="w-5 h-5" style={{ filter: 'brightness(2)' }} />
                </div>
                <div>
                    <p className="text-xs font-bold uppercase tracking-widest text-purple-600">PyMasters</p>
                    <p className="text-[11px] text-slate-500">Onboarding with Vaathiyaar</p>
                </div>
            </header>

            {/* Message feed */}
            <div className="flex-1 overflow-y-auto px-4 sm:px-8 py-6 space-y-4 max-w-2xl w-full mx-auto">
                <AnimatePresence initial={false}>
                    {messages.map((msg) => {
                        if (msg.role === 'vaathiyaar') {
                            return (
                                <div key={msg.id} className="space-y-3">
                                    <VaathiyaarBubble text={msg.content} />

                                    {/* Path recommendation action buttons */}
                                    {done && msg.isPathRecommendation && (
                                        <motion.div
                                            initial={{ opacity: 0, y: 10 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            transition={{ duration: 0.3, delay: 0.3 }}
                                            className="flex flex-wrap gap-2 pl-12"
                                        >
                                            <button
                                                onClick={async () => {
                                                    try {
                                                        await api.post(`/paths/${msg.pathId}/start`, { user_id: user?.id });
                                                    } catch (e) { console.log('Path start:', e); }
                                                    navigate(`/dashboard/paths/${msg.pathId}`);
                                                }}
                                                className="px-5 py-2.5 rounded-full text-sm font-bold border border-cyan-500/40 bg-cyan-500 text-white hover:bg-cyan-600 transition-all duration-200 shadow-lg shadow-cyan-500/20"
                                            >
                                                🚀 Start This Path
                                            </button>
                                            <button
                                                onClick={() => navigate('/dashboard/paths')}
                                                className="px-5 py-2.5 rounded-full text-sm font-bold border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 transition-all duration-200"
                                            >
                                                Browse All Paths
                                            </button>
                                            <button
                                                onClick={() => navigate('/dashboard/classroom')}
                                                className="px-5 py-2.5 rounded-full text-sm font-medium border border-transparent text-slate-500 hover:text-slate-700 transition-all duration-200"
                                            >
                                                Skip for now →
                                            </button>
                                        </motion.div>
                                    )}

                                    {/* Render interactive widget only for the currently active question */}
                                    {!done && msg.questionIndex === activeQuestionIndex && (
                                        <>
                                            {QUESTIONS[msg.questionIndex].type === 'language' ? (
                                                <LangPickerBlock onSelect={handleAnswer} disabled={busy} />
                                            ) : QUESTIONS[msg.questionIndex].type === 'contact' ? (
                                                <ContactInputBlock onSelect={handleAnswer} disabled={busy} />
                                            ) : QUESTIONS[msg.questionIndex].type === 'social' ? (
                                                <motion.div
                                                    initial={{ opacity: 0, y: 10 }}
                                                    animate={{ opacity: 1, y: 0 }}
                                                    transition={{ duration: 0.3, delay: 0.15 }}
                                                    className="pl-12"
                                                >
                                                    <div className="space-y-3">
                                                        <div className="relative">
                                                            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-blue-500">
                                                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M19 3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14m-.5 15.5v-5.3a3.26 3.26 0 0 0-3.26-3.26c-.85 0-1.84.52-2.32 1.3v-1.11h-2.79v8.37h2.79v-4.93c0-.77.62-1.4 1.39-1.4a1.4 1.4 0 0 1 1.4 1.4v4.93h2.79M6.88 8.56a1.68 1.68 0 0 0 1.68-1.68c0-.93-.75-1.69-1.68-1.69a1.69 1.69 0 0 0-1.69 1.69c0 .93.76 1.68 1.69 1.68m1.39 9.94v-8.37H5.5v8.37h2.77z"/></svg>
                                                            </div>
                                                            <input
                                                                type="url"
                                                                placeholder="LinkedIn URL (optional)"
                                                                className="w-full pl-10 pr-4 py-3 rounded-xl bg-white/80 border border-black/10 text-sm focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition-all"
                                                                value={answers.linkedin_url || ''}
                                                                onChange={e => setAnswers(a => ({...a, linkedin_url: e.target.value}))}
                                                            />
                                                        </div>
                                                        <div className="relative">
                                                            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-700">
                                                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/></svg>
                                                            </div>
                                                            <input
                                                                type="url"
                                                                placeholder="GitHub URL (optional)"
                                                                className="w-full pl-10 pr-4 py-3 rounded-xl bg-white/80 border border-black/10 text-sm focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition-all"
                                                                value={answers.github_url || ''}
                                                                onChange={e => setAnswers(a => ({...a, github_url: e.target.value}))}
                                                            />
                                                        </div>
                                                        <button
                                                            onClick={() => handleAnswer({ value: 'done', label: (answers.linkedin_url || answers.github_url) ? 'Profiles added' : 'Skipped' })}
                                                            className="w-full mt-2 py-3 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-bold text-sm hover:scale-[1.02] transition-transform"
                                                        >
                                                            {(answers.linkedin_url || answers.github_url) ? 'Save & Continue ✓' : 'Skip for Now →'}
                                                        </button>
                                                    </div>
                                                </motion.div>
                                            ) : QUESTIONS[msg.questionIndex].multi ? (
                                                <MultiOptionPills
                                                    options={QUESTIONS[msg.questionIndex].options}
                                                    onSelect={handleAnswer}
                                                    disabled={busy}
                                                />
                                            ) : (
                                                <OptionPills
                                                    options={QUESTIONS[msg.questionIndex].options}
                                                    onSelect={handleAnswer}
                                                    disabled={busy}
                                                />
                                            )}
                                        </>
                                    )}
                                </div>
                            );
                        }
                        return <UserBubble key={msg.id} text={msg.content} />;
                    })}
                </AnimatePresence>
                <div ref={bottomRef} />
            </div>

            {/* Footer — progress + dots */}
            <footer className="flex-shrink-0 px-4 py-5 border-t border-slate-200 flex flex-col items-center gap-3">
                <ProgressDots total={QUESTIONS.length} current={done ? QUESTIONS.length : currentStep} />
                <p className="text-[11px] text-slate-600">
                    {done ? 'All done!' : `Question ${currentStep + 1} of ${QUESTIONS.length}`}
                </p>
            </footer>
        </div>
    );
}

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------
function delay(ms) {
    return new Promise((res) => setTimeout(res, ms));
}
