import { useState, useEffect, useRef, useCallback } from 'react';

// Learner-paced playback over a fixed number of steps. The visual components
// render whatever step this hook reports (via their `controlledStep` prop), so
// there is no second animation engine. Autoplay never starts when the learner
// prefers reduced motion; playback stops on the last step.
export default function useStepPlayback(total, { reducedMotion = false, intervalMs = 1600, onFinish } = {}) {
  const last = Math.max(0, (Number(total) || 0) - 1);
  const [rawStep, setStep] = useState(0);
  const [playing, setPlaying] = useState(() => !reducedMotion && total > 0);
  const [speed, setSpeed] = useState(1);

  const step = Math.min(Math.max(rawStep, 0), last);

  const onFinishRef = useRef(onFinish);
  useEffect(() => { onFinishRef.current = onFinish; }, [onFinish]);

  // Reduced motion switched on mid-lesson: stop at once.
  useEffect(() => {
    if (reducedMotion) setPlaying(false);
  }, [reducedMotion]);

  useEffect(() => {
    if (!playing) return undefined;
    const id = setTimeout(() => {
      if (step < last) {
        setStep(step + 1);
      } else {
        setPlaying(false);
        onFinishRef.current?.();
      }
    }, intervalMs / speed);
    return () => clearTimeout(id);
  }, [playing, step, last, speed, intervalMs]);

  // An explicit Play press is the learner's choice, so it works even under reduced motion.
  const play = useCallback(() => {
    // Pressing play on the last step replays from the start.
    if (step >= last) setStep(0);
    setPlaying(true);
  }, [step, last]);
  const pause = useCallback(() => setPlaying(false), []);
  const next = useCallback(() => {
    setPlaying(false);
    setStep(Math.min(step + 1, last));
  }, [step, last]);
  const prev = useCallback(() => {
    setPlaying(false);
    setStep(Math.max(step - 1, 0));
  }, [step]);
  const restart = useCallback(() => {
    setStep(0);
    setPlaying(!reducedMotion && total > 0);
  }, [reducedMotion, total]);

  return { step, playing, speed, play, pause, next, prev, restart, setSpeed };
}
