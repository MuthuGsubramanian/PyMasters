import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Radar, ChevronRight } from 'lucide-react';
import { getMisconceptions } from '../api';

/**
 * Misconception radar (2026-11-02): the Python errors this learner keeps hitting in the
 * Playground and lesson code, each with a one-line habit to fix it and a lesson to practise.
 * Renders nothing until there are at least two recorded errors.
 */
export default function MisconceptionRadar() {
    const navigate = useNavigate();
    const [data, setData] = useState(null);

    useEffect(() => {
        let cancelled = false;
        getMisconceptions().then((r) => !cancelled && setData(r.data)).catch(() => {});
        return () => { cancelled = true; };
    }, []);

    if (!data || data.total < 2 || !data.items?.length) return null;
    const top = data.items.slice(0, 3);
    const max = top[0].count;

    return (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
            className="rounded-2xl border border-rose-300/40 bg-gradient-to-br from-rose-50/60 to-amber-50/40 overflow-hidden">
            <div className="flex items-center gap-2.5 px-5 py-3.5 border-b border-rose-200/50">
                <div className="w-8 h-8 rounded-lg bg-rose-100 text-rose-600 flex items-center justify-center"><Radar size={18} /></div>
                <div>
                    <h3 className="font-bold text-sm text-text-primary">Watch out for</h3>
                    <p className="text-xs text-text-muted">The errors you've hit most in the last {data.window_days} days</p>
                </div>
            </div>
            <div className="p-3 space-y-1.5">
                {top.map((it) => (
                    <div key={it.type} className="rounded-xl px-3 py-2.5 hover:bg-rose-100/40">
                        <div className="flex items-center justify-between gap-3">
                            <div className="min-w-0">
                                <span className="text-sm font-semibold text-text-primary">{it.label}</span>
                                <span className="ml-2 font-mono text-xs text-rose-600">{it.type} ×{it.count}</span>
                            </div>
                            {it.lesson && (
                                <button onClick={() => navigate(`/dashboard/classroom?lesson=${encodeURIComponent(it.lesson)}`)}
                                    className="flex shrink-0 items-center gap-0.5 text-xs font-bold text-rose-600 hover:text-rose-800">
                                    Practise <ChevronRight size={13} />
                                </button>
                            )}
                        </div>
                        <div className="mt-1.5 h-1 rounded-full bg-rose-200/60 overflow-hidden">
                            <div className="h-full rounded-full bg-gradient-to-r from-rose-400 to-amber-500" style={{ width: `${Math.round((it.count / max) * 100)}%` }} />
                        </div>
                        <p className="mt-1.5 text-xs text-text-secondary">{it.tip}</p>
                    </div>
                ))}
            </div>
        </motion.div>
    );
}
