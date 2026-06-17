import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'; // eslint-disable-line no-unused-vars
import { X, Play, Pause, Rewind, FastForward, Download, Headphones } from 'lucide-react';
import { SUPPORTED_LANGUAGES } from '../i18n/index.js';
import { useEscapeKey } from '../hooks/useEscapeKey';
import { useFocusTrap } from '../hooks/useFocusTrap';

function parseVtt(text) {
  if (!text) return [];
  const cues = [];
  const toSec = (t) => {
    const m = t.trim().match(/(?:(\d+):)?(\d{2}):(\d{2})\.(\d{3})/);
    if (!m) return null;
    return (Number(m[1] || 0) * 3600) + (Number(m[2]) * 60) + Number(m[3]) + (Number(m[4]) / 1000);
  };
  for (const b of text.replace(/\r/g, '').split(/\n\n+/)) {
    const lines = b.split('\n').filter(Boolean);
    const tl = lines.find((l) => l.includes('-->'));
    if (!tl) continue;
    const [a, bb] = tl.split('-->');
    const start = toSec(a); const end = toSec(bb);
    if (start == null || end == null) continue;
    const txt = lines.slice(lines.indexOf(tl) + 1).join(' ').trim();
    if (txt) cues.push({ start, end, text: txt });
  }
  return cues;
}

function langName(code) {
  return SUPPORTED_LANGUAGES.find((l) => l.code === code)?.name || code;
}
function fmt(s) {
  if (!s || isNaN(s)) return '0:00';
  const m = Math.floor(s / 60);
  const r = Math.floor(s % 60);
  return `${m}:${String(r).padStart(2, '0')}`;
}

export default function PodcastPlayer({ contentId, language, manifest, onClose }) {
  const reduced = useReducedMotion();
  const audioRef = useRef(null);
  const panelRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [cur, setCur] = useState(0);
  const [dur, setDur] = useState(0);
  const [rate, setRate] = useState(1);
  const [transcript, setTranscript] = useState('');
  const [audioErr, setAudioErr] = useState(false);
  const [cues, setCues] = useState([]);
  const [showCaptions, setShowCaptions] = useState(true);
  const [activeCue, setActiveCue] = useState(-1);
  const cueRefs = useRef([]);

  const byLang = manifest?.[contentId] || {};
  const entry = byLang[language] || null;
  const enEntry = byLang.en || null;

  useEscapeKey(() => onClose?.());
  useFocusTrap(panelRef, true);

  useEffect(() => {
    let cancelled = false;
    if (!entry?.captions_url) {
      Promise.resolve().then(() => { if (!cancelled) { setCues([]); setActiveCue(-1); } });
    } else {
      fetch(entry.captions_url).then((r) => (r.ok ? r.text() : '')).then((t) => { if (!cancelled) { setCues(parseVtt(t)); setActiveCue(-1); } }).catch(() => {});
    }
    return () => { cancelled = true; };
  }, [entry]);

  const transcriptUrl = entry?.transcript_url ?? null;
  useEffect(() => {
    let cancelled = false;
    if (transcriptUrl) {
      fetch(transcriptUrl)
        .then((r) => r.ok ? r.text() : '')
        .then((t) => { if (!cancelled) setTranscript(t); })
        .catch(() => { if (!cancelled) setTranscript(''); });
    } else {
      Promise.resolve().then(() => { if (!cancelled) setTranscript(''); });
    }
    return () => { cancelled = true; };
  }, [transcriptUrl]);

  useEffect(() => {
    if (activeCue >= 0 && cueRefs.current[activeCue]) {
      cueRefs.current[activeCue].scrollIntoView({ block: 'nearest', behavior: reduced ? 'auto' : 'smooth' });
    }
  }, [activeCue, reduced]);

  const a = audioRef.current;
  const toggle = () => { if (!a) return; if (a.paused) { a.play(); } else { a.pause(); } };
  const skip = (d) => { if (a) a.currentTime = Math.max(0, Math.min(a.duration || 0, a.currentTime + d)); };
  const setSpeed = (r) => { setRate(r); if (a) a.playbackRate = r; };

  return (
    <AnimatePresence>
      <motion.div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
        <motion.div ref={panelRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label="Podcast player"
          onClick={(e) => e.stopPropagation()}
          initial={reduced ? false : { scale: 0.96, opacity: 0 }} animate={reduced ? false : { scale: 1, opacity: 1 }} exit={reduced ? undefined : { scale: 0.96, opacity: 0 }}
          className="w-full max-w-lg max-h-[85vh] overflow-y-auto bg-bg-surface border border-border-default rounded-2xl shadow-2xl focus:outline-none">
          <div className="flex items-center gap-2 p-4 border-b border-border-default">
            <Headphones size={18} className="text-cyan-500" />
            <h2 className="text-base font-bold text-text-primary flex-1">Listen as podcast</h2>
            <button onClick={onClose} aria-label="Close" className="text-text-muted hover:text-text-secondary p-1"><X size={18} /></button>
          </div>

          {entry ? (
            <div className="p-4 space-y-4">
              <audio
                ref={audioRef}
                src={entry.audio_url}
                onPlay={() => setPlaying(true)}
                onPause={() => setPlaying(false)}
                onTimeUpdate={(e) => {
                  const t = e.currentTarget.currentTime;
                  setCur(t);
                  if (cues.length) {
                    const idx = cues.findIndex((c) => t >= c.start && t < c.end);
                    if (idx !== -1 && idx !== activeCue) setActiveCue(idx);
                  }
                }}
                onLoadedMetadata={(e) => { setDur(e.currentTarget.duration); e.currentTarget.playbackRate = rate; }}
                onError={() => setAudioErr(true)}
                preload="metadata"
              />
              {audioErr ? <p className="text-sm text-red-500">Couldn't load the audio. Please try again later.</p> : null}

              <div className="flex items-center justify-center gap-4">
                <button onClick={() => skip(-15)} aria-label="Back 15 seconds" className="text-text-secondary hover:text-text-primary"><Rewind size={22} /></button>
                <button onClick={toggle} aria-label={playing ? 'Pause' : 'Play'} className="w-12 h-12 rounded-full bg-gradient-to-br from-purple-600 to-cyan-500 text-white flex items-center justify-center">
                  {playing ? <Pause size={22} /> : <Play size={22} />}
                </button>
                <button onClick={() => skip(15)} aria-label="Forward 15 seconds" className="text-text-secondary hover:text-text-primary"><FastForward size={22} /></button>
              </div>

              <div className="space-y-1">
                <input type="range" min={0} max={dur || 0} value={cur} step="1"
                  onChange={(e) => { if (a) a.currentTime = Number(e.target.value); }}
                  aria-label="Seek" className="w-full accent-cyan-500" />
                <div className="flex justify-between text-[11px] text-text-muted"><span>{fmt(cur)}</span><span>{fmt(dur)}</span></div>
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1">
                  {[0.75, 1, 1.25, 1.5].map((r) => (
                    <button key={r} onClick={() => setSpeed(r)}
                      className={`text-xs px-2 py-1 rounded-lg border ${rate === r ? 'bg-cyan-500 text-white border-cyan-500' : 'border-border-default text-text-secondary hover:bg-bg-elevated'}`}>{r}×</button>
                  ))}
                </div>
                <a href={entry.audio_url} download className="inline-flex items-center gap-1 text-xs font-semibold text-cyan-600 hover:text-cyan-700">
                  <Download size={14} /> Download
                </a>
              </div>

              {(cues.length > 0 || transcript) ? (
                <div className="border-t border-border-default pt-3">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-sm font-bold text-text-secondary">{cues.length > 0 ? 'Captions' : 'Transcript'}</h3>
                    {cues.length > 0 && (
                      <button onClick={() => setShowCaptions((v) => !v)} className="text-xs text-text-muted hover:text-text-secondary">
                        {showCaptions ? 'Hide sync' : 'Show sync'}
                      </button>
                    )}
                  </div>
                  {cues.length > 0 && showCaptions ? (
                    <div className="max-h-60 overflow-y-auto space-y-1">
                      {cues.map((c, i) => (
                        <p
                          key={i}
                          ref={(el) => { cueRefs.current[i] = el; }}
                          onClick={() => { if (a) a.currentTime = c.start; }}
                          className={`text-sm leading-relaxed cursor-pointer rounded px-2 py-1 transition-colors ${i === activeCue ? 'bg-cyan-500/10 text-text-primary font-medium' : 'text-text-muted hover:bg-bg-elevated'}`}
                        >
                          {c.text}
                        </p>
                      ))}
                    </div>
                  ) : (
                    <div className="text-sm text-text-secondary whitespace-pre-wrap max-h-60 overflow-y-auto leading-relaxed">{transcript}</div>
                  )}
                </div>
              ) : null}
            </div>
          ) : (
            <div className="p-6 text-center space-y-3">
              <p className="text-sm text-text-muted">No podcast in {langName(language)} yet for this lesson.</p>
              {enEntry ? (
                <p className="text-sm text-text-secondary">An English episode is available — <a href={enEntry.audio_url} className="text-cyan-600 font-semibold" target="_blank" rel="noopener noreferrer">play it</a>.</p>
              ) : null}
              <p className="text-xs text-text-muted">You can still use read-aloud in the lesson.</p>
            </div>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
