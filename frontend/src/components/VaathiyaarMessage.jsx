import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, Play, Plus, X } from 'lucide-react';
import api from '../api';

export default function VaathiyaarMessage() {
    const { user } = useAuth();
    const [message, setMessage] = useState(null);
    const [dismissed, setDismissed] = useState(false);

    useEffect(() => {
        if (!user?.id) return;
        api.get(`/messages/pending/${user.id}`)
            .then((r) => {
                const msgs = r.data?.messages || r.data;
                if (Array.isArray(msgs) && msgs.length > 0) {
                    setMessage(msgs[0]);
                } else if (r.data?.id) {
                    setMessage(r.data);
                }
            })
            .catch(() => {});
    }, [user]);

    const handleAction = async (action) => {
        if (!message?.id) return;
        try {
            await api.post(`/messages/${message.id}/action`, {
                user_id: user?.id,
                action,
            });
        } catch {}
        setDismissed(true);
    };

    const handleDismiss = async () => {
        if (!message?.id) return;
        try {
            await api.post(`/messages/${message.id}/dismiss`, {
                user_id: user?.id,
            });
        } catch {}
        setDismissed(true);
    };

    return (
        <AnimatePresence>
            {message && !dismissed && (
                <motion.div
                    initial={{ opacity: 0, y: -20, height: 0 }}
                    animate={{ opacity: 1, y: 0, height: 'auto' }}
                    exit={{ opacity: 0, y: -20, height: 0 }}
                    transition={{ duration: 0.4, ease: 'easeOut' }}
                    className="mb-6"
                >
                    <div className="rounded-2xl overflow-hidden border border-purple-200 bg-gradient-to-r from-purple-50 via-white to-cyan-50 shadow-sm">
                        <div className="h-1 bg-gradient-to-r from-purple-400 via-cyan-400 to-blue-500" />
                        <div className="p-5 flex items-start gap-4">
                            <div className="flex-shrink-0 w-11 h-11 rounded-xl bg-gradient-to-br from-purple-500 to-cyan-500 flex items-center justify-center text-lg select-none shadow-md shadow-purple-300/20">
                                {'🧑‍🏫'}
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1">
                                    <span className="text-sm font-bold text-slate-800">Vaathiyaar</span>
                                    <Sparkles size={12} className="text-purple-400" />
                                </div>
                                <p className="text-sm text-slate-600 leading-relaxed">
                                    {message.text || message.message || message.content}
                                </p>
                                <div className="flex items-center gap-2 mt-3">
                                    {message.action_type === 'start_lesson' || message.lesson_id ? (
                                        <button
                                            onClick={() => handleAction('start')}
                                            className="btn-neo btn-neo-primary text-xs py-1.5 px-3 gap-1"
                                        >
                                            <Play size={12} /> Start Now
                                        </button>
                                    ) : null}
                                    {message.path_id ? (
                                        <button
                                            onClick={() => handleAction('add_to_path')}
                                            className="btn-neo btn-neo-ghost text-xs py-1.5 px-3 gap-1"
                                        >
                                            <Plus size={12} /> Add to My Path
                                        </button>
                                    ) : null}
                                    <button
                                        onClick={handleDismiss}
                                        className="text-xs text-slate-400 hover:text-slate-600 transition-colors ml-auto flex items-center gap-1"
                                    >
                                        <X size={12} /> Dismiss
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
