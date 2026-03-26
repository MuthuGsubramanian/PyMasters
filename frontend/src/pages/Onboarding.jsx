import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import api from '../api';
import { useAuth } from '../context/AuthContext';
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
];

// ---------------------------------------------------------------------------
// Vaathiyaar reaction map
// ---------------------------------------------------------------------------
const REACTIONS = {
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
            <div className="flex-shrink-0 w-9 h-9 rounded-full bg-purple-600/30 border border-purple-500/40 flex items-center justify-center text-lg select-none mt-1">
                🧑‍🏫
            </div>
            {/* Bubble */}
            <div className="panel rounded-2xl rounded-tl-sm px-5 py-3 border-l-2 border-purple-500/60 text-slate-200 text-sm leading-relaxed">
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
            <div className="max-w-[75%] panel rounded-2xl rounded-tr-sm px-5 py-3 border-r-2 border-cyan-500/60 text-slate-200 text-sm leading-relaxed">
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
                    className="px-4 py-2 rounded-full text-sm font-medium border border-cyan-500/30 bg-cyan-500/10 text-cyan-300 hover:bg-cyan-500/25 hover:border-cyan-400/60 hover:text-white transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                    {opt.label}
                </button>
            ))}
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
                className="self-start px-5 py-2 rounded-full text-sm font-bold border border-cyan-500/40 bg-cyan-500/15 text-cyan-300 hover:bg-cyan-500/30 hover:border-cyan-400 hover:text-white transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed"
            >
                Confirm Language ✓
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
                            : 'w-2 h-2 bg-white/10'
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
    const { user, updateUser } = useAuth();
    const navigate = useNavigate();
    const bottomRef = useRef(null);

    const [messages, setMessages] = useState([
        makeMsg('vaathiyaar', "Vanakkam! 🙏 I'm Vaathiyaar — your personal Python guide. Before we dive in, I'd love to get to know you a little. Ready?"),
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
        setAnswers(newAnswers);

        // User message
        addMsg(makeMsg('user', option.label));

        // Reaction from Vaathiyaar
        const reaction = REACTIONS[option.value] || "Noted! Let's keep going. 😊";
        await delay(400);
        addMsg(makeMsg('vaathiyaar', reaction));

        const nextStep = currentStep + 1;

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
                });
            } catch (err) {
                console.error('Onboarding submit failed:', err);
            }

            addMsg(makeMsg('vaathiyaar', "Let's begin your Python journey! 🚀"));
            setDone(true);
            setBusy(false);

            // Mark onboarding complete in local user state
            updateUser({ onboarding_completed: true, preferred_language: newAnswers.preferred_language || 'en' });

            await delay(1500);
            navigate('/dashboard/classroom');
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
            <header className="flex-shrink-0 px-6 py-4 flex items-center gap-3 border-b border-white/5">
                <div className="w-8 h-8 rounded-lg bg-purple-600/30 border border-purple-500/40 flex items-center justify-center text-base select-none">
                    🧑‍🏫
                </div>
                <div>
                    <p className="text-xs font-bold uppercase tracking-widest text-purple-400">Vaathiyaar</p>
                    <p className="text-[11px] text-slate-500">Your personal Python guide</p>
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

                                    {/* Render interactive widget only for the currently active question */}
                                    {!done && msg.questionIndex === activeQuestionIndex && (
                                        <>
                                            {QUESTIONS[msg.questionIndex].type === 'language' ? (
                                                <LangPickerBlock onSelect={handleAnswer} disabled={busy} />
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
            <footer className="flex-shrink-0 px-4 py-5 border-t border-white/5 flex flex-col items-center gap-3">
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
