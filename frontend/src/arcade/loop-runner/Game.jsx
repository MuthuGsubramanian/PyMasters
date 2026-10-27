import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowDown, ArrowLeft, ArrowUp, RotateCcw } from 'lucide-react';
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
import { newRun, spawnPair, addGate, step, gateEveryMs, STAGE, GROUND_Y, ROBOT_X, LANE } from './rules.js';
import { draw } from './render.js';

const mirror = (s) => ({ lives: s.lives, alive: s.alive, score: s.score, combo: s.combo, passes: s.passes, lane: s.lane, scene: s.scene,
  gate: s.gates.find((g) => !g.resolved) || null, correct: s.correct, wrong: s.wrong });

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
    if (result) setReveal({ correct, why: result.why }); else setReveal({ correct: false, why: t('arcade.retry_answer', 'Connection hiccup. Answer once more.') });
    setTimeout(() => setReveal(null), 1800);
    pendingInput.current.verdict = { gateId: gateEvt.gateId, correct: result ? correct : true };   // no verdict → no penalty
    if (correct) { sfx('gate'); if (!reducedMotion) burst(particles.current, ROBOT_X, GROUND_Y - 40, { count: 16, color: ['#facc15', '#fff', '#22d3ee'], speed: 220 }); }
    else { sfx('stumble'); try { navigator.vibrate?.(30); } catch { /* unsupported */ } }
    itemRef.current = null;
    if (session.queue.length || session.item) session.take();
  }, [session, reducedMotion, t]);

  const update = useCallback((dt) => {
    const s = stateRef.current;
    if (!s.alive) return;
    stepParticles(particles.current, dt);
    // spawn the next gate when the lane is clear
    const active = s.gates.some((g) => !g.resolved);
    let state = s;
    if (!active && !itemRef.current && deckEmpty.current && s.passes + s.stumbles > 0) { setDone(true); return; }
    if (!active && itemRef.current) {
      spawnIn.current -= dt;
      if (spawnIn.current <= 0) {
        state = addGate(state, spawnPair(itemRef.current, rng));
        askedAt.current = Date.now();
        spawnIn.current = gateEveryMs(state.passes);
      }
    }
    const input = pendingInput.current;
    pendingInput.current = {};
    const r = step(state, dt, input);
    stateRef.current = r.state;
    for (const e of r.events) {
      if (e.type === 'gate' && e.choiceIndex !== null) grade(e);
      if (e.type === 'gate' && e.choiceIndex === null) { sfx('stumble'); itemRef.current = null; if (session.queue.length || session.item) session.take(); }
      if (e.type === 'jump') sfx('jump');
      if (e.type === 'checkpoint') sfx('win');
      if (e.type === 'game_over') { sfx('lose'); setDone(true); }
      if (e.type === 'stumble' && !reducedMotion) burst(particles.current, ROBOT_X, GROUND_Y, { count: 10, color: '#9ca3af', speed: 120, ttl: 400 });
    }
    if (Math.floor(r.state.time / 100) !== Math.floor(s.time / 100)) setHud(mirror(r.state));
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
  }, []);

  const act = useCallback((action) => {
    if (action === 'up' || action === 'jump' || action === 'tap') pendingInput.current.jump = true;
    else if (action === 'down') pendingInput.current.slide = true;
  }, []);
  useInput({ onAction: act, enabled: !done && !paused });

  // Accessible path: pick the gate directly.
  const pickGate = useCallback((which) => {
    const s = stateRef.current;
    const g = s.gates.find((x) => !x.resolved);
    if (!g || grading.current) return;
    const choice = which === 'upper' ? g.upper : g.lower;
    g.resolved = true; g.pending = true;
    grade({ gateId: g.id, itemId: g.itemId, choiceIndex: choice.choiceIndex, lane: which });
  }, [grade]);

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
          <Button onClick={session.start}>{t('play.retry', 'Retry')}</Button>
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
  return (
    <ArcadeShell title="Loop Runner" subtitle={`${hud.passes} gates · ${t('arcade.combo', 'Combo ×{n}', { n: hud.combo })}`} score={hud.score} lives={hud.lives} onQuit={onQuit} paused={paused} onPauseChange={setPaused}
      footer={t('arcade.runner_help', 'Tap, Space or ↑ to jump through the upper gate; swipe down or ↓ to slide through the lower one.')}>
      {() => (
        <div className="flex flex-col gap-3" data-lives={hud.lives} data-lane={hud.lane} data-paused={paused ? '1' : '0'}>
          <Hud item={session.item || (gate ? { prompt: { code: '' } } : null)} reveal={reveal} />
          <div ref={wrapRef} className="w-full flex justify-center">
            <canvas ref={canvasRef} width={STAGE.w} height={STAGE.h} role="img" aria-label={t('arcade.runner_help', 'Tap, Space or ↑ to jump through the upper gate; swipe down or ↓ to slide through the lower one.')}
              className="rounded-2xl border border-border-strong shadow-lg max-w-full touch-none select-none" />
          </div>
          <p data-stage-text className="sr-only" aria-live="polite">{gate ? `Upper gate ${gate.upper.label}, lower gate ${gate.lower.label}.` : 'Running. Waiting for the next gate.'} Lane {hud.lane}.</p>
          {gate && (
            <div role="group" aria-label={t('arcade.choices', 'Answers')} className="grid grid-cols-2 gap-2 sm:hidden">
              <Button variant="outline" data-gate="upper" data-choice={gate.upper.choiceIndex} className="min-h-12" onClick={() => pickGate('upper')}><ArrowUp size={16} /> {gate.upper.label}</Button>
              <Button variant="outline" data-gate="lower" data-choice={gate.lower.choiceIndex} className="min-h-12" onClick={() => pickGate('lower')}><ArrowDown size={16} /> {gate.lower.label}</Button>
            </div>
          )}
          {gate && (
            <div className="sr-only" role="group" aria-label={t('arcade.choices', 'Answers')}>
              <button type="button" data-gate="upper" data-choice={gate.upper.choiceIndex} onClick={() => pickGate('upper')}>{gate.upper.label}</button>
              <button type="button" data-gate="lower" data-choice={gate.lower.choiceIndex} onClick={() => pickGate('lower')}>{gate.lower.label}</button>
            </div>
          )}
        </div>
      )}
    </ArcadeShell>
  );
}

export { LANE };
