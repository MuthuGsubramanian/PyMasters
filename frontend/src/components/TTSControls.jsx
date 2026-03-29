import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Volume2, VolumeX, Play, Pause, Square, Settings } from 'lucide-react';

const SPEED_OPTIONS = [0.5, 1, 1.5, 2];

/**
 * TTSControls - floating glassmorphism control panel for Vaathiyaar TTS
 *
 * Props:
 *   tts  - the object returned by useTTS()
 *   className - optional extra classes on the outer wrapper
 */
export default function TTSControls({ tts, className = '' }) {
  const [expanded, setExpanded] = useState(false);

  if (!tts?.supported) return null;

  const {
    enabled,
    setEnabled,
    isSpeaking,
    isPaused,
    stop,
    pause,
    resume,
    rate,
    setRate,
    volume,
    setVolume,
    voices,
    selectedVoice,
    setSelectedVoice,
  } = tts;

  return (
    <div className={`fixed bottom-6 right-6 z-50 flex flex-col items-end gap-2 ${className}`}>
      {/* ---- expanded panel ---- */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ opacity: 0, y: 12, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.95 }}
            transition={{ duration: 0.18 }}
            className="
              w-72 rounded-2xl p-4
              bg-slate-900/70 backdrop-blur-xl
              border border-slate-700/50
              shadow-2xl shadow-black/40
            "
          >
            {/* --- TTS toggle --- */}
            <div className="flex items-center justify-between mb-4">
              <span className="text-xs font-semibold uppercase tracking-widest text-slate-400">
                Voice
              </span>
              <button
                onClick={() => setEnabled(!enabled)}
                className={`
                  relative w-10 h-5 rounded-full transition-colors duration-200
                  ${enabled ? 'bg-emerald-500' : 'bg-slate-600'}
                `}
                aria-label="Toggle TTS"
              >
                <span
                  className={`
                    absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white
                    transition-transform duration-200
                    ${enabled ? 'translate-x-5' : 'translate-x-0'}
                  `}
                />
              </button>
            </div>

            {enabled && (
              <div className="space-y-4">
                {/* --- transport --- */}
                <div className="flex items-center justify-center gap-3">
                  <button
                    onClick={() => (isSpeaking && !isPaused ? pause() : resume())}
                    disabled={!isSpeaking}
                    className="p-2 rounded-lg bg-slate-800/60 text-slate-300 hover:text-white
                               disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                    aria-label={isPaused ? 'Resume' : 'Pause'}
                  >
                    {isSpeaking && !isPaused ? <Pause size={16} /> : <Play size={16} />}
                  </button>

                  <button
                    onClick={stop}
                    disabled={!isSpeaking}
                    className="p-2 rounded-lg bg-slate-800/60 text-slate-300 hover:text-white
                               disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                    aria-label="Stop"
                  >
                    <Square size={16} />
                  </button>
                </div>

                {/* --- speed --- */}
                <div>
                  <label className="text-[10px] uppercase tracking-widest text-slate-500 mb-1 block">
                    Speed
                  </label>
                  <div className="flex gap-1">
                    {SPEED_OPTIONS.map((s) => (
                      <button
                        key={s}
                        onClick={() => setRate(s)}
                        className={`
                          flex-1 py-1 text-xs font-mono rounded-md transition-colors
                          ${
                            rate === s
                              ? 'bg-emerald-500/20 text-emerald-400 ring-1 ring-emerald-500/40'
                              : 'bg-slate-800/50 text-slate-400 hover:text-slate-200'
                          }
                        `}
                      >
                        {s}x
                      </button>
                    ))}
                  </div>
                </div>

                {/* --- volume slider --- */}
                <div>
                  <label className="text-[10px] uppercase tracking-widest text-slate-500 mb-1 block">
                    Volume
                  </label>
                  <div className="flex items-center gap-2">
                    <VolumeX size={12} className="text-slate-500 flex-shrink-0" />
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.05}
                      value={volume}
                      onChange={(e) => setVolume(parseFloat(e.target.value))}
                      className="
                        w-full h-1 rounded-full appearance-none cursor-pointer
                        bg-slate-700 accent-emerald-500
                        [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3
                        [&::-webkit-slider-thumb]:rounded-full
                        [&::-webkit-slider-thumb]:bg-emerald-400
                        [&::-webkit-slider-thumb]:appearance-none
                      "
                    />
                    <Volume2 size={12} className="text-slate-500 flex-shrink-0" />
                  </div>
                </div>

                {/* --- voice selector --- */}
                {voices.length > 0 && (
                  <div>
                    <label className="text-[10px] uppercase tracking-widest text-slate-500 mb-1 block">
                      Voice
                    </label>
                    <select
                      value={selectedVoice?.name ?? ''}
                      onChange={(e) => setSelectedVoice(e.target.value)}
                      className="
                        w-full text-xs py-1.5 px-2 rounded-lg
                        bg-slate-800/70 text-slate-300 border border-slate-700/50
                        focus:outline-none focus:ring-1 focus:ring-emerald-500/50
                        truncate
                      "
                    >
                      {voices.map((v) => (
                        <option key={v.name} value={v.name}>
                          {v.name} ({v.lang})
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ---- floating trigger button ---- */}
      <motion.button
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={() => setExpanded((prev) => !prev)}
        className={`
          p-3 rounded-full shadow-lg
          backdrop-blur-xl border border-slate-700/50
          transition-colors duration-200
          ${
            isSpeaking
              ? 'bg-emerald-500/20 text-emerald-400 ring-2 ring-emerald-500/30'
              : 'bg-slate-900/70 text-slate-400 hover:text-white'
          }
        `}
        aria-label="TTS settings"
      >
        {expanded ? (
          <Settings size={20} className="animate-spin-slow" />
        ) : enabled ? (
          <Volume2 size={20} />
        ) : (
          <VolumeX size={20} />
        )}
      </motion.button>
    </div>
  );
}
