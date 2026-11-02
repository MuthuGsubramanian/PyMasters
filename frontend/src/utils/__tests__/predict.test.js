import { describe, it, expect, beforeEach } from 'vitest';
import { comparePrediction, loadStats, recordPrediction } from '../predict';

describe('comparePrediction', () => {
    it('accepts an exact match ignoring trailing space and quote style', () => {
        const r = comparePrediction("['a', 'b']\n6  ", '["a", "b"]\n6\n');
        expect(r.exact).toBe(true);
        expect(r.matched).toBe(2);
    });

    it('scores partial predictions line by line', () => {
        const r = comparePrediction('1\n2\n4', '1\n2\n3');
        expect(r.exact).toBe(false);
        expect(r.matched).toBe(2);
        expect(r.total).toBe(3);
        expect(r.lines[2]).toEqual({ expected: '3', got: '4', ok: false });
    });

    it('rejects extra predicted lines', () => {
        expect(comparePrediction('1\n2', '1').exact).toBe(false);
    });

    it('counts naming the error when the run fails', () => {
        expect(comparePrediction('zero division error', 'total 6', 'ZeroDivisionError').exact).toBe(true);
        expect(comparePrediction('KeyError', '', 'ZeroDivisionError').exact).toBe(false);
        expect(comparePrediction('error', '', 'ZeroDivisionError').exact).toBe(false);
    });
});

describe('prediction stats', () => {
    beforeEach(() => localStorage.clear());

    it('tracks tries, correct answers and streak', () => {
        recordPrediction(true);
        recordPrediction(true);
        expect(loadStats()).toEqual({ tries: 2, correct: 2, streak: 2 });
        recordPrediction(false);
        expect(loadStats()).toEqual({ tries: 3, correct: 2, streak: 0 });
    });
});
