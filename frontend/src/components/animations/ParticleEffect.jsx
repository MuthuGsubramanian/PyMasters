import { useEffect, useRef } from 'react';
import gsap from 'gsap';

const CONFETTI_COLORS = ['#f59e0b', '#06b6d4', '#8b5cf6', '#10b981', '#ef4444'];

function createConfettiParticles(container, count) {
  const particles = [];
  for (let i = 0; i < count; i++) {
    const el = document.createElement('div');
    const size = Math.random() * 10 + 6;
    const color = CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)];
    el.style.cssText = `
      position: absolute;
      width: ${size}px;
      height: ${size}px;
      background: ${color};
      border-radius: ${Math.random() > 0.5 ? '50%' : '2px'};
      left: 50%;
      top: 50%;
      opacity: 0;
      pointer-events: none;
    `;
    container.appendChild(el);
    particles.push(el);
  }
  return particles;
}

function createSparkParticles(container, count) {
  const particles = [];
  for (let i = 0; i < count; i++) {
    const el = document.createElement('div');
    const size = Math.random() * 6 + 4;
    el.style.cssText = `
      position: absolute;
      width: ${size}px;
      height: ${size}px;
      background: #ef4444;
      border-radius: 50%;
      left: 50%;
      top: 50%;
      opacity: 0;
      pointer-events: none;
      box-shadow: 0 0 6px #ef4444, 0 0 12px #ef444480;
    `;
    container.appendChild(el);
    particles.push(el);
  }
  return particles;
}

function createThinkingDots(container, count) {
  const particles = [];
  for (let i = 0; i < count; i++) {
    const el = document.createElement('div');
    const size = Math.random() * 8 + 4;
    el.style.cssText = `
      position: absolute;
      width: ${size}px;
      height: ${size}px;
      background: #8b5cf6;
      border-radius: 50%;
      left: 50%;
      top: 50%;
      opacity: 0;
      pointer-events: none;
    `;
    container.appendChild(el);
    particles.push(el);
  }
  return particles;
}

export default function ParticleEffect({ effect = 'success_confetti', trigger, active = false }) {
  const containerRef = useRef(null);
  const tlRef = useRef(null);

  useEffect(() => {
    if (!active || !containerRef.current) return;

    const container = containerRef.current;
    // Clear previous particles
    container.innerHTML = '';
    if (tlRef.current) tlRef.current.kill();

    const tl = gsap.timeline();
    tlRef.current = tl;

    if (effect === 'success_confetti') {
      const particles = createConfettiParticles(container, 40);
      particles.forEach((el, i) => {
        const angle = (i / particles.length) * Math.PI * 2 + Math.random() * 0.5;
        const radius = 120 + Math.random() * 180;
        const tx = Math.cos(angle) * radius;
        const ty = Math.sin(angle) * radius;
        tl.fromTo(
          el,
          { opacity: 1, x: 0, y: 0, rotation: 0, scale: 1 },
          {
            opacity: 0,
            x: tx,
            y: ty,
            rotation: Math.random() * 720 - 360,
            scale: 0.3,
            duration: 1.2 + Math.random() * 0.6,
            ease: 'power2.out',
          },
          i * 0.02
        );
      });
    } else if (effect === 'error_sparks') {
      const particles = createSparkParticles(container, 15);
      particles.forEach((el, i) => {
        const angle = (i / particles.length) * Math.PI * 2;
        const radius = 60 + Math.random() * 80;
        const tx = Math.cos(angle) * radius;
        const ty = Math.sin(angle) * radius;
        tl.fromTo(
          el,
          { opacity: 1, x: 0, y: 0, scale: 1 },
          {
            opacity: 0,
            x: tx,
            y: ty,
            scale: 0.2,
            duration: 0.8 + Math.random() * 0.3,
            ease: 'power3.out',
          },
          i * 0.03
        );
      });
    } else if (effect === 'thinking_dots') {
      const particles = createThinkingDots(container, 8);
      particles.forEach((el, i) => {
        tl.fromTo(
          el,
          { opacity: 0, y: 0, x: (i - 4) * 20 + 10 },
          {
            opacity: 0.8,
            y: -30,
            duration: 0.4,
            ease: 'power2.out',
            yoyo: true,
            repeat: 3,
          },
          i * 0.1
        );
      });
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
