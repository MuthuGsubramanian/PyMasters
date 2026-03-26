import { useEffect, useRef } from 'react';
import gsap from 'gsap';

export default function FlowArrow({ label = '', style = 'solid', direction = 'down', onComplete }) {
  const arrowRef = useRef(null);

  const isVertical = direction === 'down' || direction === 'up';

  useEffect(() => {
    if (!arrowRef.current) return;

    gsap.fromTo(
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
        onComplete: () => onComplete?.(),
      }
    );
  }, []);

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
      {label && direction !== 'down' && (
        <span className="text-xs text-slate-700 mb-1">{label}</span>
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
      {label && direction === 'down' && (
        <span className="text-xs text-slate-700 mt-1">{label}</span>
      )}
    </div>
  );
}
