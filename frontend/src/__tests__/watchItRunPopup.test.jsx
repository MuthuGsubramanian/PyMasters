import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import AnimationRenderer from '../components/animations/AnimationRenderer';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const read = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

const text = (html) =>
  html.replace(/<[^>]+>/g, ' ').replace(/&gt;/g, '>').replace(/&lt;/g, '<').replace(/&#x27;/g, "'").replace(/&quot;/g, '"');

// backend/lessons/ai_agents/agent_fundamentals.json flow_1 (string nodes, label edges).
const AGENT_FLOW = {
  type: 'FlowDiagram',
  id: 'flow_1',
  nodes: ['Perceive', 'Reason', 'Act', 'Memory Update', 'Task Complete?'],
  edges: [
    { from: 'Perceive', to: 'Reason' }, { from: 'Reason', to: 'Act' }, { from: 'Act', to: 'Memory Update' },
    { from: 'Memory Update', to: 'Task Complete?' }, { from: 'Task Complete?', to: 'Perceive' },
  ],
  description: 'The Perceive-Reason-Act loop: the core cycle every AI agent runs until the task is complete',
};

const EXEC = {
  type: 'ExecutionVisualizer',
  code: 'x = 1\ny = x + 1',
  executionSteps: [
    { line: 1, variables: { x: 1 }, output: '', description: 'Set x' },
    { line: 2, variables: { x: 1, y: 2 }, output: '', description: 'Set y' },
  ],
  title: { en: 'Two assignments' },
  description: { en: 'Each line runs in order' },
};

describe('Watch It Run popup: FlowDiagram goes through normalizeProps, caption and controls', () => {
  it('string-node FlowDiagram (agent_fundamentals) shows its labels and caption', async () => {
    const { PopupFlowVisual } = await import('../pages/Classroom');
    const t = text(renderToStaticMarkup(<PopupFlowVisual flowDiagram={AGENT_FLOW} language="en" />));
    for (const label of ['Perceive', 'Reason', 'Act', 'Memory Update', 'Task Complete?']) expect(t).toContain(label);
    expect(t).toContain('The Perceive-Reason-Act loop');
  });

  it('a FlowDiagram with an execution path gets playback controls', async () => {
    const { PopupFlowVisual } = await import('../pages/Classroom');
    const html = renderToStaticMarkup(
      <PopupFlowVisual flowDiagram={{ ...AGENT_FLOW, executionPath: ['perceive', 'reason', 'act'] }} language="en" />,
    );
    expect(html).toContain('aria-label="Next step"');
    expect(text(html)).toContain('Step 1 of 3');
    expect(text(html)).toContain('Perceive');
  });
});

describe('Watch It Run popup: ExecutionVisualizer goes through normalizeProps, caption and controls', () => {
  it('shows title, description and playback controls', async () => {
    const { PopupExecutionVisual } = await import('../pages/Classroom');
    const html = renderToStaticMarkup(<PopupExecutionVisual executionViz={EXEC} language="en" />);
    const t = text(html);
    expect(t).toContain('Two assignments');
    expect(t).toContain('Each line runs in order');
    expect(html).toContain('aria-label="Next step"');
    expect(t).toContain('Step 1 of 2');
  });
});

describe('Watch It Run popup is a dark surface in both themes', () => {
  let root, container;
  beforeEach(async () => {
    localStorage.setItem('pm_reduce_motion', '1');
    // IntroPhase asks for the lesson's Under the hood trace in the background; no server here.
    const { default: api } = await import('../api');
    vi.spyOn(api, 'get').mockRejectedValue(Object.assign(new Error('Not Found'), { response: { status: 404 } }));
  });
  afterEach(() => {
    act(() => root?.unmount());
    container?.remove();
    localStorage.removeItem('pm_reduce_motion');
    vi.restoreAllMocks();
  });

  const lesson = {
    id: 'popup_test',
    title: 'Popup test',
    story_variants: { en: 'A story without section headings.' },
    animation_sequence: [
      { type: 'LoopVisualizer', iterable: [3, 2, 1], expression: 'yield n' },
      { type: 'VariableBox', variable: 'signal', value: 'green', data_type: 'str' },
      AGENT_FLOW,
    ],
  };

  async function openPopup() {
    const { IntroPhase } = await import('../pages/Classroom');
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => { root.render(<IntroPhase lesson={lesson} language="en" onComplete={vi.fn()} />); });
    return container;
  }

  it('the dialog root carries the `dark` class so tokens and dark: variants inside it are the dark ones', async () => {
    const c = await openPopup();
    const launcher = [...c.querySelectorAll('button')].find((b) => b.textContent.includes('Watch It Run'));
    expect(launcher).toBeTruthy();
    act(() => launcher.click());
    const dialog = document.querySelector('[role="dialog"]');
    expect(dialog).toBeTruthy();
    expect(dialog.classList.contains('dark')).toBe(true);
    // The page itself is not switched to dark: only the popup subtree is.
    expect(document.documentElement.classList.contains('dark')).toBe(false);
    // The popup FlowDiagram shows the string-node labels.
    expect(dialog.textContent).toContain('Memory Update');
  });

  it('the launcher subtitle counts the normalised loop steps (iterable, no iterations)', async () => {
    const c = await openPopup();
    expect(c.textContent).toContain('for loop · 3 iterations');
  });

  it('intro header text is at least 12px', async () => {
    const c = await openPopup();
    expect(c.innerHTML).not.toMatch(/text-\[(9|10|11)px\]/);
    const src = read('../pages/Classroom.jsx');
    const intro = src.slice(src.indexOf('function IntroPhase'), src.indexOf('function PracticePhase'));
    expect(intro).not.toMatch(/text-\[(9|10|11)px\]/);
  });
});

describe('a nested .dark scope re-resolves the colour tokens', () => {
  // Tailwind v4 emits `color: var(--color-text-primary)`, and @theme declares
  // `--color-text-primary: var(--text-primary)` on :root, where it resolves to the
  // light value and is inherited already-resolved. The .dark block must redeclare
  // the --color-* mappings so a `.dark` element below a light <html> gets dark tokens.
  it('index.css .dark block redeclares every --color-* token used by the visuals', () => {
    const css = read('../index.css');
    // The multi-line `.dark { ... }` variables block (not the one-line color-scheme rule).
    const block = css.match(/\n\.dark\s*\{[ \t]*\n([\s\S]*?)\n\}/)[1];
    expect(block).toContain('--text-primary:');
    for (const t of ['text-primary', 'text-secondary', 'text-muted', 'bg-base', 'bg-surface', 'bg-elevated',
      'bg-inset', 'border-default', 'border-strong', 'accent-primary', 'bg-code', 'code-foreground']) {
      expect(block, t).toMatch(new RegExp(`--color-${t}:\\s*var\\(--${t}\\)`));
    }
  });
});

describe('ComparisonPanel at phone width', () => {
  const render = (prim) => renderToStaticMarkup(<AnimationRenderer sequence={[prim]} language="en" />);
  it('stacks to one column below sm and lets long results wrap', () => {
    const html = render({
      type: 'ComparisonPanel',
      before: { label: 'Before', code: 'a = 1', result: 'x'.repeat(200) },
      after: { label: 'After', result: 'y'.repeat(200) },
      tone: 'before_after',
    });
    expect(html).toMatch(/class="[^"]*\bgrid-cols-1\b[^"]*\bsm:grid-cols-2\b/);
    const results = html.match(/<div data-result[^>]*class="([^"]*)"/g) || [];
    expect(results.length).toBe(2);
    for (const r of results) expect(r).toMatch(/break-words|break-all|overflow-x-auto/);
  });
});
