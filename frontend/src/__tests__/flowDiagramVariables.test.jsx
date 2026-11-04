import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import FlowDiagram from '../components/animations/FlowDiagram';

// Same shape as backend/lessons/python_fundamentals/conditionals.json
const base = {
  nodes: [
    { id: 'start', label: 'Start', type: 'start' },
    { id: 'input', label: 'score = 85', type: 'process' },
    { id: 'check1', label: 'score >= 90?', type: 'decision' },
    { id: 'check2', label: 'score >= 80?', type: 'decision' },
    { id: 'grade_b', label: "grade = 'B'", type: 'process' },
    { id: 'print', label: 'print(grade)', type: 'io' },
    { id: 'end', label: 'End', type: 'end' },
  ],
  edges: [],
  executionPath: ['start', 'input', 'check1', 'check2', 'grade_b', 'print', 'end'],
  variables: {
    score: [null, 85, 85, 85, 85, 85, 85],
    grade: [null, null, null, null, 'B', 'B', 'B'],
  },
};

const render = (props) => renderToStaticMarkup(<FlowDiagram {...base} {...props} />);
// Text of the value chips only (amber badges in the Variables panel).
const chips = (html) => [...html.matchAll(/text-amber-300[^>]*>([^<]*)</g)].map((m) => m[1]);

describe('FlowDiagram variables are per-step', () => {
  it('shows the value at the current step, not the joined history', () => {
    const html = render({ controlledStep: 4 });
    expect(chips(html)).toEqual(['85', 'B']);
    expect(html).not.toContain('85,85');
    expect(html).not.toContain(',,');
  });

  it('shows an em dash for a variable with no value yet (step 0)', () => {
    const html = render({ controlledStep: 0 });
    expect(chips(html)).toEqual(['—', '—']);
    expect(html).not.toContain('85,85');
  });

  it('shows a mid-run state: score set, grade not yet', () => {
    expect(chips(render({ controlledStep: 2 }))).toEqual(['85', '—']);
  });

  it('clamps a step past the end of the array', () => {
    expect(chips(render({ controlledStep: 99 }))).toEqual(['85', 'B']);
  });

  it('keeps plain scalar variables working', () => {
    const html = render({ variables: { x: 3, name: 'Ada' }, controlledStep: 2 });
    expect(chips(html)).toEqual(['3', 'Ada']);
  });
});
