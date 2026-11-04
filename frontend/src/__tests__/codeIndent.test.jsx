import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import ExecutionVisualizer from '../components/animations/ExecutionVisualizer';
import CodeStepper from '../components/animations/CodeStepper';
import LoopVisualizer from '../components/animations/LoopVisualizer';

const CODE = 'for i in range(3):\n    total += i';

// Line 2 is rendered as: <span class="CODE TEXT CLASSES"><span>    </span><span>total</span>...
// The four-space token opens the line's code text, so the nearest class-bearing
// opening tag before it is the element holding the code text.
const codeTextClasses = (html) => {
  const at = html.indexOf('>    </span>');
  expect(at).toBeGreaterThan(-1);
  const open = html.lastIndexOf('<span class="', at);
  const match = html.slice(open).match(/^<span class="([^"]*)"/);
  expect(match).not.toBeNull();
  return match[1].split(/\s+/);
};

describe('code views keep indentation', () => {
  it('ExecutionVisualizer: line 2 code text carries whitespace-pre', () => {
    const html = renderToStaticMarkup(
      <ExecutionVisualizer code={CODE} executionSteps={[]} controlledStep={0} />
    );
    expect(codeTextClasses(html)).toContain('whitespace-pre');
  });

  it('CodeStepper: line 2 code text carries whitespace-pre', () => {
    const html = renderToStaticMarkup(
      <CodeStepper code={CODE} highlightSequence={[]} controlledStep={0} />
    );
    expect(codeTextClasses(html)).toContain('whitespace-pre');
  });

  it('LoopVisualizer: line 2 code text carries whitespace-pre', () => {
    const html = renderToStaticMarkup(
      <LoopVisualizer code={CODE} iterations={[]} controlledStep={0} />
    );
    expect(codeTextClasses(html)).toContain('whitespace-pre');
  });
});
