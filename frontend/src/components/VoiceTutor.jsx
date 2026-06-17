import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Mic, MicOff, X, Volume2, Loader2, Radio } from 'lucide-react';
import { classroomChat } from '../api';
import useTTS from '../hooks/useTTS';
import useSpeechInput, { speechSupported } from '../hooks/useSpeechInput';

/**
 * Live voice tutorial: a hands-free spoken conversation with Vaathiyaar.
 * Loop: learner speaks (STT) → Vaathiyaar answers concisely (voice mode) →
 * spoken aloud (TTS) → (continuous mode) auto-listen again.
 */
export default function VoiceTutor({ open, onClose, user, lessonContext = null, language = 'en', phase }) {
    const [messages, setMessages] = useState([]);
    const [thinking, setThinking] = useState(false);
    const [continuous, setContinuous] = useState(true);
    const tts = useTTS();
    const scrollRef = useRef(null);
    const continuousRef = useRef(continuous);
    const openRef = useRef(open);
    const messagesRef = useRef(messages);
    useEffect(() => { continuousRef.current = continuous; }, [continuous]);
    useEffect(() => { openRef.current = open; }, [open]);
    useEffect(() => { messagesRef.current = messages; }, [messages]);

    const handleFinal = useCallback(async (transcript) => {
        if (!transcript) return;
        tts.stop(); // barge-in: stop any current speech
        setMessages((prev) => [...prev, { role: 'user', content: transcript }]);
        setThinking(true);
        try {
            const history = messagesRef.current.slice(-5).map((m) => ({ role: m.role, content: m.content }));
            const res = await classroomChat({
                user_id: user?.id,
                message: transcript,
                lesson_context: lessonContext,
                phase,
                language,
                username: user?.name || user?.username,
                history,
                voice: true,
            });
            const reply = res.data?.message || "Sorry, I didn't catch that — could you say it again?";
            setMessages((prev) => [...prev, { role: 'assistant', content: reply }]);
            tts.speak(reply);
        } catch {
            const msg = "I hit a snag reaching the tutor. Let's try that again.";
            setMessages((prev) => [...prev, { role: 'assistant', content: msg }]);
            tts.speak(msg);
        } finally {
            setThinking(false);
        }
    }, [user, lessonContext, phase, language, tts]);

    const speech = useSpeechInput({ language, onFinal: handleFinal });

    // Continuous mode: when Vaathiyaar finishes speaking, resume listening.
    const wasSpeaking = useRef(false);
    useEffect(() => {
        if (wasSpeaking.current && !tts.isSpeaking && openRef.current
            && continuousRef.current && !thinking && !speech.listening) {
            const t = setTimeout(() => { if (openRef.current) speech.start(); }, 350);
            return () => clearTimeout(t);
        }
        wasSpeaking.current = tts.isSpeaking;
    }, [tts.isSpeaking, thinking, speech]);

    useEffect(() => { scrollRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, speech.interim, thinking]);

    // Clean up when closed.
    useEffect(() => {
        if (!open) { speech.stop(); tts.stop(); }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);

    if (!open) return null;

    const status = !speechSupported ? 'unsupported'
        : speech.listening ? 'listening'
        : thinking ? 'thinking'
        : tts.isSpeaking ? 'speaking' : 'idle';
    const statusText = {
        unsupported: 'Voice input needs Chrome or Edge',
        listening: 'Listening…',
        thinking: 'Vaathiyaar is thinking…',
        speaking: 'Vaathiyaar is speaking…',
        idle: 'Tap the mic and start talking',
    }[status];

    const toggleMic = () => {
        if (speech.listening) speech.stop();
        else { tts.stop(); speech.start(); }
    };

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="fixed inset-0 z-[120] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
                onClick={onClose}
            >
                <motion.div
                    initial={{ opacity: 0, scale: 0.94, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.94 }}
                    onClick={(e) => e.stopPropagation()}
                    className="relative w-full max-w-lg rounded-3xl bg-bg-surface border border-border-default shadow-2xl overflow-hidden flex flex-col"
                    style={{ maxHeight: '85vh' }}
                >
                    {/* Header */}
                    <div className="flex items-center justify-between px-5 py-4 border-b border-border-default bg-gradient-to-r from-purple-600/10 to-cyan-500/10">
                        <div className="flex items-center gap-2.5">
                            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-purple-600 to-cyan-500 flex items-center justify-center">
                                <Volume2 size={18} className="text-white" />
                            </div>
                            <div>
                                <h3 className="font-bold text-text-primary text-sm">Voice Tutor</h3>
                                <p className="text-[11px] text-text-muted">Talk with Vaathiyaar — hands-free</p>
                            </div>
                        </div>
                        <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-bg-elevated text-text-muted" aria-label="Close voice tutor">
                            <X size={18} />
                        </button>
                    </div>

                    {/* Conversation */}
                    <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3 min-h-[180px] dark-scrollbar">
                        {messages.length === 0 && (
                            <p className="text-center text-text-muted text-sm py-8">
                                Ask Vaathiyaar anything out loud — “Explain list comprehensions”, “Why is my loop slow?”…
                            </p>
                        )}
                        {messages.map((m, i) => (
                            <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                <div className={`max-w-[80%] px-3.5 py-2 rounded-2xl text-sm leading-relaxed ${
                                    m.role === 'user'
                                        ? 'bg-gradient-to-r from-purple-600 to-cyan-600 text-white rounded-br-sm'
                                        : 'bg-bg-elevated text-text-secondary rounded-bl-sm'
                                }`}>{m.content}</div>
                            </div>
                        ))}
                        {speech.interim && (
                            <div className="flex justify-end">
                                <div className="max-w-[80%] px-3.5 py-2 rounded-2xl rounded-br-sm text-sm bg-purple-500/20 text-text-muted italic">{speech.interim}</div>
                            </div>
                        )}
                        <div ref={scrollRef} />
                    </div>

                    {/* Controls */}
                    <div className="px-5 py-5 border-t border-border-default flex flex-col items-center gap-3">
                        <button
                            onClick={toggleMic}
                            disabled={!speechSupported || thinking}
                            className={`relative w-20 h-20 rounded-full flex items-center justify-center transition-all disabled:opacity-40 ${
                                speech.listening
                                    ? 'bg-red-500 text-white shadow-lg shadow-red-500/40'
                                    : 'bg-gradient-to-br from-purple-600 to-cyan-500 text-white hover:scale-105'
                            }`}
                            aria-label={speech.listening ? 'Stop listening' : 'Start talking'}
                        >
                            {speech.listening && <span className="absolute inset-0 rounded-full bg-red-500/40 animate-ping" />}
                            {thinking ? <Loader2 size={28} className="animate-spin" />
                                : speech.listening ? <Mic size={28} /> : <MicOff size={28} />}
                        </button>
                        <div className="flex items-center gap-1.5 text-sm text-text-secondary">
                            {status === 'speaking' && <Radio size={14} className="text-cyan-500 animate-pulse" />}
                            {statusText}
                        </div>
                        <div className="flex items-center gap-4 text-xs">
                            <label className="flex items-center gap-1.5 text-text-muted cursor-pointer">
                                <input type="checkbox" checked={continuous} onChange={(e) => setContinuous(e.target.checked)} className="accent-cyan-500" />
                                Continuous (auto-listen)
                            </label>
                            {tts.isSpeaking && (
                                <button onClick={() => tts.stop()} className="text-text-muted hover:text-text-secondary font-medium">Stop speaking</button>
                            )}
                        </div>
                        {speech.error && speech.error !== 'no-speech' && (
                            <p className="text-[11px] text-red-500">
                                {speech.error === 'not-allowed' ? 'Microphone permission denied — allow mic access to talk.'
                                    : speech.error === 'unsupported' ? 'Voice input is not supported in this browser (use Chrome/Edge).'
                                    : `Mic error: ${speech.error}`}
                            </p>
                        )}
                    </div>
                </motion.div>
            </motion.div>
        </AnimatePresence>
    );
}
