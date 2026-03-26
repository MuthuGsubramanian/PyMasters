import { useEffect, useRef, useMemo } from 'react';
import gsap from 'gsap';

export default function FlowArrow({ label = '', style = 'solid', direction = 'down', duration = 3000, onComplete }) {
  const arrowRef = useRef(null);

  const isVertical = direction === 'down' || direction === 'up';

  // Stabilize props to prevent re-render loops
  const stableLabel = useMemo(() => label, [JSON.stringify(label)]);

  // Ref for onComplete to avoid it being a useEffect dependency
  const onCompleteRef = useRef(onComplete);
  useEffect(() => { onCompleteRef.current = onComplete; }, [onComplete]);

  useEffect(() => {
    if (!arrowRef.current) return;

    const holdSeconds = Math.max(duration / 1000, 2);

    const tl = gsap.timeline({ onComplete: () => onCompleteRef.current?.() });

    tl.fromTo(
      arrowRef.current,
      {
        opacity: 0,
        scaleY: isVertical ? 0 : 1,
        scaleX: isVertical ? 1 : 0,
        transformOrigin: direction === 'down' ? 'top center' :
                         direction === 'up' ? 'bottom center' :
                         direction === 'right' ? 'left center' : 'right center',
      },
      {
        opacity: 1,
        scaleY: 1,
        scaleX: 1,
        duration: 0.5,
        ease: 'power2.out',
      }
    );

    // Hold so users can see the result before completing
    tl.to({}, { duration: holdSeconds });

    return () => {
      tl.kill();
    };
  }, [stableLabel, direction, style, isVertical, duration]);

  // SVG dimensions based on direction
  const svgProps = isVertical
    ? { width: 40, height: 80, viewBox: '0 0 40 80' }
    : { width: 120, height: 40, viewBox: '0 0 120 40' };

  const strokeDasharray = style === 'dashed' ? '6 4' : 'none';

  let linePath = '';
  let arrowhead = null;

  if (direction === 'down') {
    linePath = 'M 20 0 L 20 60';
    arrowhead = <polygon points="20,80 11,60 29,60" fill="#94a3b8" />;
  } else if (direction === 'up') {
    linePath = 'M 20 80 L 20 20';
    arrowhead = <polygon points="20,0 11,20 29,20" fill="#94a3b8" />;
  } else if (direction === 'right') {
    linePath = 'M 0 20 L 100 20';
    arrowhead = <polygon points="120,20 100,11 100,29" fill="#94a3b8" />;
  } else {
    // left
    linePath = 'M 120 20 L 20 20';
    arrowhead = <polygon points="0,20 20,11 20,29" fill="#94a3b8" />;
  }

  return (
    <div ref={arrowRef} className="flex flex-col items-center gap-1 opacity-0">
      {stableLabel && direction !== 'down' && (
        <span className="text-xs text-slate-700 mb-1">{stableLabel}</span>
      )}
      <svg {...svgProps}>
        <line
          x1={linePath.split(' ')[1]}
          y1={linePath.split(' ')[2]}
          x2={linePath.split(' ')[4]}
          y2={linePath.split(' ')[5]}
          stroke="#94a3b8"
          strokeWidth="2"
          strokeDasharray={strokeDasharray}
        />
        {arrowhead}
      </svg>
      {stableLabel && direction === 'down' && (
        <span className="text-xs text-slate-700 mt-1">{stableLabel}</span>
      )}
    </div>
  );
}
