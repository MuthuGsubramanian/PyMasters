import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowDown, ArrowLeft, ArrowUp, Clock, RotateCcw } from 'lucide-react';
import { Button } from '../../components/ui';
import { usePlayT } from '../../games/engine/i18n';
import { shortcutsBlocked } from '../../games/engine/keys';
import { ArcadeShell } from '../engine/ArcadeShell';
import { Hud } from '../engine/Hud';
import { useArcadeSession } from '../engine/useArcadeSession';
import { useGameLoop } from '../engine/useGameLoop';
import { useInput } from '../engine/useInput';
import { createPool, burst, step as stepParticles } from '../engine/particles';
import { fitCanvas } from '../engine/sprites';
import { play as sfx, haptic } from '../engine/sfx';
import { newRun, spawnPair, addGate, step, gateEveryMs, STAGE, GROUND_Y, ROBOT_X, LANE } from './rules.js';
import { draw } from './render.js';

const DECISION_ZONE_X = ROBOT_X + 340;
const HOLD_ZONE_X = ROBOT_X + 120;
const THINK_MS = 25000;

const mirror = (s, thinkLeftMs = THINK_MS) => ({
  lives: s.lives, alive: s.alive, score: s.score, combo: s.combo, passes: s.passes, lane: s.lane, scene: s.scene,
  gate: s.gates.find((g) => !g.resolved) || null, correct: s.correct, wrong: s.wrong, thinkLeftMs,
});

/**
 * Loop Runner: auto-run through the neon city; jump or slide through the gate whose label is the
 * expression's real value. Rules are pure; verdicts come from the server.
 */
export default function Game({ reducedMotion = false, onQuit, lives, rng = Math.random }) {
  const t = usePlayT();
  const session = useArcadeSession({ gameId: 'loop_runner' });
  const stateRef = useRef(newRun({ lives }));
  const [hud, setHud] = useState(() => mirror(newRun({ lives })));
  const [reveal, setReveal] = useState(null);
  const [paused, setPaused] = useState(false);
  const [done, setDone] = useState(false);
  const canvasRef = useRef(null);
  const wrapRef = useRef(null);
  const particles = useRef(createPool(200));
  const pendingInput = useRef({});
  const spawnIn = useRef(0);
  const askedAt = useRef(0);
  const grading = useRef(false);
  const finished = useRef(false);
  const itemRef = useRef(null);
  const deckEmpty = useRef(false);
  const thinkLeftRef = useRef(THINK_MS);

  // Keep the next item to spawn at hand; note when the deck is empty (the loop ends the run).
  useEffect(() => {
    const s = stateRef.current;
    if (!s.alive || session.state !== 'ready') return;
    if (session.item) { itemRef.current = session.item; deckEmpty.current = false; }
    else if (session.queue.length) session.take();
    else deckEmpty.current = Boolean(session.exhausted);
  }, [session.state, session.item, session.queue.length, session.exhausted, session, hud.gate]);

  const grade = useCallback(async (gateEvt) => {
    if (grading.current) return;
    grading.current = true;
    const ms = Date.now() - askedAt.current;
    const result = await session.answer(gateEvt.itemId, gateEvt.choiceIndex, ms);
    grading.current = false;
    const correct = Boolean(result?.correct);
    if (result) { setReveal({ correct, why: result.why }); setTimeout(() => setReveal(null), 2400); }
    pendingInput.current.verdict = { gateId: gateEvt.gateId, correct: result ? correct : null };   // no verdict → neutral
    if (correct) { sfx('gate'); if (!reducedMotion) burst(particles.current, ROBOT_X, GROUND_Y - 40, { count: 16, color: ['#facc15', '#fff', '#22d3ee'], speed: 220 }); }
    else if (result) { sfx('stumble'); haptic(30); }
    itemRef.current = null;
    thinkLeftRef.current = THINK_MS;
    if (session.queue.length || session.item) session.take();
  }, [session, reducedMotion]);

  // Lock in a gate choice immediately (via ↑/↓, keys 1/2, swipe, or buttons) so the learner
  // never misses a gate due to jump duration expiring early.
  const pickGate = useCallback((which) => {
    const s = stateRef.current;
    const g = s.gates.find((x) => !x.resolved);
    if (!g || grading.current) return;
    const choice = which === 'upper' ? g.upper : g.lower;
    const targetLane = which === 'upper' ? LANE.UPPER : LANE.LOWER;
    sfx(which === 'upper' ? 'jump' : 'gate');
    stateRef.current = {
      ...s,
      lane: targetLane,
      laneT: 900,
      gates: s.gates.map((x) => (x.id === g.id ? { ...x, x: Math.min(x.x, ROBOT_X - 4), resolved: true, pending: true } : x)),
    };
    setHud(mirror(stateRef.current, thinkLeftRef.current));
    grade({ gateId: g.id, itemId: g.itemId, choiceIndex: choice.choiceIndex, lane: which });
  }, [grade]);

  const update = useCallback((dt) => {
    const s = stateRef.current;
    if (!s.alive) return;
    stepParticles(particles.current, dt);
    // spawn the next gate when the lane is clear
    const activeGate = s.gates.find((g) => !g.resolved);
    let state = s;
    if (!activeGate && !itemRef.current && deckEmpty.current && s.passes + s.stumbles > 0) { setDone(true); return; }
    if (!activeGate && itemRef.current) {
      spawnIn.current -= dt;
      if (spawnIn.current <= 0) {
        state = addGate(state, spawnPair(itemRef.current, rng));
        askedAt.current = Date.now();
        thinkLeftRef.current = THINK_MS;
        spawnIn.current = gateEveryMs(state.passes);
      }
    }
    const input = pendingInput.current;
    pendingInput.current = {};

    // Bullet-Time / Thinking Zone: once an unresolved gate enters DECISION_ZONE_X, slow world
    // scroll dramatically and hold at HOLD_ZONE_X for up to THINK_MS (25s) so the learner has
    // plenty of time to read the Python snippet and pick Upper (↑) or Lower (↓).
    const gateNow = state.gates.find((g) => !g.resolved);
    let worldDt = dt;
    if (gateNow && !input.verdict) {
      if (gateNow.x <= DECISION_ZONE_X) {
        thinkLeftRef.current = Math.max(0, thinkLeftRef.current - dt);
        if (thinkLeftRef.current > 0) {
          worldDt = gateNow.x <= HOLD_ZONE_X ? 0 : dt * 0.12;
        }
      }
    }

    const r = step(state, worldDt, input);
    stateRef.current = r.state;
    for (const e of r.events) {
      if (e.type === 'gate' && e.choiceIndex !== null) grade(e);
      if (e.type === 'gate' && e.choiceIndex === null) { sfx('stumble'); itemRef.current = null; thinkLeftRef.current = THINK_MS; if (session.queue.length || session.item) session.take(); }
      if (e.type === 'jump') sfx('jump');
      if (e.type === 'checkpoint') sfx('win');
      if (e.type === 'game_over') { sfx('lose'); setDone(true); }
      if (e.type === 'stumble' && !reducedMotion) burst(particles.current, ROBOT_X, GROUND_Y, { count: 10, color: '#9ca3af', speed: 120, ttl: 400 });
    }
    if (Math.floor(r.state.time / 100) !== Math.floor(s.time / 100) || worldDt === 0 || r.events.length) {
      setHud(mirror(r.state, thinkLeftRef.current));
    }
  }, [grade, rng, session, reducedMotion]);

  const render = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!ctx) return;
    draw(ctx, { state: stateRef.current, particles: particles.current, reducedMotion });
  }, [reducedMotion]);

  useGameLoop({ update, draw: render, running: !done && hud.alive && !paused });

  useEffect(() => {
    const canvas = canvasRef.current, wrap = wrapRef.current;
    if (!canvas || !wrap) return undefined;
    const resize = () => {
      const width = Math.min(STAGE.w, wrap.clientWidth || STAGE.w);
      const ctx = fitCanvas(canvas, width, (width * STAGE.h) / STAGE.w);
      ctx.scale(width / STAGE.w, width / STAGE.w);
    };
    resize();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null;
    ro?.observe(wrap);
    return () => ro?.disconnect();
  }, [done]);

  const act = useCallback((action) => {
    const hasGate = stateRef.current.gates.some((g) => !g.resolved);
    if (action === 'up' || action === 'jump' || action === 'tap') {
      if (hasGate) pickGate('upper');
      else pendingInput.current.jump = true;
    } else if (action === 'down') {
      if (hasGate) pickGate('lower');
      else pendingInput.current.slide = true;
    }
  }, [pickGate]);
  useInput({ onAction: act, enabled: !done && !paused, target: wrapRef });

  // Also allow number keys 1 (upper) and 2 (lower) to pick the gate directly.
  useEffect(() => {
    if (done || paused) return undefined;
    const onKey = (e) => {
      if (shortcutsBlocked(e)) return;
      if (e.key === '1') { e.preventDefault(); pickGate('upper'); }
      else if (e.key === '2') { e.preventDefault(); pickGate('lower'); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [done, paused, pickGate]);

  useEffect(() => {
    if (!done || finished.current) return;
    finished.current = true;
    const s = stateRef.current;
    session.finish(s.score, { passes: s.passes, distance: Math.floor(s.distance), scene: s.scene });
  }, [done, session]);

  const restart = () => {
    finished.current = false;
    stateRef.current = newRun({ lives });
    itemRef.current = null;
    spawnIn.current = 0;
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
        <p className="text-sm text-text-secondary">{hud.passes} gates · scene {hud.scene + 1}</p>
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

  const gate = hud.gate;
  const thinkSec = Math.ceil((hud.thinkLeftMs ?? THINK_MS) / 1000);
  const thinkPct = Math.max(0, Math.min(100, ((hud.thinkLeftMs ?? THINK_MS) / THINK_MS) * 100));
  return (
    <ArcadeShell title="Loop Runner" subtitle={`${hud.passes} gates · ${t('arcade.combo', 'Combo ×{n}', { n: hud.combo })}`} score={hud.score} lives={hud.lives} onQuit={onQuit} paused={paused} onPauseChange={setPaused}
      footer={t('arcade.runner_help', 'Gates slow down in the Thinking Zone so you can read the code. Press ↑ / Space / 1 for Upper Gate, or ↓ / 2 for Lower Gate.')}>
      {() => (
        <div className="flex flex-col gap-3" data-lives={hud.lives} data-lane={hud.lane} data-paused={paused ? '1' : '0'}>
          <Hud item={session.item || (gate ? { prompt: { code: '' } } : null)} reveal={reveal}>
            <div className="flex flex-col gap-1.5 pt-1 border-t border-border-default/60 text-xs text-text-muted font-mono">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <span>for gate_idx in range({hud.passes}, ∞):</span>
                <span className="flex items-center gap-2">
                  {gate && (
                    <span className="inline-flex items-center gap-1 text-amber-400 font-semibold">
                      <Clock size={12} aria-hidden="true" /> Thinking Time: {thinkSec}s
                    </span>
                  )}
                  <span>Lane: <strong className="text-accent-primary uppercase">{hud.lane}</strong> · Combo ×{hud.combo}</span>
                </span>
              </div>
              {gate && (
                <div className="h-1.5 rounded-full bg-bg-inset overflow-hidden" aria-hidden="true">
                  <div className="h-full bg-amber-400 transition-all duration-150" style={{ width: `${thinkPct}%` }} />
                </div>
              )}
            </div>
          </Hud>
          {gate && (
            <div role="group" aria-label={t('arcade.choices', 'Answers')} className="grid grid-cols-2 gap-2.5">
              <Button variant="outline" data-gate="upper" data-choice={gate.upper.choiceIndex} className="min-h-12 font-mono text-sm border-2 border-cyan-500/40 hover:border-cyan-400" onClick={() => pickGate('upper')}>
                <ArrowUp size={16} className="text-cyan-400" /> [↑ / 1] Upper: {gate.upper.label}
              </Button>
              <Button variant="outline" data-gate="lower" data-choice={gate.lower.choiceIndex} className="min-h-12 font-mono text-sm border-2 border-amber-500/40 hover:border-amber-400" onClick={() => pickGate('lower')}>
                <ArrowDown size={16} className="text-amber-400" /> [↓ / 2] Lower: {gate.lower.label}
              </Button>
            </div>
          )}
          <div ref={wrapRef} className="w-full flex justify-center">
            <canvas ref={canvasRef} width={STAGE.w} height={STAGE.h} role="img" aria-label={t('arcade.runner_help', 'Tap, Space or ↑ to jump through the upper gate; swipe down or ↓ to slide through the lower one.')}
              className="rounded-2xl border border-border-strong shadow-lg max-w-full touch-none select-none" />
          </div>
          <p data-stage-text className="sr-only" aria-live="polite">{gate ? `Upper gate ${gate.upper.label}, lower gate ${gate.lower.label}.` : 'Running. Waiting for the next gate.'} Lane {hud.lane}.</p>
        </div>
      )}
    </ArcadeShell>
  );
}

