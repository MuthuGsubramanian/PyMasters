// Pooled particles for bursts, trails and dust. No allocation during play.

export function createPool(size = 256) {
  const items = Array.from({ length: size }, () => ({ x: 0, y: 0, vx: 0, vy: 0, life: 0, ttl: 1, size: 3, color: '#fff', gravity: 0, alive: false }));
  return { items, alive: 0, size };
}

export function burst(pool, x, y, { count = 12, color = '#fff', speed = 180, size = 3, ttl = 600, gravity = 400, spread = Math.PI * 2, angle = 0 } = {}) {
  let spawned = 0;
  for (let i = 0; i < pool.items.length && spawned < count; i++) {
    const p = pool.items[i];
    if (p.alive) continue;
    const a = angle + (Math.random() - 0.5) * spread;
    const v = speed * (0.4 + Math.random() * 0.8);
    p.x = x; p.y = y; p.vx = Math.cos(a) * v; p.vy = Math.sin(a) * v;
    p.life = 0; p.ttl = ttl * (0.6 + Math.random() * 0.6); p.size = size * (0.6 + Math.random() * 0.8);
    p.color = Array.isArray(color) ? color[i % color.length] : color; p.gravity = gravity; p.alive = true;
    spawned++;
  }
  pool.alive += spawned;
  return spawned;
}

export function step(pool, dtMs) {
  const dt = dtMs / 1000;
  for (const p of pool.items) {
    if (!p.alive) continue;
    p.life += dtMs;
    if (p.life >= p.ttl) { p.alive = false; pool.alive--; continue; }
    p.vy += p.gravity * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
  }
}

export function draw(pool, ctx) {
  ctx.save();
  for (const p of pool.items) {
    if (!p.alive) continue;
    const t = 1 - p.life / p.ttl;
    ctx.globalAlpha = Math.max(0, t);
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size * (0.5 + 0.5 * t), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

export function clear(pool) {
  for (const p of pool.items) p.alive = false;
  pool.alive = 0;
}
