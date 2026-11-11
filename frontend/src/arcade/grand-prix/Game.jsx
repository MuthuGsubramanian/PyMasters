import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, RotateCcw } from 'lucide-react';
import { Button } from '../../components/ui';
import { usePlayT } from '../../games/engine/i18n';
import { ArcadeShell } from '../engine/ArcadeShell';
import { Hud } from '../engine/Hud';
import { useArcadeSession } from '../engine/useArcadeSession';
import { useGameLoop } from '../engine/useGameLoop';
import { createPool, burst, step as stepParticles } from '../engine/particles';
import { fitCanvas } from '../engine/sprites';
import { laneOffset } from '../engine/track.js';
import { play as sfx, haptic } from '../engine/sfx';
import { shortcutsBlocked } from '../../games/engine/keys';
import { newRace, step, setFork, applyForkResult, STAGE, LAPS } from './rules.js';
import { draw } from './render.js';

const THINK_MS = 25000;

const mirror = (s, thinkLeft = THINK_MS) => {
  const you = s.karts.find((k) => k.id === 'you');
  return { lap: Math.min(s.laps, you.lap + 1), laps: s.laps, score: s.score, finished: s.finished, positions: s.positions, place: s.place,
    kart: you.boostT > 0 ? 'boost' : you.spinT > 0 ? 'spin' : 'normal', fork: s.fork, correct: s.correct, wrong: s.wrong, bestLap: s.bestLap,
    thinkLeft };
};

/**
 * Big-O Grand Prix: three laps against three karts; at each fork the lanes carry the answers.
 * Right lane → boost, wrong lane → oil. Rules are pure; grading is the server's.
 */
export default function Game({ reducedMotion = false, onQuit, laps = LAPS, rng = Math.random, debugFinish = false }) {
  const t = usePlayT();
  const session = useArcadeSession({ gameId: 'big_o_grand_prix' });
  const stateRef = useRef(newRace({ seed: 1, laps }));
  const thinkLeftRef = useRef(THINK_MS);
  const [hud, setHud] = useState(() => mirror(newRace({ seed: 1, laps }), THINK_MS));
  const [reveal, setReveal] = useState(null);
  const [paused, setPaused] = useState(false);
  const [done, setDone] = useState(false);
  const canvasRef = useRef(null);
  const wrapRef = useRef(null);
  const particles = useRef(createPool(200));
  const keys = useRef({ throttle: false, brake: false, left: false, right: false });
  const confetti = useRef(0);
  const grading = useRef(false);
  const finished = useRef(false);
  const lastForkId = useRef(null);

  // A fork for the next checkpoint whenever the race has none.
  useEffect(() => {
    const s = stateRef.current;
    if (s.finished || session.state !== 'ready') return;
    if (!s.fork && session.item && session.item.id !== lastForkId.current) {
      stateRef.current = setFork(s, session.item, rng);
      lastForkId.current = session.item.id;
      thinkLeftRef.current = THINK_MS;
      setHud(mirror(stateRef.current, thinkLeftRef.current));
    } else if (!session.item && session.queue.length) session.take();
  }, [session.state, session.item, session.queue.length, session, rng, hud.fork]);

  const grade = useCallback(async (evt) => {
    if (grading.current) return;
    grading.current = true;
    const s0 = stateRef.current;
    const ms = Date.now() - (s0.fork?.askedAtWall || Date.now());
    const result = await session.answer(evt.itemId, evt.choiceIndex, ms);
    grading.current = false;
    const correct = result ? Boolean(result.correct) : null;   // no verdict → the fork passes without effect
    const r = applyForkResult(stateRef.current, 'you', correct);
    if (correct === null) { stateRef.current = r.state; setHud(mirror(r.state, thinkLeftRef.current)); if (session.queue.length || session.item) session.take(); return; }
    stateRef.current = r.state;
    const you = r.state.karts[0];
    const p = laneOffset(r.state.track, you.s, you.lane);
    if (correct) { sfx('boost'); if (!reducedMotion) burst(particles.current, p.x, p.y, { count: 18, color: ['#fbbf24', '#fff'], speed: 200 }); }
    else { sfx('squeal'); if (!reducedMotion) burst(particles.current, p.x, p.y, { count: 14, color: '#111827', speed: 90, ttl: 900 }); haptic(40); }
    if (result) { setReveal({ correct, why: result.why }); setTimeout(() => setReveal(null), 2600); }
    setHud(mirror(stateRef.current, thinkLeftRef.current));
    if (session.queue.length || session.item) session.take();
  }, [session, reducedMotion]);

  // Accessible path: the fork lanes as real buttons (resolves the pending fork immediately).
  const chooseLane = useCallback((lane) => {
    const s = stateRef.current;
    if (!s.fork || s.fork.answered || grading.current) return;
    const chosen = s.fork.lanes.find((l) => l.lane === lane);
    if (!chosen) return;
    thinkLeftRef.current = THINK_MS;
    stateRef.current = { ...s, fork: { ...s.fork, answered: true }, karts: s.karts.map((k) => (k.id === 'you' ? { ...k, lane, answered: { ...k.answered, [s.fork.itemId]: true } } : k)) };
    setHud(mirror(stateRef.current, thinkLeftRef.current));
    grade({ itemId: s.fork.itemId, choiceIndex: chosen.choiceIndex, lane });
  }, [grade]);

  const update = useCallback((dt) => {
    const s = stateRef.current;
    if (s.finished) return;
    stepParticles(particles.current, dt);
    confetti.current = Math.max(0, confetti.current - dt / 2500);

    // Tactical Pit-Wall Thinking Mode: when an unanswered fork is active, slow the race to 8%
    // for up to 25 seconds so the player can read the Python function and pick a lane without
    // AI karts zooming past or crossing the checkpoint prematurely.
    const hasActiveFork = Boolean(s.fork && !s.fork.answered && !debugFinish);
    let worldDt = dt;
    if (hasActiveFork) {
      thinkLeftRef.current = Math.max(0, thinkLeftRef.current - dt);
      if (thinkLeftRef.current > 0) {
        worldDt = dt * 0.08;
      }
    }

    const input = {
      throttle: keys.current.throttle || !keys.current.brake,
      brake: keys.current.brake,
      steer: (keys.current.right ? 1 : 0) - (keys.current.left ? 1 : 0),
      rng,
    };
    const r = step(s, worldDt, input);
    stateRef.current = r.state;
    for (const e of r.events) {
      if (e.type === 'fork') grade(e);
      if (e.type === 'lap') sfx('chime');
      if (e.type === 'finish') { sfx('win'); confetti.current = 1; setDone(true); }
      if (e.type === 'ai_fork') sfx(e.correct ? 'gate' : 'squeal');
    }
    if (Math.floor(r.state.time / 120) !== Math.floor(s.time / 120) || r.events.length || hasActiveFork) {
      setHud(mirror(r.state, thinkLeftRef.current));
    }
  }, [grade, rng, debugFinish]);

  const render = useCallback(() => {
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    draw(ctx, { state: stateRef.current, particles: particles.current, reducedMotion, confetti: confetti.current });
  }, [reducedMotion]);

  useGameLoop({ update, draw: render, running: !done && !paused });

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

  useEffect(() => {
    if (done || paused) return undefined;
    const map = { ArrowUp: 'throttle', w: 'throttle', ArrowDown: 'brake', s: 'brake', ArrowLeft: 'left', a: 'left', ArrowRight: 'right', d: 'right' };
    const down = (e) => {
      if (shortcutsBlocked(e)) return;
      if (['1', '2', '3'].includes(e.key)) {
        const s = stateRef.current;
        if (s.fork && !s.fork.answered) {
          e.preventDefault();
          const sorted = [...s.fork.lanes].sort((a, b) => a.lane - b.lane);
          const pick = sorted[Number(e.key) - 1];
          if (pick) chooseLane(pick.lane);
          return;
        }
      }
      const k = map[e.key];
      if (k) { e.preventDefault(); keys.current[k] = true; }
    };
    const up = (e) => { const k = map[e.key]; if (k) keys.current[k] = false; };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); keys.current = { throttle: false, brake: false, left: false, right: false }; };
  }, [done, paused, chooseLane]);

  useEffect(() => {
    if (!done || finished.current) return;
    finished.current = true;
    const s = stateRef.current;
    session.finish(s.score, { place: s.place, bestLap: s.bestLap, laps: s.laps });
  }, [done, session]);

  const restart = () => {
    finished.current = false;
    stateRef.current = newRace({ seed: Date.now() & 0xffff, laps });
    lastForkId.current = null;
    thinkLeftRef.current = THINK_MS;
    setHud(mirror(stateRef.current, THINK_MS));
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
    const place = hud.place || (hud.positions.indexOf('you') + 1) || 1;
    return (
      <div data-end-screen className="max-w-xl mx-auto flex flex-col gap-4 rounded-2xl border border-border-default bg-bg-elevated p-6">
        <h2 className="font-display text-2xl font-bold text-text-primary">{place === 1 ? t('arcade.you_won', 'You won!') : t('arcade.finished_place', 'Finished P{n}', { n: place })}</h2>
        <p className="text-sm text-text-secondary">{hud.bestLap ? `Best lap ${(hud.bestLap / 1000).toFixed(1)} s` : ''}</p>
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

  const fork = hud.fork && !hud.fork.answered ? hud.fork : null;
  const thinkPct = Math.max(0, Math.min(100, ((hud.thinkLeft ?? THINK_MS) / THINK_MS) * 100));
  const thinkSecs = Math.ceil((hud.thinkLeft ?? THINK_MS) / 1000);
  const hold = (k, v) => () => { keys.current[k] = v; };
  return (
    <ArcadeShell title="Big-O Grand Prix" subtitle={`Lap ${hud.lap}/${hud.laps}`} score={hud.score} onQuit={onQuit} paused={paused} onPauseChange={setPaused}
      footer={t('arcade.prix_help', 'Auto-cruise is ON! Read the Python function in the HUD, then click a lane or press 1, 2, or 3 (or ← →) to lock in the Big-O complexity.')}>
      {() => (
        <div className="flex flex-col gap-3" data-lap={hud.lap} data-kart={hud.kart} data-paused={paused ? '1' : '0'}>
          <Hud item={session.item && fork ? session.item : null} reveal={reveal}>
            <div className="flex flex-col gap-1.5 pt-1 border-t border-border-default/60 text-xs font-mono text-text-muted">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <span>Race Position: <strong className="text-text-primary">P{hud.place || (hud.positions.indexOf('you') + 1) || 1}</strong> · Lap {hud.lap}/{hud.laps}</span>
                {fork && (
                  <span className="text-amber-300 font-semibold">
                    ⏱ Pit-Wall Telemetry (Time Slowed): {thinkSecs}s — Press 1, 2, or 3
                  </span>
                )}
                <span>Kart: <strong className={hud.kart === 'boost' ? 'text-amber-400' : hud.kart === 'spin' ? 'text-red-400' : 'text-emerald-400'}>{hud.kart}</strong></span>
              </div>
              {fork && (
                <div className="h-1.5 w-full rounded-full bg-bg-inset overflow-hidden">
                  <div className="h-full rounded-full bg-gradient-to-r from-amber-400 to-emerald-400 transition-all duration-150" style={{ width: `${thinkPct}%` }} />
                </div>
              )}
            </div>
          </Hud>
          {fork && (
            <div role="group" aria-label={t('arcade.choices', 'Answers')} className="grid grid-cols-3 gap-2">
              {[...fork.lanes].sort((a, b) => a.lane - b.lane).map((l, idx) => (
                <button
                  key={l.choiceIndex}
                  type="button"
                  data-lane={l.lane}
                  data-choice={l.choiceIndex}
                  onClick={() => chooseLane(l.lane)}
                  className="min-h-12 rounded-xl border-2 border-amber-400/70 bg-amber-500/10 hover:bg-amber-500/20 px-3 py-2 font-mono text-xs sm:text-sm font-bold text-text-primary flex items-center justify-between gap-1.5 shadow-sm transition-colors"
                >
                  <span className="text-[11px] uppercase tracking-wider text-amber-300">
                    [{idx + 1}] {l.lane < 0 ? '◀ Left' : l.lane > 0 ? '▶ Right' : '● Center'}
                  </span>
                  <span className="truncate">{l.label}</span>
                </button>
              ))}
            </div>
          )}
          <div ref={wrapRef} className="w-full flex justify-center">
            <canvas ref={canvasRef} width={STAGE.w} height={STAGE.h} role="img" aria-label={t('arcade.prix_help', '↑ throttle, ↓ brake, ← → steer. At a fork, drive through the lane with the right answer for a boost; wrong lanes are oil.')}
              className="rounded-2xl border border-border-strong shadow-lg max-w-full touch-none select-none" />
          </div>
          <p data-stage-text className="sr-only" aria-live="polite">{fork ? `Fork ahead. Lanes: ${fork.lanes.map((l) => l.label).join(', ')}.` : 'Driving.'} Lap {hud.lap} of {hud.laps}.</p>
          {debugFinish && <button type="button" className="sr-only" data-debug-finish onClick={() => { const s = stateRef.current; stateRef.current = { ...s, karts: s.karts.map((k) => (k.id === 'you' ? { ...k, s: s.track.length - 4, speed: 300, lap: s.laps - 1, nextCp: 0 } : k)) }; keys.current.throttle = true; }}>debug finish</button>}
          <div className="grid grid-cols-3 gap-1 w-44 mx-auto sm:hidden" aria-label="Drive">
            <span />
            <Button variant="outline" size="icon" className="min-h-12 min-w-12" aria-label="Throttle" onPointerDown={hold('throttle', true)} onPointerUp={hold('throttle', false)} onPointerLeave={hold('throttle', false)}><ArrowUp size={18} /></Button>
            <span />
            <Button variant="outline" size="icon" className="min-h-12 min-w-12" aria-label="Left" onPointerDown={hold('left', true)} onPointerUp={hold('left', false)} onPointerLeave={hold('left', false)}><ArrowLeft size={18} /></Button>
            <Button variant="outline" size="icon" className="min-h-12 min-w-12" aria-label="Brake" onPointerDown={hold('brake', true)} onPointerUp={hold('brake', false)} onPointerLeave={hold('brake', false)}><ArrowDown size={18} /></Button>
            <Button variant="outline" size="icon" className="min-h-12 min-w-12" aria-label="Right" onPointerDown={hold('right', true)} onPointerUp={hold('right', false)} onPointerLeave={hold('right', false)}><ArrowRight size={18} /></Button>
          </div>
        </div>
      )}
    </ArcadeShell>
  );
}
