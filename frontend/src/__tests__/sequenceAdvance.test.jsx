import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import gsap from 'gsap';
import AnimationRenderer from '../components/animations/AnimationRenderer';
import { normalizeProps } from '../components/animations/normalize';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// A "Watch It Run" walkthrough shows one primitive at a time; each one's
// completion reveals the next. A primitive that never completes stalls the
// sequence and the learner never sees the rest (conditionals stalled at its
// VariableBox, 2026-11-04 CI).

const LESSONS_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../backend/lessons');

// The popup's walkthrough: Classroom IntroPhase legacyAnimPrimitives.
const FLOW_TYPES = new Set(['ExecutionVisualizer', 'execution_visualizer', 'FlowDiagram', 'flow_diagram', 'LoopVisualizer', 'loop_visualizer']);
const walkthrough = (seq) => seq.filter((s) => s && s.type !== 'StoryCard' && s.type !== 'ConceptMap'
  && s.type !== 'ParticleEffect' && !FLOW_TYPES.has(s.type));

function loadLesson(rel) {
  return JSON.parse(fs.readFileSync(path.join(LESSONS_DIR, rel), 'utf8'));
}

const saved = {};
beforeAll(() => {
  saved.matchMedia = window.matchMedia;
  window.matchMedia = (query) => ({
    matches: false, media: query,
    addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {},
  });
  class Stub { observe() {} unobserve() {} disconnect() {} }
  saved.io = globalThis.IntersectionObserver;
  saved.ro = globalThis.ResizeObserver;
  globalThis.IntersectionObserver = Stub;
  globalThis.ResizeObserver = Stub;
  if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};
  gsap.ticker.remove(gsap.updateRoot);
  gsapTime = gsap.ticker.time;
});
afterAll(() => {
  gsap.ticker.add(gsap.updateRoot);
  window.matchMedia = saved.matchMedia;
  globalThis.IntersectionObserver = saved.io;
  globalThis.ResizeObserver = saved.ro;
});

let root, container;
afterEach(() => {
  if (root) act(() => root.unmount());
  container?.remove();
  root = null;
  vi.useRealTimers();
  localStorage.removeItem('pm_reduce_motion');
});

function mount(sequence, onSequenceComplete) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => { root.render(<AnimationRenderer sequence={sequence} language="en" onSequenceComplete={onSequenceComplete} />); });
}
// Primitives currently mounted (each sits in its own wrapper under the renderer's column).
const shown = () => container.firstChild.querySelectorAll(':scope > div.flex.flex-col.gap-2').length;

// GSAP keeps its own clock (captured before fake timers are installed), so the
// test drives it by hand: its ticker is detached and each simulated step
// advances both the fake timers and GSAP's root timeline by the same amount.
let gsapTime = 0;
function run(ms, stepMs = 100) {
  for (let t = 0; t < ms; t += stepMs) {
    act(() => {
      vi.advanceTimersByTime(stepMs);
      gsapTime += stepMs / 1000;
      gsap.updateRoot(gsapTime);
    });
  }
}

function* jsonFiles(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* jsonFiles(full);
    else if (entry.name.endsWith('.json')) yield full;
  }
}

// One lesson per distinct walkthrough "signature": the ordered primitive types
// plus, for the synced types, how many values/lines they carry.
function walkthroughCases() {
  const seen = new Map();
  for (const file of jsonFiles(LESSONS_DIR)) {
    let data;
    try { data = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { continue; }
    for (const lesson of Array.isArray(data) ? data : [data]) {
      if (!lesson || !Array.isArray(lesson.animation_sequence)) continue;
      const seq = walkthrough(lesson.animation_sequence);
      if (seq.length === 0) continue;
      const sig = seq.map((s) => s.type).join('>');
      if (!seen.has(sig)) seen.set(sig, { id: lesson.id || path.basename(file, '.json'), seq });
    }
  }
  return [...seen.values()];
}

describe('CodeStepper step shapes that stalled or crashed a walkthrough', () => {
  it('fun_automation/auto_email_sender: an explanation carrying {en, output} gives text, not an object', () => {
    const p = normalizeProps('CodeStepper', {
      steps: [{ code: "name = 'alice'.title()", explanation: { en: 'Title-case the name', output: 'Alice' } }],
    }, 'en');
    expect(p.stepDescriptions).toEqual([{ description: 'Title-case the name', output: 'Alice' }]);
  });

  it('aws_enterprise/aws_bedrock_genai: code plus line-numbered steps becomes a highlight sequence', () => {
    const p = normalizeProps('CodeStepper', {
      code: 'a = 1\nb = 2\nc = 3',
      steps: [{ line: 2, explanation: { en: 'Set b' } }, { line: 3, explanation: 'Set c' }],
    }, 'en');
    expect(p.code).toBe('a = 1\nb = 2\nc = 3');
    expect(p.highlightSequence).toEqual([2, 3]);
    expect(p.stepDescriptions.map((d) => d.description)).toEqual(['Set b', 'Set c']);
  });
});

describe('every lesson walkthrough reaches its last primitive (motion allowed)', () => {
  it('no walkthrough stalls within 3 minutes of simulated time', () => {
    localStorage.setItem('pm_reduce_motion', '0');
    const stalled = [];
    const cases = walkthroughCases();
    for (const { id, seq } of cases) {
      vi.useFakeTimers();
      const done = vi.fn();
      try {
        mount(seq, done);
        for (let s = 0; s < 180 && !done.mock.calls.length; s++) run(1000, 1000);
      } catch (e) {
        stalled.push(`${id}: throws ${String(e.message).slice(0, 120)}`);
        done();
      }
      if (!done.mock.calls.length) {
        const at = shown() - 1;
        stalled.push(`${id}: stalls at #${at} ${seq[at]?.type} (${seq.map((p) => p.type).join('>')})`);
      }
      act(() => root.unmount());
      container.remove();
      root = null;
      vi.useRealTimers();
    }
    expect(stalled, `${stalled.length}/${cases.length} walkthroughs stall:\n${stalled.join('\n')}`).toEqual([]);
  }, 600000);
});

describe('conditionals Watch It Run walkthrough advances to the end', () => {
  const lesson = loadLesson('python_fundamentals/conditionals.json');
  const seq = walkthrough(lesson.animation_sequence);

  it('motion allowed: reaches the ComparisonPanel and shows its caption within 60 s', () => {
    localStorage.setItem('pm_reduce_motion', '0');
    vi.useFakeTimers();
    const done = vi.fn();
    mount(seq, done);
    const trace = [];
    for (let s = 0; s < 60 && !container.textContent.includes('Only the first True branch executes'); s++) {
      run(1000);
      trace.push(shown());
    }
    expect(container.textContent, `primitives shown per second: ${trace.join(',')}`)
      .toContain('Only the first True branch executes');
  });

  it('reduced motion: Next on each controlled visual reaches the ComparisonPanel', () => {
    localStorage.setItem('pm_reduce_motion', '1');
    vi.useFakeTimers();
    mount(seq);
    for (let i = 0; i < 40 && !container.textContent.includes('Only the first True branch executes'); i++) {
      const nexts = container.querySelectorAll('button[aria-label="Next step"]');
      if (nexts.length) act(() => nexts[nexts.length - 1].click());
      run(500);
    }
    expect(container.textContent, `primitives shown: ${shown()}`).toContain('Only the first True branch executes');
  });
});
