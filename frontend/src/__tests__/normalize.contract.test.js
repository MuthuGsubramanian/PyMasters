import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeProps } from '../components/animations/AnimationRenderer';
import { CONTRACT, NON_CONTENT_KEYS, canonicalType, droppedKeys } from '../components/animations/normalize';

// Data contract between lesson JSON and the animation components.
//
// For every primitive in every backend lesson, the keys the author wrote that
// the normaliser neither maps to a component prop nor lists in
// NON_CONTENT_KEYS are "dropped": the learner never sees them. KNOWN_GAPS is
// the measured set of dropped keys per canonical type. Fix a gap (teach the
// component or the normaliser to use the key, or remove the key from the
// lessons), then delete the key from KNOWN_GAPS. The test fails both when a
// new key starts being dropped and when a listed key stops being dropped.
const KNOWN_GAPS = {
  CodeStepper: ['language'],
  DataStructure: [
    'animations', 'connections', 'highlight_cells', 'highlight_color', 'initial_state',
    'items', 'label', 'labels', 'layers', 'pending_append', 'structure_type', 'visualization',
  ],
  FlowArrow: ['flows', 'from', 'nodes', 'stages', 'steps', 'to'],
  LoopVisualizer: [
    'arrayLabel', 'condition', 'expression', 'initialArray', 'iterable', 'label', 'loopVariable',
    'result', 'type_name',
  ],
  ParticleEffect: ['message'],
  VariableBox: ['data_type', 'variables'],
};

const LESSONS_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../backend/lessons');

function* jsonFiles(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
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

// Same extraction as AnimationRenderer: `.props`, or the primitive minus type/sync_with.
function primitiveProps(primitive) {
  if (primitive.props) return primitive.props;
  const { type: _type, sync_with: _syncWith, ...rest } = primitive;
  return rest;
}

function measureGaps() {
  const gaps = {};
  for (const file of jsonFiles(LESSONS_DIR)) {
    const lesson = JSON.parse(fs.readFileSync(file, 'utf8'));
    for (const seq of sequences(lesson)) {
      for (const primitive of seq) {
        if (!primitive || typeof primitive.type !== 'string') continue;
        const type = canonicalType(primitive.type);
        if (!CONTRACT[type]) continue;
        const props = primitiveProps(primitive);
        if (!props || typeof props !== 'object') continue;
        for (const key of droppedKeys(type, props)) {
          (gaps[type] ||= new Set()).add(key);
        }
      }
    }
  }
  return Object.fromEntries(Object.entries(gaps).map(([t, s]) => [t, [...s].sort()]));
}

describe('normalize data contract over every lesson', () => {
  it('keeps normalizeProps importable from AnimationRenderer', () => {
    expect(typeof normalizeProps).toBe('function');
  });

  it('declares the non-content keys', () => {
    expect([...NON_CONTENT_KEYS].sort()).toEqual(
      ['animated', 'color', 'duration', 'duration_ms', 'id', 'speed', 'style', 'sync_with', 'theme', 'trigger', 'type'],
    );
  });

  it('has a contract for every canonical type', () => {
    expect(canonicalType('story_card')).toBe('StoryCard');
    expect(canonicalType('Terminal')).toBe('TerminalOutput');
    expect(canonicalType('neural_network')).toBe('NeuralNetworkVisualizer');
    expect(Object.keys(CONTRACT)).toHaveLength(16);
  });

  it('dropped keys per type equal KNOWN_GAPS exactly', () => {
    const measured = measureGaps();
    const diffs = [];
    for (const type of new Set([...Object.keys(measured), ...Object.keys(KNOWN_GAPS)])) {
      const now = new Set(measured[type] || []);
      const known = new Set(KNOWN_GAPS[type] || []);
      const extra = [...now].filter((k) => !known.has(k)).sort();
      const fixed = [...known].filter((k) => !now.has(k)).sort();
      if (extra.length || fixed.length) {
        diffs.push(
          `${type}:` +
            (extra.length ? `\n    newly dropped (add to KNOWN_GAPS or fix): ${extra.join(', ')}` : '') +
            (fixed.length ? `\n    no longer dropped (remove from KNOWN_GAPS): ${fixed.join(', ')}` : ''),
        );
      }
    }
    if (process.env.PRINT_GAPS) console.log(JSON.stringify(measured, null, 2));
    expect(diffs, `contract differences:\n  ${diffs.join('\n  ')}`).toEqual([]);
  });
});
