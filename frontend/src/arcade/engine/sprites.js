// Vector drawing helpers shared by the canvas games (everything is drawn in code).

export function roundedRect(ctx, x, y, w, h, r = 6) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

export function shadow(ctx, x, y, w, alpha = 0.25) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.ellipse(x, y, w / 2, w / 6, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** Squash-and-stretch scale factors for a bounce phase t in [0, 1]. */
export function squash(t, amount = 0.25) {
  const s = Math.sin(t * Math.PI);
  return { sx: 1 + amount * s, sy: 1 - amount * s };
}

export function lerp(a, b, t) { return a + (b - a) * t; }
export function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
export const easeOut = (t) => 1 - (1 - t) * (1 - t);
export const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

/** Fit a canvas to its CSS size at device pixel ratio; returns the logical size. */
export function fitCanvas(canvas, width, height) {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return ctx;
}

/** Text with a soft outline, readable on any background. */
export function label(ctx, text, x, y, { font = '600 13px JetBrains Mono, monospace', color = '#fff', outline = 'rgba(0,0,0,.55)', align = 'center', maxWidth } = {}) {
  ctx.save();
  ctx.font = font;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 3;
  ctx.strokeStyle = outline;
  ctx.lineJoin = 'round';
  if (maxWidth) ctx.strokeText(text, x, y, maxWidth); else ctx.strokeText(text, x, y);
  ctx.fillStyle = color;
  if (maxWidth) ctx.fillText(text, x, y, maxWidth); else ctx.fillText(text, x, y);
  ctx.restore();
}
