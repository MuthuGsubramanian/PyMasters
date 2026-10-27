// Small 2-D physics for Code Slingshot: a bird on a parabola, crates that stack, topple and
// fall, pigs that ride their crate. Pure functions over a plain `world` object.
export const STAGE = { w: 960, h: 540 };
export const GRAVITY = 1800;          // px/s²
export const MAX_SPEED = 1100;        // px/s
export const DRAG = 0.12;             // per second
export const POWER = 6.5;             // launch speed per pixel of pull
export const BIRD_R = 14;
export const CRATE = 44;
export const PIG_R = 18;

export function createWorld() {
  return { w: STAGE.w, h: STAGE.h, groundY: STAGE.h - 60, bird: null, boxes: [], pigs: [], flight: 0 };
}

let _ids = 0;
export function addTower(world, { x, crates = 2, pig }) {
  const towerId = `t${++_ids}`;
  let topId = null;
  for (let i = 0; i < crates; i++) {
    const id = `${towerId}c${i}`;
    world.boxes.push({ id, towerId, level: i, x: x - CRATE / 2, y: world.groundY - (i + 1) * CRATE, w: CRATE, h: CRATE, vx: 0, vy: 0, resting: true, hitFlight: -1 });
    topId = id;
  }
  if (pig) {
    world.pigs.push({ ...pig, towerId, onBox: topId, x, y: world.groundY - crates * CRATE - PIG_R, r: PIG_R, vx: 0, vy: 0, alive: true, hit: false, locked: Boolean(pig.locked), grounded: false });
  }
  return towerId;
}

/** Launch from `origin` with the drag vector `pull` (from origin to the finger): the bird flies the other way. */
export function launch(world, origin, pull) {
  let vx = -pull.x * POWER, vy = -pull.y * POWER;
  const speed = Math.hypot(vx, vy);
  if (speed > MAX_SPEED) { vx = (vx / speed) * MAX_SPEED; vy = (vy / speed) * MAX_SPEED; }
  world.flight += 1;
  world.bird = { x: origin.x, y: origin.y, vx, vy, r: BIRD_R, flying: true, hitPig: null, trail: [], flight: world.flight };
  return world.bird;
}

export function trajectoryPreview(origin, v, n = 12, g = GRAVITY, dt = 0.06) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const t = i * dt;
    pts.push({ x: origin.x + v.vx * t, y: origin.y + v.vy * t + 0.5 * g * t * t });
  }
  return pts;
}

function circleBox(cx, cy, r, b) {
  const nx = Math.max(b.x, Math.min(cx, b.x + b.w));
  const ny = Math.max(b.y, Math.min(cy, b.y + b.h));
  const dx = cx - nx, dy = cy - ny;
  return dx * dx + dy * dy <= r * r;
}

function supportFor(world, b, tol = 3) {
  if (b.y + b.h >= world.groundY - 0.5) return { kind: 'ground', y: world.groundY };
  let best = null;
  for (const o of world.boxes) {
    if (o === b) continue;
    const overlap = Math.min(b.x + b.w, o.x + o.w) - Math.max(b.x, o.x);
    if (overlap < b.w * 0.45) continue;
    const gap = o.y - (b.y + b.h);
    if (gap >= -tol && gap <= 3 && (!best || o.y < best.y)) best = { kind: 'box', y: o.y, box: o };
  }
  return best;
}

export function stepWorld(world, dtMs) {
  const dt = dtMs / 1000;
  const events = [];
  const bird = world.bird;
  if (bird && bird.flying) {
    bird.vx -= bird.vx * DRAG * dt;
    bird.vy += GRAVITY * dt;
    bird.x += bird.vx * dt;
    bird.y += bird.vy * dt;
    if (bird.trail.length > 24) bird.trail.shift();
    bird.trail.push({ x: bird.x, y: bird.y });
    for (const p of world.pigs) {
      if (!p.alive || p.hit) continue;
      const d = Math.hypot(p.x - bird.x, p.y - bird.y);
      if (d <= p.r + bird.r) {
        p.hit = true;
        bird.hitPig = p.id;
        events.push({ type: 'pig', id: p.id, choiceIndex: p.choiceIndex, label: p.label, locked: p.locked });
        bird.vx *= 0.35; bird.vy = Math.min(bird.vy, -120);
      }
    }
    for (const b of world.boxes) {
      if (b.hitFlight === bird.flight || !circleBox(bird.x, bird.y, bird.r, b)) continue;
      b.hitFlight = bird.flight;
      events.push({ type: 'crate', id: b.id, towerId: b.towerId });
      const strength = Math.min(1, Math.hypot(bird.vx, bird.vy) / MAX_SPEED);
      // knock this crate and every crate above it in the same tower
      for (const o of world.boxes) {
        if (o.towerId === b.towerId && o.level >= b.level) { o.vx += bird.vx * 0.55 * strength; o.vy += Math.min(0, bird.vy * 0.25) - 40 * strength; o.resting = false; }
      }
      const fromSide = bird.y > b.y + 4 && bird.y < b.y + b.h - 4;
      if (fromSide) bird.vx *= -0.3; else bird.vy *= -0.35;
      bird.vx *= 0.7;
    }
    if (bird.y + bird.r >= world.groundY) { bird.y = world.groundY - bird.r; bird.flying = false; events.push({ type: 'ground' }); }
    else if (bird.x > world.w + 60 || bird.x < -60 || bird.y > world.h + 100) { bird.flying = false; events.push({ type: 'out' }); }
  }
  // crates
  for (const b of world.boxes) {
    if (b.resting) {
      const s = supportFor(world, b);
      if (!s) b.resting = false; else continue;
    }
    b.vy += GRAVITY * dt;
    b.vx -= b.vx * 2.5 * dt;
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    if (b.y + b.h >= world.groundY) { b.y = world.groundY - b.h; b.vy = 0; if (Math.abs(b.vx) < 6) { b.vx = 0; b.resting = true; } }
    else {
      const s = supportFor(world, b, Math.abs(b.vy) * dt + 4);
      if (s && b.vy >= 0) { b.y = s.y - b.h; b.vy = 0; if (Math.abs(b.vx) < 6) { b.vx = 0; b.resting = true; } }
    }
    if (b.x < -b.w) b.x = -b.w; if (b.x > world.w) b.x = world.w;
  }
  // pigs ride their crate; if it moved away, they fall
  for (const p of world.pigs) {
    if (!p.alive) continue;
    const box = world.boxes.find((b) => b.id === p.onBox);
    const stillOn = box && Math.abs(box.x + box.w / 2 - p.x) < box.w * 0.6 && !p.grounded;
    if (stillOn && box.resting) { p.x = box.x + box.w / 2; p.y = box.y - p.r; p.vx = 0; p.vy = 0; continue; }
    if (stillOn && !box.resting) { p.x = box.x + box.w / 2; p.y = box.y - p.r; continue; }
    p.vy += GRAVITY * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    if (p.y + p.r >= world.groundY) { p.y = world.groundY - p.r; p.vy = 0; p.vx = 0; p.grounded = true; }
  }
  return events;
}
