// Synthesised sound effects (WebAudio, two-oscillator envelopes). On by default with a mute
// toggle remembered per device. Silent when AudioContext is missing or the user muted.
import { useCallback, useEffect, useState } from 'react';

const KEY = 'pm_arcade_sound';
const EVT = 'pm:arcade-sound';

export function isSoundOn() {
  try { return localStorage.getItem(KEY) !== '0'; } catch { return true; }
}

export function setSoundOn(on) {
  try { localStorage.setItem(KEY, on ? '1' : '0'); } catch { /* private mode */ }
  try { window.dispatchEvent(new CustomEvent(EVT, { detail: { on } })); } catch { /* ssr */ }
}

export function useSoundPref() {
  const [on, setOn] = useState(isSoundOn);
  useEffect(() => {
    const onChange = (e) => setOn(Boolean(e.detail?.on));
    window.addEventListener(EVT, onChange);
    return () => window.removeEventListener(EVT, onChange);
  }, []);
  const toggle = useCallback(() => setSoundOn(!isSoundOn()), []);
  return [on, toggle];
}

// name -> [ {type, from, to, dur, gain} ... ] (two voices max)
const VOICES = {
  dice: [{ type: 'square', from: 220, to: 180, dur: 0.08, gain: 0.08 }, { type: 'triangle', from: 440, to: 330, dur: 0.12, gain: 0.05 }],
  hop: [{ type: 'sine', from: 520, to: 660, dur: 0.07, gain: 0.07 }],
  chime: [{ type: 'sine', from: 660, to: 990, dur: 0.25, gain: 0.08 }, { type: 'triangle', from: 1320, to: 1320, dur: 0.3, gain: 0.03 }],
  hiss: [{ type: 'sawtooth', from: 300, to: 90, dur: 0.45, gain: 0.05 }],
  crunch: [{ type: 'square', from: 180, to: 90, dur: 0.1, gain: 0.08 }, { type: 'sine', from: 700, to: 900, dur: 0.08, gain: 0.04 }],
  fizz: [{ type: 'sawtooth', from: 500, to: 120, dur: 0.3, gain: 0.05 }],
  thud: [{ type: 'sine', from: 120, to: 40, dur: 0.25, gain: 0.12 }],
  jump: [{ type: 'sine', from: 300, to: 700, dur: 0.15, gain: 0.07 }],
  gate: [{ type: 'triangle', from: 880, to: 1100, dur: 0.12, gain: 0.06 }],
  stumble: [{ type: 'square', from: 200, to: 60, dur: 0.3, gain: 0.07 }],
  stretch: [{ type: 'sawtooth', from: 90, to: 160, dur: 0.3, gain: 0.03 }],
  whoosh: [{ type: 'sine', from: 900, to: 200, dur: 0.25, gain: 0.05 }],
  pop: [{ type: 'sine', from: 800, to: 1400, dur: 0.1, gain: 0.08 }, { type: 'triangle', from: 400, to: 200, dur: 0.12, gain: 0.04 }],
  raspberry: [{ type: 'sawtooth', from: 160, to: 110, dur: 0.35, gain: 0.06 }],
  win: [{ type: 'sine', from: 523, to: 784, dur: 0.4, gain: 0.08 }, { type: 'triangle', from: 659, to: 1046, dur: 0.5, gain: 0.05 }],
  lose: [{ type: 'triangle', from: 392, to: 196, dur: 0.5, gain: 0.07 }],
  pew: [{ type: 'square', from: 900, to: 300, dur: 0.08, gain: 0.05 }],
  boom: [{ type: 'sawtooth', from: 160, to: 40, dur: 0.35, gain: 0.1 }, { type: 'square', from: 80, to: 30, dur: 0.3, gain: 0.05 }],
  waka: [{ type: 'square', from: 300, to: 500, dur: 0.06, gain: 0.04 }],
  whoop: [{ type: 'sine', from: 300, to: 1200, dur: 0.35, gain: 0.07 }],
  squeal: [{ type: 'sawtooth', from: 700, to: 500, dur: 0.25, gain: 0.04 }],
  boost: [{ type: 'sine', from: 200, to: 900, dur: 0.3, gain: 0.08 }],
};

let gestured = false;
if (typeof window !== 'undefined') {
  const mark = () => { gestured = true; };
  window.addEventListener('pointerdown', mark, { passive: true });
  window.addEventListener('keydown', mark);
}

/** Vibrate only after the learner has interacted (browsers block and log it otherwise). */
export function haptic(ms = 30) {
  if (!gestured) return;
  try { navigator.vibrate?.(ms); } catch { /* unsupported */ }
}

let ctx = null;
function audio() {
  const Ctor = typeof window !== 'undefined' ? (window.AudioContext || window.webkitAudioContext) : (globalThis.AudioContext || globalThis.webkitAudioContext);
  if (!Ctor) return null;
  try {
    if (!ctx) ctx = new Ctor();
    if (ctx.state === 'suspended') ctx.resume?.();
    return ctx;
  } catch { return null; }
}

export function play(name) {
  if (!isSoundOn()) return;
  const voices = VOICES[name];
  if (!voices) return;
  const ac = audio();
  if (!ac) return;
  try {
    const t0 = ac.currentTime;
    for (const v of voices) {
      const osc = ac.createOscillator();
      const gain = ac.createGain();
      osc.type = v.type;
      osc.frequency.setValueAtTime(v.from, t0);
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, v.to), t0 + v.dur);
      gain.gain.setValueAtTime(v.gain, t0);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + v.dur);
      osc.connect(gain).connect(ac.destination);
      osc.start(t0);
      osc.stop(t0 + v.dur + 0.02);
    }
  } catch { /* never let sound break play */ }
}

export default play;
