import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import AnimationRenderer from '../components/animations/AnimationRenderer';

const render = (prim) => renderToStaticMarkup(<AnimationRenderer sequence={[prim]} language="en" />);

describe('ComparisonPanel results and tone', () => {
  it('shows code with indentation, the result line and a Python False (left/right with result)', () => {
    const html = render({
      type: 'ComparisonPanel',
      left: { label: 'list', code: 'a = [1]\nif a:\n    b = a\nb.append(2)', result: '[1, 2]' },
      right: { label: 'tuple', result: false },
    });
    expect(html).toContain('    b = a');
    expect(html).toContain('whitespace-pre');
    expect(html).toContain('→ [1, 2]');
    expect(html).toContain('tuple');
    expect(html).toContain('>False<');
    expect(html).not.toMatch(/Result: (false|true)/i);
    expect(html).toContain('data-tone="neutral"');
    expect(html).not.toMatch(/red-|green-/);
  });

  it('regex_fundamentals literal_vs_meta: boolean results render as True/False, neutral', () => {
    const html = render({
      type: 'ComparisonPanel',
      left: { label: "Literal chars: 'cat'", result: true },
      right: { label: 'Metacharacters', result: false },
    });
    expect(html).toContain('>True<');
    expect(html).toContain('>False<');
    expect(html).not.toMatch(/Result:/);
    expect(html).toContain('data-tone="neutral"');
  });

  it('before/after keys keep the red/green pair', () => {
    const html = render({ type: 'ComparisonPanel', before: { label: 'x', code: 'c' }, after: { label: 'y', code: 'd' } });
    expect(html).toContain('data-tone="before_after"');
    expect(html).toMatch(/red-/);
    expect(html).toMatch(/green-/);
  });

  it('a Wrong/Right side label selects before_after tone', () => {
    const html = render({ type: 'ComparisonPanel', left: { label: 'Wrong: x', code: 'a' }, right: { label: 'Right: y', code: 'b' } });
    expect(html).toContain('data-tone="before_after"');
  });
});
