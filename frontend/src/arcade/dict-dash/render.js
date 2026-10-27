// Canvas renderer for Dict Dash: neon maze with glowing walls, shimmering pellets, labelled
// power pellets, a chomping player, classic ghosts with tracking eyes (blue when frightened).
import { roundedRect, label as drawLabel } from '../engine/sprites.js';
import { draw as drawParticles } from '../engine/particles.js';
import { LEVEL_PALETTES } from './maze.js';

export const CELL = 36;

export function fieldSize(state) {
  return { w: state.map.cols * CELL, h: state.map.rows * CELL };
}

function ghost(ctx, g, cx, cy, look, t, reducedMotion) {
  const r = CELL * 0.42;
  const frightened = g.mode === 'frightened';
  const eaten = g.mode === 'eaten';
  if (!eaten) {
    ctx.fillStyle = frightened ? '#1d4ed8' : g.color;
    ctx.beginPath();
    ctx.arc(cx, cy - 2, r, Math.PI, 0);
    const wave = reducedMotion ? 0 : Math.sin(t / 120) * 2;
    ctx.lineTo(cx + r, cy + r - 2);
    for (let i = 3; i >= -3; i--) ctx.lineTo(cx + (i * r) / 3, cy + r - 2 - (i % 2 === 0 ? 4 + wave : 0));
    ctx.closePath();
    ctx.fill();
  }
  const ex = Math.sign(look.x - cx) * 2, ey = Math.sign(look.y - cy) * 2;
  for (const ox of [-6, 6]) {
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(cx + ox, cy - 4, 4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = frightened ? '#fff' : '#1e3a8a'; ctx.beginPath(); ctx.arc(cx + ox + (frightened ? 0 : ex), cy - 4 + (frightened ? 0 : ey), 2, 0, Math.PI * 2); ctx.fill();
  }
  if (!eaten) drawLabel(ctx, g.name, cx, cy + r + 8, { font: '600 9px JetBrains Mono, monospace', color: frightened ? '#bfdbfe' : '#fff', outline: 'rgba(0,0,0,0.6)' });
}

const _mazeCache = new Map();   // static walls per palette: drawn once, blitted every frame
function mazeLayer(map, pal, w, h) {
  const key = `${pal.wall}:${w}x${h}`;
  let layer = _mazeCache.get(key);
  if (layer) return layer;
  if (typeof document === 'undefined') return null;
  layer = document.createElement('canvas');
  layer.width = w; layer.height = h;
  const c = layer.getContext('2d');
  if (!c) return null;
  c.fillStyle = pal.bg; c.fillRect(0, 0, w, h);
  for (let y = 0; y < map.rows; y++) {
    for (let x = 0; x < map.cols; x++) {
      if (!map.walls[y][x]) continue;
      c.save(); c.shadowColor = pal.glow; c.shadowBlur = 8; c.fillStyle = pal.wall;
      roundedRect(c, x * CELL + 3, y * CELL + 3, CELL - 6, CELL - 6, 6); c.fill(); c.restore();
      c.strokeStyle = pal.glow; c.lineWidth = 1; c.globalAlpha = 0.6;
      roundedRect(c, x * CELL + 7, y * CELL + 7, CELL - 14, CELL - 14, 4); c.stroke(); c.globalAlpha = 1;
    }
  }
  _mazeCache.set(key, layer);
  return layer;
}

export function draw(ctx, { state, particles, reducedMotion = false, flash = 0 }) {
  const pal = LEVEL_PALETTES[(state.level - 1) % LEVEL_PALETTES.length];
  const { w, h } = fieldSize(state);
  const map = state.map;
  ctx.save();
  const layer = mazeLayer(map, pal, w, h);
  if (layer) ctx.drawImage(layer, 0, 0); else { ctx.fillStyle = pal.bg; ctx.fillRect(0, 0, w, h); }
  // pellets
  ctx.fillStyle = pal.pellet;
  for (const k of state.pellets) {
    const [x, y] = k.split(',').map(Number);
    const shimmer = reducedMotion ? 1 : 0.8 + 0.2 * Math.sin(state.time / 300 + x + y);
    ctx.globalAlpha = shimmer;
    ctx.beginPath(); ctx.arc(x * CELL + CELL / 2, y * CELL + CELL / 2, 3, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1;
  // power pellets with labels
  for (const p of state.powers) {
    const cx = p.x * CELL + CELL / 2, cy = p.y * CELL + CELL / 2;
    ctx.save();
    if (!reducedMotion) { ctx.shadowColor = '#fbbf24'; ctx.shadowBlur = 16; }
    ctx.fillStyle = '#f59e0b';
    const pulse = reducedMotion ? 0 : Math.sin(state.time / 200) * 2;
    ctx.beginPath(); ctx.arc(cx, cy, 11 + pulse, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    const lx = p.x < map.cols / 2 ? cx + 18 : cx - 18;
    drawLabel(ctx, p.label, lx, cy, { font: '700 12px JetBrains Mono, monospace', color: '#fff7ed', outline: 'rgba(0,0,0,0.75)', align: p.x < map.cols / 2 ? 'left' : 'right', maxWidth: 150 });
  }
  // player
  const px = state.player.x * CELL + CELL / 2, py = state.player.y * CELL + CELL / 2;
  const open = reducedMotion ? 0.3 : Math.abs(Math.sin(state.player.mouth)) * 0.45;
  const base = { right: 0, down: Math.PI / 2, left: Math.PI, up: -Math.PI / 2 }[state.player.dir] || 0;
  ctx.fillStyle = state.deathT > 0 ? '#9ca3af' : '#facc15';
  ctx.beginPath();
  ctx.moveTo(px, py);
  ctx.arc(px, py, CELL * 0.42, base + open, base + Math.PI * 2 - open);
  ctx.closePath(); ctx.fill();
  // ghosts
  for (const g of state.ghosts) ghost(ctx, g, g.x * CELL + CELL / 2, g.y * CELL + CELL / 2, { x: px, y: py }, state.time, reducedMotion);
  if (particles) drawParticles(particles, ctx);
  if (state.hurriedT > 0) { ctx.fillStyle = `rgba(239,68,68,${reducedMotion ? 0.12 : 0.12 + 0.05 * Math.sin(state.time / 100)})`; ctx.fillRect(0, 0, w, h); }
  if (flash > 0 && !reducedMotion) { ctx.fillStyle = `rgba(255,255,255,${0.4 * flash})`; ctx.fillRect(0, 0, w, h); }
  drawLabel(ctx, `L${state.level}`, w - 14, 16, { font: '700 12px JetBrains Mono, monospace', align: 'right', color: pal.glow });
  ctx.restore();
}
