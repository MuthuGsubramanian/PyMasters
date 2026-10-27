// Canvas renderer for Linked Snake: CRT-dark field, node cards with monospace values,
// connectors between nodes, a head with eyes that look at the nearest food, glowing foods.
import { roundedRect, label as drawLabel, lerp } from '../engine/sprites.js';
import { draw as drawParticles } from '../engine/particles.js';

export const CELL = 32;

const COLORS = {
  bg: '#0b1020', grid: 'rgba(120, 160, 255, 0.07)', node: '#0f766e', nodeEdge: '#5eead4', head: '#14b8a6',
  link: 'rgba(94, 234, 212, 0.65)', food: '#f59e0b', foodEdge: '#fde68a', text: '#f8fafc', dead: '#7f1d1d',
};

export function fieldSize(state) {
  return { w: state.cols * CELL, h: state.rows * CELL };
}

function nearestFood(state) {
  const h = state.snake[0];
  let best = null, bd = Infinity;
  for (const f of state.foods) {
    const d = Math.hypot(f.x - h.x, f.y - h.y);
    if (d < bd) { bd = d; best = f; }
  }
  return best;
}

/** `progress` in [0,1) is the fraction of the current tick elapsed, for smooth head motion. */
export function draw(ctx, state, { progress = 0, particles, flash = 0, reducedMotion = false } = {}) {
  const { w, h } = fieldSize(state);
  ctx.save();
  ctx.fillStyle = COLORS.bg;
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = COLORS.grid;
  ctx.lineWidth = 1;
  for (let x = 0; x <= state.cols; x++) { ctx.beginPath(); ctx.moveTo(x * CELL + 0.5, 0); ctx.lineTo(x * CELL + 0.5, h); ctx.stroke(); }
  for (let y = 0; y <= state.rows; y++) { ctx.beginPath(); ctx.moveTo(0, y * CELL + 0.5); ctx.lineTo(w, y * CELL + 0.5); ctx.stroke(); }

  // foods
  for (const f of state.foods) {
    const cx = f.x * CELL + CELL / 2, cy = f.y * CELL + CELL / 2;
    ctx.save();
    if (!reducedMotion) { ctx.shadowColor = COLORS.food; ctx.shadowBlur = 14; }
    ctx.fillStyle = COLORS.food;
    roundedRect(ctx, cx - CELL * 0.46, cy - CELL * 0.38, CELL * 0.92, CELL * 0.76, 8);
    ctx.fill();
    ctx.restore();
    ctx.strokeStyle = COLORS.foodEdge;
    ctx.lineWidth = 1.5;
    roundedRect(ctx, cx - CELL * 0.46, cy - CELL * 0.38, CELL * 0.92, CELL * 0.76, 8);
    ctx.stroke();
    drawLabel(ctx, f.label.length > 7 ? f.label.slice(0, 6) + '…' : f.label, cx, cy, { font: '700 12px JetBrains Mono, monospace', color: '#1f1300', outline: 'rgba(255,255,255,0.35)' });
  }

  // snake links then nodes (tail → head so the head draws on top)
  const nodes = state.snake;
  const dirDelta = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[state.dir] || [0, 0];
  const headShift = reducedMotion ? 0 : progress;  // smooth slide toward the next cell
  const pos = (n, i) => {
    let x = n.x, y = n.y;
    if (i === 0 && state.alive) { x += dirDelta[0] * headShift * 0.6; y += dirDelta[1] * headShift * 0.6; }
    return { cx: x * CELL + CELL / 2, cy: y * CELL + CELL / 2 };
  };
  ctx.strokeStyle = COLORS.link;
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';
  for (let i = nodes.length - 1; i > 0; i--) {
    const a = pos(nodes[i], i), b = pos(nodes[i - 1], i - 1);
    ctx.beginPath(); ctx.moveTo(a.cx, a.cy); ctx.lineTo(b.cx, b.cy); ctx.stroke();
  }
  for (let i = nodes.length - 1; i >= 0; i--) {
    const n = nodes[i];
    const { cx, cy } = pos(n, i);
    const isHead = i === 0;
    const size = isHead ? CELL * 0.86 : CELL * 0.74;
    ctx.save();
    if (!reducedMotion && isHead) { ctx.shadowColor = COLORS.head; ctx.shadowBlur = 16; }
    ctx.fillStyle = state.alive ? (isHead ? COLORS.head : COLORS.node) : COLORS.dead;
    roundedRect(ctx, cx - size / 2, cy - size / 2, size, size, 7);
    ctx.fill();
    ctx.restore();
    ctx.strokeStyle = COLORS.nodeEdge;
    ctx.lineWidth = isHead ? 2 : 1;
    roundedRect(ctx, cx - size / 2, cy - size / 2, size, size, 7);
    ctx.stroke();
    if (isHead) {
      const f = nearestFood(state);
      const ex = f ? Math.sign(f.x - n.x) * 2 : dirDelta[0] * 2;
      const ey = f ? Math.sign(f.y - n.y) * 2 : dirDelta[1] * 2;
      for (const ox of [-6, 6]) {
        ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(cx + ox, cy - 3, 4, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#0b1020'; ctx.beginPath(); ctx.arc(cx + ox + ex, cy - 3 + ey, 2, 0, Math.PI * 2); ctx.fill();
      }
    } else {
      drawLabel(ctx, n.value.length > 5 ? n.value.slice(0, 4) + '…' : n.value, cx, cy, { font: '600 11px JetBrains Mono, monospace', color: COLORS.text, outline: 'rgba(0,0,0,0.4)' });
    }
  }

  if (particles) drawParticles(particles, ctx);
  if (flash > 0) {
    ctx.fillStyle = `rgba(239, 68, 68, ${lerp(0, 0.35, flash)})`;
    ctx.fillRect(0, 0, w, h);
  }
  if (!state.alive) {
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillRect(0, 0, w, h);
    drawLabel(ctx, 'IndexError', w / 2, h / 2 - 10, { font: '800 28px Outfit, sans-serif', color: '#fecaca', outline: 'rgba(0,0,0,0.6)' });
    drawLabel(ctx, state.lastOp, w / 2, h / 2 + 18, { font: '500 13px JetBrains Mono, monospace', color: '#fff', outline: 'rgba(0,0,0,0.6)' });
  }
  ctx.restore();
}
