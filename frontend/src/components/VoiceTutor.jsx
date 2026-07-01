import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Mic, MicOff, X, Volume2, Loader2, Radio } from 'lucide-react';
import { classroomChat } from '../api';
import useTTS from '../hooks/useTTS';
import useSpeechInput, { speechSupported } from '../hooks/useSpeechInput';
import useAudioTranscribe, { audioRecordingSupported } from '../hooks/useAudioTranscribe';
import { useEscapeKey } from '../hooks/useEscapeKey';
import { useFocusTrap } from '../hooks/useFocusTrap';

/**
 * Live voice tutorial: a hands-free spoken conversation with Vaathiyaar.
 * Loop: learner speaks (STT) → Vaathiyaar answers concisely → spoken aloud (TTS)
 * → (continuous mode) auto-listen again.
 *
 * STT engine: the browser Web Speech API where available (Chrome/Edge/Safari);
 * otherwise falls back to recording + server-side Whisper (/api/voice/transcribe),
 * so it works on Firefox and others too.
 */
export default function VoiceTutor({ open, onClose, user, lessonContext = null, language = 'en', phase }) {
    const [messages, setMessages] = useState([]);
    const [thinking, setThinking] = useState(false);
    const [continuous, setContinuous] = useState(true);
    const tts = useTTS();
    const scrollRef = useRef(null);
    const panelRef = useRef(null);
    const continuousRef = useRef(continuous);
    const openRef = useRef(open);
    const messagesRef = useRef(messages);
    useEffect(() => { continuousRef.current = continuous; }, [continuous]);
    useEffect(() => { openRef.current = open; }, [open]);
    useEffect(() => { messagesRef.current = messages; }, [messages]);

    // Speak Vaathiyaar replies in the learner's language, not always English.
    // useTTS defaults its voice/lang to 'en' and nothing else sets it, so a Tamil
    // (or other non-English) reply — correctly generated in that language — was
    // read aloud by an English voice. Keep the TTS lang in step with the active
    // language. No-op for English users (lang already 'en'); an explicit user
    // voice pick still wins (resolvedVoice prioritises selectedVoiceName).
    useEffect(() => { if (language) tts.setLang(language); }, [language, tts.setLang]);

    const handleFinal = useCallback(async (transcript) => {
        if (!transcript) return;
        tts.stop(); // barge-in
        setMessages((prev) => [...prev, { role: 'user', content: transcript }]);
        setThinking(true);
        try {
            const history = messagesRef.current.slice(-5).map((m) => ({ role: m.role, content: m.content }));
            const res = await classroomChat({
                user_id: user?.id, message: transcript, lesson_context: lessonContext,
                phase, language, username: user?.name || user?.username, history, voice: true,
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

    // Two engines; pick Web Speech when supported, else server-side Whisper.
    const web = useSpeechInput({ language, onFinal: handleFinal });
    const recorder = useAudioTranscribe({ language, userId: user?.id, onFinal: handleFinal });
    const useWeb = speechSupported;
    const listening = useWeb ? web.listening : recorder.recording;
    const interim = useWeb ? web.interim : '';
    const transcribing = !useWeb && recorder.transcribing;
    const engineError = useWeb ? web.error : recorder.error;
    const startListen = useWeb ? web.start : recorder.start;
    const stopListen = useWeb ? web.stop : recorder.stop;
    const inputSupported = speechSupported || audioRecordingSupported;

    // Continuous mode: when Vaathiyaar finishes speaking, resume listening.
    const wasSpeaking = useRef(false);
    useEffect(() => {
        if (wasSpeaking.current && !tts.isSpeaking && openRef.current
            && continuousRef.current && !thinking && !listening && !transcribing) {
            const t = setTimeout(() => { if (openRef.current) startListen(); }, 350);
            return () => clearTimeout(t);
        }
        wasSpeaking.current = tts.isSpeaking;
    }, [tts.isSpeaking, thinking, listening, transcribing, startListen]);

    useEffect(() => { scrollRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, interim, thinking, transcribing]);

    useEffect(() => {
        if (!open) { stopListen(); tts.stop(); }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);

    useEscapeKey(onClose, open);
    useFocusTrap(panelRef, open);

    if (!open) return null;

    const status = !inputSupported ? 'unsupported'
        : listening ? 'listening'
        : transcribing ? 'transcribing'
        : thinking ? 'thinking'
        : tts.isSpeaking ? 'speaking' : 'idle';
    const statusText = {
        unsupported: 'Voice not supported in this browser',
        listening: useWeb ? 'Listening…' : 'Recording… tap to send',
        transcribing: 'Transcribing…',
        thinking: 'Vaathiyaar is thinking…',
        speaking: 'Vaathiyaar is speaking…',
        idle: 'Tap the mic and start talking',
    }[status];

    const errorText = {
        'not-allowed': 'Microphone permission denied — allow mic access to talk.',
        'unsupported': 'Voice input is not supported in this browser.',
        'stt-unavailable': 'Speech service is warming up — try again in a moment.',
        'transcribe-failed': 'Could not transcribe that — please try again.',
        'mic-error': 'Could not access the microphone.',
    };

    const toggleMic = () => {
        if (listening) stopListen();
        else { tts.stop(); startListen(); }
    };

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="fixed inset-0 z-[120] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
                onClick={onClose}
            >
                <motion.div
                    ref={panelRef} role="dialog" aria-modal="true" aria-label="Voice Tutor" tabIndex={-1}
                    initial={{ opacity: 0, scale: 0.94, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.94 }}
                    onClick={(e) => e.stopPropagation()}
                    className="relative w-full max-w-lg rounded-3xl bg-bg-surface border border-border-default shadow-2xl overflow-hidden flex flex-col focus:outline-none"
                    style={{ maxHeight: '85vh' }}
                >
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
                        {interim && (
                            <div className="flex justify-end">
                                <div className="max-w-[80%] px-3.5 py-2 rounded-2xl rounded-br-sm text-sm bg-purple-500/20 text-text-muted italic">{interim}</div>
                            </div>
                        )}
                        <div ref={scrollRef} />
                    </div>

                    <div className="px-5 py-5 border-t border-border-default flex flex-col items-center gap-3">
                        <button
                            onClick={toggleMic}
                            disabled={!inputSupported || thinking || transcribing}
                            className={`relative w-20 h-20 rounded-full flex items-center justify-center transition-all disabled:opacity-40 ${
                                listening ? 'bg-red-500 text-white shadow-lg shadow-red-500/40'
                                    : 'bg-gradient-to-br from-purple-600 to-cyan-500 text-white hover:scale-105'
                            }`}
                            aria-label={listening ? 'Stop' : 'Start talking'}
                        >
                            {listening && <span className="absolute inset-0 rounded-full bg-red-500/40 animate-ping" />}
                            {(thinking || transcribing) ? <Loader2 size={28} className="animate-spin" />
                                : listening ? <Mic size={28} /> : <MicOff size={28} />}
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
                        {!useWeb && inputSupported && (
                            <p className="text-[10px] text-text-muted">Using server transcription (your browser lacks built-in speech).</p>
                        )}
                        {engineError && engineError !== 'no-speech' && errorText[engineError] && (
                            <p className="text-[11px] text-red-500">{errorText[engineError]}</p>
                        )}
                    </div>
                </motion.div>
            </motion.div>
        </AnimatePresence>
    );
}
