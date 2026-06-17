import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Brain, RotateCcw, ChevronRight } from 'lucide-react';
import { getDueReviews } from '../api';

/**
 * Spaced-repetition review card. Surfaces lessons whose estimated recall has
 * decayed (from /api/review/due) so learners reinforce before forgetting.
 * Reviewing reuses the normal Classroom flow — the "Review" button deep-links
 * to the lesson via ?lesson=<topic>. Renders nothing until there's something due.
 */
export default function ReviewQueue({ userId }) {
    const [due, setDue] = useState([]);
    const [totalDue, setTotalDue] = useState(0);
    const [loaded, setLoaded] = useState(false);
    const navigate = useNavigate();

    useEffect(() => {
        if (!userId) return;
        let cancelled = false;
        getDueReviews(userId)
            .then((r) => {
                if (cancelled) return;
                setDue(r.data?.due || []);
                setTotalDue(r.data?.total_due || 0);
            })
            .catch(() => {})
            .finally(() => !cancelled && setLoaded(true));
        return () => { cancelled = true; };
    }, [userId]);

    // Stay out of the way until there's actually something to review.
    if (!loaded || totalDue === 0) return null;

    return (
        <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-2xl border border-amber-300/40 bg-gradient-to-br from-amber-50/60 to-orange-50/40 backdrop-blur-sm overflow-hidden"
        >
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-amber-200/50">
                <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-amber-100 text-amber-600 flex items-center justify-center">
                        <Brain size={18} />
                    </div>
                    <div>
                        <h3 className="font-bold text-sm text-text-primary">Due for Review</h3>
                        <p className="text-[11px] text-text-muted">Reinforce these before you forget them</p>
                    </div>
                </div>
                <span className="text-xs font-bold text-amber-600 bg-amber-100 rounded-full px-2.5 py-1">{totalDue}</span>
            </div>

            <div className="p-3 space-y-1.5">
                {due.slice(0, 4).map((item) => (
                    <button
                        key={item.topic}
                        onClick={() => navigate(`/dashboard/classroom?lesson=${encodeURIComponent(item.topic)}`)}
                        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-amber-100/50 transition-colors text-left group"
                    >
                        <div className="flex-1 min-w-0">
                            <div className="text-sm font-semibold text-text-primary truncate">{item.title}</div>
                            <div className="flex items-center gap-2 mt-0.5">
                                {item.track && (
                                    <span className="text-[10px] uppercase tracking-wider text-text-muted">{String(item.track).replace(/_/g, ' ')}</span>
                                )}
                                <span className="text-[10px] text-amber-600 font-medium">
                                    memory {Math.round((item.recall ?? 0) * 100)}% · {item.days_since}d ago
                                </span>
                            </div>
                            {/* memory strength bar */}
                            <div className="mt-1.5 h-1 rounded-full bg-amber-200/60 overflow-hidden">
                                <div className="h-full rounded-full bg-gradient-to-r from-amber-400 to-orange-500"
                                    style={{ width: `${Math.max(4, Math.round((item.recall ?? 0) * 100))}%` }} />
                            </div>
                        </div>
                        <span className="flex items-center gap-1 text-xs font-bold text-amber-600 shrink-0">
                            <RotateCcw size={13} /> Review
                            <ChevronRight size={13} className="group-hover:translate-x-0.5 transition-transform" />
                        </span>
                    </button>
                ))}
                {totalDue > 4 && (
                    <button
                        onClick={() => navigate('/dashboard/classroom')}
                        className="w-full text-center text-xs font-semibold text-amber-600 hover:text-amber-700 py-1.5"
                    >
                        +{totalDue - 4} more to review →
                    </button>
                )}
            </div>
        </motion.div>
    );
}
