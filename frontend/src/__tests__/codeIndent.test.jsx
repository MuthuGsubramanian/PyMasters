import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import ExecutionVisualizer from '../components/animations/ExecutionVisualizer';
import CodeStepper from '../components/animations/CodeStepper';
import LoopVisualizer from '../components/animations/LoopVisualizer';

const CODE = 'for i in range(3):\n    total += i';
const VOID = new Set(['area', 'base', 'br', 'col', 'hr', 'img', 'input', 'link', 'meta', 'source', 'wbr']);

// Line 2 is rendered as: <span class="CODE TEXT CLASSES"><span>    </span><span>total</span>...
// The four-space token opens the line's code text, so the nearest class-bearing
// opening tag before it is the element holding the code text.
const locateCodeText = (html) => {
  const at = html.indexOf('>    </span>');
  expect(at).toBeGreaterThan(-1);
  const open = html.lastIndexOf('<span class="', at);
  const match = html.slice(open).match(/^<span class="([^"]*)"/);
  expect(match).not.toBeNull();
  return { open, classes: match[1].split(/\s+/) };
};

// Class lists of every element that encloses the position `end` in the markup,
// computed with a small open/close tag stack.
const ancestorClasses = (html, end) => {
  const stack = [];
  const re = /<(\/?)([a-zA-Z][\w-]*)([^>]*?)(\/?)>/g;
  let m;
  while ((m = re.exec(html)) && m.index < end) {
    const [, closing, tag, attrs, selfClosing] = m;
    if (closing) {
      const i = stack.map((e) => e.tag).lastIndexOf(tag);
      if (i !== -1) stack.length = i;
    } else if (!selfClosing && !VOID.has(tag)) {
      const cls = (attrs.match(/class="([^"]*)"/) || [])[1] || '';
      stack.push({ tag, cls });
    }
  }
  return stack.map((e) => e.cls.split(/\s+/));
};

const expectIndentedAndScrollable = (html) => {
  const { open, classes } = locateCodeText(html);
  expect(classes).toContain('whitespace-pre');
  expect(ancestorClasses(html, open).some((c) => c.includes('overflow-x-auto'))).toBe(true);
};

describe('code views keep indentation', () => {
  it('ExecutionVisualizer: line 2 code text is whitespace-pre inside an overflow-x-auto scroller', () => {
    const html = renderToStaticMarkup(
      <ExecutionVisualizer code={CODE} executionSteps={[]} controlledStep={0} />
    );
    expectIndentedAndScrollable(html);
  });

  it('CodeStepper: line 2 code text is whitespace-pre inside an overflow-x-auto scroller', () => {
    const html = renderToStaticMarkup(
      <CodeStepper code={CODE} highlightSequence={[]} controlledStep={0} />
    );
    expectIndentedAndScrollable(html);
  });

  it('LoopVisualizer: line 2 code text is whitespace-pre inside an overflow-x-auto scroller', () => {
    const html = renderToStaticMarkup(
      <LoopVisualizer code={CODE} iterations={[]} controlledStep={0} />
    );
    expectIndentedAndScrollable(html);
  });
});
