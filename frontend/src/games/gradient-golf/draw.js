// Canvas drawing for Gradient Golf. Pure functions of (ctx, hole, path, opts);
// colours come from the page's CSS tokens so light/dark both work.
import { loss } from './levels.js'

export function themeColors() {
  const fallback = { accent: '#7c3aed', text: '#6b6b80', surface: '#ffffff', border: '#c9c9d6', flag: '#059669', warn: '#dc2626' }
  if (typeof document === 'undefined') return fallback
  const cs = getComputedStyle(document.documentElement)
  const v = (name, fb) => (cs.getPropertyValue(name) || '').trim() || fb
  return {
    accent: v('--accent-primary', fallback.accent),
    text: v('--text-muted', fallback.text),
    surface: v('--bg-elevated', fallback.surface),
    border: v('--border-strong', fallback.border),
    flag: fallback.flag,
    warn: fallback.warn,
  }
}

function xRange(hole) {
  const pts = [hole.start[0], hole.params.min[0], ...(hole.params.local || []), ...(hole.params.hump || [])]
  const span = Math.max(...pts.map(Math.abs), 1) * 1.45 + 0.5
  return [-span, span]
}

/** Draw a 1-D hole: loss curve, flag at the minimum, trail, ball. `path` is [[x], ...]. */
export function drawHole1D(ctx, hole, path, { width, height, colors, diverged }) {
  const pad = 24
  const [x0, x1] = xRange(hole)
  const N = 160
  const xs = Array.from({ length: N + 1 }, (_, i) => x0 + ((x1 - x0) * i) / N)
  const ys = xs.map((x) => loss(hole, [x]))
  const yMin = Math.min(...ys), yMaxRaw = Math.max(...ys)
  const yMax = yMin + Math.max(1e-6, (yMaxRaw - yMin)) * 1.1
  const sx = (x) => pad + ((x - x0) / (x1 - x0)) * (width - 2 * pad)
  const sy = (y) => height - pad - ((Math.min(y, yMax) - yMin) / (yMax - yMin)) * (height - 2 * pad)

  ctx.clearRect(0, 0, width, height)
  // ground line
  ctx.strokeStyle = colors.border; ctx.lineWidth = 1
  ctx.beginPath(); ctx.moveTo(pad, height - pad); ctx.lineTo(width - pad, height - pad); ctx.stroke()
  // curve
  ctx.strokeStyle = colors.text; ctx.lineWidth = 2
  ctx.beginPath()
  xs.forEach((x, i) => { const px = sx(x), py = sy(ys[i]); i ? ctx.lineTo(px, py) : ctx.moveTo(px, py) })
  ctx.stroke()
  // flag (triangle on a pole) at the global minimum; a hollow marker at a local minimum
  const fx = sx(hole.params.min[0]), fy = sy(loss(hole, hole.params.min))
  ctx.strokeStyle = colors.flag; ctx.fillStyle = colors.flag; ctx.lineWidth = 2
  ctx.beginPath(); ctx.moveTo(fx, fy); ctx.lineTo(fx, fy - 34); ctx.stroke()
  ctx.beginPath(); ctx.moveTo(fx, fy - 34); ctx.lineTo(fx + 16, fy - 28); ctx.lineTo(fx, fy - 22); ctx.closePath(); ctx.fill()
  if (hole.params.local) {
    const lx = sx(hole.params.local[0]), ly = sy(loss(hole, hole.params.local))
    ctx.strokeStyle = colors.text; ctx.setLineDash([3, 3])
    ctx.beginPath(); ctx.arc(lx, ly, 7, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([])
  }
  // trail
  if (path.length > 1) {
    ctx.strokeStyle = colors.accent; ctx.lineWidth = 1.5; ctx.globalAlpha = 0.55
    ctx.beginPath()
    path.forEach((p, i) => {
      const cx = Math.max(x0, Math.min(x1, p[0]))
      const px = sx(cx), py = sy(loss(hole, [cx]))
      i ? ctx.lineTo(px, py) : ctx.moveTo(px, py)
    })
    ctx.stroke(); ctx.globalAlpha = 1
    path.forEach((p, i) => {
      if (i === 0 || i === path.length - 1) return
      const cx = Math.max(x0, Math.min(x1, p[0]))
      ctx.fillStyle = colors.accent; ctx.globalAlpha = 0.35
      ctx.beginPath(); ctx.arc(sx(cx), sy(loss(hole, [cx])), 3, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1
    })
  }
  // ball
  const last = path[path.length - 1]
  const bx = Math.max(x0, Math.min(x1, last[0]))
  ctx.fillStyle = diverged ? colors.warn : colors.accent
  ctx.beginPath(); ctx.arc(sx(bx), sy(loss(hole, [bx])) - 6, 7, 0, Math.PI * 2); ctx.fill()
  ctx.strokeStyle = colors.surface; ctx.lineWidth = 2; ctx.stroke()
  if (diverged) {
    ctx.fillStyle = colors.warn; ctx.font = '12px system-ui, sans-serif'; ctx.textAlign = 'center'
    ctx.fillText(last[0] > 0 ? 'off the course →' : '← off the course', width / 2, pad)
  }
}

/** Draw a 2-D bowl as contour ellipses with the descent path. `path` is [[x, y], ...]. */
export function drawHole2D(ctx, hole, path, { width, height, colors, diverged }) {
  const pad = 24
  const { a, b } = hole.params
  const span = Math.max(Math.abs(hole.start[0]), Math.abs(hole.start[1]), 1) * 1.3 + 0.5
  const sx = (x) => width / 2 + (x / span) * (Math.min(width, height) / 2 - pad)
  const sy = (y) => height / 2 - (y / span) * (Math.min(width, height) / 2 - pad)
  ctx.clearRect(0, 0, width, height)
  ctx.strokeStyle = colors.border; ctx.lineWidth = 1
  for (let k = 1; k <= 6; k++) {
    const c = (k / 6) * (a * span * span)
    const rx = Math.sqrt(c / a), ry = Math.sqrt(c / b)
    ctx.beginPath(); ctx.ellipse(sx(0), sy(0), Math.abs(sx(rx) - sx(0)), Math.abs(sy(ry) - sy(0)), 0, 0, Math.PI * 2); ctx.stroke()
  }
  // flag at the minimum
  const fx = sx(hole.params.min[0]), fy = sy(hole.params.min[1])
  ctx.fillStyle = colors.flag; ctx.strokeStyle = colors.flag; ctx.lineWidth = 2
  ctx.beginPath(); ctx.moveTo(fx, fy); ctx.lineTo(fx, fy - 30); ctx.stroke()
  ctx.beginPath(); ctx.moveTo(fx, fy - 30); ctx.lineTo(fx + 14, fy - 25); ctx.lineTo(fx, fy - 20); ctx.closePath(); ctx.fill()
  const clamp = (v) => Math.max(-span, Math.min(span, v))
  if (path.length > 1) {
    ctx.strokeStyle = colors.accent; ctx.lineWidth = 1.5; ctx.globalAlpha = 0.6
    ctx.beginPath()
    path.forEach((p, i) => { const px = sx(clamp(p[0])), py = sy(clamp(p[1])); i ? ctx.lineTo(px, py) : ctx.moveTo(px, py) })
    ctx.stroke(); ctx.globalAlpha = 1
  }
  const last = path[path.length - 1]
  ctx.fillStyle = diverged ? colors.warn : colors.accent
  ctx.beginPath(); ctx.arc(sx(clamp(last[0])), sy(clamp(last[1])), 7, 0, Math.PI * 2); ctx.fill()
  ctx.strokeStyle = colors.surface; ctx.lineWidth = 2; ctx.stroke()
}

export function drawHole(ctx, hole, path, opts) {
  if (hole.start.length === 2) drawHole2D(ctx, hole, path, opts)
  else drawHole1D(ctx, hole, path, opts)
}
