import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import AnimationRenderer from '../components/animations/AnimationRenderer';
import VisualCaption from '../components/animations/VisualCaption';
import { normalizeProps } from '../components/animations/normalize';

const panel = (extra) => [{
  type: 'ComparisonPanel',
  left: { label: 'A', code: 'x' },
  right: { label: 'B', code: 'y' },
  ...extra,
}];

describe('visual captions', () => {
  it('shows a description to the learner', () => {
    const html = renderToStaticMarkup(
      <AnimationRenderer sequence={panel({ description: { en: 'Lists copy, tuples do not' } })} language="en" />,
    );
    expect(html).toContain('Lists copy, tuples do not');
  });

  it('falls back to English when the language has no entry', () => {
    const html = renderToStaticMarkup(
      <AnimationRenderer sequence={panel({ description: { en: 'Lists copy, tuples do not' } })} language="ta" />,
    );
    expect(html).toContain('Lists copy, tuples do not');
  });

  it('shows the title above and the description below the visual', () => {
    const html = renderToStaticMarkup(
      <AnimationRenderer sequence={panel({ title: 'TITLE_TXT', description: 'DESC_TXT' })} language="en" />,
    );
    expect(html.indexOf('TITLE_TXT')).toBeGreaterThan(-1);
    expect(html.indexOf('TITLE_TXT')).toBeLessThan(html.indexOf('DESC_TXT'));
    expect(html.indexOf('DESC_TXT')).toBeGreaterThan(html.indexOf('>B<'));
  });

  it('normalizeProps returns a resolved caption and leaves no title/description props', () => {
    const p = normalizeProps('CodeStepper', { code: 'x=1', title: { ta: 'தமிழ்', en: 'Hi' }, caption: 'cap' }, 'ta');
    expect(p.caption).toEqual({ title: 'தமிழ்', description: 'cap' });
    expect(p.title).toBeUndefined();
    expect(normalizeProps('ConceptMap', { nodes: [] }, 'en').caption).toEqual({ title: '', description: '' });
  });

  it('renders nothing when both title and description are empty', () => {
    expect(renderToStaticMarkup(<VisualCaption title="" description="" />)).toBe('');
    expect(renderToStaticMarkup(<VisualCaption />)).toBe('');
  });
});
