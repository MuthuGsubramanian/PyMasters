import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import AnimationRenderer from '../components/animations/AnimationRenderer';
import FlowArrow from '../components/animations/FlowArrow';
import { normalizeProps } from '../components/animations/normalize';

const render = (prim) => renderToStaticMarkup(<AnimationRenderer sequence={[prim]} language="en" />);

describe('FlowArrow shapes', () => {
  it('renders string stages in order (gemini_workspace_enterprise stages)', () => {
    const html = render({ type: 'FlowArrow', id: 'x', stages: ['Tokenize', 'Embed', 'Attend', 'Predict'] });
    const at = ['Tokenize', 'Embed', 'Attend', 'Predict'].map((s) => html.indexOf(s));
    expect(at.every((i) => i >= 0)).toBe(true);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
  });

  it('renders object stages from git_workflows pr_flow', () => {
    const html = render({ type: 'FlowArrow', stages: [{ label: 'Branch', icon: 'git-branch' }, { label: 'Commit' }] });
    expect(html).toContain('Branch');
    expect(html).toContain('Commit');
  });

  it('renders steps with label and description detail', () => {
    const html = render({ type: 'FlowArrow', steps: [{ label: 'Load', description: 'read CSV' }] });
    expect(html).toContain('Load');
    expect(html).toContain('read CSV');
  });

  it('renders string steps (fastapi_authentication jwt_flow)', () => {
    const html = render({ type: 'FlowArrow', steps: ['Client sends POST /token', 'Server verifies credentials'] });
    expect(html).toContain('Client sends POST /token');
    expect(html).toContain('Server verifies credentials');
  });

  it('renders from/to as two stages (sklearn_classification ml_pipeline)', () => {
    const html = render({ type: 'FlowArrow', from: 'A', to: 'B' });
    expect(html).toContain('A');
    expect(html).toContain('B');
  });

  it('steps win over from/to (dl_cnn_architectures skip_connection)', () => {
    const n = normalizeProps('FlowArrow', { from: 'block_input', to: 'block_output', steps: ['x', 'ReLU'] }, 'en');
    expect(n.stages.map((s) => s.label)).toEqual(['x', 'ReLU']);
  });

  it('renders flows (async_await_basics execution_flow)', () => {
    const html = render({
      type: 'FlowArrow',
      flows: [{ label: 'gather()', from: 'make_breakfast', to: ['brew_coffee', 'toast_bread'] }],
    });
    expect(html).toContain('gather()');
    expect(html).toContain('make_breakfast');
    expect(html).toContain('brew_coffee');
  });

  it('empty stages with a label still shows the label (Review Focus 3)', () => {
    const html = render({ type: 'FlowArrow', stages: [], label: 'Next' });
    expect(html).toContain('Next');
  });

  it('branch becomes the arrow label (errors_handling exception_flow)', () => {
    const html = render({ type: 'FlowArrow', direction: 'down', branch: 'exception' });
    expect(html).toContain('exception');
  });

  it('normalised FlowArrow always has stages', () => {
    expect(normalizeProps('FlowArrow', { from: 'A', to: 'B' }, 'en').stages).toEqual([{ label: 'A' }, { label: 'B' }]);
    expect(normalizeProps('FlowArrow', { label: 'x' }, 'en').stages).toEqual([]);
  });

  it('controlledStep marks exactly that stage as current', () => {
    const html = renderToStaticMarkup(
      <FlowArrow stages={[{ label: 'One' }, { label: 'Two' }, { label: 'Three' }]} controlledStep={1} />,
    );
    expect(html.match(/aria-current="step"/g)).toHaveLength(1);
    expect(html).toMatch(/aria-current="step"[^>]*>(?:(?!<li).)*Two/s);
  });

  it('no current stage without controlledStep, and no tiny text', () => {
    const html = renderToStaticMarkup(<FlowArrow stages={[{ label: 'One', detail: 'why' }]} />);
    expect(html).not.toContain('aria-current');
    expect(html).not.toMatch(/text-\[(9|10|11)px\]/);
    expect(html).toContain('text-xs text-text-secondary');
  });

  it('stacks vertically on phones and wraps on sm+', () => {
    const html = renderToStaticMarkup(<FlowArrow stages={[{ label: 'One' }, { label: 'Two' }]} />);
    expect(html).toContain('flex-col');
    expect(html).toContain('sm:flex-row');
    expect(html).toContain('sm:flex-wrap');
  });
});

describe('FlowDiagram string nodes', () => {
  it('renders string nodes as labelled boxes', () => {
    const html = render({ type: 'FlowDiagram', nodes: ['Start', 'Check', 'End'] });
    for (const l of ['Start', 'Check', 'End']) expect(html).toContain(l);
  });

  it('normalises nodes to {id,label} and resolves label-based edges to ids', () => {
    const n = normalizeProps('FlowDiagram', {
      nodes: ['Start', 'Check it'],
      edges: [{ from: 'Start', to: 'Check it', label: 'go' }],
    }, 'en');
    expect(n.nodes).toEqual([{ id: 'start', label: 'Start' }, { id: 'check-it', label: 'Check it' }]);
    expect(n.edges[0]).toMatchObject({ from: 'start', to: 'check-it', label: 'go' });
  });

  it('keeps object nodes (django_views_templates) intact', () => {
    const n = normalizeProps('FlowDiagram', { nodes: [{ id: 'request', label: 'HTTP Request', type: 'start' }] }, 'en');
    expect(n.nodes).toEqual([{ id: 'request', label: 'HTTP Request', type: 'start' }]);
  });
});
