import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import ExecutionVisualizer from '../components/animations/ExecutionVisualizer';
import VisualControls from '../components/animations/VisualControls';

const TINY = /text-\[([1-9]|10|11)px\]/;
const read = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8');
const controls = () => renderToStaticMarkup(
  <VisualControls step={0} total={3} playing={false} speed={1} onPlay={() => {}} onPause={() => {}}
    onNext={() => {}} onPrev={() => {}} onRestart={() => {}} onSpeed={() => {}} />,
);

describe('visual text is at least 12px (text-xs)', () => {
  it.each(['ExecutionVisualizer', 'CodeStepper', 'FlowDiagram', 'MemoryStack', 'VisualControls',
    'TreeVisualizer', 'AlgorithmVisualizer', 'NeuralNetworkVisualizer', 'TerminalOutput', 'ConceptMap'])(
    '%s source has no 9/10/11px text',
    (name) => {
      expect(read(`../components/animations/${name}.jsx`)).not.toMatch(TINY);
    },
  );

  it('the Watch It Run popup chrome has no 9/10/11px text', () => {
    const src = read('../pages/Classroom.jsx');
    const start = src.indexOf('Popup: code execution + flow diagram');
    const end = src.indexOf('Code Walkthrough', start);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    expect(src.slice(start, end + 400)).not.toMatch(TINY);
  });

  it('rendered markup has no 9/10/11px text', () => {
    const steps = [{ line: 1, variables: { a: 1 }, output: 'hi', description: 'Assign a' }];
    const html = renderToStaticMarkup(<ExecutionVisualizer code="a = 1" executionSteps={steps} controlledStep={0} />) + controls();
    expect(html).not.toMatch(TINY);
  });
});

describe('VisualControls surface', () => {
  it('has its own surface so its tokens match its background in both themes', () => {
    const html = controls();
    const root = html.match(/^<div[^>]*class="([^"]*)"/)[1].split(/\s+/);
    expect(root).toEqual(expect.arrayContaining(['bg-bg-elevated', 'border', 'border-border-default', 'rounded-xl']));
    expect(html).toContain('focus-visible:ring-2');
  });
});
