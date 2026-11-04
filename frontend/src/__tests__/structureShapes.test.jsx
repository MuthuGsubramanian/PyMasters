import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import AnimationRenderer from '../components/animations/AnimationRenderer';

const render = (prim) => renderToStaticMarkup(<AnimationRenderer sequence={[prim]} language="en" />);
const text = (html) =>
  html.replace(/<[^>]+>/g, '').replace(/&gt;/g, '>').replace(/&lt;/g, '<').replace(/&#x27;/g, "'").replace(/&quot;/g, '"');

describe('LoopVisualizer shows the fields lessons actually write', () => {
  it('python_fundamentals/adv_generators: iterable list, expression, result and label', () => {
    const html = render({
      type: 'LoopVisualizer',
      iterable: [3, 2, 1],
      expression: 'yield n',
      result: [3, 2, 1],
      label: 'countdown(3) yields values on demand',
      speed: 'normal',
    });
    const t = text(html);
    expect(t).toContain('Result: [3, 2, 1]');
    expect(t).toContain('yield n');
    expect(t).toContain('countdown(3) yields values on demand');
    // the list iterable fills the collection row
    expect(html).toMatch(/>3<[\s\S]*>2<[\s\S]*>1</);
  });

  it('ai_ml_foundations/sklearn_clustering: loopVariable names the variable', () => {
    const html = render({
      type: 'LoopVisualizer',
      loopVariable: 'iteration',
      iterations: [{ iteration: 1, description: 'Random centroid placement' }],
    });
    expect(html).toMatch(/>iteration<\/span>/);
    expect(html).not.toMatch(/>item<\/span>/);
  });

  it('fun_automation/auto_email_sender: string iterable becomes a for line, type_name is shown', () => {
    const html = render({
      type: 'LoopVisualizer',
      type_name: 'email_loop',
      iterable: 'contacts',
      iterations: [
        { index: 0, value: 'Alice', description: 'Compose and send to Alice' },
        { index: 1, value: 'Bob', description: 'Compose and send to Bob' },
      ],
      speed: 'normal',
    });
    const t = text(html);
    expect(t).toContain('for item in contacts:');
    expect(t).toContain('email_loop');
  });

  it('python_fundamentals/while_loops: the while condition is shown', () => {
    const html = render({
      type: 'LoopVisualizer',
      loopType: 'while',
      variable: 'count',
      condition: 'count > 0',
      code: "count = 5\nwhile count > 0:\n    print(count)\n    count -= 1",
      iterations: [{ value: 5, output: '5', description: 'First check: 5 > 0 is True' }],
    });
    expect(text(html)).toContain('Condition: count > 0');
  });

  it('dsa/sorting_basics: arrayLabel heads the loop and initialArray fills the collection', () => {
    const html = render({
      type: 'LoopVisualizer',
      arrayLabel: 'Bubble Sort',
      initialArray: [64, 34, 25],
      iterations: [{ pass: 1, comparing: [0, 1], action: 'swap', array: [34, 64, 25] }],
    });
    expect(text(html)).toContain('Bubble Sort');
    expect(html).toMatch(/>64<[\s\S]*>34<[\s\S]*>25</);
  });

  it('keeps controlledStep working with the new fields', () => {
    const html = renderToStaticMarkup(
      <AnimationRenderer
        sequence={[{ type: 'LoopVisualizer', iterable: [3, 2, 1], result: [3, 2, 1], controlledStep: 0 }]}
        language="en"
      />,
    );
    expect(text(html)).toContain('Result: [3, 2, 1]');
  });
});

describe('DataStructure shows the fields lessons actually write', () => {
  it('ai_ml_foundations/numpy_arrays: structure_type, labels and highlight', () => {
    const html = render({
      type: 'DataStructure',
      structure_type: 'matrix',
      data: [[1, 2], [3, 4]],
      labels: ['row 0', 'row 1'],
      highlight_color: '#f7914f',
      highlight_cells: [[1, 0]],
    });
    const t = text(html);
    expect(t).toContain('matrix');
    expect(t).toContain('row 0');
    expect(t).toContain('row 1');
    expect(html.match(/data-highlighted="true"/g)).toHaveLength(1);
    expect(html).toContain('#f7914f');
  });

  it('flat highlight_cells numbers highlight those items', () => {
    const html = render({ type: 'DataStructure', structure: 'list', data: ['a', 'b', 'c'], highlight_cells: [0, 2] });
    expect(html.match(/data-highlighted="true"/g)).toHaveLength(2);
  });

  it('dsa/queues style initial_state is the starting data when data is absent', () => {
    const html = render({ type: 'DataStructure', structure_type: 'list', initial_state: ['A', 'B'] });
    const t = text(html);
    expect(t).toContain('len=2');
    expect(t).toContain('A');
  });

  it('python_fundamentals/lists: items are the data', () => {
    const html = render({
      type: 'DataStructure',
      structure: 'list',
      items: ['apple', 'banana', 'cherry'],
      pending_append: 'date',
    });
    expect(text(html)).toContain('banana');
  });

  it('python_fundamentals/ds_tuples: label is shown', () => {
    const html = render({ type: 'DataStructure', structure: 'tuple', items: [3, 7], label: 'point (immutable)' });
    expect(text(html)).toContain('point (immutable)');
  });

  it('ai_fundamentals/vector_databases: object data does not crash and its keys show', () => {
    const html = render({
      type: 'DataStructure',
      structure_type: 'vector',
      data: { doc1_lists: [0.85, 0.22, 0.45], query: [0.82, 0.25, 0.48] },
    });
    expect(text(html)).toContain('doc1_lists');
  });
});

describe('VariableBox shows the fields lessons actually write', () => {
  it('web_development/django_views_templates: data_type is the badge', () => {
    const html = render({
      type: 'VariableBox',
      variable: 'context',
      value: "{'posts': QuerySet[Post1, Post2, ...]}",
      data_type: 'dict',
    });
    expect(html).toMatch(/>dict<\/span>/);
    expect(html).not.toMatch(/>str<\/span>/);
  });

  it('trending_ai/llm_memory_math: variables list renders every box', () => {
    const html = render({
      type: 'VariableBox',
      variables: [
        { name: 'params', value: '7e9' },
        { name: 'bits', value: '4' },
        { name: 'ram_gb', value: '4.2' },
      ],
      duration_ms: 3000,
    });
    const t = text(html);
    for (const s of ['params', '7e9', 'bits', 'ram_gb', '4.2']) expect(t).toContain(s);
  });

  it('variables entries may use variable/data_type keys', () => {
    const html = render({
      type: 'VariableBox',
      variables: [{ variable: 'x', value: 5, data_type: 'int' }, { variable: 'y', value: 'hi', data_type: 'text' }],
    });
    expect(html).toMatch(/>text<\/span>/);
    expect(text(html)).toContain('y');
  });
});
