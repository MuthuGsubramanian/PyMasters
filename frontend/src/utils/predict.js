// Predict-then-run (2026-11-02): compare a learner's predicted output with the real output and keep a
// running accuracy score in localStorage. Pure + client-side.

const STATS_KEY = 'pm_predict_stats';

const norm = (s) => (s || '').replace(/\r/g, '').split('\n').map((l) => l.trimEnd()).join('\n').trim();
// Loose line compare: ignore surrounding spaces and quote style ('a' vs "a").
const loose = (l) => l.trim().replace(/"/g, "'").replace(/\s+/g, ' ');

// errorType: the exception name when the run failed (e.g. "ZeroDivisionError"), else null.
export function comparePrediction(prediction, actual, errorType = null) {
    const want = norm(actual).split('\n').filter((l, i, a) => a.length > 1 || l !== '');
    const got = norm(prediction).split('\n');
    if (errorType) {
        // Naming the error counts ("ZeroDivisionError", "zero division error"), whatever printed first.
        const squashed = (prediction || '').toLowerCase().replace(/[\s_-]+/g, '');
        const stem = errorType.toLowerCase().replace(/(error|exception)$/, '');
        const ok = stem.length > 0 && squashed.includes(stem);
        return { exact: ok, matched: ok ? 1 : 0, total: 1, lines: [{ expected: errorType, got: norm(prediction), ok }] };
    }
    const total = Math.max(want.length, 1);
    const lines = [];
    let matched = 0;
    for (let i = 0; i < Math.max(want.length, got.length); i++) {
        const expected = want[i] ?? '';
        const g = got[i] ?? '';
        const ok = loose(expected) === loose(g);
        if (ok && i < want.length) matched++;
        lines.push({ expected, got: g, ok });
    }
    const exact = matched === want.length && got.filter((l) => l.trim()).length === want.filter((l) => l.trim()).length;
    return { exact, matched, total, lines };
}

export function loadStats() {
    try {
        const s = JSON.parse(localStorage.getItem(STATS_KEY) || '{}');
        return { tries: s.tries | 0, correct: s.correct | 0, streak: s.streak | 0 };
    } catch {
        return { tries: 0, correct: 0, streak: 0 };
    }
}

export function recordPrediction(exact) {
    const s = loadStats();
    const next = { tries: s.tries + 1, correct: s.correct + (exact ? 1 : 0), streak: exact ? s.streak + 1 : 0 };
    try { localStorage.setItem(STATS_KEY, JSON.stringify(next)); } catch { /* storage unavailable */ }
    return next;
}
