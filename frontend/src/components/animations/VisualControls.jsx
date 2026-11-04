import { useRef } from 'react';
import { Play, Pause, ChevronLeft, ChevronRight, RotateCcw } from 'lucide-react';
import { loopStepCount } from './normalize';
import useStepPlayback from '../../hooks/useStepPlayback';
import useReducedMotion from '../../hooks/useReducedMotion';

// Visual types that play through discrete steps and accept `controlledStep`.
const STEP_TYPES = new Set([
  'ExecutionVisualizer', 'execution_visualizer',
  'CodeStepper', 'code_stepper',
  'LoopVisualizer', 'loop_visualizer',
  'FlowDiagram', 'flow_diagram',
  'FlowArrow', 'flow_arrow',
]);

const len = (v) => (Array.isArray(v) ? v.length : 0);

// Number of steps a normalised primitive plays through, or 0 when it is not
// step-based (or has too few steps for controls to mean anything).
export function getStepTotal(type, p = {}) {
  if (!STEP_TYPES.has(type)) return 0;
  switch (type) {
    case 'ExecutionVisualizer': case 'execution_visualizer':
      return len(p.executionSteps);
    case 'CodeStepper': case 'code_stepper':
      return len(p.highlightSequence);
    case 'FlowDiagram': case 'flow_diagram':
      return len(p.executionPath);
    case 'FlowArrow': case 'flow_arrow':
      return len(p.stages) >= 2 ? len(p.stages) : 0;
    default: // LoopVisualizer
      return loopStepCount({
        loopType: p.loopType || 'for', collection: p.collection || [], iterations: p.iterations || [],
        rangeStart: p.rangeStart ?? 0, rangeEnd: p.rangeEnd ?? 5, rangeStep: p.rangeStep ?? 1,
      });
  }
}

const SPEEDS = [0.5, 1, 2];

const BTN = 'inline-flex items-center justify-center min-w-[44px] min-h-[44px] rounded-lg border border-border-default '
  + 'bg-bg-elevated text-text-primary hover:border-border-strong hover:bg-bg-surface transition-colors '
  + 'disabled:opacity-40 disabled:cursor-not-allowed';

export default function VisualControls({
  step, total, playing, speed, onPlay, onPause, onNext, onPrev, onRestart, onSpeed,
}) {
  const nextSpeed = SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length];
  return (
    <div role="group" aria-label="Playback controls" className="flex flex-wrap items-center justify-center gap-2">
      <button type="button" className={BTN} aria-label="Previous step" onClick={onPrev} disabled={step <= 0}>
        <ChevronLeft size={18} aria-hidden="true" />
      </button>
      <button
        type="button"
        className={BTN}
        aria-label={playing ? 'Pause' : 'Play'}
        onClick={playing ? onPause : onPlay}
      >
        {playing ? <Pause size={18} aria-hidden="true" /> : <Play size={18} aria-hidden="true" />}
      </button>
      <button type="button" className={BTN} aria-label="Next step" onClick={onNext}>
        <ChevronRight size={18} aria-hidden="true" />
      </button>
      <button type="button" className={BTN} aria-label="Restart" onClick={onRestart}>
        <RotateCcw size={16} aria-hidden="true" />
      </button>
      <button
        type="button"
        className={`${BTN} px-3 text-xs font-semibold`}
        aria-label={`Speed ${speed}x, change to ${nextSpeed}x`}
        onClick={() => onSpeed(nextSpeed)}
      >
        {speed}x
      </button>
      <span aria-live="polite" className="text-xs font-medium text-text-secondary px-1">
        {`Step ${Math.min(step + 1, total)} of ${total}`}
      </span>
    </div>
  );
}

const EDITABLE = 'input, textarea, select, [contenteditable=""], [contenteditable="true"], .cm-content';

function isEditableTarget(t) {
  return !!(t && t.closest && t.closest(EDITABLE));
}

// Wraps a step-based visual: owns the playback state, passes the current step
// to `children(step)` (which renders the visual with controlledStep), and shows
// the controls. `onComplete` fires when playback finishes the last step or the
// learner presses Next on it, so a "Watch It Run" sequence still advances.
export function PlayableVisual({ total, onComplete, children }) {
  const reducedMotion = useReducedMotion();
  const completedRef = useRef(false);
  const complete = () => {
    if (completedRef.current) return;
    completedRef.current = true;
    onComplete?.();
  };
  const pb = useStepPlayback(total, { reducedMotion, onFinish: complete });

  const next = () => {
    if (pb.step >= total - 1) {
      pb.pause();
      complete();
    } else {
      pb.next();
    }
  };

  const onKeyDown = (e) => {
    if (isEditableTarget(e.target)) return;
    if (e.key === ' ' || e.key === 'Spacebar') {
      // A focused button handles Space itself; toggling here too would double up.
      if (e.target.closest && e.target.closest('button')) return;
      e.preventDefault();
      if (pb.playing) pb.pause(); else pb.play();
      return;
    }
    if (e.key === 'ArrowRight') { e.preventDefault(); next(); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); pb.prev(); }
  };

  return (
    <div
      tabIndex={0}
      onKeyDown={onKeyDown}
      className="flex flex-col gap-3 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
    >
      {children(pb.step)}
      <VisualControls
        step={pb.step}
        total={total}
        playing={pb.playing}
        speed={pb.speed}
        onPlay={pb.play}
        onPause={pb.pause}
        onNext={next}
        onPrev={pb.prev}
        onRestart={pb.restart}
        onSpeed={pb.setSpeed}
      />
    </div>
  );
}
