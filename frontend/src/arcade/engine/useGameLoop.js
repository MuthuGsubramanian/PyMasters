// Fixed-timestep game loop: `update(dtMs)` runs at 60 Hz regardless of frame rate, `draw()`
// once per animation frame. Hidden tabs and the shell's pause stop the clock; resuming never
// replays the missed time (capped catch-up), so a backgrounded run cannot kill the player.
import { useEffect, useRef } from 'react';

export const STEP_MS = 1000 / 60;
export const MAX_STEPS = 5;

export function createStepper(update, { stepMs = STEP_MS, maxSteps = MAX_STEPS } = {}) {
  let last = null;
  let acc = 0;
  let running = false;
  return {
    resume(nowMs) { running = true; last = nowMs; acc = 0; },
    pause() { running = false; last = null; acc = 0; },
    get running() { return running; },
    step(nowMs) {
      if (!running || last === null) return 0;
      acc += Math.max(0, nowMs - last);
      last = nowMs;
      let n = 0;
      while (acc + 1e-6 >= stepMs && n < maxSteps) { update(stepMs); acc -= stepMs; n++; }
      if (n === maxSteps) acc = 0;          // drop the backlog instead of replaying it
      return n;
    },
  };
}

/**
 * @param {{update: (dtMs:number)=>void, draw?: (fps:number)=>void, running?: boolean}} opts
 */
export function useGameLoop({ update, draw, running = true }) {
  const updateRef = useRef(update);
  const drawRef = useRef(draw);
  const fpsRef = useRef(60);
  useEffect(() => { updateRef.current = update; drawRef.current = draw; }, [update, draw]);

  useEffect(() => {
    if (!running) return undefined;
    const stepper = createStepper((dt) => updateRef.current?.(dt));
    let raf = 0;
    let frames = 0;
    let fpsAt = performance.now();
    const onVisibility = () => {
      if (document.hidden) stepper.pause(); else stepper.resume(performance.now());
    };
    const frame = (now) => {
      stepper.step(now);
      frames++;
      if (now - fpsAt >= 1000) { fpsRef.current = frames; frames = 0; fpsAt = now; }
      drawRef.current?.(fpsRef.current);
      raf = requestAnimationFrame(frame);
    };
    if (!document.hidden) stepper.resume(performance.now());
    document.addEventListener('visibilitychange', onVisibility);
    raf = requestAnimationFrame(frame);
    return () => { cancelAnimationFrame(raf); document.removeEventListener('visibilitychange', onVisibility); };
  }, [running]);

  return fpsRef;
}

export default useGameLoop;
