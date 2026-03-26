import { useEffect, useRef, useState } from 'react';
import gsap from 'gsap';

const ILLUSTRATION_MAP = {
  postman_street: '🏘️',
  warehouse_boxes: '📦',
  traffic_signal: '🚦',
  train_compartments: '🚂',
  counting_fingers: '🖐️',
};

export default function StoryCard({ content = '', illustration = '', duration = 3000, onComplete }) {
  const cardRef = useRef(null);
  const textRef = useRef(null);
  const [displayed, setDisplayed] = useState('');

  const emoji = ILLUSTRATION_MAP[illustration] || '📖';

  useEffect(() => {
    if (!cardRef.current) return;

    const tl = gsap.timeline({
      onComplete: () => {
        onComplete?.();
      },
    });

    // Card springs in
    tl.fromTo(
      cardRef.current,
      { opacity: 0, y: 40, scale: 0.95 },
      { opacity: 1, y: 0, scale: 1, duration: 0.6, ease: 'back.out(1.7)' }
    );

    // Typewriter effect
    const chars = content.split('');
    const charDuration = Math.max((duration / 1000 - 0.6) / Math.max(chars.length, 1), 0.02);

    let current = '';
    tl.to(
      {},
      {
        duration: chars.length * charDuration,
        onUpdate: function () {
          const progress = this.progress();
          const charIndex = Math.floor(progress * chars.length);
          current = chars.slice(0, charIndex).join('');
          setDisplayed(current);
        },
        onComplete: () => {
          setDisplayed(content);
        },
      }
    );

    return () => {
      tl.kill();
    };
  }, [content, duration]);

  return (
    <div
      ref={cardRef}
      className="panel rounded-2xl p-6 border-l-4 border-purple-400 opacity-0 max-w-2xl"
    >
      <div className="flex items-start gap-4">
        {/* Vaathiyaar avatar */}
        <div className="flex-shrink-0 w-12 h-12 rounded-full bg-gradient-to-br from-purple-400 to-purple-600 flex items-center justify-center text-xl shadow-lg shadow-purple-300/30">
          🧑‍🏫
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-purple-500 uppercase tracking-widest">
              Vaathiyaar
            </span>
            <span className="text-2xl">{emoji}</span>
          </div>

          <p ref={textRef} className="text-slate-700 text-sm leading-relaxed min-h-[3rem]">
            {displayed}
            <span className="inline-block w-0.5 h-4 bg-purple-500 ml-0.5 animate-pulse align-middle" />
          </p>
        </div>
      </div>
    </div>
  );
}
