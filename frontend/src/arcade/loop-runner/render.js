// Canvas renderer for Loop Runner: three-layer parallax neon city, a courier robot with wheel spin
// and squash, gate pairs with labels, dust, speed lines, stumble shake.
import { roundedRect, label as drawLabel, clamp } from '../engine/sprites.js';
import { draw as drawParticles } from '../engine/particles.js';
import { STAGE, GROUND_Y, ROBOT_X, LANE } from './rules.js';

const SCENES = [
  { sky: ['#0f172a', '#312e81', '#db2777'], far: '#1e1b4b', mid: '#312e81', near: '#4c1d95', neon: '#22d3ee', ground: '#111827' },
  { sky: ['#082f49', '#0369a1', '#fbbf24'], far: '#0c4a6e', mid: '#075985', near: '#0e7490', neon: '#f472b6', ground: '#0f172a' },
  { sky: ['#1a0b2e', '#6d28d9', '#f97316'], far: '#2e1065', mid: '#4c1d95', near: '#6b21a8', neon: '#a3e635', ground: '#1f1033' },
  { sky: ['#020617', '#0f172a', '#334155'], far: '#0f172a', mid: '#1e293b', near: '#334155', neon: '#facc15', ground: '#020617' },
];

const _skyCache = new Map();
function skyGradient(ctx, scene, h) {
  let byCtx = _skyCache.get(ctx);
  if (!byCtx) { byCtx = new Map(); _skyCache.set(ctx, byCtx); }
  const key = `${scene.sky.join('|')}:${h}`;
  let g = byCtx.get(key);
  if (!g) {
    g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, scene.sky[0]); g.addColorStop(0.6, scene.sky[1]); g.addColorStop(1, scene.sky[2]);
    byCtx.set(key, g);
  }
  return g;
}

function skyline(ctx, color, offset, baseY, heightScale, w, seed) {
  ctx.fillStyle = color;
  let x = -((offset) % 160) - 160;
  let i = Math.floor(offset / 160);
  while (x < w + 160) {
    const h = 60 + ((i * 7919 + seed) % 120) * heightScale;
    const bw = 60 + ((i * 104729) % 70);
    ctx.fillRect(x, baseY - h, bw, h);
    x += bw + 18;
    i++;
  }
}

function windows(ctx, neon, offset, baseY, w) {
  ctx.fillStyle = neon;
  ctx.globalAlpha = 0.35;
  let x = -((offset) % 160) - 160;
  let i = 0;
  while (x < w + 160) {
    for (let r = 0; r < 5; r++) if ((i * 31 + r * 17) % 3 === 0) ctx.fillRect(x + 12 + (r % 2) * 16, baseY - 30 - r * 22, 6, 9);
    x += 78 + (i % 3) * 20; i++;
  }
  ctx.globalAlpha = 1;
}

function robot(ctx, x, y, { lane, t, stumbling, reducedMotion }) {
  ctx.save();
  ctx.translate(x, y);
  const slide = lane === LANE.LOWER;
  const air = lane === LANE.UPPER;
  const sq = slide ? { sx: 1.25, sy: 0.6 } : air ? { sx: 0.9, sy: 1.12 } : { sx: 1, sy: 1 };
  if (stumbling && !reducedMotion) ctx.rotate(Math.sin(t / 40) * 0.25);
  ctx.scale(sq.sx, sq.sy);
  // wheel
  ctx.fillStyle = '#1f2937';
  ctx.beginPath(); ctx.arc(0, 0, 14, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#9ca3af'; ctx.lineWidth = 3;
  const spin = reducedMotion ? 0 : t / 60;
  for (let k = 0; k < 3; k++) { const a = spin + (k * Math.PI * 2) / 3; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a) * 11, Math.sin(a) * 11); ctx.stroke(); }
  // body
  ctx.fillStyle = '#e5e7eb';
  roundedRect(ctx, -16, -52, 32, 40, 8); ctx.fill();
  ctx.fillStyle = '#22d3ee';
  roundedRect(ctx, -10, -46, 20, 12, 4); ctx.fill();          // visor
  ctx.fillStyle = '#111827';
  ctx.beginPath(); ctx.arc(-3, -40, 2.2, 0, Math.PI * 2); ctx.arc(4, -40, 2.2, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#f59e0b';
  roundedRect(ctx, -12, -30, 24, 10, 3); ctx.fill();          // courier bag strap
  ctx.strokeStyle = '#e5e7eb'; ctx.lineWidth = 4; ctx.lineCap = 'round';
  const armSwing = reducedMotion ? 0 : Math.sin(t / 90) * 10;
  ctx.beginPath(); ctx.moveTo(-14, -34); ctx.lineTo(-24, -20 + armSwing); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(14, -34); ctx.lineTo(24, -20 - armSwing); ctx.stroke();
  // antenna
  ctx.strokeStyle = '#9ca3af'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(0, -52); ctx.lineTo(0, -62); ctx.stroke();
  ctx.fillStyle = '#f472b6'; ctx.beginPath(); ctx.arc(0, -64, 3, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

function gate(ctx, g, neon) {
  const x = g.x;
  const top = GROUND_Y - 150, mid = GROUND_Y - 62;
  const col = g.resolved ? (g.outcome === 'pass' ? '#4ade80' : '#f87171') : neon;
  ctx.save();
  ctx.strokeStyle = col; ctx.lineWidth = 6; ctx.lineCap = 'round';
  ctx.shadowColor = col; ctx.shadowBlur = 14;
  // posts
  ctx.beginPath(); ctx.moveTo(x, top - 10); ctx.lineTo(x, GROUND_Y); ctx.stroke();
  // divider bar between upper and lower gate (ground lane crashes into it)
  ctx.lineWidth = 10;
  ctx.beginPath(); ctx.moveTo(x - 26, mid); ctx.lineTo(x + 26, mid); ctx.stroke();
  ctx.restore();
  // labels
  ctx.save();
  ctx.fillStyle = 'rgba(2, 6, 23, 0.8)';
  roundedRect(ctx, x - 44, top + 10, 88, 34, 8); ctx.fill();
  roundedRect(ctx, x - 44, mid + 12, 88, 34, 8); ctx.fill();
  ctx.restore();
  drawLabel(ctx, g.upper.label.length > 9 ? g.upper.label.slice(0, 8) + '…' : g.upper.label, x, top + 27, { font: '700 14px JetBrains Mono, monospace', color: '#fff' });
  drawLabel(ctx, g.lower.label.length > 9 ? g.lower.label.slice(0, 8) + '…' : g.lower.label, x, mid + 29, { font: '700 14px JetBrains Mono, monospace', color: '#fff' });
  drawLabel(ctx, '▲ jump', x, top - 4, { font: '600 10px Inter, sans-serif', color: 'rgba(255,255,255,0.7)', outline: 'rgba(0,0,0,0.4)' });
  drawLabel(ctx, '▼ slide', x, GROUND_Y - 10, { font: '600 10px Inter, sans-serif', color: 'rgba(255,255,255,0.7)', outline: 'rgba(0,0,0,0.4)' });
}

export function draw(ctx, { state, particles, reducedMotion = false }) {
  const w = STAGE.w, h = STAGE.h;
  const scene = SCENES[state.scene % SCENES.length];
  ctx.save();
  if (state.stumbleT > 0 && !reducedMotion) ctx.translate((Math.random() - 0.5) * 6, (Math.random() - 0.5) * 6);
  ctx.fillStyle = skyGradient(ctx, scene, h); ctx.fillRect(0, 0, w, h);
  skyline(ctx, scene.far, state.distance * 0.15, GROUND_Y - 40, 0.6, w, 3);
  skyline(ctx, scene.mid, state.distance * 0.35, GROUND_Y - 10, 0.9, w, 11);
  windows(ctx, scene.neon, state.distance * 0.35, GROUND_Y - 10, w);
  skyline(ctx, scene.near, state.distance * 0.6, GROUND_Y + 2, 0.5, w, 29);
  // ground
  ctx.fillStyle = scene.ground; ctx.fillRect(0, GROUND_Y, w, h - GROUND_Y);
  ctx.strokeStyle = scene.neon; ctx.lineWidth = 2; ctx.globalAlpha = 0.8;
  ctx.beginPath(); ctx.moveTo(0, GROUND_Y + 1); ctx.lineTo(w, GROUND_Y + 1); ctx.stroke();
  ctx.globalAlpha = 0.35;
  for (let x = -((state.distance * 1) % 80); x < w; x += 80) { ctx.beginPath(); ctx.moveTo(x, GROUND_Y + 20); ctx.lineTo(x + 40, GROUND_Y + 20); ctx.stroke(); }
  ctx.globalAlpha = 1;
  // speed lines when boosting
  if (state.boostT > 0 && !reducedMotion) {
    ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 2;
    for (let i = 0; i < 8; i++) { const y = 40 + ((i * 53 + state.time / 3) % (GROUND_Y - 60)); const x = (i * 131 + state.time) % w; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 60, y); ctx.stroke(); }
  }
  for (const gt of state.gates) gate(ctx, gt, scene.neon);
  const laneY = state.lane === LANE.UPPER ? GROUND_Y - 95 - (reducedMotion ? 0 : Math.sin((state.laneT / 620) * Math.PI) * 10) : GROUND_Y;
  // shadow
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath(); ctx.ellipse(ROBOT_X, GROUND_Y + 4, 20 - (GROUND_Y - laneY) * 0.08, 5, 0, 0, Math.PI * 2); ctx.fill();
  robot(ctx, ROBOT_X, laneY, { lane: state.lane, laneT: state.laneT, t: state.time, stumbling: state.stumbleT > 0, reducedMotion });
  if (particles) drawParticles(particles, ctx);
  // distance + combo
  drawLabel(ctx, `${Math.floor(state.distance / 10)} m`, w - 16, 22, { font: '600 13px JetBrains Mono, monospace', align: 'right' });
  if (state.combo > 1) drawLabel(ctx, `combo ×${state.combo}`, w - 16, 42, { font: '700 13px Outfit, sans-serif', color: scene.neon, align: 'right' });
  drawLabel(ctx, `for gate in range(${CHECKPOINT_LABEL(state.passes)})`, 16, 22, { font: '600 12px JetBrains Mono, monospace', align: 'left', color: 'rgba(255,255,255,0.85)' });
  ctx.restore();
}

function CHECKPOINT_LABEL(passes) {
  return `${passes % 10}, 10`;
}

export { clamp };
