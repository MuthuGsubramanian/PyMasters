import { useState } from 'react';
import useReducedMotion from '../../hooks/useReducedMotion';

// ──────────────────────────────────────────────────────────────────────────────
// Neural network visual — a 2-4-1 network (tanh hidden units, sigmoid output)
// trained by full-batch gradient descent with hand-written backpropagation on an
// XOR-style puzzle no straight line can solve. Data comes from a fixed-seed
// generator; every forward pass, gradient and snapshot below is computed for
// real at module load. Pure SVG; step states clamp defensively.
// ──────────────────────────────────────────────────────────────────────────────

const H = 4;
const LR = 0.8;
const EPOCHS = 300;
const SNAP_EVERY = 10;

// Deterministic pseudo-random normals (LCG + Box-Muller) — no Math.random.
function makeNormals(seed) {
    let s = seed;
    const u = () => { s = (s * 1664525 + 1013904223) % 4294967296; return (s + 1) / 4294967297; };
    return () => Math.sqrt(-2 * Math.log(u())) * Math.cos(2 * Math.PI * u());
}

// Four clusters at the corners of a square; opposite corners share a class.
const randn = makeNormals(11);
const PTS = [];
[[-1, -1, 0], [1, 1, 0], [-1, 1, 1], [1, -1, 1]].forEach(([cx, cy, l]) => {
    for (let i = 0; i < 6; i++) PTS.push({ x: cx + randn() * 0.3, y: cy + randn() * 0.3, l });
});

const sigmoid = (z) => 1 / (1 + Math.exp(-z));

const rn = makeNormals(3);
const initNet = () => ({
    W1: Array.from({ length: H }, () => [rn() * 0.5, rn() * 0.5]),
    b1: Array(H).fill(0),
    W2: Array.from({ length: H }, () => rn() * 0.5),
    b2: 0,
});

const forward = (m, x, y) => {
    const h = m.W1.map((w, j) => Math.tanh(w[0] * x + w[1] * y + m.b1[j]));
    return { h, p: sigmoid(h.reduce((s, v, j) => s + v * m.W2[j], m.b2)) };
};
const netLoss = (m) => PTS.reduce((s, q) => {
    const p = forward(m, q.x, q.y).p;
    return s - (q.l ? Math.log(p) : Math.log(1 - p));
}, 0) / PTS.length;
const netAcc = (m) => PTS.filter((q) => (forward(m, q.x, q.y).p > 0.5) === !!q.l).length / PTS.length;

// One backprop + gradient step. For sigmoid + cross-entropy the output error is
// simply (p - label); it is then pushed back through W2 and the tanh slope.
function trainStep(m) {
    const g = { W1: m.W1.map(() => [0, 0]), b1: Array(H).fill(0), W2: Array(H).fill(0), b2: 0 };
    PTS.forEach((q) => {
        const { h, p } = forward(m, q.x, q.y);
        const d = p - q.l;
        g.b2 += d;
        for (let j = 0; j < H; j++) {
            g.W2[j] += d * h[j];
            const dz = d * m.W2[j] * (1 - h[j] * h[j]);
            g.W1[j][0] += dz * q.x;
            g.W1[j][1] += dz * q.y;
            g.b1[j] += dz;
        }
    });
    const n = PTS.length;
    return {
        W1: m.W1.map((w, j) => [w[0] - (LR * g.W1[j][0]) / n, w[1] - (LR * g.W1[j][1]) / n]),
        b1: m.b1.map((b, j) => b - (LR * g.b1[j]) / n),
        W2: m.W2.map((w, j) => w - (LR * g.W2[j]) / n),
        b2: m.b2 - (LR * g.b2) / n,
    };
}

// Snapshots every SNAP_EVERY epochs, plus the loss at every epoch for the curve.
const SNAPS = [];
const LOSSES = [];
{
    let m = initNet();
    for (let e = 0; e <= EPOCHS; e++) {
        const loss = netLoss(m);
        LOSSES.push(loss);
        if (e % SNAP_EVERY === 0) SNAPS.push({ epoch: e, net: m, loss, acc: netAcc(m) });
        m = trainStep(m);
    }
}
const snapAt = (epoch) => SNAPS.find((s) => s.epoch === epoch) || SNAPS[SNAPS.length - 1];
const FINAL = SNAPS[SNAPS.length - 1];

// Best straight-line model (logistic regression, same loss, same data) for contrast.
const LINEAR = (() => {
    let w = [0, 0, 0];
    const losses = [];
    for (let e = 0; e <= EPOCHS; e++) {
        let g = [0, 0, 0], l = 0;
        PTS.forEach((q) => {
            const p = sigmoid(w[0] * q.x + w[1] * q.y + w[2]);
            const d = p - q.l;
            g[0] += d * q.x; g[1] += d * q.y; g[2] += d;
            l -= q.l ? Math.log(p) : Math.log(1 - p);
        });
        losses.push(l / PTS.length);
        w = w.map((v, i) => v - (LR * g[i]) / PTS.length);
    }
    const acc = PTS.filter((q) => (sigmoid(w[0] * q.x + w[1] * q.y + w[2]) > 0.5) === !!q.l).length / PTS.length;
    return { w, losses, acc, predict: (x, y) => sigmoid(w[0] * x + w[1] * y + w[2]) };
})();

const STEP_STATES = [
    { mode: 'points' },
    { mode: 'linear' },
    { mode: 'net', snap: snapAt(0) },
    { mode: 'net', snap: snapAt(10) },
    { mode: 'net', snap: snapAt(30) },
    { mode: 'interactive' },
    { mode: 'net', snap: FINAL },
    { mode: 'curve' },
];

// Plot geometry: data range [-1.8, 1.8] on both axes mapped to a 260px square.
const PX0 = 70, PY0 = 25, SIZE = 260, RANGE = 1.8;
const sx = (x) => PX0 + ((x + RANGE) / (2 * RANGE)) * SIZE;
const sy = (y) => PY0 + ((RANGE - y) / (2 * RANGE)) * SIZE;
const CELLS = 26;
const CELL = SIZE / CELLS;

// Background tint = what the model believes at that spot: ring-filled tint for
// class 0, solid tint for class 1 (only faint, so the points stay readable).
function Field({ predict }) {
    const cells = [];
    for (let i = 0; i < CELLS; i++) {
        for (let j = 0; j < CELLS; j++) {
            const x = -RANGE + ((i + 0.5) / CELLS) * 2 * RANGE;
            const y = RANGE - ((j + 0.5) / CELLS) * 2 * RANGE;
            const p = predict(x, y);
            const one = p > 0.5;
            cells.push(
                <rect key={`${i}-${j}`} x={PX0 + i * CELL} y={PY0 + j * CELL} width={CELL + 0.4} height={CELL + 0.4}
                    fill={one ? 'var(--secondary)' : 'var(--accent-primary)'}
                    fillOpacity={0.08 + 0.3 * Math.abs(p - 0.5) * 2} />,
            );
        }
    }
    return <g>{cells}</g>;
}

// Class 0 = circle, class 1 = square — shape carries the class, not colour.
function Points({ snapPredict }) {
    return (
        <g>
            {PTS.map((q, i) => {
                const col = q.l ? 'var(--secondary)' : 'var(--accent-primary)';
                const wrong = snapPredict && (snapPredict(q.x, q.y) > 0.5) !== !!q.l;
                const common = { fill: col, stroke: wrong ? 'var(--destructive)' : 'currentColor', strokeWidth: wrong ? 2 : 1, strokeOpacity: wrong ? 1 : 0.35 };
                return q.l
                    ? <rect key={i} x={sx(q.x) - 5} y={sy(q.y) - 5} width="10" height="10" rx="2" {...common} />
                    : <circle key={i} cx={sx(q.x)} cy={sy(q.y)} r="5.5" {...common} />;
            })}
        </g>
    );
}

function Curve({ reducedMotion }) {
    const x0 = 50, x1 = 370, y0 = 235, y1 = 60;
    const maxL = Math.max(LOSSES[0], LINEAR.losses[0]) * 1.05;
    const px = (e) => x0 + ((x1 - x0) * e) / EPOCHS;
    const py = (v) => y0 - ((y0 - y1) * v) / maxL;
    const line = (arr) => arr.map((v, e) => `${px(e).toFixed(1)},${py(v).toFixed(1)}`).join(' ');
    return (
        <g>
            <line x1={x0} y1={y0} x2={x1} y2={y0} stroke="currentColor" strokeOpacity="0.3" />
            <line x1={x0} y1={y0} x2={x0} y2={y1 - 10} stroke="currentColor" strokeOpacity="0.3" />
            <polyline points={line(LINEAR.losses)} fill="none" stroke="var(--destructive)" strokeWidth="2.5" strokeDasharray="6 4" />
            <polyline points={line(LOSSES)} fill="none" stroke="var(--accent-primary)" strokeWidth="2.5"
                className={reducedMotion ? undefined : 'transition-all'} />
            <text x={(x0 + x1) / 2} y="258" textAnchor="middle" fontSize="11" fill="currentColor" fillOpacity="0.7">training epoch</text>
            <text x="14" y="148" fontSize="11" fill="currentColor" fillOpacity="0.7" transform="rotate(-90 14 148)" textAnchor="middle">loss</text>
            <text x="372" y="46" textAnchor="end" fontSize="11" fontFamily="monospace" fill="currentColor" fillOpacity="0.85">
                network (solid) {LOSSES[0].toFixed(2)} → {FINAL.loss.toFixed(3)}
            </text>
            <text x="372" y="30" textAnchor="end" fontSize="11" fontFamily="monospace" fill="currentColor" fillOpacity="0.85">
                straight line (dashed) stuck at {LINEAR.losses[EPOCHS].toFixed(2)}
            </text>
        </g>
    );
}

export default function NeuralNetworkVisual({ stepIndex = 0 }) {
    const idx = Math.max(0, Math.min(stepIndex, STEP_STATES.length - 1));
    const state = STEP_STATES[idx];
    const interactive = state.mode === 'interactive';
    const reducedMotion = useReducedMotion();

    const [epoch, setEpoch] = useState(0);
    const [wasInteractive, setWasInteractive] = useState(interactive);
    if (interactive !== wasInteractive) {
        setWasInteractive(interactive);
        if (!interactive) setEpoch(0);
    }

    let predict = null, label = null;
    if (state.mode === 'net') {
        predict = (x, y) => forward(state.snap.net, x, y).p;
        label = `epoch ${state.snap.epoch} · loss ${state.snap.loss.toFixed(3)} · ${Math.round(state.snap.acc * 100)}% correct`;
    } else if (state.mode === 'linear') {
        predict = LINEAR.predict;
        label = `straight line · ${Math.round(LINEAR.acc * 100)}% correct`;
    } else if (interactive) {
        const s = snapAt(epoch);
        predict = (x, y) => forward(s.net, x, y).p;
        label = `epoch ${s.epoch} · loss ${s.loss.toFixed(3)} · ${Math.round(s.acc * 100)}% correct`;
    }

    return (
        <div className="h-full flex flex-col text-text-secondary">
            <svg viewBox="0 0 400 300" className="flex-1 min-h-0 w-full" role="img"
                aria-label="Two classes of points arranged like an XOR puzzle: circles at opposite corners and squares at the other two. A shaded map shows what a model believes at each spot, first a straight line that fails and then a small neural network whose map bends to separate all points as training proceeds">
                {state.mode === 'curve' ? (
                    <Curve reducedMotion={reducedMotion} />
                ) : (
                    <>
                        <rect x={PX0} y={PY0} width={SIZE} height={SIZE} rx="6" fill="none" stroke="currentColor" strokeOpacity="0.15" />
                        {predict && <Field predict={predict} />}
                        <Points snapPredict={predict} />
                        {state.mode === 'points' && (
                            <text x="200" y="296" textAnchor="middle" fontSize="11" fill="currentColor" fillOpacity="0.6">
                                24 points · circles vs squares · opposite corners match
                            </text>
                        )}
                        {label && (
                            <text x="200" y="296" textAnchor="middle" fontSize="11" fontFamily="monospace" fill="currentColor" fillOpacity="0.75">
                                {label}
                            </text>
                        )}
                    </>
                )}
            </svg>

            {interactive && (
                <div className="flex-shrink-0 pt-2 flex flex-wrap items-center gap-3">
                    <label className="flex items-center gap-2 text-xs font-medium text-text-muted">
                        Training epoch
                        <input type="range" min="0" max={EPOCHS} step={SNAP_EVERY} value={epoch}
                            onChange={(e) => setEpoch(Number(e.target.value))}
                            aria-label="Training epoch" className="cursor-pointer" />
                    </label>
                    <span className="text-xs font-mono text-text-muted">
                        {epoch} · loss {snapAt(epoch).loss.toFixed(3)}
                    </span>
                </div>
            )}
        </div>
    );
}
