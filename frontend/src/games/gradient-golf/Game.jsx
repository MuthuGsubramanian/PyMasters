import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Flag, RotateCw } from 'lucide-react';
import { Button } from '../../components/ui';
import { simulate, holeScore } from './levels.js';
import { drawHole, themeColors } from './draw.js';

const STEP_FRAMES_REDUCED = 5;

function Slider({ name, label, value, min, max, step, onChange, format = (v) => v, disabled }) {
  const id = `gg-${name}`;
  return (
    <label htmlFor={id} className="flex flex-col gap-1 text-xs text-text-muted">
      <span className="flex justify-between"><span>{label}</span><span className="font-mono text-text-primary">{format(value)}</span></span>
      <input id={id} name={name} type="range" min={min} max={max} step={step} value={value} disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))} className="accent-[var(--accent-primary)] min-h-6" />
    </label>
  );
}

/**
 * Gradient Golf: set a learning rate (and steps; momentum/decay when the hole allows),
 * swing, watch exact gradient descent. The round answer is the swing list; the server
 * re-simulates it.
 */
export default function Game({ item, onAnswer, disabled, reducedMotion }) {
  const hole = item?.hole;
  const seed = item?.seed;
  const [lr, setLr] = useState(0.1);
  const [steps, setSteps] = useState(10);
  const [momentum, setMomentum] = useState(0);
  const [decay, setDecay] = useState(0);
  const [swings, setSwings] = useState([]);
  const [shown, setShown] = useState(1);      // how many path points are drawn (animation)
  const canvasRef = useRef(null);
  const answered = useRef(false);

  const sim = useMemo(() => (hole ? simulate(hole, swings, seed) : null), [hole, swings, seed]);
  const finished = !!sim && (sim.converged || sim.diverged || swings.length >= (hole?.max_swings || 0));
  const animating = !!sim && shown < sim.path.length;

  // Animate the newest swing's path points (state changes only inside timer callbacks).
  useEffect(() => {
    if (!sim) return undefined;
    const total = sim.path.length;
    if (shown >= total) return undefined;
    if (reducedMotion) {
      const stride = Math.max(1, Math.ceil((total - shown) / STEP_FRAMES_REDUCED));
      const id = setTimeout(() => setShown((s) => Math.min(total, s + stride)), 150);
      return () => clearTimeout(id);
    }
    const id = requestAnimationFrame(() => setShown((s) => Math.min(total, s + Math.max(1, Math.ceil((total - s) / 24)))));
    return () => cancelAnimationFrame(id);
  }, [sim, shown, reducedMotion]);

  // Draw whenever the visible path changes.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !sim) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const width = canvas.clientWidth || 600, height = canvas.clientHeight || 300;
    if (canvas.width !== Math.round(width * dpr)) { canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr); }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawHole(ctx, hole, sim.path.slice(0, Math.max(1, shown)), { width, height, colors: themeColors(), diverged: sim.diverged && shown >= sim.path.length });
  }, [sim, shown, hole]);

  // Hand the round the answer once the hole is over and the animation has landed.
  useEffect(() => {
    if (!finished || animating || answered.current || !sim) return;
    answered.current = true;
    onAnswer({ hole_id: item.id, swings, seed: item.seed });
  }, [finished, animating, sim, swings, item, onAnswer]);

  const swing = useCallback(() => {
    if (disabled || finished || animating) return;
    const s = { lr, steps };
    if (hole.allow_momentum) s.momentum = momentum;
    if (hole.allow_decay) s.decay = decay;
    setSwings((prev) => [...prev, s]);
  }, [disabled, finished, animating, lr, steps, momentum, decay, hole]);

  if (!hole) return null;
  const dist = Math.sqrt(sim.final.reduce((acc, v, i) => acc + (v - hole.params.min[i]) ** 2, 0));
  const status = sim.diverged
    ? 'Off the course! The learning rate was too high — each step landed farther away.'
    : sim.converged
      ? `Sunk it in ${sim.swingsToConverge} swing${sim.swingsToConverge === 1 ? '' : 's'} — in the hole. ${holeScore(hole, sim.swingsToConverge)} points.`
      : swings.length
        ? `Swing ${swings.length}: ball at ${sim.final.map((v) => v.toFixed(2)).join(', ')}, ${dist.toFixed(2)} from the flag.${swings.length >= hole.max_swings ? ' Out of swings.' : ''}`
        : `Start at ${hole.start.map((v) => v.toFixed(1)).join(', ')}. Choose a learning rate and swing.`;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="text-sm text-text-secondary"><Flag size={14} className="inline mr-1" aria-hidden="true" />{hole.name} · hole {hole.level}</p>
        <p className="text-xs text-text-muted">Swings: {swings.length}/{hole.max_swings}</p>
      </div>
      <canvas ref={canvasRef} className="w-full h-[260px] sm:h-[300px] rounded-xl border border-border-default bg-bg-elevated" role="img"
        aria-label={`Loss landscape for ${hole.name}: ${status}`} />
      <p className="text-sm text-text-secondary" aria-live="polite">{status}</p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Slider name="lr" label="Learning rate" value={lr} min={0.01} max={3} step={0.01} onChange={setLr} format={(v) => v.toFixed(2)} disabled={disabled || finished} />
        <Slider name="steps" label="Steps per swing" value={steps} min={1} max={50} step={1} onChange={setSteps} disabled={disabled || finished} />
        {hole.allow_momentum && (
          <Slider name="momentum" label="Momentum" value={momentum} min={0} max={0.95} step={0.05} onChange={setMomentum} format={(v) => v.toFixed(2)} disabled={disabled || finished} />
        )}
        {hole.allow_decay && (
          <Slider name="decay" label="Rate decay" value={decay} min={0} max={1} step={0.05} onChange={setDecay} format={(v) => v.toFixed(2)} disabled={disabled || finished} />
        )}
      </div>

      <div className="flex items-center gap-3">
        <Button onClick={swing} disabled={disabled || finished || animating} className="min-h-11">
          <RotateCw size={16} /> Swing
        </Button>
        <span className="text-xs text-text-muted">Fewer swings to sink the ball = more points.</span>
      </div>
    </div>
  );
}
