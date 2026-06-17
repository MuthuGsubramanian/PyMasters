import { useState, useRef, useCallback, useEffect } from 'react';
import api from '../api';

/**
 * Fallback speech-to-text for browsers without the Web Speech API (e.g. Firefox):
 * record a clip with MediaRecorder, POST it to /api/voice/transcribe (server-side
 * Whisper), and hand the transcript to onFinal. Tap to start, tap to stop (or a
 * 15s safety auto-stop). Mirrors useSpeechInput's shape so VoiceTutor can swap engines.
 */
export const audioRecordingSupported =
    typeof navigator !== 'undefined' &&
    !!navigator.mediaDevices?.getUserMedia &&
    typeof window !== 'undefined' &&
    typeof window.MediaRecorder !== 'undefined';

export default function useAudioTranscribe({ language = 'en', userId, onFinal } = {}) {
    const [recording, setRecording] = useState(false);
    const [transcribing, setTranscribing] = useState(false);
    const [error, setError] = useState(null);
    const recorderRef = useRef(null);
    const chunksRef = useRef([]);
    const maxTimerRef = useRef(null);
    const onFinalRef = useRef(onFinal);
    useEffect(() => { onFinalRef.current = onFinal; }, [onFinal]);

    const stop = useCallback(() => {
        try { if (recorderRef.current?.state === 'recording') recorderRef.current.stop(); } catch { /* ignore */ }
    }, []);

    const start = useCallback(async () => {
        if (!audioRecordingSupported) { setError('unsupported'); return; }
        setError(null);
        let stream;
        try {
            stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        } catch (e) {
            setError(e?.name === 'NotAllowedError' ? 'not-allowed' : 'mic-error');
            return;
        }
        const mr = new MediaRecorder(stream);
        chunksRef.current = [];
        mr.ondataavailable = (e) => { if (e.data && e.data.size) chunksRef.current.push(e.data); };
        mr.onstop = async () => {
            setRecording(false);
            clearTimeout(maxTimerRef.current);
            stream.getTracks().forEach((t) => t.stop());
            const blob = new Blob(chunksRef.current, { type: mr.mimeType || 'audio/webm' });
            if (blob.size < 1500) { setError('no-speech'); return; } // too short / silence
            setTranscribing(true);
            try {
                const fd = new FormData();
                fd.append('audio', blob, 'speech.webm');
                fd.append('user_id', userId || 'anon');
                fd.append('language', language || 'en');
                const res = await api.post('/voice/transcribe', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
                const text = (res.data?.text || '').trim();
                if (text) onFinalRef.current?.(text);
                else setError('no-speech');
            } catch (e) {
                setError(e?.response?.status === 503 ? 'stt-unavailable' : 'transcribe-failed');
            } finally {
                setTranscribing(false);
            }
        };
        recorderRef.current = mr;
        mr.start();
        setRecording(true);
        maxTimerRef.current = setTimeout(() => { try { if (mr.state === 'recording') mr.stop(); } catch { /* ignore */ } }, 15000);
    }, [language, userId]);

    useEffect(() => () => {
        clearTimeout(maxTimerRef.current);
        try { if (recorderRef.current?.state === 'recording') recorderRef.current.stop(); } catch { /* ignore */ }
    }, []);

    return { supported: audioRecordingSupported, recording, transcribing, error, start, stop };
}
