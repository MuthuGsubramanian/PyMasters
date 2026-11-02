// Warm-up streak (days in a row with a finished warm-up), kept in localStorage.
const KEY = 'pm_warmup';

const day = (d) => d.toLocaleDateString('en-CA'); // YYYY-MM-DD in local time

export function loadStreak(now = new Date()) {
    try {
        const s = JSON.parse(localStorage.getItem(KEY) || '{}');
        const yesterday = new Date(now); yesterday.setDate(now.getDate() - 1);
        const alive = s.last === day(now) || s.last === day(yesterday);
        return { streak: alive ? s.streak | 0 : 0, doneToday: s.last === day(now) };
    } catch {
        return { streak: 0, doneToday: false };
    }
}

export function finishToday(now = new Date()) {
    const { streak, doneToday } = loadStreak(now);
    const next = doneToday ? streak : streak + 1;
    try { localStorage.setItem(KEY, JSON.stringify({ last: day(now), streak: next })); } catch { /* storage unavailable */ }
    return next;
}
