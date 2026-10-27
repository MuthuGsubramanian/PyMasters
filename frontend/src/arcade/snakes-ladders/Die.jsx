import { motion } from 'framer-motion';

const PIPS = {
  1: [[50, 50]], 2: [[25, 25], [75, 75]], 3: [[25, 25], [50, 50], [75, 75]],
  4: [[25, 25], [75, 25], [25, 75], [75, 75]], 5: [[25, 25], [75, 25], [50, 50], [25, 75], [75, 75]],
  6: [[25, 25], [75, 25], [25, 50], [75, 50], [25, 75], [75, 75]],
};
// Rotation that brings each face to the front of the CSS cube.
const FACE_ROT = { 1: [0, 0], 2: [0, -90], 3: [0, 180], 4: [0, 90], 5: [-90, 0], 6: [90, 0] };
const FACE_TRANSFORM = {
  1: 'rotateY(0deg) translateZ(28px)', 2: 'rotateY(90deg) translateZ(28px)', 3: 'rotateY(180deg) translateZ(28px)',
  4: 'rotateY(-90deg) translateZ(28px)', 5: 'rotateX(90deg) translateZ(28px)', 6: 'rotateX(-90deg) translateZ(28px)',
};

function Face({ n }) {
  return (
    <div className="absolute inset-0 rounded-xl bg-white border border-gray-300 shadow-inner" style={{ transform: FACE_TRANSFORM[n], backfaceVisibility: 'hidden' }}>
      <svg viewBox="0 0 100 100" className="w-full h-full" aria-hidden="true">
        {PIPS[n].map(([x, y], i) => <circle key={i} cx={x} cy={y} r="9" fill="#1f2937" />)}
      </svg>
    </div>
  );
}

/** A CSS 3-D die. `value` 1–6 is the face shown; `rolling` adds a tumble before settling. */
export function Die({ value = 1, rolling = false, reducedMotion = false }) {
  if (reducedMotion) {
    return (
      <div className="w-14 h-14 rounded-xl bg-white border border-gray-300 flex items-center justify-center text-2xl font-bold text-gray-800" aria-label={`die shows ${value}`} data-die={value}>
        {value}
      </div>
    );
  }
  const [rx, ry] = FACE_ROT[value] || [0, 0];
  return (
    <div className="w-14 h-14" style={{ perspective: '320px' }} aria-label={`die shows ${value}`} data-die={value}>
      <motion.div className="relative w-full h-full" style={{ transformStyle: 'preserve-3d' }}
        animate={{ rotateX: rolling ? rx + 720 : rx, rotateY: rolling ? ry + 1080 : ry }}
        transition={{ duration: rolling ? 0.7 : 0.35, ease: 'easeOut' }}>
        {[1, 2, 3, 4, 5, 6].map((n) => <Face key={n} n={n} />)}
      </motion.div>
    </div>
  );
}

export default Die;
