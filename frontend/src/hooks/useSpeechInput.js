import { useState, useRef, useCallback, useEffect } from 'react';

/**
 * Browser speech-to-text via the Web Speech API (Chromium/Safari).
 * Powers the live voice tutorial: the learner speaks, we transcribe, and the
 * final transcript is handed to onFinal (which sends it to Vaathiyaar).
 *
 * Returns { supported, listening, interim, error, start, stop }.
 */
const SR = typeof window !== 'undefined'
    ? (window.SpeechRecognition || window.webkitSpeechRecognition)
    : null;

// App language code → BCP-47 tag for SpeechRecognition.
const LANG_TAG = {
    en: 'en-US', ta: 'ta-IN', te: 'te-IN', ml: 'ml-IN',
    fr: 'fr-FR', es: 'es-ES', it: 'it-IT', ko: 'ko-KR',
};

export const speechSupported = !!SR;

export default function useSpeechInput({ language = 'en', onFinal } = {}) {
    const [listening, setListening] = useState(false);
    const [interim, setInterim] = useState('');
    const [error, setError] = useState(null);
    const recRef = useRef(null);
    const onFinalRef = useRef(onFinal);
    useEffect(() => { onFinalRef.current = onFinal; }, [onFinal]);

    const stop = useCallback(() => {
        try { recRef.current?.stop(); } catch { /* ignore */ }
        setListening(false);
    }, []);

    const start = useCallback(() => {
        if (!SR) { setError('unsupported'); return; }
        try { recRef.current?.abort(); } catch { /* ignore */ }

        const rec = new SR();
        rec.lang = LANG_TAG[language] || 'en-US';
        rec.interimResults = true;
        rec.continuous = false;       // one utterance per turn
        rec.maxAlternatives = 1;

        rec.onstart = () => { setListening(true); setError(null); };
        rec.onerror = (e) => { setError(e.error || 'error'); setListening(false); };
        rec.onend = () => { setListening(false); setInterim(''); };
        rec.onresult = (e) => {
            let finalText = '', interimText = '';
            for (let i = e.resultIndex; i < e.results.length; i++) {
                const t = e.results[i][0].transcript;
                if (e.results[i].isFinal) finalText += t;
                else interimText += t;
            }
            if (interimText) setInterim(interimText);
            if (finalText.trim()) {
                setInterim('');
                onFinalRef.current?.(finalText.trim());
            }
        };

        recRef.current = rec;
        try { rec.start(); } catch (e) { setError(String(e)); }
    }, [language]);

    useEffect(() => () => { try { recRef.current?.abort(); } catch { /* ignore */ } }, []);

    return { supported: !!SR, listening, interim, error, start, stop };
}
