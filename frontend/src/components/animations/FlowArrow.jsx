import { useEffect, useRef, useMemo } from 'react';
import gsap from 'gsap';

export default function FlowArrow({ label = '', style = 'solid', direction = 'down', duration = 3000, onComplete }) {
  const arrowRef = useRef(null);
  const pathRef = useRef(null);
  const labelRef = useRef(null);

  const isVertical = direction === 'down' || direction === 'up';
  const stableLabel = useMemo(() => label, [JSON.stringify(label)]);

  const onCompleteRef = useRef(onComplete);
  useEffect(() => { onCompleteRef.current = onComplete; }, [onComplete]);

  useEffect(() => {
    if (!arrowRef.current) return;

    const holdSeconds = Math.max(duration / 1000, 2);

    const tl = gsap.timeline({ onComplete: () => onCompleteRef.current?.() });

    // Container fade in
    tl.fromTo(
      arrowRef.current,
      { opacity: 0 },
      { opacity: 1, duration: 0.3, ease: 'power2.out' }
    );

    // Animate the SVG path drawing effect
    if (pathRef.current) {
      const length = pathRef.current.getTotalLength?.() || 100;
      tl.fromTo(
        pathRef.current,
        { strokeDasharray: length, strokeDashoffset: length },
        { strokeDashoffset: 0, duration: 0.6, ease: 'power2.inOut' },
        0.1
      );
    }

    // Label fade in
    if (labelRef.current) {
      tl.fromTo(
        labelRef.current,
        { opacity: 0, y: 4 },
        { opacity: 1, y: 0, duration: 0.3, ease: 'power2.out' },
        0.5
      );
    }

    tl.to({}, { duration: holdSeconds });

    return () => { tl.kill(); };
  }, [stableLabel, direction, style, isVertical, duration]);

  const strokeDasharray = style === 'dashed' ? '6 4' : 'none';
  const gradientId = `arrow-grad-${direction}`;

  // Larger, better-looking arrows
  const svgProps = isVertical
    ? { width: 60, height: 90, viewBox: '0 0 60 90' }
    : { width: 140, height: 50, viewBox: '0 0 140 50' };

  let pathD = '';
  let arrowhead = null;

  if (direction === 'down') {
    pathD = 'M 30 5 L 30 65';
    arrowhead = <polygon points="30,85 20,65 40,65" fill={`url(#${gradientId})`} />;
  } else if (direction === 'up') {
    pathD = 'M 30 85 L 30 25';
    arrowhead = <polygon points="30,5 20,25 40,25" fill={`url(#${gradientId})`} />;
  } else if (direction === 'right') {
    pathD = 'M 5 25 L 115 25';
    arrowhead = <polygon points="135,25 115,15 115,35" fill={`url(#${gradientId})`} />;
  } else {
    pathD = 'M 135 25 L 25 25';
    arrowhead = <polygon points="5,25 25,15 25,35" fill={`url(#${gradientId})`} />;
  }

  return (
    <div ref={arrowRef} className="flex flex-col items-center gap-1.5 opacity-0">
      {stableLabel && direction !== 'down' && (
        <span ref={labelRef} className="text-xs font-medium text-slate-300 bg-white/[0.05] rounded-lg px-2.5 py-1 border border-white/[0.06] opacity-0">
          {stableLabel}
        </span>
      )}
      <svg {...svgProps} className="drop-shadow-sm">
        <defs>
          <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#06b6d4" />
            <stop offset="100%" stopColor="#8b5cf6" />
          </linearGradient>
        </defs>
        <path
          ref={pathRef}
          d={pathD}
          stroke={`url(#${gradientId})`}
          strokeWidth="2.5"
          fill="none"
          strokeDasharray={strokeDasharray}
          strokeLinecap="round"
        />
        {arrowhead}
      </svg>
      {stableLabel && direction === 'down' && (
        <span ref={labelRef} className="text-xs font-medium text-slate-300 bg-white/[0.05] rounded-lg px-2.5 py-1 border border-white/[0.06] opacity-0">
          {stableLabel}
        </span>
      )}
    </div>
  );
}
