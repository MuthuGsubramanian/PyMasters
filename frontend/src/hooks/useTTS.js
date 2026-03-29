import { useState, useEffect, useRef, useCallback } from 'react';

const STORAGE_KEY = 'pm_tts_settings';
const SENTENCE_RE = /(?<=[.!?\u0964\u0965])\s+/; // split on . ! ? and Tamil/Devanagari purna viram

/** Preferred voice name fragments per language */
const VOICE_HINTS = {
  en: ['google us', 'google uk', 'samantha', 'daniel', 'microsoft david', 'microsoft zira'],
  ta: ['tamil', 'google \u0ba4\u0bae\u0bbf\u0bb4\u0bcd', 'google ta'],
};

/** Strip markdown formatting so spoken text sounds natural */
function stripMarkdown(text) {
  if (!text) return '';
  return text
    .replace(/```[\s\S]*?```/g, ' code block ')    // fenced code
    .replace(/`([^`]+)`/g, '$1')                    // inline code
    .replace(/!\[.*?\]\(.*?\)/g, '')                // images
    .replace(/\[([^\]]+)\]\(.*?\)/g, '$1')          // links -> label only
    .replace(/#{1,6}\s+/g, '')                      // headings
    .replace(/[*_]{1,3}([^*_]+)[*_]{1,3}/g, '$1')  // bold / italic
    .replace(/~~(.*?)~~/g, '$1')                    // strikethrough
    .replace(/>\s?/g, '')                           // blockquotes
    .replace(/[-*+]\s/g, '')                        // unordered list markers
    .replace(/\d+\.\s/g, '')                        // ordered list markers
    .replace(/\n{2,}/g, '. ')                       // paragraph breaks -> pause
    .replace(/\n/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/** Split text into sentence-sized chunks for smoother speech */
function splitSentences(text, maxLen = 200) {
  const raw = text.split(SENTENCE_RE).filter(Boolean);
  const chunks = [];
  let buf = '';
  for (const s of raw) {
    if ((buf + ' ' + s).length > maxLen && buf) {
      chunks.push(buf.trim());
      buf = s;
    } else {
      buf = buf ? buf + ' ' + s : s;
    }
  }
  if (buf.trim()) chunks.push(buf.trim());
  return chunks.length ? chunks : [text];
}

function loadSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveSettings(settings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // quota exceeded or private mode — silently ignore
  }
}

/**
 * useTTS - Web Speech API hook for Vaathiyaar text-to-speech
 *
 * Returns controls, state, and voice management for SpeechSynthesis.
 */
export default function useTTS() {
  const supported = typeof window !== 'undefined' && 'speechSynthesis' in window;
  const synth = supported ? window.speechSynthesis : null;

  // ---- persisted settings ----
  const saved = useRef(loadSettings());

  const [enabled, setEnabledState] = useState(saved.current?.enabled ?? true);
  const [rate, setRateState] = useState(saved.current?.rate ?? 1.0);
  const [pitch, setPitch] = useState(saved.current?.pitch ?? 1.0);
  const [volume, setVolume] = useState(saved.current?.volume ?? 1.0);
  const [lang, setLang] = useState(saved.current?.lang ?? 'en');
  const [selectedVoiceName, setSelectedVoiceName] = useState(saved.current?.voiceName ?? null);

  // ---- transient state ----
  const [voices, setVoices] = useState([]);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isPaused, setIsPaused] = useState(false);

  const queueRef = useRef([]);         // text chunks waiting to be spoken
  const currentUtterance = useRef(null);
  const onWordRef = useRef(null);      // optional word-boundary callback
  const mountedRef = useRef(true);

  // ---- persist settings on change ----
  useEffect(() => {
    saveSettings({
      enabled,
      rate,
      pitch,
      volume,
      lang,
      voiceName: selectedVoiceName,
    });
  }, [enabled, rate, pitch, volume, lang, selectedVoiceName]);

  // ---- load voices (may fire asynchronously) ----
  useEffect(() => {
    if (!synth) return;

    const load = () => {
      const v = synth.getVoices();
      if (v.length) setVoices(v);
    };

    load();
    synth.addEventListener('voiceschanged', load);
    return () => synth.removeEventListener('voiceschanged', load);
  }, [synth]);

  // ---- resolve the SpeechSynthesisVoice object ----
  const resolvedVoice = useCallback(() => {
    if (!voices.length) return null;

    // explicit selection by name
    if (selectedVoiceName) {
      const match = voices.find((v) => v.name === selectedVoiceName);
      if (match) return match;
    }

    // auto-detect best voice for language
    const hints = VOICE_HINTS[lang] || VOICE_HINTS.en;
    for (const hint of hints) {
      const match = voices.find(
        (v) => v.lang.startsWith(lang) && v.name.toLowerCase().includes(hint),
      );
      if (match) return match;
    }

    // fallback: first voice matching language
    const langMatch = voices.find((v) => v.lang.startsWith(lang));
    if (langMatch) return langMatch;

    // last resort: default voice
    return voices.find((v) => v.default) || voices[0];
  }, [voices, selectedVoiceName, lang]);

  // ---- internal: speak next chunk in queue ----
  const speakNext = useCallback(() => {
    if (!synth || !mountedRef.current) return;
    if (queueRef.current.length === 0) {
      setIsSpeaking(false);
      setIsPaused(false);
      currentUtterance.current = null;
      return;
    }

    const text = queueRef.current.shift();
    const utt = new SpeechSynthesisUtterance(text);

    const voice = resolvedVoice();
    if (voice) utt.voice = voice;

    utt.rate = rate;
    utt.pitch = pitch;
    utt.volume = volume;
    utt.lang = lang;

    utt.onend = () => {
      if (!mountedRef.current) return;
      speakNext();
    };

    utt.onerror = (e) => {
      // 'interrupted' and 'canceled' are normal when stop() is called
      if (e.error === 'interrupted' || e.error === 'canceled') return;
      console.warn('[useTTS] SpeechSynthesis error:', e.error);
      if (!mountedRef.current) return;
      speakNext(); // skip to next chunk
    };

    // word boundary callback for karaoke highlighting
    utt.onboundary = (e) => {
      if (e.name === 'word' && onWordRef.current) {
        onWordRef.current({
          charIndex: e.charIndex,
          charLength: e.charLength ?? 0,
          word: text.substring(e.charIndex, e.charIndex + (e.charLength || 0)),
        });
      }
    };

    currentUtterance.current = utt;
    setIsSpeaking(true);
    setIsPaused(false);
    synth.speak(utt);
  }, [synth, resolvedVoice, rate, pitch, volume, lang]);

  // ---- public API ----

  const speak = useCallback(
    (text, options = {}) => {
      if (!synth || !enabled) return;

      const {
        rate: r,
        pitch: p,
        volume: v,
        lang: l,
        voice: vo,
        onWord,
      } = options;

      // Apply one-shot overrides (they don't persist)
      if (r != null) setRateState(r);
      if (p != null) setPitch(p);
      if (v != null) setVolume(v);
      if (l != null) setLang(l);
      if (vo != null) setSelectedVoiceName(typeof vo === 'string' ? vo : vo.name);
      if (onWord) onWordRef.current = onWord;

      const clean = stripMarkdown(text);
      if (!clean) return;

      const chunks = splitSentences(clean);

      // If already speaking, queue new chunks
      if (isSpeaking) {
        queueRef.current.push(...chunks);
        return;
      }

      // Cancel any lingering synthesis and start fresh
      synth.cancel();
      queueRef.current = chunks;
      speakNext();
    },
    [synth, enabled, isSpeaking, speakNext],
  );

  const stop = useCallback(() => {
    if (!synth) return;
    queueRef.current = [];
    synth.cancel();
    setIsSpeaking(false);
    setIsPaused(false);
    currentUtterance.current = null;
  }, [synth]);

  const pause = useCallback(() => {
    if (!synth || !isSpeaking) return;
    synth.pause();
    setIsPaused(true);
  }, [synth, isSpeaking]);

  const resume = useCallback(() => {
    if (!synth || !isPaused) return;
    synth.resume();
    setIsPaused(false);
  }, [synth, isPaused]);

  const setEnabled = useCallback(
    (val) => {
      setEnabledState(val);
      if (!val) stop();
    },
    [stop],
  );

  const setRate = useCallback((r) => {
    setRateState(Math.min(2.0, Math.max(0.5, r)));
  }, []);

  const setSelectedVoice = useCallback(
    (voice) => {
      const name = typeof voice === 'string' ? voice : voice?.name ?? null;
      setSelectedVoiceName(name);
    },
    [],
  );

  // ---- cleanup on unmount ----
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (synth) {
        synth.cancel();
      }
      queueRef.current = [];
    };
  }, [synth]);

  return {
    // state
    supported,
    isSpeaking,
    isPaused,
    voices,
    enabled,
    rate,
    pitch,
    volume,
    lang,
    selectedVoice: resolvedVoice(),

    // setters
    setEnabled,
    setRate,
    setPitch: (p) => setPitch(Math.min(2.0, Math.max(0.5, p))),
    setVolume: (v) => setVolume(Math.min(1.0, Math.max(0, v))),
    setLang,
    setSelectedVoice,

    // actions
    speak,
    stop,
    pause,
    resume,
  };
}
