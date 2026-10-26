import { describe, it, expect } from 'vitest';
import { normalizeProps } from '../components/animations/AnimationRenderer';

// Lesson JSON authored over 2026 drifted into several shapes for these two
// primitives; the renderer must coerce every one of them (2026-10-26).
describe('normalizeProps — ComparisonPanel / TerminalOutput author shapes', () => {
  it('maps TerminalOutput `lines` to `output`', () => {
    const p = normalizeProps('TerminalOutput', { lines: ['a', 'b'] }, 'en');
    expect(p.output).toEqual(['a', 'b']);
    expect(p.lines).toBeUndefined();
  });
  it('maps left/right {title, items} (GRPO style)', () => {
    const p = normalizeProps('ComparisonPanel', { left: { title: 'L', items: ['x', 'y'] }, right: { title: 'R', items: ['z'] } }, 'en');
    expect(p.before).toEqual({ label: 'L', code: 'x\ny' });
    expect(p.after).toEqual({ label: 'R', code: 'z' });
  });
  it('maps left_content/right_content with labels', () => {
    const p = normalizeProps('ComparisonPanel', { left_label: 'A', right_label: 'B', left_content: 'one', right_content: 'two' }, 'en');
    expect(p.before.label).toBe('A');
    expect(p.after.code).toBe('two');
  });
  it('maps items [{left,right}] rows into two columns', () => {
    const p = normalizeProps('ComparisonPanel', { left_label: 'GPT', right_label: 'BERT', items: [{ left: 'l1', right: 'r1' }, { left: 'l2', right: 'r2' }] }, 'en');
    expect(p.before).toEqual({ label: 'GPT', code: 'l1\nl2' });
    expect(p.after).toEqual({ label: 'BERT', code: 'r1\nr2' });
  });
  it('maps models [{name,strengths,weaknesses}]', () => {
    const p = normalizeProps('ComparisonPanel', { models: [{ name: 'F1', strengths: 's', weaknesses: 'w' }] }, 'en');
    expect(p.before.code).toBe('F1: s');
    expect(p.after.code).toBe('F1: w');
  });
  it('maps comparisons + x_labels', () => {
    const p = normalizeProps('ComparisonPanel', { comparisons: [{ label: 'O(n)', values: [1, 2] }], x_labels: ['n=1', 'n=2'] }, 'en');
    expect(p.before.code).toBe('n=1  n=2');
    expect(p.after.code).toBe('O(n): 1  2');
  });
  it('leaves the canonical before/after untouched', () => {
    const p = normalizeProps('ComparisonPanel', { before: { label: 'x', code: 'c' }, after: { label: 'y', code: 'd' } }, 'en');
    expect(p.before).toEqual({ label: 'x', code: 'c' });
  });
});
