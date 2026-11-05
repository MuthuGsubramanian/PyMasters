import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import HowALessonWorks from '../components/landing/HowALessonWorks';

// Landing (redesign plan PR 6 / "Later"): the 4 identical icon+title+sentence feature cards become a
// "How a lesson works" strip in the product's own words: story -> Watch It Run -> Under the hood -> practice.
const read = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8');
const doc = () => {
  const el = document.createElement('div');
  el.innerHTML = renderToStaticMarkup(<HowALessonWorks />);
  return el;
};

describe('How a lesson works (landing)', () => {
  it('is one ordered list of the four lesson steps, in the order a lesson runs', () => {
    const root = doc();
    expect(root.querySelector('h2').textContent).toBe('How a lesson works');
    const steps = root.querySelectorAll('ol > li');
    expect(steps).toHaveLength(4);
    expect([...steps].map((li) => li.querySelector('h3').textContent)).toEqual([
      'Read the story', 'Watch It Run', 'Under the hood', 'Practice with instant grading',
    ]);
  });

  it('shows Under the hood as names pointing to objects, step by step', () => {
    const uth = doc().querySelectorAll('ol > li')[2];
    expect(uth.textContent).toMatch(/Names/);
    expect(uth.textContent).toMatch(/Objects/);
    expect(uth.textContent).toMatch(/step by step/i);
  });

  it('each step shows its own piece of the product, not a repeated icon card', () => {
    const steps = [...doc().querySelectorAll('ol > li')];
    const shots = steps.map((li) => li.querySelector('[data-step-preview]')?.getAttribute('data-step-preview'));
    expect(shots).toEqual(['story', 'watch-it-run', 'under-the-hood', 'practice']);
  });

  it('uses no gradients, glass blur, emoji or sub-12px text', () => {
    const html = renderToStaticMarkup(<HowALessonWorks />);
    expect(html).not.toMatch(/gradient|backdrop-blur|bg-clip-text|text-\[(9|10|11)px\]/);
    expect(html).not.toMatch(/\p{Extended_Pictographic}/u);
  });

  it('replaces the feature-card grid on the landing page', () => {
    const home = read('../pages/Home.jsx');
    expect(home).not.toMatch(/FeatureCard|const FEATURES/);
    expect(home).toContain('<HowALessonWorks');
    expect(home).toContain('href="#how-it-works"');
  });
});
