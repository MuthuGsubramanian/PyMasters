import { describe, it, expect } from 'vitest';
import { explainError } from '../errorExplainer';

const tb = (body, line = 3) => `Traceback (most recent call last):\n  File "/tmp/pm_sandbox_ab/main.py", line ${line}, in <module>\n    x\n${body}`;

describe('explainError', () => {
    it('explains NameError with the name and the learner line', () => {
        const r = explainError(tb("NameError: name 'totl' is not defined", 7));
        expect(r.type).toBe('NameError');
        expect(r.title).toContain('totl');
        expect(r.line).toBe(7);
    });
    it('explains str + int concatenation', () => {
        const r = explainError(tb('TypeError: can only concatenate str (not "int") to str'));
        expect(r.title).toMatch(/types can't be combined/);
        expect(r.fix).toMatch(/str\(/);
    });
    it('detects a missing colon', () => {
        const r = explainError(`  File "/tmp/x/main.py", line 1\n    if x > 1\n            ^\nSyntaxError: expected ':'`);
        expect(r.title).toMatch(/colon/);
        expect(r.line).toBe(1);
    });
    it('explains NoneType attribute errors', () => {
        const r = explainError(tb("AttributeError: 'NoneType' object has no attribute 'append'"));
        expect(r.what).toMatch(/None/);
    });
    it('explains timeouts', () => {
        expect(explainError('Execution timed out after 10 seconds.').title).toMatch(/too long/);
    });
    it('uses the deepest main.py frame', () => {
        const t = `Traceback (most recent call last):\n  File "/tmp/a/main.py", line 9, in <module>\n  File "/tmp/a/main.py", line 2, in f\nZeroDivisionError: division by zero`;
        expect(explainError(t).line).toBe(2);
    });
    it('returns null for normal output', () => {
        expect(explainError('hello world\n42')).toBeNull();
    });
});
