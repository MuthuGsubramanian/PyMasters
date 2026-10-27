import { useEffect, useMemo, useRef, useState } from 'react';
import { ScatterChart, Lock } from 'lucide-react';
import { Button } from '../../components/ui';
import { makeDataset, fit, mse, predict, evaluate, MAX_DEGREE } from './levels.js';
import { themeColors } from '../gradient-golf/draw.js';

const LAMBDAS = [0, 0.001, 0.01, 0.05, 0.1, 0.3, 1];

function draw(ctx, { width, height, data, w, showTest, colors, reduced }) {
  const pad = 22;
  const ys = [...data.train_y, ...(showTest ? data.test_y : [])];
  const yMin = Math.min(-1.2, ...ys) - 0.2, yMax = Math.max(1.6, ...ys) + 0.2;
  const sx = (x) => pad + ((x + 1) / 2) * (width - 2 * pad);
  const sy = (y) => height - pad - ((y - yMin) / (yMax - yMin)) * (height - 2 * pad);
  ctx.clearRect(0, 0, width, height);
  ctx.strokeStyle = colors.border; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(pad, sy(0)); ctx.lineTo(width - pad, sy(0)); ctx.stroke();
  // fitted curve
  if (w) {
    ctx.strokeStyle = colors.accent; ctx.lineWidth = 2; ctx.beginPath();
    for (let i = 0; i <= 160; i++) {
      const x = -1 + (2 * i) / 160, y = Math.max(yMin - 5, Math.min(yMax + 5, predict(w, x)));
      i ? ctx.lineTo(sx(x), sy(y)) : ctx.moveTo(sx(x), sy(y));
    }
    ctx.stroke();
  }
  // training points: filled circles
  ctx.fillStyle = colors.text;
  data.train_x.forEach((x, i) => { ctx.beginPath(); ctx.arc(sx(x), sy(data.train_y[i]), 4, 0, Math.PI * 2); ctx.fill(); });
  // test points: hollow squares (shape, not colour, distinguishes them)
  if (showTest) {
    ctx.strokeStyle = colors.flag; ctx.lineWidth = 2;
    data.test_x.forEach((x, i) => { ctx.strokeRect(sx(x) - 4, sy(data.test_y[i]) - 4, 8, 8); });
  }
  if (reduced) ctx.globalAlpha = 1;
}

/**
 * Overfit Detective: pick a polynomial degree (and λ when allowed) watching the fit on the
 * TRAINING points; commit; the hidden TEST points appear with their error. Answer:
 * {dataset_id, seed, degree, lam}.
 */
export default function Game({ item, onAnswer, disabled, reducedMotion }) {
  const ds = item?.dataset;
  const seed = item?.seed;
  const [degree, setDegree] = useState(3);
  const [lamIdx, setLamIdx] = useState(0);
  const [committed, setCommitted] = useState(false);
  const canvasRef = useRef(null);
  const answered = useRef(false);

  const data = useMemo(() => (ds ? makeDataset(ds, seed) : null), [ds, seed]);
  const lam = ds?.allow_lambda ? LAMBDAS[lamIdx] : 0;
  const w = useMemo(() => (data ? fit(data.train_x, data.train_y, degree, lam) : null), [data, degree, lam]);
  const trainMse = data && w ? mse(data.train_x, data.train_y, w) : 0;
  const result = useMemo(() => (committed && ds ? evaluate(ds, seed, degree, lam) : null), [committed, ds, seed, degree, lam]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !data) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const width = canvas.clientWidth || 600, height = canvas.clientHeight || 300;
    if (canvas.width !== Math.round(width * dpr)) { canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr); }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    draw(ctx, { width, height, data, w, showTest: committed, colors: themeColors(), reduced: reducedMotion });
  }, [data, w, committed, reducedMotion]);

  useEffect(() => {
    if (!committed || answered.current || !ds) return;
    answered.current = true;
    onAnswer({ dataset_id: item.id, seed, degree, lam });
  }, [committed, ds, item, seed, degree, lam, onAnswer]);

  if (!ds || !data) return null;
  const ratio = result ? result.test_mse / Math.max(result.best_test_mse, 1e-12) : null;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="text-sm text-text-secondary"><ScatterChart size={14} className="inline mr-1" aria-hidden="true" />{ds.name} · {ds.n_train} training points (filled dots)</p>
        <p className="text-xs text-text-muted">{committed ? 'Test points: hollow squares' : <><Lock size={11} className="inline" aria-hidden="true" /> {ds.n_test} test points hidden</>}</p>
      </div>
      <canvas ref={canvasRef} className="w-full h-[240px] sm:h-[280px] rounded-xl border border-border-default bg-bg-elevated" role="img"
        aria-label={`Scatter of training points with a degree ${degree} polynomial fit; training error ${trainMse.toFixed(4)}`} />
      <p className="text-sm text-text-secondary" aria-live="polite">
        {result
          ? `Test error ${result.test_mse.toFixed(4)} vs best achievable ${result.best_test_mse.toFixed(4)} (degree ${result.best_degree}). ${ratio <= 1.1 ? 'Excellent generalisation.' : ratio <= 1.5 ? 'Close.' : degree > result.best_degree ? 'Overfit: the curve chased the noise.' : 'Underfit: the model was too simple.'}`
          : `Training error ${trainMse.toFixed(4)}. Lower training error is not the goal — the hidden test points are.`}
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label htmlFor="od-degree" className="flex flex-col gap-1 text-xs text-text-muted">
          <span className="flex justify-between"><span>Polynomial degree</span><span className="font-mono text-text-primary">{degree}</span></span>
          <input id="od-degree" name="degree" type="range" min={1} max={MAX_DEGREE} step={1} value={degree} disabled={disabled || committed}
            onChange={(e) => setDegree(Number(e.target.value))} className="accent-[var(--accent-primary)] min-h-6" />
        </label>
        {ds.allow_lambda && (
          <label htmlFor="od-lam" className="flex flex-col gap-1 text-xs text-text-muted">
            <span className="flex justify-between"><span>Regularisation λ</span><span className="font-mono text-text-primary">{lam}</span></span>
            <input id="od-lam" name="lam" type="range" min={0} max={LAMBDAS.length - 1} step={1} value={lamIdx} disabled={disabled || committed}
              onChange={(e) => setLamIdx(Number(e.target.value))} className="accent-[var(--accent-primary)] min-h-6" />
          </label>
        )}
      </div>
      <div className="flex items-center gap-3">
        <Button onClick={() => setCommitted(true)} disabled={disabled || committed} className="min-h-11">Commit and reveal test set</Button>
        <span className="text-xs text-text-muted">Score depends on test error, never training error.</span>
      </div>
    </div>
  );
}
