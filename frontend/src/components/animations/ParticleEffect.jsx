import { useEffect, useRef } from 'react';
import gsap from 'gsap';

const CONFETTI_COLORS = ['#f59e0b', '#06b6d4', '#8b5cf6', '#10b981', '#ef4444', '#ec4899', '#3b82f6'];
const SHAPES = ['circle', 'rect', 'star'];

function createParticle(container, { color, size, shape, glow }) {
  const el = document.createElement('div');
  const borderRadius = shape === 'circle' ? '50%' : shape === 'star' ? '2px' : '3px';
  const rotation = shape === 'star' ? 'rotate(45deg)' : '';
  el.style.cssText = `
    position: absolute;
    width: ${size}px;
    height: ${size}px;
    background: ${color};
    border-radius: ${borderRadius};
    left: 50%;
    top: 50%;
    opacity: 0;
    pointer-events: none;
    transform: ${rotation};
    ${glow ? `box-shadow: 0 0 ${size}px ${color}80, 0 0 ${size * 2}px ${color}40;` : ''}
  `;
  container.appendChild(el);
  return el;
}

function burstConfetti(container, tl) {
  const particles = [];
  // Main burst - 50 particles
  for (let i = 0; i < 50; i++) {
    const color = CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)];
    const size = Math.random() * 10 + 4;
    const shape = SHAPES[Math.floor(Math.random() * SHAPES.length)];
    const el = createParticle(container, { color, size, shape, glow: Math.random() > 0.6 });
    particles.push(el);

    const angle = (i / 50) * Math.PI * 2 + (Math.random() - 0.5) * 0.8;
    const radius = 100 + Math.random() * 250;
    const tx = Math.cos(angle) * radius;
    const ty = Math.sin(angle) * radius - Math.random() * 100; // gravity bias upward

    tl.fromTo(
      el,
      { opacity: 1, x: 0, y: 0, rotation: 0, scale: 1 },
      {
        opacity: 0,
        x: tx,
        y: ty + 100, // gravity pull
        rotation: Math.random() * 1080 - 540,
        scale: 0.1 + Math.random() * 0.3,
        duration: 1.5 + Math.random() * 1,
        ease: 'power2.out',
      },
      i * 0.015
    );
  }

  // Secondary ring burst after a tiny delay
  for (let i = 0; i < 20; i++) {
    const color = CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)];
    const size = Math.random() * 6 + 3;
    const el = createParticle(container, { color, size, shape: 'circle', glow: true });
    particles.push(el);

    const angle = (i / 20) * Math.PI * 2;
    const radius = 60 + Math.random() * 80;

    tl.fromTo(
      el,
      { opacity: 0.9, x: 0, y: 0, scale: 1 },
      {
        opacity: 0,
        x: Math.cos(angle) * radius,
        y: Math.sin(angle) * radius,
        scale: 0.2,
        duration: 0.8,
        ease: 'power3.out',
      },
      0.15 + i * 0.02
    );
  }

  // Shimmer ring
  const ring = document.createElement('div');
  ring.style.cssText = `
    position: absolute;
    left: 50%;
    top: 50%;
    transform: translate(-50%, -50%);
    width: 10px;
    height: 10px;
    border: 2px solid rgba(139, 92, 246, 0.6);
    border-radius: 50%;
    pointer-events: none;
  `;
  container.appendChild(ring);
  tl.fromTo(ring,
    { opacity: 0.8, scale: 1 },
    { opacity: 0, scale: 15, duration: 1.2, ease: 'power2.out' },
    0.05
  );

  return particles;
}

function burstSparks(container, tl) {
  const particles = [];
  for (let i = 0; i < 20; i++) {
    const size = Math.random() * 6 + 3;
    const el = createParticle(container, {
      color: i < 10 ? '#ef4444' : '#f97316',
      size,
      shape: 'circle',
      glow: true,
    });
    particles.push(el);

    const angle = (i / 20) * Math.PI * 2;
    const radius = 40 + Math.random() * 80;

    tl.fromTo(
      el,
      { opacity: 1, x: 0, y: 0, scale: 1 },
      {
        opacity: 0,
        x: Math.cos(angle) * radius,
        y: Math.sin(angle) * radius,
        scale: 0.1,
        duration: 0.6 + Math.random() * 0.4,
        ease: 'power3.out',
      },
      i * 0.025
    );
  }
  return particles;
}

function burstThinking(container, tl) {
  const particles = [];
  const colors = ['#8b5cf6', '#06b6d4', '#a855f7'];
  for (let i = 0; i < 12; i++) {
    const size = Math.random() * 8 + 4;
    const color = colors[i % colors.length];
    const el = createParticle(container, { color, size, shape: 'circle', glow: true });
    particles.push(el);

    tl.fromTo(
      el,
      { opacity: 0, y: 0, x: (i - 6) * 16 },
      {
        opacity: 0.8,
        y: -25 - Math.random() * 20,
        duration: 0.5,
        ease: 'power2.out',
        yoyo: true,
        repeat: 3,
      },
      i * 0.08
    );
  }
  return particles;
}

export default function ParticleEffect({ effect = 'success_confetti', trigger, active = false }) {
  const containerRef = useRef(null);
  const tlRef = useRef(null);

  useEffect(() => {
    if (!active || !containerRef.current) return;

    const container = containerRef.current;
    container.innerHTML = '';
    if (tlRef.current) tlRef.current.kill();

    const tl = gsap.timeline();
    tlRef.current = tl;

    if (effect === 'success_confetti') {
      burstConfetti(container, tl);
    } else if (effect === 'error_sparks') {
      burstSparks(container, tl);
    } else if (effect === 'thinking_dots') {
      burstThinking(container, tl);
    }

    return () => {
      tl.kill();
    };
  }, [active, effect, trigger]);

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 z-50 pointer-events-none flex items-center justify-center"
    />
  );
}
