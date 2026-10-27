// Canvas renderer for Bug Invaders: CRT dark, scanlines, pixel-style invaders carrying code,
// fix ships, cannon, lasers with glow, explosions. Everything drawn in code.
import { roundedRect, label as drawLabel } from '../engine/sprites.js';
import { draw as drawParticles } from '../engine/particles.js';
import { STAGE, CANNON_Y } from './rules.js';

const C = { bg: '#030712', star: 'rgba(148,163,184,0.5)', scan: 'rgba(255,255,255,0.035)', green: '#4ade80', red: '#f87171', cyan: '#22d3ee', amber: '#fbbf24', text: '#e5e7eb' };

function invader(ctx, inv, t, boss, reducedMotion) {
  const wob = reducedMotion ? 0 : Math.sin(t / 220 + inv.wobble) * 3;
  ctx.save();
  ctx.translate(inv.x, inv.y + wob);
  const w = 186, h = 44;
  ctx.fillStyle = boss ? '#7f1d1d' : '#1e293b';
  roundedRect(ctx, -w / 2, -h / 2, w, h, 6); ctx.fill();
  ctx.strokeStyle = boss ? C.red : C.green; ctx.lineWidth = 2;
  roundedRect(ctx, -w / 2, -h / 2, w, h, 6); ctx.stroke();
  // antennae / eyes (pixel feel)
  ctx.fillStyle = boss ? C.red : C.green;
  ctx.fillRect(-w / 2 + 10, -h / 2 - 8, 6, 8); ctx.fillRect(w / 2 - 16, -h / 2 - 8, 6, 8);
  ctx.fillRect(-w / 2 + 6, h / 2 - 2, 8, 6); ctx.fillRect(w / 2 - 14, h / 2 - 2, 8, 6);
  ctx.restore();
  drawLabel(ctx, inv.text.length > 24 ? inv.text.slice(0, 23) + '…' : inv.text, inv.x, inv.y + wob, { font: '600 12px JetBrains Mono, monospace', color: C.text, outline: 'rgba(0,0,0,0.5)' });
  drawLabel(ctx, String(inv.lineIndex + 1), inv.x - 82, inv.y + wob - 12, { font: '700 10px JetBrains Mono, monospace', color: boss ? C.red : C.green, outline: 'rgba(0,0,0,0.5)' });
}

function ship(ctx, sh) {
  ctx.save();
  ctx.translate(sh.x, sh.y);
  ctx.fillStyle = '#312e81';
  ctx.beginPath(); ctx.moveTo(-80, 0); ctx.lineTo(-60, -16); ctx.lineTo(60, -16); ctx.lineTo(80, 0); ctx.lineTo(60, 16); ctx.lineTo(-60, 16); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = C.cyan; ctx.lineWidth = 2; ctx.stroke();
  ctx.fillStyle = C.cyan; ctx.fillRect(-86, -3, 8, 6);
  ctx.restore();
  drawLabel(ctx, sh.label.length > 20 ? sh.label.slice(0, 19) + '…' : sh.label, sh.x, sh.y, { font: '600 12px JetBrains Mono, monospace', color: '#fff', outline: 'rgba(0,0,0,0.6)' });
}

function cannon(ctx, x) {
  ctx.save();
  ctx.translate(x, CANNON_Y);
  ctx.fillStyle = '#0ea5e9';
  roundedRect(ctx, -26, -10, 52, 20, 5); ctx.fill();
  ctx.fillStyle = '#38bdf8';
  roundedRect(ctx, -6, -30, 12, 24, 3); ctx.fill();
  ctx.fillStyle = '#0c4a6e';
  roundedRect(ctx, -32, 8, 64, 10, 4); ctx.fill();
  ctx.restore();
}

export function draw(ctx, { state, particles, reducedMotion = false, shake = 0 }) {
  const w = STAGE.w, h = STAGE.h;
  ctx.save();
  if (shake > 0 && !reducedMotion) ctx.translate((Math.random() - 0.5) * shake * 8, (Math.random() - 0.5) * shake * 8);
  ctx.fillStyle = C.bg; ctx.fillRect(0, 0, w, h);
  // stars
  ctx.fillStyle = C.star;
  for (let i = 0; i < 70; i++) { const x = (i * 97) % w, y = ((i * 193) + (reducedMotion ? 0 : state.time / 40)) % h; ctx.fillRect(x, y, 2, 2); }
  // scanlines
  ctx.fillStyle = C.scan;
  for (let y = 0; y < h; y += 4) ctx.fillRect(0, y, w, 1);
  // danger line
  ctx.strokeStyle = 'rgba(248,113,113,0.35)'; ctx.setLineDash([8, 10]); ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(0, CANNON_Y - 30); ctx.lineTo(w, CANNON_Y - 30); ctx.stroke(); ctx.setLineDash([]);
  for (const inv of state.invaders) if (inv.alive) invader(ctx, inv, state.time, state.boss, reducedMotion);
  for (const sh of state.ships) if (sh.alive) ship(ctx, sh);
  for (const l of state.lasers) {
    ctx.save(); if (!reducedMotion) { ctx.shadowColor = C.amber; ctx.shadowBlur = 12; }
    ctx.fillStyle = C.amber; ctx.fillRect(l.x - 2, l.y - 14, 4, 18); ctx.restore();
  }
  cannon(ctx, state.cannonX);
  if (particles) drawParticles(particles, ctx);
  // shields
  for (let i = 0; i < state.shields; i++) { ctx.fillStyle = C.cyan; roundedRect(ctx, 16 + i * 22, 14, 16, 12, 3); ctx.fill(); }
  drawLabel(ctx, `WAVE ${state.wave + 1}${state.boss ? ' · BOSS' : ''}`, w - 16, 22, { font: '700 13px JetBrains Mono, monospace', align: 'right', color: state.boss ? C.red : C.green });
  if (state.phase === 'line') drawLabel(ctx, 'shoot the guilty line', w / 2, h - 22, { font: '600 12px Inter, sans-serif', color: 'rgba(255,255,255,0.75)' });
  if (state.phase === 'fix') drawLabel(ctx, 'now shoot the fix', w / 2, h - 22, { font: '600 12px Inter, sans-serif', color: C.cyan });
  if (state.phase === 'grading') drawLabel(ctx, 'running the test…', w / 2, h - 22, { font: '600 12px Inter, sans-serif', color: C.amber });
  ctx.restore();
}
