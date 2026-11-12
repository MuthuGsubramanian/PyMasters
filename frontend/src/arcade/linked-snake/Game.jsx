import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, RotateCcw } from 'lucide-react';
import { Button } from '../../components/ui';
import { usePlayT } from '../../games/engine/i18n';
import { ArcadeShell } from '../engine/ArcadeShell';
import { Hud } from '../engine/Hud';
import { useArcadeSession } from '../engine/useArcadeSession';
import { useGameLoop } from '../engine/useGameLoop';
import { useInput } from '../engine/useInput';
import { createPool, burst, step as stepParticles } from '../engine/particles';
import { fitCanvas } from '../engine/sprites';
import { play as sfx } from '../engine/sfx';
import { shortcutsBlocked } from '../../games/engine/keys';
import { newRun, turn, step, placeFoods, applyEatResult, speedFor, COLS, ROWS } from './rules.js';
import { draw, CELL, fieldSize } from './render.js';

const mirror = (s) => ({ dir: s.nextDir || s.dir, alive: s.alive, started: s.started, score: s.score, level: s.level, eaten: s.eaten, correct: s.correct, wrong: s.wrong,
  lastOp: s.lastOp, prompt: s.prompt, foods: s.foods, length: s.snake.length, nodes: s.snake.slice(0, 6).map((n) => n.value) });

const PACE_OPTIONS = [
  { id: 'slow', label: '🐢 Slow', mul: 2.8 },
  { id: 'normal', label: '🚶 Normal', mul: 2.0 },
  { id: 'fast', label: '⚡ Fast', mul: 1.35 },
];

/**
 * Linked Snake: steer, eat the right answer to append a node, the wrong one pops your tail.
 * Rules are pure (rules.js); the loop and canvas live here; grading is the server's.
 */
export default function Game({ reducedMotion = false, onQuit, initial = null, rng = Math.random }) {
  const t = usePlayT();
  const session = useArcadeSession({ gameId: 'linked_snake' });
  const stateRef = useRef({ ...newRun({ seed: 1 }), ...(initial || {}) });
  const [hud, setHud] = useState(() => mirror({ ...newRun({ seed: 1 }), ...(initial || {}) }));
  const [reveal, setReveal] = useState(null);
  const canvasRef = useRef(null);
  const wrapRef = useRef(null);
  const particles = useRef(createPool(160));
  const acc = useRef(0);
  const flash = useRef(0);
  const askedAt = useRef(0);
  const answering = useRef(false);
  const finished = useRef(false);
  const [done, setDone] = useState(false);
  const [paused, setPaused] = useState(false);
  const [paceId, setPaceId] = useState('slow');
  const paceMul = initial ? 1 : (PACE_OPTIONS.find((p) => p.id === paceId)?.mul ?? 2.8);
  const stepSpeed = useCallback((s) => speedFor(s.level) * paceMul, [paceMul]);

  // Hand the snake a new prompt whenever the session has one and the field is empty.
  useEffect(() => {
    const s = stateRef.current;
    if (!s.alive || s.prompt || s.pendingEat || session.state !== 'ready') return;
    if (session.item && session.item.id !== s.lastPromptId) {
      // Study-Pause: whenever a new Python prompt is placed on the board, pause the snake
      // in place (`started: false`) so the learner has unlimited time to read the code before
      // pressing an Arrow key to slither or pressing 1–4 to answer directly.
      const keepStarted = Boolean(initial?.started && !s.lastPromptId);
      stateRef.current = { ...placeFoods(s, session.item, rng), lastPromptId: session.item.id, started: keepStarted };
      acc.current = 0;
      askedAt.current = Date.now();
      setHud(mirror(stateRef.current));
    } else if (!session.item && session.queue.length) {
      session.take();
    } else if (!session.item && !session.queue.length && session.exhausted && s.lastPromptId) {
      setDone(true);                       // the deck is empty: the run ends with what was scored
    }
  }, [session.state, session.item, session.queue.length, session.exhausted, session, rng, hud.prompt, hud.length, initial]);

  const onEat = useCallback(async (evt) => {
    const s0 = stateRef.current;
    if (!s0.prompt || answering.current) return;
    answering.current = true;
    const ms = Date.now() - askedAt.current;
    const result = await session.answer(s0.prompt.id, evt.choiceIndex, ms);
    if (!result) {                       // no verdict (network): neither grow nor shrink, move on
      stateRef.current = { ...stateRef.current, pendingEat: null, prompt: null, started: false };
      answering.current = false;
      setHud(mirror(stateRef.current));
      if (session.queue.length || session.item) session.take();
      return;
    }
    const correct = Boolean(result.correct);
    const r = applyEatResult(stateRef.current, correct, evt.label);
    stateRef.current = { ...r.state, started: false };
    acc.current = 0;
    answering.current = false;
    const head = r.state.snake[0];
    if (correct) { sfx('crunch'); if (!reducedMotion) burst(particles.current, head.x * CELL + CELL / 2, head.y * CELL + CELL / 2, { count: 18, color: ['#5eead4', '#f59e0b', '#fff'], speed: 220 }); }
    else { sfx(r.events.some((e) => e.type === 'crash') ? 'thud' : 'fizz'); flash.current = 1; }
    if (r.events.some((e) => e.type === 'crash')) setDone(true);
    if (r.events.some((e) => e.type === 'level_up')) sfx('win');
    setReveal({ correct, why: result.why });
    setTimeout(() => setReveal(null), 2200);
    setHud(mirror(stateRef.current));
    if (session.queue.length || session.item) session.take();
  }, [session, reducedMotion]);

  // Accessible path: the foods as real buttons (also handy on tiny screens).
  const eatChoice = useCallback((food) => {
    const s = stateRef.current;
    if (!s.alive || !s.prompt || answering.current) return;
    stateRef.current = { ...s, foods: [], pendingEat: food, started: false };
    setHud(mirror(stateRef.current));
    onEat({ choiceIndex: food.choiceIndex, label: food.label });
  }, [onEat]);

  const update = useCallback((dt) => {
    const s = stateRef.current;
    if (!s.alive) return;
    stepParticles(particles.current, dt);
    flash.current = Math.max(0, flash.current - dt / 400);
    acc.current += dt;
    const speed = stepSpeed(s);
    if (acc.current < speed) return;
    acc.current -= speed;
    const r = step(s);
    stateRef.current = r.state;
    for (const e of r.events) {
      if (e.type === 'crash') { sfx('thud'); flash.current = 1; setHud(mirror(r.state)); setDone(true); }
      if (e.type === 'eat') onEat(e);
    }
    if (r.state.ticks % 2 === 0 || r.state.dir !== s.dir) setHud(mirror(r.state));
  }, [onEat, stepSpeed]);

  const render = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const s = stateRef.current;
    draw(ctx, s, { progress: Math.min(1, acc.current / stepSpeed(s)), particles: particles.current, flash: flash.current, reducedMotion });
  }, [reducedMotion, stepSpeed]);

  useGameLoop({ update, draw: render, running: !done && hud.alive && !paused });

  // Canvas sizing: the field is 20×14 cells; scale to the container width, keep the aspect.
  useEffect(() => {
    const canvas = canvasRef.current, wrap = wrapRef.current;
    if (!canvas || !wrap) return undefined;
    const { w, h } = fieldSize(stateRef.current);
    const resize = () => {
      const width = Math.min(w, wrap.clientWidth || w);
      const ctx = fitCanvas(canvas, width, (width * h) / w);
      ctx.scale(width / w, width / w);
    };
    resize();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null;
    ro?.observe(wrap);
    return () => ro?.disconnect();
  }, [done]);

  const steer = useCallback((action) => {
    if (['up', 'down', 'left', 'right'].includes(action)) {
      stateRef.current = turn(stateRef.current, action);
      setHud(mirror(stateRef.current));
    }
  }, []);
  useInput({ onAction: steer, enabled: !done && !paused, target: wrapRef });

  // Keyboard shortcuts 1–4 to directly eat the corresponding answer choice without steering.
  useEffect(() => {
    if (done || paused) return undefined;
    const onKey = (e) => {
      if (shortcutsBlocked(e)) return;
      if (['1', '2', '3', '4'].includes(e.key)) {
        const s = stateRef.current;
        const food = s.foods.find((f) => f.choiceIndex === Number(e.key) - 1) || s.foods[Number(e.key) - 1];
        if (food) {
          e.preventDefault();
          eatChoice(food);
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [done, paused, eatChoice]);

  // Game over → report once.
  useEffect(() => {
    if (!done || finished.current) return;
    finished.current = true;
    const s = stateRef.current;
    session.finish(s.score, { level: s.level, eaten: s.eaten, length: s.snake.length });
  }, [done, session]);

  const restart = () => {
    finished.current = false;
    stateRef.current = newRun({ seed: Date.now() & 0xffff });
    acc.current = 0;
    setHud(mirror(stateRef.current));
    setReveal(null);
    setDone(false);
    session.start();
  };

  if (session.state === 'error') {
    return (
      <div className="max-w-xl mx-auto flex flex-col gap-4">
        <p className="text-text-secondary" role="alert">{session.error}</p>
        <div className="flex gap-3">
          <Button onClick={restart}>{t('play.retry', 'Retry')}</Button>
          <Button as={Link} to="/dashboard/play#arcade" variant="outline"><ArrowLeft size={16} /> {t('arcade.back', 'Back to Arcade')}</Button>
        </div>
      </div>
    );
  }

  if (done && session.state === 'done') {
    const res = session.result || {};
    return (
      <div data-end-screen className="max-w-xl mx-auto flex flex-col gap-4 rounded-2xl border border-border-default bg-bg-elevated p-6">
        <h2 className="font-display text-2xl font-bold text-text-primary">{t('arcade.game_over', 'Game over')}</h2>
        <p className="text-sm text-text-secondary font-mono">{hud.lastOp}</p>
        <dl className="grid grid-cols-3 gap-2 text-center text-sm">
          <div className="rounded-xl bg-bg-inset py-2"><dt className="text-xs text-text-muted">Score</dt><dd className="font-semibold text-text-primary tabular-nums">{res.score ?? hud.score}</dd></div>
          <div className="rounded-xl bg-bg-inset py-2"><dt className="text-xs text-text-muted">{t('arcade.correct', 'Correct')}</dt><dd className="font-semibold text-text-primary tabular-nums">{hud.correct} / {hud.correct + hud.wrong}</dd></div>
          <div className="rounded-xl bg-bg-inset py-2"><dt className="text-xs text-text-muted">{t('arcade.xp_earned', 'XP earned')}</dt><dd className="font-semibold text-text-primary tabular-nums">+{res.xp ?? 0}</dd></div>
        </dl>
        {res.xp_capped && <p className="text-xs text-text-muted">{t('arcade.capped', 'Daily game XP cap reached')}</p>}
        {res.best && <p className="text-sm font-medium text-accent-primary">{t('arcade.new_best', 'New personal best!')}</p>}
        <div className="flex flex-wrap gap-3">
          <Button onClick={restart} className="min-h-11"><RotateCcw size={16} /> {t('arcade.rematch', 'Play again')}</Button>
          <Button as={Link} to="/dashboard/play#arcade" variant="outline" className="min-h-11"><ArrowLeft size={16} /> {t('arcade.back', 'Back to Arcade')}</Button>
        </div>
      </div>
    );
  }

  const foodsText = hud.foods.map((f) => `${f.label} at column ${f.x + 1}, row ${f.y + 1}`).join('; ');
  return (
    <ArcadeShell title="Linked Snake" subtitle={`Level ${hud.level} · len(snake) == ${hud.length}`} score={hud.score} onQuit={onQuit} paused={paused} onPauseChange={setPaused}
      footer={t('arcade.steer', 'Snake pauses on every new question so you can read! Press 1–4 (or click an answer) to eat directly, or press Arrow keys to slither to the food.')}>
      {() => (
        <div className="flex flex-col gap-3" data-dir={hud.dir} data-paused={paused ? '1' : '0'}>
          <Hud item={hud.prompt} reveal={reveal}>
            <div className="flex items-center justify-between gap-2 flex-wrap pt-1 border-t border-border-default/60 text-xs">
              <div className="flex items-center gap-2 flex-wrap">
                <code className="text-text-muted font-mono">{hud.lastOp}</code>
                {!hud.started && hud.foods.length > 0 && (
                  <span className="rounded-full bg-amber-500/15 border border-amber-400/50 px-2 py-0.5 text-xs font-mono font-semibold text-amber-300">
                    ⏸ Study Mode — Take your time! Click an answer below (1–4) or press an Arrow key to slither
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <div className="flex items-center gap-1" role="group" aria-label="Snake speed">
                  {PACE_OPTIONS.map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setPaceId(opt.id)}
                      className={`rounded-md px-1.5 py-0.5 text-xs font-mono border transition-colors ${paceId === opt.id ? 'bg-teal-500/20 border-teal-400 text-teal-300 font-bold' : 'bg-bg-inset border-border-default text-text-muted hover:text-text-primary'}`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-1 font-mono text-xs" aria-label="Linked nodes">
                  {(hud.nodes || []).map((val, idx) => (
                    <span key={idx} className="inline-flex items-center gap-1">
                      <span className={`rounded px-1.5 py-0.5 border ${idx === 0 ? 'bg-teal-500/20 border-teal-400 text-teal-300 font-bold' : 'bg-bg-inset border-border-default text-text-secondary'}`}>
                        {idx === 0 ? 'HEAD' : val}
                      </span>
                      {idx < (hud.nodes?.length || 0) - 1 && <span className="text-teal-400">→</span>}
                    </span>
                  ))}
                  {hud.length > 6 && <span className="text-text-muted">… ({hud.length} nodes)</span>}
                </div>
              </div>
            </div>
          </Hud>
          {hud.foods.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2" role="group" aria-label={t('arcade.choices', 'Answers')}>
              {hud.foods.map((f, idx) => (
                <button
                  key={f.choiceIndex}
                  type="button"
                  data-eat={f.choiceIndex}
                  onClick={() => eatChoice(f)}
                  className="min-h-11 rounded-xl border-2 border-amber-400/60 bg-amber-500/10 hover:bg-amber-500/20 px-3 py-2 font-mono text-xs sm:text-sm font-bold text-text-primary flex items-center justify-between gap-1.5 shadow-sm transition-colors"
                >
                  <span className="text-xs text-amber-300">[{idx + 1}]</span>
                  <span className="truncate">{f.label}</span>
                </button>
              ))}
            </div>
          )}
          <div ref={wrapRef} className="w-full flex justify-center">
            <canvas ref={canvasRef} width={COLS * CELL} height={ROWS * CELL} role="img" aria-label={t('arcade.steer', 'Arrow keys or swipe to steer. Eat the right answer.')}
              className="rounded-2xl border border-border-strong shadow-lg max-w-full touch-none" />
          </div>
          <p data-field-text className="sr-only" aria-live="polite">{foodsText ? `Foods: ${foodsText}.` : 'Waiting for the next question.'} Snake length {hud.length}, heading {hud.dir}.</p>
            <div className="grid grid-cols-3 gap-1 w-40 mx-auto sm:hidden" aria-label="Steer">
              <span />
              <Button variant="outline" size="icon" className="min-h-12 min-w-12" aria-label="Up" onClick={() => steer('up')}><ArrowUp size={18} /></Button>
              <span />
              <Button variant="outline" size="icon" className="min-h-12 min-w-12" aria-label="Left" onClick={() => steer('left')}><ArrowLeft size={18} /></Button>
              <Button variant="outline" size="icon" className="min-h-12 min-w-12" aria-label="Down" onClick={() => steer('down')}><ArrowDown size={18} /></Button>
              <Button variant="outline" size="icon" className="min-h-12 min-w-12" aria-label="Right" onClick={() => steer('right')}><ArrowRight size={18} /></Button>
            </div>
        </div>
      )}
    </ArcadeShell>
  );
}
