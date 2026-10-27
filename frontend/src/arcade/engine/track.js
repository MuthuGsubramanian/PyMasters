// Closed-loop race track from control points: Catmull-Rom spline, arc-length samples, lane
// offsets, checkpoints and forward-only crossing detection. Pure functions.
export const LANES = { spacing: 26 };

function catmull(p0, p1, p2, p3, t) {
  const t2 = t * t, t3 = t2 * t;
  const x = 0.5 * ((2 * p1[0]) + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3);
  const y = 0.5 * ((2 * p1[1]) + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3);
  return [x, y];
}

export function buildTrack(control, { checkpoints = 4, samplesPerSeg = 40 } = {}) {
  const n = control.length;
  const samples = [];
  let s = 0, prev = null;
  for (let i = 0; i < n; i++) {
    const p0 = control[(i - 1 + n) % n], p1 = control[i], p2 = control[(i + 1) % n], p3 = control[(i + 2) % n];
    for (let k = 0; k < samplesPerSeg; k++) {
      const [x, y] = catmull(p0, p1, p2, p3, k / samplesPerSeg);
      if (prev) s += Math.hypot(x - prev[0], y - prev[1]);
      samples.push({ x, y, s });
      prev = [x, y];
    }
  }
  // close the loop
  const first = samples[0];
  s += Math.hypot(first.x - prev[0], first.y - prev[1]);
  const length = s;
  for (let i = 0; i < samples.length; i++) {
    const a = samples[i], b = samples[(i + 1) % samples.length];
    a.angle = Math.atan2(b.y - a.y, b.x - a.x);
  }
  const track = { samples, length, control };
  track.checkpoints = Array.from({ length: checkpoints }, (_, i) => {
    const cs = (i * length) / checkpoints;
    const p = pointAt(track, cs);
    return { index: i, s: cs, x: p.x, y: p.y, angle: p.angle };
  });
  return track;
}

export function pointAt(track, s) {
  const L = track.length;
  let u = ((s % L) + L) % L;
  const samples = track.samples;
  // binary search the sample just before u
  let lo = 0, hi = samples.length - 1;
  while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (samples[mid].s <= u) lo = mid; else hi = mid - 1; }
  const a = samples[lo], b = samples[(lo + 1) % samples.length];
  const span = ((lo + 1) % samples.length === 0 ? L : b.s) - a.s || 1;
  const t = Math.max(0, Math.min(1, (u - a.s) / span));
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, angle: a.angle };
}

export function nearestS(track, x, y) {
  let best = 0, bd = Infinity;
  for (const p of track.samples) {
    const d = (p.x - x) ** 2 + (p.y - y) ** 2;
    if (d < bd) { bd = d; best = p.s; }
  }
  return best;
}

/** World position for lane offset `lane` (−1 … 1, in units of LANES.spacing) at arc length s. */
export function laneOffset(track, s, lane) {
  const p = pointAt(track, s);
  const nx = -Math.sin(p.angle), ny = Math.cos(p.angle);
  return { x: p.x + nx * lane * LANES.spacing, y: p.y + ny * lane * LANES.spacing, angle: p.angle };
}

/** Index of the checkpoint crossed moving forward from sPrev to sNow (wrap-aware), or -1. */
export function whichCheckpoint(track, sPrev, sNow) {
  const L = track.length;
  let delta = sNow - sPrev;
  if (delta < -L / 2) delta += L;         // wrapped forward across the start line
  if (delta <= 0 || delta > L / 2) return -1;
  for (const cp of track.checkpoints) {
    const d = (((cp.s - sPrev) % L) + L) % L;
    if (d > 0 && d <= delta) return cp.index;
    if (d === 0 && delta > 0 && cp.s !== sPrev) return cp.index;
  }
  return -1;
}

export function crossedCheckpoint(track, sPrev, sNow) {
  return whichCheckpoint(track, sPrev, sNow) >= 0;
}
