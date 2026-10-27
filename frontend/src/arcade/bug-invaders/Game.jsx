import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Crosshair, RotateCcw } from 'lucide-react';
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
import { newGame, newWave, step, hitLine, hitFix, STAGE, CANNON_Y } from './rules.js';
import { draw } from './render.js';

const mirror = (s) => ({ shields: s.shields, alive: s.alive, score: s.score, wave: s.wave, phase: s.phase, boss: s.boss, correct: s.correct, wrong: s.wrong,
  lines: s.phase === 'line' ? s.invaders.filter((i) => i.alive).map((i) => ({ lineIndex: i.lineIndex, text: i.text })) : [],
  fixes: s.phase === 'fix' ? s.ships.filter((x) => x.alive).map((x) => ({ fixIndex: x.fixIndex, label: x.label })) : [], item: s.item });

/**
 * Bug Invaders: the program's lines descend; shoot the guilty line, then the fix. One server
 * grade per wave ([line, fix]); shields absorb failed waves.
 */
export default function Game({ reducedMotion = false, onQuit, shields, rng = Math.random }) {
  const t = usePlayT();
  const session = useArcadeSession({ gameId: 'bug_invaders' });
  const stateRef = useRef(newGame({ shields }));
  const [hud, setHud] = useState(() => mirror(newGame({ shields })));
  const [reveal, setReveal] = useState(null);
  const [paused, setPaused] = useState(false);
  const [done, setDone] = useState(false);
  const canvasRef = useRef(null);
  const wrapRef = useRef(null);
  const particles = useRef(createPool(220));
  const keys = useRef({ left: false, right: false, fire: false });
  const pending = useRef({});
  const shake = useRef(0);
  const askedAt = useRef(0);
  const finished = useRef(false);
  const grading = useRef(false);
  const waveIn = useRef(600);
  const deckEmpty = useRef(false);

  useEffect(() => {
    if (session.state !== 'ready') return;
    if (!session.item && session.queue.length) session.take();
    deckEmpty.current = !session.item && !session.queue.length && Boolean(session.exhausted);
  }, [session.state, session.item, session.queue.length, session.exhausted, session, hud.phase]);

  const grade = useCallback(async (answer, itemId) => {
    if (grading.current) return;
    grading.current = true;
    const ms = Date.now() - askedAt.current;
    const result = await session.answer(itemId, answer, ms);
    grading.current = false;
    if (!result) { pending.current.verdict = { score: 3, max: 3 }; return; }   // no verdict → no penalty
    pending.current.verdict = { score: result.score ?? (result.correct ? 3 : 0), max: result.max ?? 3 };
    const lineRight = result.score === 1 || result.score === 3;
    setReveal({ correct: Boolean(result.correct), why: result.correct ? result.why : `${lineRight ? 'Right line, wrong fix.' : 'Wrong line.'} ${result.why || ''}` });
    setTimeout(() => setReveal(null), 3000);
    if (result.correct) sfx('win'); else { sfx('lose'); try { navigator.vibrate?.(40); } catch { /* unsupported */ } }
    if (session.queue.length || session.item) session.take();
  }, [session]);

  const update = useCallback((dt) => {
    const s = stateRef.current;
    if (!s.alive) return;
    stepParticles(particles.current, dt);
    shake.current = Math.max(0, shake.current - dt / 300);
    let state = s;
    if (state.phase === 'idle') {
      if (session.item) {
        waveIn.current -= dt;
        if (waveIn.current <= 0) { state = newWave(state, session.item, rng); askedAt.current = Date.now(); waveIn.current = 900; sfx('chime'); }
      } else if (deckEmpty.current && state.wave + state.wrong > 0) { setDone(true); return; }
    }
    const input = { move: (keys.current.right ? 1 : 0) - (keys.current.left ? 1 : 0), fire: keys.current.fire, ...pending.current };
    pending.current = {};
    keys.current.fire = false;
    const r = step(state, dt, input);
    stateRef.current = r.state;
    for (const e of r.events) {
      if (e.type === 'fire') sfx('pew');
      if (e.type === 'line_hit') { sfx('boom'); if (!reducedMotion) { const inv = s.invaders.find((i) => i.lineIndex === e.lineIndex); burst(particles.current, inv?.x || 0, inv?.y || 0, { count: 22, color: ['#4ade80', '#fff', '#fbbf24'], speed: 240 }); } }
      if (e.type === 'submit') { sfx('boom'); grade(e.answer, e.itemId); }
      if (e.type === 'wave_clear') { shake.current = 0.6; if (!reducedMotion) burst(particles.current, STAGE.w / 2, 200, { count: 40, color: ['#22d3ee', '#4ade80', '#fff'], speed: 320 }); }
      if (e.type === 'wave_fail') { shake.current = 1; sfx('stumble'); }
      if (e.type === 'invaded') sfx('thud');
      if (e.type === 'game_over') { sfx('lose'); setDone(true); }
    }
    if (Math.floor(r.state.time / 120) !== Math.floor(s.time / 120) || r.events.length) setHud(mirror(r.state));
  }, [grade, rng, session, reducedMotion]);

  const render = useCallback(() => {
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    draw(ctx, { state: stateRef.current, particles: particles.current, reducedMotion, shake: shake.current });
  }, [reducedMotion]);

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

  // keyboard: ← → move, Space fires
  useEffect(() => {
    if (done || paused) return undefined;
    const down = (e) => {
      if (shortcutsBlocked(e)) return;
      if (e.key === 'ArrowLeft' || e.key === 'a') { e.preventDefault(); keys.current.left = true; }
      else if (e.key === 'ArrowRight' || e.key === 'd') { e.preventDefault(); keys.current.right = true; }
      else if (e.key === ' ' || e.key === 'ArrowUp') { e.preventDefault(); keys.current.fire = true; }
    };
    const up = (e) => {
      if (e.key === 'ArrowLeft' || e.key === 'a') keys.current.left = false;
      if (e.key === 'ArrowRight' || e.key === 'd') keys.current.right = false;
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); keys.current = { left: false, right: false, fire: false }; };
  }, [done, paused]);

  // pointer: drag moves the cannon, tap fires
  const onPointer = (e) => {
    if (done || paused) return;
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const scale = Number(canvas.dataset.scale || 1);
    const x = (e.clientX - rect.left) / scale;
    stateRef.current = { ...stateRef.current, cannonX: Math.max(30, Math.min(STAGE.w - 30, x)) };
    if (e.type === 'pointerdown') keys.current.fire = true;
  };

  // Accessible path: lines then fixes as real buttons.
  const chooseLine = useCallback((lineIndex) => {
    const r = hitLine(stateRef.current, lineIndex);
    if (!r.events.length) return;
    stateRef.current = r.state; sfx('boom'); setHud(mirror(r.state));
  }, []);
  const chooseFix = useCallback((fixIndex) => {
    const r = hitFix(stateRef.current, fixIndex);
    if (!r.events.length) return;
    stateRef.current = r.state; setHud(mirror(r.state));
    const sub = r.events.find((e) => e.type === 'submit');
    grade(sub.answer, sub.itemId);
  }, [grade]);

  useEffect(() => {
    if (!done || finished.current) return;
    finished.current = true;
    const s = stateRef.current;
    session.finish(s.score, { waves: s.wave, shields: s.shields });
  }, [done, session]);

  const restart = () => {
    finished.current = false;
    stateRef.current = newGame({ shields });
    waveIn.current = 600;
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
        <p className="text-sm text-text-secondary">{hud.wave} waves cleared</p>
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

  const testLine = hud.item?.prompt?.test;
  return (
    <ArcadeShell title="Bug Invaders" subtitle={`${t('arcade.wave', 'Wave {n}', { n: hud.wave + 1 })}${hud.boss ? ' · BOSS' : ''}`} score={hud.score} lives={hud.shields} onQuit={onQuit} paused={paused} onPauseChange={setPaused}
      footer={t('arcade.invaders_help', '← → or drag to move, Space or tap to fire. Shoot the guilty line, then the fix that makes the test pass.')}>
      {() => (
        <div className="flex flex-col gap-3" data-shields={hud.shields} data-wave={hud.wave + 1} data-phase={hud.phase} data-paused={paused ? '1' : '0'}>
          <Hud item={testLine ? { prompt: { code: `# failing test\n${testLine}` } } : null} reveal={reveal} />
          <div ref={wrapRef} className="w-full flex justify-center">
            <canvas ref={canvasRef} width={STAGE.w} height={STAGE.h} role="img" aria-label={t('arcade.invaders_help', '← → or drag to move, Space or tap to fire. Shoot the guilty line, then the fix that makes the test pass.')}
              className="rounded-2xl border border-border-strong shadow-lg max-w-full touch-none select-none"
              onPointerDown={onPointer} onPointerMove={(e) => { if (e.buttons) onPointer(e); }} />
          </div>
          <p data-stage-text className="sr-only" aria-live="polite">
            {hud.phase === 'line' ? `Lines: ${hud.lines.map((l) => `${l.lineIndex + 1}: ${l.text}`).join('; ')}.` : hud.phase === 'fix' ? `Fixes: ${hud.fixes.map((f) => f.label).join('; ')}.` : 'Between waves.'}
          </p>
          {hud.phase === 'line' && (
            <div className="sr-only" role="group" aria-label={t('arcade.lines', 'Program lines')}>
              {hud.lines.map((l) => <button key={l.lineIndex} type="button" data-line={l.lineIndex} onClick={() => chooseLine(l.lineIndex)}>{l.lineIndex + 1}: {l.text}</button>)}
            </div>
          )}
          {hud.phase === 'fix' && (
            <div className="sr-only" role="group" aria-label={t('arcade.choices', 'Answers')}>
              {hud.fixes.map((f) => <button key={f.fixIndex} type="button" data-fix={f.fixIndex} onClick={() => chooseFix(f.fixIndex)}>{f.label}</button>)}
            </div>
          )}
          <div className="grid grid-cols-3 gap-1 w-56 mx-auto sm:hidden" aria-label="Controls">
            <Button variant="outline" size="icon" className="min-h-12 min-w-12" aria-label="Left" onPointerDown={() => { keys.current.left = true; }} onPointerUp={() => { keys.current.left = false; }}><ArrowLeft size={18} /></Button>
            <Button variant="outline" size="icon" className="min-h-12 min-w-12" aria-label="Fire" onClick={() => { keys.current.fire = true; }}><Crosshair size={18} /></Button>
            <Button variant="outline" size="icon" className="min-h-12 min-w-12" aria-label="Right" onPointerDown={() => { keys.current.right = true; }} onPointerUp={() => { keys.current.right = false; }}><ArrowRight size={18} /></Button>
          </div>
        </div>
      )}
    </ArcadeShell>
  );
}

