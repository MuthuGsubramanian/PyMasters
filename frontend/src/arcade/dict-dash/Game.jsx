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
import { play as sfx, haptic } from '../engine/sfx';
import { newGame, setPrompt, step, applyPowerResult } from './rules.js';
import { draw, CELL, fieldSize } from './render.js';

const mirror = (s) => ({ lives: s.lives, alive: s.alive, score: s.score, level: s.level, prompt: s.prompt, powers: s.powers, correct: s.correct, wrong: s.wrong,
  ghosts: s.frightenedT > 0 ? 'frightened' : s.hurriedT > 0 ? 'hurried' : 'normal', pellets: s.pellets.size });

/**
 * Dict Dash: a pellet maze; the four corner power pellets carry the answers. Right → the error
 * ghosts turn blue and edible; wrong → they hurry. Rules are pure; grading is the server's.
 */
export default function Game({ reducedMotion = false, onQuit, lives, rng = Math.random, debugDeath = false }) {
  const t = usePlayT();
  const session = useArcadeSession({ gameId: 'dict_dash' });
  const stateRef = useRef(newGame({ lives }));
  const [hud, setHud] = useState(() => mirror(newGame({ lives })));
  const [reveal, setReveal] = useState(null);
  const [paused, setPaused] = useState(false);
  const [done, setDone] = useState(false);
  const canvasRef = useRef(null);
  const wrapRef = useRef(null);
  const particles = useRef(createPool(160));
  const pendingDir = useRef(null);
  const flash = useRef(0);
  const askedAt = useRef(0);
  const grading = useRef(false);
  const finished = useRef(false);
  const deckEmpty = useRef(false);
  const lastPromptId = useRef(null);

  // Hand the maze a prompt whenever it has none.
  useEffect(() => {
    const s = stateRef.current;
    if (!s.alive || session.state !== 'ready') return;
    if (!s.prompt && session.item && session.item.id !== lastPromptId.current) {
      stateRef.current = setPrompt(s, session.item, rng);
      lastPromptId.current = session.item.id;
      askedAt.current = Date.now();
      setHud(mirror(stateRef.current));
    } else if (!session.item && session.queue.length) session.take();
    deckEmpty.current = !session.item && !session.queue.length && Boolean(session.exhausted);
  }, [session.state, session.item, session.queue.length, session.exhausted, session, rng, hud.prompt]);

  const onPower = useCallback(async (evt) => {
    const s0 = stateRef.current;
    if (!s0.prompt || grading.current) return;
    grading.current = true;
    const ms = Date.now() - askedAt.current;
    const result = await session.answer(s0.prompt.id, evt.choiceIndex, ms);
    grading.current = false;
    if (!result) { stateRef.current = { ...stateRef.current, prompt: null, powers: [] }; setHud(mirror(stateRef.current)); if (session.queue.length || session.item) session.take(); return; }
    const correct = Boolean(result.correct);
    const r = applyPowerResult(stateRef.current, correct);
    stateRef.current = r.state;
    if (correct) { sfx('whoop'); flash.current = 0.6; if (!reducedMotion) burst(particles.current, evt.x * CELL + CELL / 2, evt.y * CELL + CELL / 2, { count: 22, color: ['#fbbf24', '#fff', '#60a5fa'], speed: 220 }); }
    else { sfx('stumble'); haptic(30); }
    setReveal({ correct, why: result.why });
    setTimeout(() => setReveal(null), 2600);
    setHud(mirror(stateRef.current));
    if (session.queue.length || session.item) session.take();
  }, [session, reducedMotion]);

  const update = useCallback((dt) => {
    const s = stateRef.current;
    if (!s.alive) return;
    stepParticles(particles.current, dt);
    flash.current = Math.max(0, flash.current - dt / 400);
    if (!s.prompt && !s.powers.length && deckEmpty.current && s.correct + s.wrong > 0) { setDone(true); return; }
    const input = { dir: pendingDir.current, rng };
    pendingDir.current = null;
    const r = step(s, dt, input);
    stateRef.current = r.state;
    for (const e of r.events) {
      if (e.type === 'pellet' && r.state.pelletsEaten % 3 === 0) sfx('waka');
      if (e.type === 'power') onPower({ ...e, x: s.player.x, y: s.player.y });
      if (e.type === 'ghost_eaten') { sfx('chime'); if (!reducedMotion) burst(particles.current, s.player.x * CELL + CELL / 2, s.player.y * CELL + CELL / 2, { count: 14, color: '#bfdbfe', speed: 160 }); }
      if (e.type === 'death') { sfx('lose'); flash.current = 1; haptic(60); }
      if (e.type === 'level_clear') sfx('win');
      if (e.type === 'game_over') setDone(true);
    }
    if (Math.floor(r.state.time / 120) !== Math.floor(s.time / 120) || r.events.length) setHud(mirror(r.state));
  }, [onPower, rng, reducedMotion]);

  const render = useCallback(() => {
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    draw(ctx, { state: stateRef.current, particles: particles.current, reducedMotion, flash: flash.current });
  }, [reducedMotion]);

  useGameLoop({ update, draw: render, running: !done && hud.alive && !paused });

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
    if (['up', 'down', 'left', 'right'].includes(action)) pendingDir.current = action;
  }, []);
  useInput({ onAction: steer, enabled: !done && !paused, target: wrapRef });

  // Accessible path: the power pellets as real buttons.
  const eatPower = useCallback((p) => {
    const s = stateRef.current;
    if (!s.alive || !s.prompt || grading.current) return;
    stateRef.current = { ...s, powers: [] };
    setHud(mirror(stateRef.current));
    onPower({ choiceIndex: p.choiceIndex, label: p.label, x: p.x, y: p.y });
  }, [onPower]);

  useEffect(() => {
    if (!done || finished.current) return;
    finished.current = true;
    const s = stateRef.current;
    session.finish(s.score, { level: s.level, pellets: s.pelletsEaten });
  }, [done, session]);

  const restart = () => {
    finished.current = false;
    stateRef.current = newGame({ lives });
    lastPromptId.current = null;
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
        <p className="text-sm text-text-secondary">Level {hud.level}</p>
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

  return (
    <ArcadeShell title="Dict Dash" subtitle={`Level ${hud.level} · ${hud.pellets} pellets left`} score={hud.score} lives={hud.lives} onQuit={onQuit} paused={paused} onPauseChange={setPaused}
      footer={t('arcade.dash_help', 'Arrow keys or swipe to steer. Eat the corner pellet with the right answer: ghosts turn blue. The wrong one makes them hurry.')}>
      {() => (
        <div className="flex flex-col gap-3" data-lives={hud.lives} data-ghosts={hud.ghosts} data-paused={paused ? '1' : '0'}>
          <Hud item={hud.prompt} reveal={reveal} />
          <div ref={wrapRef} className="w-full flex justify-center">
            <canvas ref={canvasRef} width={fieldSize(stateRef.current).w} height={fieldSize(stateRef.current).h} role="img"
              aria-label={t('arcade.dash_help', 'Arrow keys or swipe to steer. Eat the corner pellet with the right answer: ghosts turn blue. The wrong one makes them hurry.')}
              className="rounded-2xl border border-border-strong shadow-lg max-w-full touch-none select-none" />
          </div>
          <p data-stage-text className="sr-only" aria-live="polite">{hud.powers.length ? `Power pellets: ${hud.powers.map((p) => p.label).join(', ')}.` : 'Waiting for the next question.'} Ghosts {hud.ghosts}. {hud.pellets} pellets left.</p>
          {hud.powers.length > 0 && (
            <div role="group" aria-label={t('arcade.choices', 'Answers')} className="flex flex-wrap gap-1.5">
              {hud.powers.map((p) => <button key={p.choiceIndex} type="button" data-power={p.choiceIndex} onClick={() => eatPower(p)} className="min-h-10 rounded-lg border border-border-default bg-bg-surface px-2 py-1 font-mono text-xs text-text-primary hover:border-accent-primary">{p.label}</button>)}
            </div>
          )}
          {debugDeath && <button type="button" className="sr-only" data-debug-death onClick={() => { const s = stateRef.current; stateRef.current = { ...s, ghosts: s.ghosts.map((g, i) => (i === 0 ? { ...g, x: s.player.x, y: s.player.y, mode: 'chase', releaseAt: 0 } : g)) }; }}>debug death</button>}
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
