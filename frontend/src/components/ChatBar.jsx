import { useState, useRef, useEffect } from 'react';
import VaathiyaarGlyph from '../assets/vaathiyaar-glyph.svg';
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
            className={`flex items-center gap-3 rounded-2xl px-4 py-3 transition-all duration-300 bg-bg-surface backdrop-blur-xl border ${
                focused
                    ? 'border-border-focus ring-1 ring-border-focus shadow-md'
                    : 'border-border-default shadow-sm'
            }`}
        >
            {/* Vaathiyaar Avatar */}
            <div className={`flex-shrink-0 w-9 h-9 rounded-xl flex items-center justify-center select-none transition-all duration-300 bg-gradient-primary ${
                focused ? 'scale-105 shadow-glow' : ''
            }`}>
                <img src={VaathiyaarGlyph} alt="" aria-hidden="true" className="w-[55%] h-[55%]" />
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
                aria-label="Message Vaathiyaar"
                className="flex-1 bg-transparent text-sm text-text-primary placeholder-text-muted outline-none disabled:opacity-50 disabled:cursor-not-allowed font-medium"
            />

            {/* Keyboard hint */}
            {value.trim() && !loading && (
                <span className="hidden sm:inline text-[10px] text-text-muted font-mono flex-shrink-0">
                    Enter ↵
                </span>
            )}

            {/* Send / Spinner */}
            <button
                type="submit"
                disabled={loading || !value.trim()}
                className={`flex-shrink-0 w-9 h-9 rounded-xl flex items-center justify-center transition-all duration-300 ${
                    loading
                        ? 'bg-accent-subtle text-accent-primary'
                        : value.trim()
                        ? 'bg-gradient-primary text-white shadow-glow hover:scale-105 active:scale-95'
                        : 'bg-bg-elevated text-text-disabled'
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
