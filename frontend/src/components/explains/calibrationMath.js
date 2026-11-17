// Deterministic maths for the calibration essay. Everything here runs at module
// load: a seeded generator, a "model" that is overconfident by construction,
// reliability bins, ECE, Brier score and a grid-searched temperature.

function makeRng(seed) {
    let s = seed >>> 0;
    return () => {
        s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
        return (s + 0.5) / 4294967296;
    };
}

export const sigmoid = (z) => 1 / (1 + Math.exp(-z));

const N = 400;
const TRUE_SLOPE = 1;      // reality: P(y=1) = sigmoid(t)
const MODEL_SLOPE = 2.8;   // the model shouts: it reports logit = 2.8 * t

function build() {
    const rng = makeRng(20261117);
    const logits = [];
    const labels = [];
    for (let i = 0; i < N; i++) {
        // t ~ roughly normal (sum of 6 uniforms), scaled to sd ≈ 1.5
        let u = 0;
        for (let k = 0; k < 6; k++) u += rng();
        const t = (u - 3) * 1.5 * Math.sqrt(2);
        const y = rng() < sigmoid(TRUE_SLOPE * t) ? 1 : 0;
        logits.push(MODEL_SLOPE * t);
        labels.push(y);
    }
    return { logits, labels };
}

const ALL = build();
// Even-indexed rows fit the temperature; odd-indexed rows are the untouched test half.
export const CAL = { logits: [], labels: [] };
export const TEST = { logits: [], labels: [] };
ALL.logits.forEach((m, i) => {
    const dst = i % 2 === 0 ? CAL : TEST;
    dst.logits.push(m);
    dst.labels.push(ALL.labels[i]);
});

export const NBINS = 10;

export function reliability(logits, labels, T = 1) {
    const bins = Array.from({ length: NBINS }, () => ({ n: 0, sp: 0, sy: 0 }));
    let brier = 0;
    logits.forEach((m, i) => {
        const p = sigmoid(m / T);
        const b = Math.min(NBINS - 1, Math.floor(p * NBINS));
        bins[b].n += 1;
        bins[b].sp += p;
        bins[b].sy += labels[i];
        brier += (p - labels[i]) ** 2;
    });
    const total = logits.length;
    let ece = 0;
    const pts = [];
    bins.forEach((b) => {
        if (!b.n) return;
        const conf = b.sp / b.n;
        const acc = b.sy / b.n;
        ece += (b.n / total) * Math.abs(conf - acc);
        pts.push({ conf, acc, n: b.n });
    });
    return { pts, ece, brier: brier / total };
}

const nll = (logits, labels, T) => {
    let s = 0;
    logits.forEach((m, i) => {
        const p = Math.min(1 - 1e-9, Math.max(1e-9, sigmoid(m / T)));
        s -= labels[i] ? Math.log(p) : Math.log(1 - p);
    });
    return s / logits.length;
};

// Temperature scaling: pick T that minimises log-loss on the calibration half.
export const BEST_T = (() => {
    let best = 1, bl = Infinity;
    for (let T = 0.5; T <= 5.0001; T += 0.01) {
        const l = nll(CAL.logits, CAL.labels, T);
        if (l < bl) { bl = l; best = T; }
    }
    return Math.round(best * 100) / 100;
})();

export const BEFORE = reliability(TEST.logits, TEST.labels, 1);
export const AFTER = reliability(TEST.logits, TEST.labels, BEST_T);
export const histogram = (logits, T = 1) => {
    const h = new Array(NBINS).fill(0);
    logits.forEach((m) => { h[Math.min(NBINS - 1, Math.floor(sigmoid(m / T) * NBINS))] += 1; });
    return h;
};
export const accuracyAt = (logits, labels, T) =>
    logits.filter((m, i) => (sigmoid(m / T) >= 0.5 ? 1 : 0) === labels[i]).length / logits.length;
