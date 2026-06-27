import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuth } from '../context/AuthContext';
import api from '../api';
import PymastersGlyph from '../assets/pymasters-glyph.svg';
import {
    Globe, Sparkles, Target, Code2, Clock, Eye, Check, Loader2, ArrowRight,
    Briefcase, Brain, GraduationCap, Hammer, Compass,
} from 'lucide-react';
import clsx from 'clsx';

// Single-screen card questionnaire: the learner picks every answer at once,
// then submits — no multi-click step flow. Captures everything the
// personalization engine needs (language, experience, goal+motivation,
// known languages, time, learning style).
const QUESTIONS = [
    {
        key: 'preferred_language', icon: Globe, title: 'Language', required: true,
        options: [
            { value: 'en', label: 'English' },
            { value: 'ta', label: 'தமிழ் — Tamil' },
        ],
    },
    {
        key: 'prior_experience', icon: Sparkles, title: 'Coding experience', required: true,
        options: [
            { value: 'beginner', label: 'Brand new' },
            { value: 'intermediate', label: "I've dabbled" },
            { value: 'advanced', label: 'I code already' },
        ],
    },
    {
        key: 'goal', icon: Target, title: 'Main goal', required: true,
        options: [
            { value: 'job', label: 'Land a job', icon: Briefcase, motivation: 'career' },
            { value: 'ai_ml', label: 'AI & ML skills', icon: Brain, motivation: 'ai' },
            { value: 'fundamentals', label: 'Python fundamentals', icon: GraduationCap, motivation: 'curiosity' },
            { value: 'projects', label: 'Build projects', icon: Hammer, motivation: 'build' },
            { value: 'exploring', label: 'Just exploring', icon: Compass, motivation: 'hobby' },
        ],
    },
    {
        key: 'known_languages', icon: Code2, title: 'Languages you already know', multi: true,
        options: ['None', 'Python', 'JavaScript', 'Java', 'C/C++', 'Other'].map((v) => ({ value: v, label: v === 'C/C++' ? 'C / C++' : v })),
    },
    {
        key: 'time_commitment', icon: Clock, title: 'Time per week', required: true,
        options: [
            { value: 'casual', label: 'Casual · 1–2 hrs' },
            { value: 'regular', label: 'Regular · 3–5 hrs' },
            { value: 'intense', label: 'Intense · 6+ hrs' },
        ],
    },
    {
        key: 'learning_style', icon: Eye, title: 'How you learn best', required: true,
        options: [
            { value: 'visual', label: 'Visual & animations' },
            { value: 'hands_on', label: 'Hands-on coding' },
            { value: 'reading', label: 'Read & reference' },
        ],
    },
];

const REQUIRED = QUESTIONS.filter((q) => q.required).map((q) => q.key);

export default function Onboarding() {
    const { user, updateUser } = useAuth();
    const navigate = useNavigate();
    const [answers, setAnswers] = useState({ known_languages: [] });
    const [submitting, setSubmitting] = useState(false);
    const [showHint, setShowHint] = useState(false);

    const pick = (key, value) => setAnswers((a) => ({ ...a, [key]: value }));
    const toggle = (key, value) => setAnswers((a) => {
        const cur = a[key] || [];
        let next;
        if (value === 'None') next = cur.includes('None') ? [] : ['None'];
        else next = cur.includes(value) ? cur.filter((v) => v !== value) : [...cur.filter((v) => v !== 'None'), value];
        return { ...a, [key]: next };
    });

    const complete = REQUIRED.every((k) => answers[k]);

    const submit = async (skip = false) => {
        if (!skip && !complete) { setShowHint(true); return; }
        setSubmitting(true);
        const motivation = QUESTIONS[2].options.find((o) => o.value === answers.goal)?.motivation || 'curiosity';
        const payload = {
            user_id: user?.id,
            preferred_language: answers.preferred_language || 'en',
            prior_experience: answers.prior_experience || 'beginner',
            goal: answers.goal || 'fundamentals',
            motivation,
            known_languages: answers.known_languages?.length ? answers.known_languages : ['None'],
            time_commitment: answers.time_commitment || 'regular',
            learning_style: answers.learning_style || 'visual',
            user_type: 'individual',
        };
        try { await api.post('/profile/onboarding', payload); }
        catch (e) { console.error('Onboarding save failed', e); }
        updateUser({ onboarding_completed: true, preferred_language: payload.preferred_language });
        navigate('/dashboard');
    };

    return (
        <div className="min-h-screen bg-[#020617] text-white relative overflow-hidden">
            <div className="absolute inset-0 z-0 pointer-events-none">
                <div className="absolute top-[-20%] right-[-10%] w-[600px] h-[600px] bg-purple-700/15 rounded-full blur-[140px]" />
                <div className="absolute bottom-[-20%] left-[-10%] w-[500px] h-[500px] bg-cyan-600/10 rounded-full blur-[120px]" />
            </div>

            <header className="relative z-10 flex items-center justify-between px-6 py-5 max-w-3xl mx-auto">
                <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-purple-600 to-cyan-500 flex items-center justify-center">
                        <img src={PymastersGlyph} alt="PyMasters" className="w-5 h-5" />
                    </div>
                    <p className="font-bold font-display text-sm tracking-wide">PYMASTERS</p>
                </div>
                <button onClick={() => submit(true)} className="text-sm text-slate-500 hover:text-slate-300 transition-colors">Skip for now →</button>
            </header>

            <div className="relative z-10 max-w-2xl mx-auto px-6 pb-32 pt-2">
                <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
                    <h1 className="text-3xl font-bold font-display mb-1">Let's personalize your learning</h1>
                    <p className="text-slate-400 text-sm mb-8">Pick your answers below — it takes about 30 seconds. Vaathiyaar uses these to tailor your path.</p>
                </motion.div>

                <div className="space-y-5">
                    {QUESTIONS.map((q, qi) => {
                        const Icon = q.icon;
                        const val = answers[q.key];
                        const missing = showHint && q.required && !val;
                        return (
                            <motion.div key={q.key}
                                initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, delay: qi * 0.05 }}
                                className={clsx('rounded-2xl border bg-white/[0.03] p-5 transition-colors',
                                    missing ? 'border-red-500/40' : 'border-white/[0.07]')}>
                                <div className="flex items-center gap-2.5 mb-3.5">
                                    <div className="w-8 h-8 rounded-lg bg-white/[0.05] border border-white/[0.08] flex items-center justify-center">
                                        <Icon size={16} className="text-cyan-400" />
                                    </div>
                                    <h2 className="font-semibold text-sm">{q.title}</h2>
                                    {q.multi && <span className="text-[11px] text-slate-500">(select any)</span>}
                                    {missing && <span className="text-[11px] text-red-400 ml-auto">Please pick one</span>}
                                </div>
                                <div className="flex flex-wrap gap-2">
                                    {q.options.map((opt) => {
                                        const OptIcon = opt.icon;
                                        const selected = q.multi ? (val || []).includes(opt.value) : val === opt.value;
                                        return (
                                            <button key={opt.value}
                                                onClick={() => q.multi ? toggle(q.key, opt.value) : pick(q.key, opt.value)}
                                                className={clsx(
                                                    'px-4 py-2.5 rounded-xl border text-sm font-medium transition-all duration-150 flex items-center gap-2',
                                                    selected
                                                        ? 'border-cyan-500/60 bg-cyan-500/15 text-white'
                                                        : 'border-white/[0.08] bg-white/[0.02] text-slate-300 hover:border-white/[0.2] hover:bg-white/[0.05]'
                                                )}>
                                                {OptIcon && <OptIcon size={15} className={selected ? 'text-cyan-300' : 'text-slate-400'} />}
                                                {opt.label}
                                                {selected && <Check size={14} className="text-cyan-300" />}
                                            </button>
                                        );
                                    })}
                                </div>
                            </motion.div>
                        );
                    })}
                </div>
            </div>

            {/* sticky submit */}
            <div className="fixed bottom-0 inset-x-0 z-20 bg-gradient-to-t from-[#020617] via-[#020617]/95 to-transparent pt-8 pb-5">
                <div className="max-w-2xl mx-auto px-6">
                    <button onClick={() => submit(false)} disabled={submitting}
                        className="w-full py-3.5 rounded-xl font-bold text-sm text-white bg-gradient-to-r from-purple-600 to-cyan-500 hover:scale-[1.005] transition-transform flex items-center justify-center gap-2 shadow-lg shadow-purple-900/30 disabled:opacity-70">
                        {submitting ? <><Loader2 size={16} className="animate-spin" /> Setting up your plan…</>
                                    : <>Start learning <ArrowRight size={16} /></>}
                    </button>
                    {showHint && !complete && <p className="text-center text-xs text-red-400 mt-2">Pick an answer for each highlighted question above.</p>}
                </div>
            </div>
        </div>
    );
}
