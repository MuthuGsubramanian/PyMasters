import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    X,
    Sparkles,
    Bot,
    Code2,
    BrainCircuit,
    Swords,
    CreditCard,
    Route,
    Rocket,
    ChevronRight,
} from 'lucide-react';

const RELEASE_NOTES = [
    {
        version: '1.0.0',
        date: '2026-03-29',
        title: 'Welcome to PyMasters',
        subtitle: 'Your AI-powered Python learning platform is here.',
        features: [
            {
                icon: Bot,
                title: 'AI Agents Track',
                description:
                    'Learn to build AI agents with PydanticAI, LangGraph, CrewAI, and MCP.',
                color: 'from-violet-500 to-purple-600',
            },
            {
                icon: Code2,
                title: 'Python 3.14 Track',
                description:
                    'Master t-strings, free-threading, subinterpreters, and modern tooling (uv, Ruff).',
                color: 'from-cyan-500 to-blue-600',
            },
            {
                icon: BrainCircuit,
                title: 'AI Engineering Track',
                description:
                    'Structured outputs, Polars, LLM APIs, evaluation-driven development.',
                color: 'from-amber-500 to-orange-600',
            },
            {
                icon: Swords,
                title: 'Weekly Code Challenges',
                description:
                    'Test your skills with fresh challenges every week.',
                color: 'from-rose-500 to-pink-600',
            },
            {
                icon: CreditCard,
                title: 'Quick Reference Cards',
                description:
                    'Instant access to Python and AI cheat sheets.',
                color: 'from-emerald-500 to-teal-600',
            },
            {
                icon: Route,
                title: 'Enhanced Learning Paths',
                description:
                    '15 curated paths with adaptive learning.',
                color: 'from-blue-500 to-indigo-600',
            },
        ],
    },
];

const STORAGE_KEY = 'pm_release_seen';
const CURRENT_VERSION = RELEASE_NOTES[0].version;

export default function ReleaseNotes() {
    const [visible, setVisible] = useState(false);

    useEffect(() => {
        const seen = localStorage.getItem(STORAGE_KEY);
        if (seen !== CURRENT_VERSION) {
            // Small delay so the main UI renders first
            const timer = setTimeout(() => setVisible(true), 600);
            return () => clearTimeout(timer);
        }
    }, []);

    const dismiss = () => {
        setVisible(false);
        localStorage.setItem(STORAGE_KEY, CURRENT_VERSION);
    };

    const release = RELEASE_NOTES[0];

    return (
        <AnimatePresence>
            {visible && (
                /* Backdrop */
                <motion.div
                    key="release-backdrop"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.25 }}
                    className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
                    onClick={dismiss}
                >
                    {/* Modal */}
                    <motion.div
                        key="release-modal"
                        initial={{ opacity: 0, scale: 0.92, y: 24 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.92, y: 24 }}
                        transition={{ type: 'spring', stiffness: 380, damping: 28 }}
                        onClick={(e) => e.stopPropagation()}
                        className="relative w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl shadow-2xl
                                   bg-bg-surface border border-border-default"
                    >
                        {/* Gradient header */}
                        <div className="relative overflow-hidden rounded-t-2xl bg-gradient-to-br from-purple-600 via-cyan-600 to-blue-600 px-6 pt-6 pb-8">
                            {/* Decorative circles */}
                            <div className="absolute -top-10 -right-10 w-40 h-40 rounded-full bg-white/10 blur-2xl" />
                            <div className="absolute -bottom-8 -left-8 w-32 h-32 rounded-full bg-white/10 blur-2xl" />

                            {/* Close button */}
                            <button
                                onClick={dismiss}
                                className="absolute top-4 right-4 p-1.5 rounded-full bg-white/20 hover:bg-white/30 text-white transition-colors"
                                aria-label="Close release notes"
                            >
                                <X size={16} />
                            </button>

                            {/* Badge */}
                            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/20 text-white text-xs font-bold tracking-wide mb-3">
                                <Sparkles size={12} />
                                What&apos;s New
                            </div>

                            {/* Title */}
                            <h2 className="text-2xl font-display font-bold text-white leading-tight">
                                {release.title}
                            </h2>
                            <p className="mt-1 text-sm text-white/80">
                                {release.subtitle}
                            </p>

                            {/* Version pill */}
                            <div className="mt-3 inline-flex items-center gap-1.5 text-[11px] font-mono font-bold text-white/90 bg-white/15 rounded-full px-3 py-1">
                                <Rocket size={11} />
                                v{release.version} &middot; {release.date}
                            </div>
                        </div>

                        {/* Feature list */}
                        <div className="px-6 py-5 space-y-3">
                            {release.features.map((feat, i) => (
                                <motion.div
                                    key={feat.title}
                                    initial={{ opacity: 0, x: -12 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    transition={{ delay: 0.15 + i * 0.07 }}
                                    className="flex items-start gap-3 p-3 rounded-xl
                                               bg-bg-elevated
                                               border border-border-default
                                               hover:shadow-md transition-shadow"
                                >
                                    <div
                                        className={`shrink-0 w-9 h-9 rounded-lg bg-gradient-to-br ${feat.color} flex items-center justify-center shadow-sm`}
                                    >
                                        <feat.icon size={17} className="text-white" />
                                    </div>
                                    <div className="min-w-0">
                                        <div className="text-sm font-semibold text-text-primary leading-tight">
                                            {feat.title}
                                        </div>
                                        <div className="text-xs text-text-muted mt-0.5 leading-relaxed">
                                            {feat.description}
                                        </div>
                                    </div>
                                </motion.div>
                            ))}
                        </div>

                        {/* Footer / CTA */}
                        <div className="px-6 pb-5">
                            <button
                                onClick={dismiss}
                                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl
                                           bg-gradient-to-r from-purple-600 to-cyan-600
                                           hover:from-purple-500 hover:to-cyan-500
                                           text-white text-sm font-bold tracking-wide
                                           shadow-lg shadow-purple-500/20 hover:shadow-purple-500/30
                                           transition-all duration-300"
                            >
                                Get Started <ChevronRight size={16} />
                            </button>
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
