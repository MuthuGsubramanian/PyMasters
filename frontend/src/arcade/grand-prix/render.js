// Canvas renderer for Big-O Grand Prix: painted asphalt along the spline, kerbs, start line,
// fork signposts with labels, karts with wheels and boost flames, skid smoke, a mini-map.
import { roundedRect, label as drawLabel } from '../engine/sprites.js';
import { draw as drawParticles } from '../engine/particles.js';
import { pointAt, laneOffset, LANES } from '../engine/track.js';
import { STAGE } from './rules.js';

const ROAD_W = LANES.spacing * 2 + 44;

function road(ctx, track, pal) {
  const pts = track.samples;
  const path = () => { ctx.beginPath(); pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y))); ctx.closePath(); };
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  path(); ctx.strokeStyle = pal.kerb; ctx.lineWidth = ROAD_W + 10; ctx.setLineDash([18, 18]); ctx.stroke(); ctx.setLineDash([]);
  path(); ctx.strokeStyle = '#fff'; ctx.lineWidth = ROAD_W + 10; ctx.setLineDash([18, 18]); ctx.lineDashOffset = 18; ctx.globalAlpha = 0.9; ctx.stroke(); ctx.setLineDash([]); ctx.lineDashOffset = 0; ctx.globalAlpha = 1;
  path(); ctx.strokeStyle = pal.asphalt; ctx.lineWidth = ROAD_W; ctx.stroke();
  path(); ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.lineWidth = 2; ctx.setLineDash([14, 22]); ctx.stroke(); ctx.setLineDash([]);
}

function startLine(ctx, track) {
  const p = pointAt(track, 0);
  ctx.save();
  ctx.translate(p.x, p.y); ctx.rotate(p.angle);
  for (let i = -3; i < 3; i++) for (let j = 0; j < 2; j++) { ctx.fillStyle = (i + j) % 2 ? '#111' : '#fff'; ctx.fillRect(j * 8 - 8, i * 12, 8, 12); }
  ctx.restore();
}

function signpost(ctx, track, fork) {
  const cp = track.checkpoints[fork.checkpoint];
  for (const l of fork.lanes) {
    const p = laneOffset(track, cp.s - 50, l.lane);
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.fillStyle = 'rgba(2,6,23,0.85)';
    roundedRect(ctx, -40, -11, 80, 22, 6); ctx.fill();
    ctx.strokeStyle = '#fbbf24'; ctx.lineWidth = 1.5; roundedRect(ctx, -40, -11, 80, 22, 6); ctx.stroke();
    ctx.restore();
    drawLabel(ctx, l.label.length > 11 ? l.label.slice(0, 10) + '…' : l.label, p.x, p.y, { font: '700 11px JetBrains Mono, monospace', color: '#fff' });
  }
  // gate posts
  const a = laneOffset(track, cp.s, -1.7), b = laneOffset(track, cp.s, 1.7);
  ctx.strokeStyle = '#fbbf24'; ctx.lineWidth = 3; ctx.setLineDash([6, 6]);
  ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); ctx.setLineDash([]);
}

function kart(ctx, k, track, t, reducedMotion) {
  const p = laneOffset(track, k.s, k.lane);
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate(p.angle + (k.spinT > 0 && !reducedMotion ? (k.spinT / 1500) * Math.PI * 4 : 0));
  if (k.boostT > 0 && !reducedMotion) {
    ctx.fillStyle = `rgba(251,146,60,${0.6 + 0.4 * Math.sin(t / 40)})`;
    ctx.beginPath(); ctx.moveTo(-14, -5); ctx.lineTo(-30 - Math.random() * 8, 0); ctx.lineTo(-14, 5); ctx.closePath(); ctx.fill();
  }
  ctx.fillStyle = '#111827';
  for (const [wx, wy] of [[-9, -10], [9, -10], [-9, 10], [9, 10]]) roundedRect(ctx, wx - 4, wy - 3, 8, 6, 2), ctx.fill();
  ctx.fillStyle = k.color;
  roundedRect(ctx, -14, -8, 28, 16, 5); ctx.fill();
  ctx.fillStyle = '#0f172a';
  ctx.beginPath(); ctx.arc(2, 0, 4, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  roundedRect(ctx, 6, -5, 6, 10, 2); ctx.fill();
  ctx.restore();
  drawLabel(ctx, k.id === 'you' ? 'YOU' : k.name.split(' ')[0], p.x, p.y - 18, { font: '700 9px Outfit, sans-serif', color: k.color, outline: 'rgba(0,0,0,0.6)' });
}

function minimap(ctx, state) {
  const sx = 0.14, ox = STAGE.w - 160, oy = 14;
  ctx.save();
  ctx.fillStyle = 'rgba(2,6,23,0.6)';
  roundedRect(ctx, ox - 8, oy - 6, 150, 90, 8); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 3;
  ctx.beginPath(); state.track.samples.forEach((p, i) => (i ? ctx.lineTo(ox + p.x * sx, oy + p.y * sx) : ctx.moveTo(ox + p.x * sx, oy + p.y * sx))); ctx.closePath(); ctx.stroke();
  for (const k of state.karts) { const p = pointAt(state.track, k.s); ctx.fillStyle = k.color; ctx.beginPath(); ctx.arc(ox + p.x * sx, oy + p.y * sx, k.id === 'you' ? 4 : 3, 0, Math.PI * 2); ctx.fill(); }
  ctx.restore();
}

export function draw(ctx, { state, particles, reducedMotion = false, confetti = 0 }) {
  const pal = { grass: '#166534', grass2: '#15803d', asphalt: '#374151', kerb: '#dc2626' };
  ctx.save();
  ctx.fillStyle = pal.grass; ctx.fillRect(0, 0, STAGE.w, STAGE.h);
  ctx.fillStyle = pal.grass2;
  for (let y = 0; y < STAGE.h; y += 40) for (let x = (y / 40) % 2 ? 40 : 0; x < STAGE.w; x += 80) ctx.fillRect(x, y, 40, 40);
  road(ctx, state.track, pal);
  startLine(ctx, state.track);
  if (state.fork) signpost(ctx, state.track, state.fork);
  // tyre marks (persisting skid list)
  if (state.skids) { ctx.strokeStyle = 'rgba(17,24,39,0.5)'; ctx.lineWidth = 3; for (const sk of state.skids) { ctx.beginPath(); ctx.moveTo(sk.x1, sk.y1); ctx.lineTo(sk.x2, sk.y2); ctx.stroke(); } }
  const ordered = [...state.karts].sort((a, b) => (a.id === 'you' ? 1 : 0) - (b.id === 'you' ? 1 : 0));
  for (const k of ordered) kart(ctx, k, state.track, state.time, reducedMotion);
  if (particles) drawParticles(particles, ctx);
  minimap(ctx, state);
  const pos = state.positions.length ? state.positions.indexOf('you') + 1 : [...state.karts].sort((a, b) => (b.lap * state.track.length + b.s) - (a.lap * state.track.length + a.s)).findIndex((k) => k.id === 'you') + 1;
  const you = state.karts.find((k) => k.id === 'you');
  drawLabel(ctx, `P${pos}  ·  LAP ${Math.min(state.laps, you.lap + 1)}/${state.laps}`, 16, 22, { font: '700 14px Outfit, sans-serif', align: 'left' });
  drawLabel(ctx, `${Math.round(Math.abs(you.speed))} px/s`, 16, 42, { font: '600 11px JetBrains Mono, monospace', align: 'left', color: 'rgba(255,255,255,0.8)' });
  if (confetti > 0 && !reducedMotion) {
    for (let i = 0; i < 60; i++) { ctx.fillStyle = ['#f472b6', '#22d3ee', '#facc15', '#a3e635'][i % 4]; ctx.fillRect((i * 97 + state.time / 6) % STAGE.w, ((i * 53) + state.time / 3) % STAGE.h, 6, 10); }
  }
  ctx.restore();
}
