// Canvas renderer for Code Slingshot: painterly sky per scene, grass, slingshot, crates with
// grain, pigs with eyes that track the bird, a bird that squashes and stretches, particles.
import { roundedRect, label as drawLabel, clamp } from '../engine/sprites.js';
import { draw as drawParticles } from '../engine/particles.js';
import { STAGE, trajectoryPreview } from './physics.js';

export const SLING = { x: 150, y: STAGE.h - 60 - 90 };   // the bird's rest point
export const MAX_PULL = 170;

const SCENES = [
  { top: '#1e1b4b', mid: '#7c3aed', bottom: '#fb923c', hill: '#14532d', grass: '#15803d', name: 'Dusk' },
  { top: '#0369a1', mid: '#38bdf8', bottom: '#fde68a', hill: '#166534', grass: '#16a34a', name: 'Day' },
  { top: '#020617', mid: '#1e293b', bottom: '#334155', hill: '#0f172a', grass: '#1e3a2f', name: 'Night' },
  { top: '#7f1d1d', mid: '#f97316', bottom: '#fde68a', hill: '#78350f', grass: '#a16207', name: 'Ember' },
];

const _skyCache = new Map();   // one gradient per scene per context: building one every frame costs a frame on phones
function sky(ctx, w, h, scene) {
  const s = SCENES[scene % SCENES.length];
  const key = `${scene % SCENES.length}:${h}`;
  let byCtx = _skyCache.get(ctx);
  if (!byCtx) { byCtx = new Map(); _skyCache.set(ctx, byCtx); }
  let g = byCtx.get(key);
  if (!g) {
    g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, s.top); g.addColorStop(0.55, s.mid); g.addColorStop(1, s.bottom);
    byCtx.set(key, g);
  }
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  return s;
}

function hills(ctx, w, groundY, s) {
  ctx.fillStyle = s.hill;
  ctx.globalAlpha = 0.8;
  ctx.beginPath();
  ctx.moveTo(0, groundY);
  for (let x = 0; x <= w; x += 40) ctx.lineTo(x, groundY - 40 - 30 * Math.sin(x / 120) - 18 * Math.cos(x / 57));
  ctx.lineTo(w, groundY);
  ctx.closePath();
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.fillStyle = s.grass;
  ctx.fillRect(0, groundY, w, STAGE.h - groundY);
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  ctx.fillRect(0, groundY, w, 4);
}

function crate(ctx, b) {
  ctx.save();
  ctx.translate(b.x, b.y);
  ctx.fillStyle = '#b45309';
  roundedRect(ctx, 0, 0, b.w, b.h, 4); ctx.fill();
  ctx.strokeStyle = '#78350f'; ctx.lineWidth = 2;
  roundedRect(ctx, 1, 1, b.w - 2, b.h - 2, 4); ctx.stroke();
  ctx.strokeStyle = 'rgba(120, 53, 15, 0.55)'; ctx.lineWidth = 1;
  for (let i = 1; i < 4; i++) { ctx.beginPath(); ctx.moveTo(4, (b.h / 4) * i); ctx.lineTo(b.w - 4, (b.h / 4) * i + (i % 2 ? 2 : -2)); ctx.stroke(); }
  ctx.strokeStyle = 'rgba(255,255,255,0.25)';
  ctx.beginPath(); ctx.moveTo(3, 3); ctx.lineTo(b.w - 3, 3); ctx.stroke();
  ctx.restore();
}

function pig(ctx, p, look) {
  ctx.save();
  ctx.translate(p.x, p.y);
  if (!p.alive) { ctx.restore(); return; }
  ctx.fillStyle = p.locked ? '#6b7280' : '#65a30d';
  ctx.beginPath(); ctx.arc(0, 0, p.r, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = p.locked ? '#4b5563' : '#4d7c0f';
  ctx.beginPath(); ctx.arc(-p.r * 0.55, -p.r * 0.75, p.r * 0.3, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(p.r * 0.55, -p.r * 0.75, p.r * 0.3, 0, Math.PI * 2); ctx.fill();
  // eyes track the bird
  const ex = clamp((look.x - p.x) / 200, -1, 1) * 2, ey = clamp((look.y - p.y) / 200, -1, 1) * 2;
  for (const ox of [-6, 6]) {
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(ox, -3, 4.2, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#111827'; ctx.beginPath(); ctx.arc(ox + ex, -3 + ey, 2, 0, Math.PI * 2); ctx.fill();
  }
  ctx.fillStyle = p.locked ? '#9ca3af' : '#84cc16';
  roundedRect(ctx, -6, 2, 12, 8, 3); ctx.fill();
  ctx.fillStyle = '#365314';
  ctx.beginPath(); ctx.arc(-2.5, 6, 1.2, 0, Math.PI * 2); ctx.arc(2.5, 6, 1.2, 0, Math.PI * 2); ctx.fill();
  if (p.locked) drawLabel(ctx, '🔒', 0, -p.r - 10, { font: '12px system-ui' });
  ctx.restore();
  // label plaque under the pig
  drawLabel(ctx, p.label.length > 8 ? p.label.slice(0, 7) + '…' : p.label, p.x, p.y + p.r + 12, { font: '700 13px JetBrains Mono, monospace', color: '#fff7ed', outline: 'rgba(0,0,0,0.6)' });
}

function bird(ctx, b, reducedMotion) {
  ctx.save();
  ctx.translate(b.x, b.y);
  const speed = Math.hypot(b.vx, b.vy);
  const stretch = reducedMotion ? 1 : 1 + clamp(speed / 2400, 0, 0.35);
  const angle = b.flying ? Math.atan2(b.vy, b.vx) : 0;
  ctx.rotate(angle);
  ctx.scale(stretch, 1 / stretch);
  ctx.fillStyle = '#dc2626';
  ctx.beginPath(); ctx.arc(0, 0, b.r, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#fca5a5';
  ctx.beginPath(); ctx.arc(-2, 3, b.r * 0.55, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(4, -4, 4, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#111'; ctx.beginPath(); ctx.arc(5.5, -4, 2, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#f59e0b';
  ctx.beginPath(); ctx.moveTo(b.r - 2, -1); ctx.lineTo(b.r + 8, 2); ctx.lineTo(b.r - 2, 5); ctx.closePath(); ctx.fill();
  ctx.restore();
}

function slingshot(ctx, groundY, aim, b) {
  ctx.save();
  ctx.strokeStyle = '#5b3a1a'; ctx.lineWidth = 9; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(SLING.x, groundY); ctx.lineTo(SLING.x, SLING.y + 20); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(SLING.x, SLING.y + 20); ctx.lineTo(SLING.x - 16, SLING.y - 14); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(SLING.x, SLING.y + 20); ctx.lineTo(SLING.x + 16, SLING.y - 14); ctx.stroke();
  const at = aim && !b?.flying ? { x: SLING.x + aim.x, y: SLING.y + aim.y } : null;
  if (at) {
    ctx.strokeStyle = '#1f2937'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(SLING.x - 16, SLING.y - 14); ctx.lineTo(at.x, at.y); ctx.lineTo(SLING.x + 16, SLING.y - 14); ctx.stroke();
  }
  ctx.restore();
}

/**
 * @param {object} opts {state, aim: {x,y}|null (pull vector), particles, shake, reducedMotion, flash}
 */
export function draw(ctx, { state, aim, particles, shake = 0, reducedMotion = false, flash = 0 }) {
  const world = state.world;
  const w = world.w, h = world.h;
  ctx.save();
  if (shake > 0 && !reducedMotion) ctx.translate((Math.random() - 0.5) * shake * 8, (Math.random() - 0.5) * shake * 8);
  const s = sky(ctx, w, h, state.scene);
  hills(ctx, w, world.groundY, s);
  const b = world.bird;
  const look = b ? { x: b.x, y: b.y } : { x: SLING.x, y: SLING.y };
  for (const box of world.boxes) crate(ctx, box);
  for (const p of world.pigs) pig(ctx, p, look);
  slingshot(ctx, world.groundY, aim, b);
  if (aim && !b?.flying) {
    const pts = trajectoryPreview({ x: SLING.x, y: SLING.y }, { vx: -aim.x * 6.5, vy: -aim.y * 6.5 }, Math.max(4, 12 - state.scene * 2));
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    for (const p of pts) { ctx.beginPath(); ctx.arc(p.x, p.y, 3, 0, Math.PI * 2); ctx.fill(); }
    bird(ctx, { x: SLING.x + aim.x, y: SLING.y + aim.y, vx: 0, vy: 0, r: 14, flying: false }, reducedMotion);
  } else if (b) {
    if (!reducedMotion) {
      ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 2;
      ctx.beginPath();
      b.trail.forEach((t, i) => (i ? ctx.lineTo(t.x, t.y) : ctx.moveTo(t.x, t.y)));
      ctx.stroke();
    }
    bird(ctx, b, reducedMotion);
  } else {
    bird(ctx, { x: SLING.x, y: SLING.y, vx: 0, vy: 0, r: 14, flying: false }, reducedMotion);
  }
  if (particles) drawParticles(particles, ctx);
  // birds left
  for (let i = 0; i < state.birdsLeft; i++) {
    ctx.fillStyle = '#dc2626'; ctx.beginPath(); ctx.arc(30 + i * 26, 30, 9, 0, Math.PI * 2); ctx.fill();
  }
  if (flash > 0) { ctx.fillStyle = `rgba(255,255,255,${0.5 * flash})`; ctx.fillRect(0, 0, w, h); }
  ctx.restore();
}
