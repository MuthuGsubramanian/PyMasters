import { describe, it, expect, beforeEach } from 'vitest';
import { loadStreak, finishToday } from '../warmupStreak';

describe('warm-up streak', () => {
    beforeEach(() => localStorage.clear());

    it('counts consecutive days once per day', () => {
        expect(finishToday(new Date(2026, 10, 1, 9))).toBe(1);
        expect(finishToday(new Date(2026, 10, 1, 20))).toBe(1);
        expect(finishToday(new Date(2026, 10, 2, 8))).toBe(2);
        expect(loadStreak(new Date(2026, 10, 2, 22))).toEqual({ streak: 2, doneToday: true });
    });

    it('resets after a missed day', () => {
        finishToday(new Date(2026, 10, 1));
        expect(loadStreak(new Date(2026, 10, 3)).streak).toBe(0);
        expect(finishToday(new Date(2026, 10, 3))).toBe(1);
    });
});
