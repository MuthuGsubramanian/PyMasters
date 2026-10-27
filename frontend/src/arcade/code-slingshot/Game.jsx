import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, RotateCcw } from 'lucide-react';
import { Button } from '../../components/ui';
import { usePlayT } from '../../games/engine/i18n';
import { ArcadeShell } from '../engine/ArcadeShell';
import { Hud } from '../engine/Hud';
import { useArcadeSession } from '../engine/useArcadeSession';
import { useGameLoop } from '../engine/useGameLoop';
import { createPool, burst, step as stepParticles } from '../engine/particles';
import { fitCanvas } from '../engine/sprites';
import { play as sfx } from '../engine/sfx';
import { shortcutsBlocked } from '../../games/engine/keys';
import { launch, stepWorld, STAGE } from './physics.js';
import { newRound, newQuestion, applyHitResult, onBirdSpent, noteShot } from './rules.js';
import { draw, SLING, MAX_PULL } from './render.js';

const CHARGE_MS = 1200;
const mirror = (s) => ({ lives: s.lives, birdsLeft: s.birdsLeft, score: s.score, combo: s.combo, question: s.question, alive: s.alive,
  pigs: s.world.pigs.filter((p) => p.alive).map((p) => ({ id: p.id, label: p.label, locked: p.locked, choiceIndex: p.choiceIndex })), scene: s.scene, correct: s.correct, wrong: s.wrong });

/**
 * Code Slingshot: pigs hold the answers; pull back, aim and knock out the one that matches the
 * expression. Physics and rules are pure modules; grading is the server's.
 */
export default function Game({ reducedMotion = false, onQuit, lives, birdsPerQuestion, rng = Math.random }) {
  const t = usePlayT();
  const session = useArcadeSession({ gameId: 'code_slingshot' });
  const stateRef = useRef(newRound({ lives, birds: birdsPerQuestion }));
  const [hud, setHud] = useState(() => mirror(newRound({ lives, birds: birdsPerQuestion })));
  const [reveal, setReveal] = useState(null);
  const [aim, setAim] = useState({ angle: 35, power: 0 });          // keyboard aim
  const dragRef = useRef(null);                                     // pointer pull vector
  const chargeRef = useRef(null);                                   // keyboard charge start
  const flyingRef = useRef(false);
  const [flying, setFlying] = useState(false);
  const canvasRef = useRef(null);
  const wrapRef = useRef(null);
  const particles = useRef(createPool(220));
  const shake = useRef(0);
  const flash = useRef(0);
  const askedAt = useRef(0);
  const finished = useRef(false);
  const [done, setDone] = useState(false);
  const [paused, setPaused] = useState(false);
  const hitPending = useRef(false);

  // New question → towers with pigs.
  useEffect(() => {
    const s = stateRef.current;
    if (!s.alive || s.question || session.state !== 'ready') return;
    if (session.item && session.item.id !== s.lastQuestionId) {
      stateRef.current = { ...newQuestion(s, session.item, rng), lastQuestionId: session.item.id };
      askedAt.current = Date.now();
      setHud(mirror(stateRef.current));
    } else if (!session.item && session.queue.length) {
      session.take();
    } else if (!session.item && !session.queue.length && session.exhausted && s.lastQuestionId) {
      setDone(true);                       // deck empty: end the run with what was scored
    }
  }, [session.state, session.item, session.queue.length, session.exhausted, session, rng, hud.question]);

  const fire = useCallback((pull) => {
    const s = stateRef.current;
    if (!s.alive || flyingRef.current || s.birdsLeft <= 0) return;
    launch(s.world, { x: SLING.x, y: SLING.y }, pull);
    stateRef.current = noteShot(s);
    flyingRef.current = true;
    setFlying(true);
    sfx('whoosh');
  }, []);

  const onPigHit = useCallback(async (evt) => {
    const s0 = stateRef.current;
    if (!s0.question || evt.locked) { if (evt.locked) sfx('raspberry'); hitPending.current = false; return; }
    const ms = Date.now() - askedAt.current;
    // The server grades the first hit of a question; later hits on the same question are judged
    // locally against the stored answer (no extra XP), so one wrong pig never dooms the question.
    const known = s0.knownAnswer && s0.knownAnswer.id === s0.question.id ? s0.knownAnswer : null;
    let result;
    if (known) {
      result = { ...known.reveal, correct: Number(evt.choiceIndex) === Number(known.reveal.answer) };
    } else {
      result = await session.answer(s0.question.id, evt.choiceIndex, ms);
      if (result && result.answer !== undefined && result.answer !== null) {
        stateRef.current = { ...stateRef.current, knownAnswer: { id: s0.question.id, reveal: result } };
      }
    }
    if (!result) {                       // no verdict (network): the pig shrugs it off
      const pig = stateRef.current.world.pigs.find((p) => p.id === evt.id);
      if (pig) pig.hit = false;
      hitPending.current = false;
      return;
    }
    const correct = Boolean(result.correct);
    const r = applyHitResult(stateRef.current, evt.id, correct);
    stateRef.current = r.state;
    const pig = r.state.world.pigs.find((p) => p.id === evt.id);
    if (correct) {
      sfx('pop'); shake.current = 1;
      if (pig && !reducedMotion) burst(particles.current, pig.x, pig.y, { count: 26, color: ['#a3e635', '#fef08a', '#fff'], speed: 260 });
      if (r.events.some((e) => e.type === 'scene_change')) sfx('win');
    } else { sfx('raspberry'); flash.current = 0.6; }
    setReveal({ correct, why: result.why });
    setTimeout(() => setReveal(null), 2400);
    setHud(mirror(stateRef.current));
    hitPending.current = false;
    if (correct && (session.queue.length || session.item)) session.take();
  }, [session, reducedMotion]);

  // Accessible path: each live pig as a real button.
  const hitChoice = useCallback((p) => {
    const s = stateRef.current;
    if (!s.alive || !s.question || hitPending.current) return;
    hitPending.current = true;
    onPigHit({ id: p.id, choiceIndex: p.choiceIndex, label: p.label, locked: p.locked });
  }, [onPigHit]);

  const birdDone = useCallback((poppedThisFlight) => {
    flyingRef.current = false;
    setFlying(false);
    const s = stateRef.current;
    s.world.bird = null;
    if (poppedThisFlight) return;
    const r = onBirdSpent(s);
    stateRef.current = r.state;
    if (r.events.some((e) => e.type === 'out_of_birds')) { sfx('lose'); flash.current = 0.8; }
    if (r.events.some((e) => e.type === 'game_over')) setDone(true);
    setHud(mirror(stateRef.current));
  }, []);

  const update = useCallback((dt) => {
    const s = stateRef.current;
    stepParticles(particles.current, dt);
    shake.current = Math.max(0, shake.current - dt / 350);
    flash.current = Math.max(0, flash.current - dt / 500);
    if (!s.alive) return;
    const events = stepWorld(s.world, dt);
    let popped = false;
    for (const e of events) {
      if (e.type === 'crate') { sfx('thud'); shake.current = Math.max(shake.current, 0.5); if (!reducedMotion) burst(particles.current, s.world.bird?.x || 0, s.world.bird?.y || 0, { count: 8, color: '#d6a15a', speed: 140, ttl: 400 }); }
      if (e.type === 'pig') { if (!e.locked) hitPending.current = true; onPigHit(e); popped = !e.locked; }
    }
    const b = s.world.bird;
    if (b && !b.flying) {
      // settle a moment so the player sees where it landed
      if (!b.settleAt) b.settleAt = performance.now() + 500;
      else if (performance.now() >= b.settleAt && !hitPending.current) birdDone(popped || Boolean(b.hitPig && !s.world.pigs.find((p) => p.id === b.hitPig)?.alive));
    }
  }, [onPigHit, birdDone, reducedMotion]);

  const render = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const charging = chargeRef.current !== null;
    const liveAim = dragRef.current || (charging ? { ...pullVectorFromAim(aim, Math.min(1, (performance.now() - chargeRef.current) / CHARGE_MS)) } : pullVectorFromAim(aim, Math.max(0.15, aim.power)));
    draw(ctx, { state: stateRef.current, aim: flyingRef.current ? null : liveAim, particles: particles.current, shake: shake.current, reducedMotion, flash: flash.current });
  }, [aim, reducedMotion]);

  useGameLoop({ update, draw: render, running: !done && hud.alive && !paused });

  useEffect(() => {
    const canvas = canvasRef.current, wrap = wrapRef.current;
    if (!canvas || !wrap) return undefined;
    const resize = () => {
      const width = Math.min(STAGE.w, wrap.clientWidth || STAGE.w);
      const ctx = fitCanvas(canvas, width, (width * STAGE.h) / STAGE.w);
      ctx.scale(width / STAGE.w, width / STAGE.w);
      canvas.dataset.scale = String(width / STAGE.w);
    };
    resize();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null;
    ro?.observe(wrap);
    return () => ro?.disconnect();
  }, []);

  // Keyboard: arrows aim, hold space to charge, release to fire.
  useEffect(() => {
    if (done || paused) return undefined;
    const onDown = (e) => {
      if (shortcutsBlocked(e)) return;
      if (e.key === 'ArrowUp') { e.preventDefault(); setAim((a) => ({ ...a, angle: Math.min(80, a.angle + 3) })); }
      else if (e.key === 'ArrowDown') { e.preventDefault(); setAim((a) => ({ ...a, angle: Math.max(5, a.angle - 3) })); }
      else if (e.key === ' ' && chargeRef.current === null && !flyingRef.current) { e.preventDefault(); chargeRef.current = performance.now(); sfx('stretch'); }
    };
    const onUp = (e) => {
      if (e.key !== ' ' || chargeRef.current === null) return;
      const power = Math.min(1, (performance.now() - chargeRef.current) / CHARGE_MS);
      chargeRef.current = null;
      setAim((a) => ({ ...a, power }));
      fire(pullVectorFromAim(aim, Math.max(0.15, power)));
    };
    window.addEventListener('keydown', onDown);
    window.addEventListener('keyup', onUp);
    return () => { window.removeEventListener('keydown', onDown); window.removeEventListener('keyup', onUp); };
  }, [aim, done, fire, paused]);

  // Pointer: drag the bird back, release to fire.
  const toStage = (e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const scale = Number(canvas.dataset.scale || 1);
    return { x: (e.clientX - rect.left) / scale, y: (e.clientY - rect.top) / scale };
  };
  const onPointerDown = (e) => {
    if (done || paused || flyingRef.current) return;
    const p = toStage(e);
    if (Math.hypot(p.x - SLING.x, p.y - SLING.y) > 70) return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    dragRef.current = { x: 0, y: 0 };
    sfx('stretch');
  };
  const onPointerMove = (e) => {
    if (!dragRef.current) return;
    const p = toStage(e);
    let dx = p.x - SLING.x, dy = p.y - SLING.y;
    const len = Math.hypot(dx, dy);
    if (len > MAX_PULL) { dx = (dx / len) * MAX_PULL; dy = (dy / len) * MAX_PULL; }
    dragRef.current = { x: dx, y: dy };
  };
  const onPointerUp = () => {
    if (!dragRef.current) return;
    const pull = dragRef.current;
    dragRef.current = null;
    if (Math.hypot(pull.x, pull.y) < 12) return;
    fire(pull);
  };

  useEffect(() => {
    if (!done || finished.current) return;
    finished.current = true;
    const s = stateRef.current;
    session.finish(s.score, { questions: s.questionsDone, scene: s.scene });
  }, [done, session]);

  const restart = () => {
    finished.current = false;
    stateRef.current = newRound({ lives, birds: birdsPerQuestion });
    flyingRef.current = false;
    setFlying(false);
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

  const pigsText = hud.pigs.map((p) => `${p.label}${p.locked ? ' (locked)' : ''}`).join(', ');
  return (
    <ArcadeShell title="Code Slingshot" subtitle={`${t('arcade.birds', '{n} birds left', { n: hud.birdsLeft })} · ${t('arcade.combo', 'Combo ×{n}', { n: hud.combo })}`} score={hud.score} lives={hud.lives} onQuit={onQuit} paused={paused} onPauseChange={setPaused}
      footer={t('arcade.aim', 'Drag the bird back and release. Arrow keys aim, hold Space for power.')}>
      {() => (
        <div className="flex flex-col gap-3" data-birds={hud.birdsLeft} data-angle={aim.angle} data-flying={flying ? '1' : '0'} data-paused={paused ? '1' : '0'}>
          <Hud item={hud.question} reveal={reveal} />
          <div ref={wrapRef} className="w-full flex justify-center">
            <canvas ref={canvasRef} width={STAGE.w} height={STAGE.h} role="img" aria-label={t('arcade.aim', 'Drag the bird back and release. Arrow keys aim, hold Space for power.')}
              className="rounded-2xl border border-border-strong shadow-lg max-w-full touch-none select-none"
              onPointerDown={paused ? undefined : onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp} />
          </div>
          <p data-stage-text className="sr-only" aria-live="polite">{pigsText ? `Pigs: ${pigsText}.` : 'Waiting for the next question.'} Angle {aim.angle} degrees.</p>
          {hud.pigs.length > 0 && (
            <div className="sr-only" role="group" aria-label={t('arcade.choices', 'Answers')}>
              {hud.pigs.map((p) => <button key={p.id} type="button" data-hit={p.choiceIndex} onClick={() => hitChoice(p)}>{p.label}</button>)}
            </div>
          )}
        </div>
      )}
    </ArcadeShell>
  );
}

function pullVectorFromAim(aim, power) {
  const a = (aim.angle * Math.PI) / 180;
  const len = MAX_PULL * power;
  return { x: -Math.cos(a) * len, y: Math.sin(a) * len };
}
