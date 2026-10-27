import { motion } from 'framer-motion';
import { SIZE, squareToXY, BOARD_THEMES } from './board.js';
import { RIVAL, YOU, snakeTailFor } from './rules.js';

const CELL = 10;

function Ladder({ foot, head, accent, turned }) {
  const a = squareToXY(foot, CELL);
  const b = squareToXY(head, CELL);
  const dx = b.x - a.x, dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const nx = (-dy / len) * 1.6, ny = (dx / len) * 1.6;      // rail offset
  const rungs = Math.max(2, Math.round(len / 4));
  if (turned) {
    const tail = squareToXY(snakeTailFor(foot, head), CELL);
    return <Snake head={foot} tailXY={tail} accent="#7f1d1d" dashed />;
  }
  return (
    <g data-ladder={foot} stroke={accent} strokeWidth="1.1" strokeLinecap="round" opacity="0.95">
      <line x1={a.x + nx} y1={a.y + ny} x2={b.x + nx} y2={b.y + ny} />
      <line x1={a.x - nx} y1={a.y - ny} x2={b.x - nx} y2={b.y - ny} />
      {Array.from({ length: rungs }).map((_, i) => {
        const t = (i + 0.5) / rungs;
        const x = a.x + dx * t, y = a.y + dy * t;
        return <line key={i} x1={x + nx} y1={y + ny} x2={x - nx} y2={y - ny} strokeWidth="0.9" />;
      })}
    </g>
  );
}

function Snake({ head, tail, tailXY, accent, dashed }) {
  const h = squareToXY(head, CELL);
  const t = tailXY || squareToXY(tail, CELL);
  const mx = (h.x + t.x) / 2, my = (h.y + t.y) / 2;
  const dx = t.x - h.x, dy = t.y - h.y;
  const len = Math.hypot(dx, dy) || 1;
  const bend = 9;
  const c1x = mx - (dy / len) * bend, c1y = my + (dx / len) * bend;
  const c2x = mx + (dy / len) * bend, c2y = my - (dx / len) * bend;
  const d = `M ${h.x} ${h.y} C ${c1x} ${c1y}, ${c2x} ${c2y}, ${t.x} ${t.y}`;
  return (
    <g data-snake={head} fill="none" strokeLinecap="round">
      <path d={d} stroke={accent} strokeWidth="2.6" opacity="0.9" strokeDasharray={dashed ? '2 1.2' : undefined} />
      <path d={d} stroke="#fff" strokeWidth="0.7" opacity="0.5" strokeDasharray="1.4 2.2" />
      <circle cx={h.x} cy={h.y} r="2.1" fill={accent} />
      <circle cx={h.x - 0.7} cy={h.y - 0.5} r="0.45" fill="#fff" />
      <circle cx={h.x + 0.7} cy={h.y - 0.5} r="0.45" fill="#fff" />
    </g>
  );
}

function Token({ id, pos, color, reducedMotion, offset }) {
  const { x, y } = squareToXY(Math.max(1, pos), CELL);
  const tx = x + offset, ty = y - 1.2;
  const Comp = reducedMotion ? 'g' : motion.g;
  const props = reducedMotion ? { transform: `translate(${tx} ${ty})` }
    : { initial: false, animate: { x: tx, y: ty }, transition: { type: 'spring', stiffness: 420, damping: 26 } };
  return (
    <Comp data-token={id} data-pos={pos} {...props} style={pos === 0 ? { opacity: 0.35 } : undefined}>
      <ellipse cx="0" cy="2.4" rx="2.6" ry="1" fill="#000" opacity="0.25" />
      <circle cx="0" cy="0" r="2.6" fill={color} stroke="#fff" strokeWidth="0.6" />
      {id === RIVAL && <><circle cx="-0.8" cy="-0.4" r="0.5" fill="#1f1f1f" /><circle cx="0.8" cy="-0.4" r="0.5" fill="#1f1f1f" /><circle cx="0" cy="0.9" r="0.5" fill="#1f1f1f" /></>}
      {id === YOU && <text x="0" y="0.9" textAnchor="middle" fontSize="3" fontWeight="700" fill="#fff" fontFamily="Outfit, sans-serif">Py</text>}
    </Comp>
  );
}

/**
 * The 10×10 board in SVG: numbered squares, hand-inked ladders, serpentine snakes, tokens.
 * `turned` ladders render as snakes; `highlight` marks the square a question is about.
 */
export function Board({ boardKey, layout, players, turned, highlight, reducedMotion }) {
  const theme = BOARD_THEMES[boardKey] || BOARD_THEMES.variables;
  const squares = [];
  for (let n = 1; n <= 100; n++) {
    const { x, y } = squareToXY(n, CELL);
    const { col, row } = { col: Math.round((x - 5) / CELL), row: Math.round((y - 5) / CELL) };
    const dark = (col + row) % 2 === 0;
    squares.push(
      <g key={n}>
        <rect x={x - 5} y={y - 5} width={CELL} height={CELL} fill={dark ? theme.paper : '#ffffff'} stroke={theme.ink} strokeOpacity="0.18" strokeWidth="0.3" />
        <text x={x - 4.2} y={y - 2.6} fontSize="2.2" fill={theme.ink} fillOpacity="0.55" fontFamily="JetBrains Mono, monospace">{n}</text>
        {highlight === n && <rect x={x - 5} y={y - 5} width={CELL} height={CELL} fill={theme.accent} fillOpacity="0.22" stroke={theme.accent} strokeWidth="0.6" />}
      </g>,
    );
  }
  return (
    <svg viewBox={`-1 -1 ${SIZE * CELL + 2} ${SIZE * CELL + 2}`} role="img"
      aria-label={`${theme.title} board. You are on square ${players[0]?.pos || 0}${players[1] ? `, Bugsy on ${players[1].pos || 0}` : ''}.`}
      className="w-full h-auto rounded-2xl shadow-md border border-border-default" style={{ background: theme.paper, maxHeight: '72vh' }}>
      <rect x="-1" y="-1" width={SIZE * CELL + 2} height={SIZE * CELL + 2} rx="3" fill={theme.paper} />
      {squares}
      {Object.entries(layout.snakes).map(([h, t]) => <Snake key={`s${h}`} head={Number(h)} tail={t} accent="#166534" />)}
      {Object.entries(layout.ladders).map(([f, h]) => <Ladder key={`l${f}`} foot={Number(f)} head={h} accent={theme.accent} turned={Boolean(turned?.[f])} />)}
      <text x="50" y="104" textAnchor="middle" fontSize="2.6" fill={theme.ink} fillOpacity="0.7" fontFamily="Outfit, sans-serif">{theme.subtitle}</text>
      {players.map((p, i) => <Token key={p.id} id={p.id} pos={p.pos} color={p.id === YOU ? '#2563eb' : '#f97316'} reducedMotion={reducedMotion} offset={players.length > 1 ? (i === 0 ? -1.6 : 1.6) : 0} />)}
    </svg>
  );
}

export default Board;
