import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import AnimationRenderer, { PrimitiveView } from '../components/animations/AnimationRenderer';
import { canonicalType, normalizeProps } from '../components/animations/normalize';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// Render smoke test: one primitive per (canonical type, top-level key set)
// authored anywhere in the lessons, rendered through the real AnimationRenderer.
// Guards against raw "[object Object]", "undefined", "NaN" or "Result: true"
// reaching the learner.

const LESSONS_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../backend/lessons');
const BAD = /\[object Object\]|\bundefined\b|\bNaN\b|Result: (true|false)\b/;

function* jsonFiles(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* jsonFiles(full);
    else if (entry.name.endsWith('.json')) yield full;
  }
}

function* sequences(node) {
  if (Array.isArray(node)) {
    for (const x of node) yield* sequences(x);
  } else if (node && typeof node === 'object') {
    for (const [k, v] of Object.entries(node)) {
      if (k === 'animation_sequence' && Array.isArray(v)) yield v;
      else yield* sequences(v);
    }
  }
}

function collectCases() {
  const seen = new Map();
  for (const file of jsonFiles(LESSONS_DIR)) {
    const lesson = JSON.parse(fs.readFileSync(file, 'utf8'));
    const lessonId = lesson.id || lesson.lesson_id || path.basename(file, '.json');
    for (const seq of sequences(lesson)) {
      for (const primitive of seq) {
        if (!primitive || typeof primitive.type !== 'string') continue;
        const type = canonicalType(primitive.type);
        const keys = Object.keys(primitive).filter((k) => k !== 'type').sort();
        const id = `${type}|${keys.join(',')}`;
        if (!seen.has(id)) seen.set(id, { type, lessonId, keys, primitive });
      }
    }
  }
  return [...seen.values()].sort((a, b) => (a.type + a.keys.join()).localeCompare(b.type + b.keys.join()));
}

const CASES = collectCases();

const saved = {};
beforeAll(() => {
  saved.matchMedia = window.matchMedia;
  window.matchMedia = (query) => ({
    matches: false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
  });
  class Stub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  saved.io = globalThis.IntersectionObserver;
  saved.ro = globalThis.ResizeObserver;
  globalThis.IntersectionObserver = Stub;
  globalThis.ResizeObserver = Stub;
  if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};
  if (!window.scrollTo) window.scrollTo = () => {};
});

afterAll(() => {
  window.matchMedia = saved.matchMedia;
  globalThis.IntersectionObserver = saved.io;
  globalThis.ResizeObserver = saved.ro;
});

let root;
let container;
afterEach(() => {
  if (root) act(() => { root.unmount(); });
  container?.remove();
  root = container = null;
  vi.useRealTimers();
});

describe('every authored lesson visual shape renders real content', () => {
  it('finds lesson shapes to test', () => {
    expect(CASES.length).toBeGreaterThan(20);
  });

  it.each(CASES.map((c) => [`${c.type} ${c.lessonId} [${c.keys.join(',')}]`, c]))('%s', (_name, c) => {
    vi.useFakeTimers();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => {
      root.render(<AnimationRenderer sequence={[c.primitive]} language="en" />);
    });
    act(() => { vi.advanceTimersByTime(10000); });
    const text = container.textContent;
    // ParticleEffect is an overlay that renders no text.
    if (c.type !== 'ParticleEffect') expect(text.trim(), 'textContent is empty').not.toBe('');
    expect(text).not.toMatch(BAD);
    if (c.type !== 'ParticleEffect') {
      const squash = (v) => String(v).replace(/\s+/g, ' ').trim();
      const raw = c.primitive.props ?? (({ type: _t, sync_with: _s, ...rest }) => rest)(c.primitive);
      const { caption } = normalizeProps(c.primitive.type, { ...raw }, 'en');
      const flat = squash(text);
      if (caption?.title) expect(flat, 'caption title missing').toContain(squash(caption.title));
      if (caption?.description) expect(flat, 'caption description missing').toContain(squash(caption.description));
    }
  });
});

// "How it works": every lesson's under_the_hood step visual, drawn the way the explainer draws it.
function collectTopicVisuals() {
  const out = [];
  for (const file of jsonFiles(LESSONS_DIR)) {
    const lesson = JSON.parse(fs.readFileSync(file, 'utf8'));
    const steps = lesson?.under_the_hood?.steps;
    if (!Array.isArray(steps)) continue;
    const lessonId = lesson.id || path.basename(file, '.json');
    steps.forEach((s, i) => { if (s && s.visual) out.push([`${lessonId} steps[${i}] ${s.visual.type}`, s.visual]); });
  }
  return out;
}

const TOPIC_VISUALS = collectTopicVisuals();

describe('every under_the_hood topic visual renders real content', () => {
  it('finds topic visuals to test', () => {
    expect(TOPIC_VISUALS.length).toBeGreaterThan(0);
  });

  it.each(TOPIC_VISUALS)('%s', (_name, visual) => {
    vi.useFakeTimers();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    // Reduced motion: typed and animated primitives show their full content at once.
    localStorage.setItem('pm_reduce_motion', '1');
    try {
      for (const language of ['en', 'ta']) {
        act(() => { root.render(<PrimitiveView key={language} type={visual.type} props={visual.props} language={language} />); });
        act(() => { vi.advanceTimersByTime(10000); });
        checkTopicVisual(visual, language);
      }
    } finally {
      localStorage.removeItem('pm_reduce_motion');
    }
  });
});

function checkTopicVisual(visual, language) {
  const squash = (v) => String(v).replace(/\s+/g, ' ').trim();
  const text = container.textContent;
  expect(text.trim(), 'textContent is empty').not.toBe('');
  // "NaN" is a bug only when the renderer made it up; pandas explainers author it on purpose (missing values).
  const authoredNaN = /\bNaN\b/.test(JSON.stringify(visual.props));
  expect(authoredNaN ? text.replace(/\bNaN\b/g, '') : text).not.toMatch(BAD);
  const { caption } = normalizeProps(visual.type, { ...visual.props }, language);
  if (caption?.title) expect(squash(text), 'caption title missing').toContain(squash(caption.title));
  if (caption?.description) expect(squash(text), 'caption description missing').toContain(squash(caption.description));
  // Terminal lines are the whole point of a terminal visual: every one must be on screen.
  for (const line of visual.props.lines || []) expect(squash(text)).toContain(squash(line));
}
