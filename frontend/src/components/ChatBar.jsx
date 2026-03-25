import { useState } from 'react';
import { Send, Loader2 } from 'lucide-react';

/**
 * ChatBar
 * Props:
 *   onSend      {function} — called with the trimmed message string
 *   placeholder {string}   — input placeholder text
 *   loading     {boolean}  — disables input and shows spinner while true
 */
export default function ChatBar({ onSend, placeholder = 'Ask Vaathiyaar…', loading = false }) {
    const [value, setValue] = useState('');

    const handleSubmit = (e) => {
        e.preventDefault();
        const msg = value.trim();
        if (!msg || loading) return;
        onSend(msg);
        setValue('');
    };

    return (
        <form
            onSubmit={handleSubmit}
            className="flex items-center gap-3 panel rounded-2xl px-4 py-3 border border-white/10"
        >
            {/* Vaathiyaar Avatar */}
            <div className="flex-shrink-0 w-9 h-9 rounded-full bg-purple-600/30 border border-purple-500/40 flex items-center justify-center text-lg select-none">
                🧑‍🏫
            </div>

            {/* Input */}
            <input
                type="text"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder={placeholder}
                disabled={loading}
                className="flex-1 bg-transparent text-sm text-slate-200 placeholder-slate-500 outline-none disabled:opacity-50 disabled:cursor-not-allowed"
            />

            {/* Send / Spinner */}
            <button
                type="submit"
                disabled={loading || !value.trim()}
                className="flex-shrink-0 w-9 h-9 rounded-xl bg-purple-600/20 border border-purple-500/30 flex items-center justify-center text-purple-300 hover:bg-purple-600/40 hover:text-white transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed"
                aria-label="Send message"
            >
                {loading ? (
                    <Loader2 size={16} className="animate-spin" />
                ) : (
                    <Send size={16} />
                )}
            </button>
        </form>
    );
}
