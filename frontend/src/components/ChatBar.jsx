import { useState, useRef, useEffect } from 'react';
import { Send, Loader2 } from 'lucide-react';

export default function ChatBar({ onSend, placeholder = 'Ask Vaathiyaar...', loading = false }) {
    const [value, setValue] = useState('');
    const [focused, setFocused] = useState(false);
    const inputRef = useRef(null);

    const handleSubmit = (e) => {
        e.preventDefault();
        const msg = value.trim();
        if (!msg || loading) return;
        onSend(msg);
        setValue('');
    };

    // Auto-focus on mount
    useEffect(() => {
        if (inputRef.current && !loading) {
            inputRef.current.focus();
        }
    }, [loading]);

    return (
        <form
            onSubmit={handleSubmit}
            className={`flex items-center gap-3 rounded-2xl px-4 py-3 transition-all duration-300 bg-white/90 backdrop-blur-xl border ${
                focused
                    ? 'border-purple-300 shadow-lg shadow-purple-100/30 ring-1 ring-purple-200/50'
                    : 'border-slate-200 shadow-sm'
            }`}
        >
            {/* Vaathiyaar Avatar */}
            <div className={`flex-shrink-0 w-9 h-9 rounded-xl flex items-center justify-center text-lg select-none transition-all duration-300 ${
                focused
                    ? 'bg-gradient-to-br from-purple-500 to-cyan-500 scale-105 shadow-md shadow-purple-300/30'
                    : 'bg-purple-100 border border-purple-200'
            }`}>
                {focused ? (
                    <span className="text-sm">{'🧑‍🏫'}</span>
                ) : (
                    <span className="text-sm">{'🧑‍🏫'}</span>
                )}
            </div>

            {/* Input */}
            <input
                ref={inputRef}
                type="text"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                onFocus={() => setFocused(true)}
                onBlur={() => setFocused(false)}
                placeholder={placeholder}
                disabled={loading}
                className="flex-1 bg-transparent text-sm text-slate-800 placeholder-slate-400 outline-none disabled:opacity-50 disabled:cursor-not-allowed font-medium"
            />

            {/* Keyboard hint */}
            {value.trim() && !loading && (
                <span className="hidden sm:inline text-[10px] text-slate-400 font-mono flex-shrink-0">
                    Enter ↵
                </span>
            )}

            {/* Send / Spinner */}
            <button
                type="submit"
                disabled={loading || !value.trim()}
                className={`flex-shrink-0 w-9 h-9 rounded-xl flex items-center justify-center transition-all duration-300 ${
                    loading
                        ? 'bg-purple-100 text-purple-500'
                        : value.trim()
                        ? 'bg-gradient-to-r from-purple-500 to-cyan-500 text-white shadow-md shadow-purple-300/30 hover:scale-105 active:scale-95'
                        : 'bg-slate-100 text-slate-400'
                } disabled:cursor-not-allowed`}
                aria-label="Send message"
            >
                {loading ? (
                    <Loader2 size={16} className="animate-spin" />
                ) : (
                    <Send size={15} />
                )}
            </button>
        </form>
    );
}
