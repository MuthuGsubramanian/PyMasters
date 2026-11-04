// Normalisation of authored lesson primitives into component props, plus the
// per-type data contract (which authored keys reach the learner).
//
// Lesson JSON has drifted into several author-time shapes; each normaliser
// below coerces the known shapes into the component's prop signature.

// PascalCase / snake_case / alias type names -> canonical PascalCase name
// (the component name in AnimationRenderer's PRIMITIVE_MAP).
const TYPE_ALIASES = {
  story_card: 'StoryCard',
  code_stepper: 'CodeStepper',
  variable_box: 'VariableBox',
  Terminal: 'TerminalOutput',
  terminal_output: 'TerminalOutput',
  particle_effect: 'ParticleEffect',
  flow_arrow: 'FlowArrow',
  data_structure: 'DataStructure',
  memory_stack: 'MemoryStack',
  comparison_panel: 'ComparisonPanel',
  concept_map: 'ConceptMap',
  loop_visualizer: 'LoopVisualizer',
  flow_diagram: 'FlowDiagram',
  execution_visualizer: 'ExecutionVisualizer',
  neural_network: 'NeuralNetworkVisualizer',
  algorithm_visualizer: 'AlgorithmVisualizer',
  tree_visualizer: 'TreeVisualizer',
};

export function canonicalType(type) {
  return TYPE_ALIASES[type] || type;
}

// Keys that are timing, styling or wiring rather than lesson content. They are
// never reported as dropped.
export const NON_CONTENT_KEYS = new Set([
  'id', 'type', 'duration_ms', 'duration', 'speed', 'color', 'sync_with',
  'animated', 'trigger', 'style', 'theme',
]);

// Authored keys each canonical type consumes: the keys its normaliser maps to a
// component prop, plus the prop names the component reads directly.
export const CONTRACT = {
  StoryCard: { consumes: ['content', 'illustration', 'visual_theme'] },
  CodeStepper: { consumes: ['code', 'steps', 'highlightSequence', 'stepDescriptions', 'controlledStep'] },
  VariableBox: { consumes: ['variable', 'values', 'value', 'animate_sequence', 'label', 'syncStep'] },
  TerminalOutput: { consumes: ['output', 'lines', 'syncStep'] },
  ParticleEffect: { consumes: ['effect', 'active'] },
  FlowArrow: {
    consumes: ['label', 'branch', 'direction', 'stages', 'steps', 'nodes', 'flows', 'from', 'to', 'controlledStep'],
  },
  DataStructure: { consumes: ['structure', 'data', 'operations'] },
  MemoryStack: { consumes: ['frames', 'slots', 'operations'] },
  ComparisonPanel: {
    consumes: [
      'before', 'after', 'left', 'right', 'left_label', 'right_label', 'left_content',
      'right_content', 'items', 'models', 'comparisons', 'x_labels',
    ],
  },
  ConceptMap: { consumes: ['nodes', 'edges'] },
  LoopVisualizer: {
    consumes: [
      'loopType', 'collection', 'variable', 'rangeStart', 'rangeEnd', 'rangeStep',
      'iterations', 'code', 'controlledStep',
    ],
  },
  FlowDiagram: { consumes: ['nodes', 'edges', 'executionPath', 'variables', 'controlledStep'] },
  ExecutionVisualizer: { consumes: ['code', 'executionSteps', 'controlledStep'] },
  NeuralNetworkVisualizer: { consumes: ['layers', 'labels', 'activations'] },
  AlgorithmVisualizer: { consumes: ['algorithm', 'data', 'target'] },
  TreeVisualizer: { consumes: ['data', 'operations', 'operationArgs'] },
};

// Every type shows these through VisualCaption (title above, description below),
// so they count as consumed everywhere.
export const CAPTION_KEYS = ['title', 'description', 'caption'];
for (const c of Object.values(CONTRACT)) c.consumes.push(...CAPTION_KEYS);

/**
 * Authored keys of `raw` that the normaliser for `type` neither maps to a
 * component prop nor lists in NON_CONTENT_KEYS.
 */
export function droppedKeys(type, raw) {
  const contract = CONTRACT[canonicalType(type)];
  if (!contract || !raw || typeof raw !== 'object') return [];
  const consumed = new Set(contract.consumes);
  return Object.keys(raw).filter((k) => !consumed.has(k) && !NON_CONTENT_KEYS.has(k));
}

// Locale resolution for caption text: language, then English, then the first entry.
function captionText(v, language) {
  if (v == null) return '';
  if (typeof v === 'string') return v;
  if (isLocaleMap(v)) return String(v[language] ?? v.en ?? Object.values(v)[0] ?? '');
  return '';
}

function isLocaleMap(obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return false;
  const keys = Object.keys(obj);
  if (keys.length === 0) return false;
  return keys.every((k) => /^[a-z]{2}$/.test(k));
}

// CodeStepper: steps -> code + highlightSequence + stepDescriptions
function normalizeCodeStepper(p, language) {
  if (p.steps && !p.code) {
    const steps = p.steps;
    const codeLines = [];
    const descriptions = [];

    // Build a proper execution sequence that shows the full program flow
    for (const step of steps) {
      const line = typeof step === 'string' ? step : (step.code || step.line || '');
      codeLines.push(line);

      if (typeof step === 'object') {
        const desc = step.explanation || step.description || '';
        const resolvedDesc = isLocaleMap(desc) ? (desc[language] || desc.en || '') : desc;
        descriptions.push({
          description: resolvedDesc,
          output: step.output || null,
        });
      } else {
        descriptions.push({});
      }
    }

    p.code = codeLines.join('\n');
    // Highlight each line in sequence
    p.highlightSequence = codeLines.map((_, i) => i + 1);
    p.stepDescriptions = descriptions;
    p.speed = p.speed || 'normal';
    delete p.steps;
  }
}

// VariableBox: value -> values
function normalizeVariableBox(p) {
  if (p.value != null && !p.values) {
    p.values = p.animate_sequence || [p.value];
    delete p.value;
    delete p.animate_sequence;
  }
  delete p.data_type;
  delete p.color;
}

// MemoryStack: slots -> frames
function normalizeMemoryStack(p) {
  if (p.slots && !p.frames) {
    p.frames = p.slots.map((s) => ({
      name: s.label || s.name || 'frame',
      variables: s.variables || (s.value != null ? { value: s.value } : {}),
    }));
    p.operations = p.slots.map(() => 'push');
    delete p.slots;
  }
}

// ConceptMap: handle {label, children} node format
function normalizeConceptMap(p) {
  if (p.nodes) {
    const flatNodes = [];
    const flatEdges = p.edges || [];

    p.nodes.forEach((n, i) => {
      const nodeLabel = typeof n === 'string' ? n : (n.label || n.text || `Node ${i}`);
      const nodeId = n.id || `n${i}`;
      flatNodes.push({ id: nodeId, label: nodeLabel });

      // Expand children into nodes + edges
      if (n.children && Array.isArray(n.children)) {
        n.children.forEach((child, ci) => {
          const childLabel = typeof child === 'string' ? child : (child.label || child.text || '');
          const childId = `${nodeId}_c${ci}`;
          flatNodes.push({ id: childId, label: childLabel });
          flatEdges.push({ from: nodeId, to: childId, label: '' });
        });
      }
    });

    p.nodes = flatNodes;
    p.edges = flatEdges;
  }
}

// ComparisonPanel: left/right -> before/after
function normalizeComparisonPanel(p) {
  // Lesson JSON has drifted into several author-time shapes (2026-10-26
  // audit: ~55 lessons rendered an EMPTY panel). Coerce each known shape
  // into the component's before/after {label, code} contract.
  const txt = (v) => (v == null ? '' : typeof v === 'string' ? v : String(v));
  const joinLines = (arr) => (Array.isArray(arr) ? arr.map(txt).join('\n') : txt(arr));
  // {left:{title,items[]}, right:{title,items[]}}  (GRPO / trending_ai trilogies)
  if (p.left && Array.isArray(p.left.items) && !p.left.code) {
    p.left = { label: p.left.title || p.left.label, code: joinLines(p.left.items) };
  }
  if (p.right && Array.isArray(p.right.items) && !p.right.code) {
    p.right = { label: p.right.title || p.right.label, code: joinLines(p.right.items) };
  }
  // {left_label, right_label, left_content, right_content}  (ai_fundamentals / web_development)
  if (!p.before && !p.left && (p.left_content != null || p.right_content != null)) {
    p.before = { label: p.left_label || 'Before', code: txt(p.left_content) };
    p.after = { label: p.right_label || 'After', code: txt(p.right_content) };
  }
  // {left_label, right_label, items:[{left,right}]}  (ai_engineering pipeline lessons)
  if (!p.before && !p.left && Array.isArray(p.items) && p.items.length && p.items[0] && 'left' in p.items[0]) {
    p.before = { label: p.left_label || 'Option A', code: p.items.map((i) => txt(i.left)).join('\n') };
    p.after = { label: p.right_label || 'Option B', code: p.items.map((i) => txt(i.right)).join('\n') };
  }
  // {items:[{label,value,note}]}  (deep_learning) -> first option vs the rest
  if (!p.before && !p.left && Array.isArray(p.items) && p.items.length && p.items[0] && 'label' in p.items[0]) {
    const line = (i) => `${txt(i.value)}${i.note ? ` (${txt(i.note)})` : ''}`;
    const [first, ...rest] = p.items;
    p.before = { label: txt(first.label), code: line(first) };
    p.after = { label: rest.map((i) => txt(i.label)).join(' / ') || 'Alternatives', code: rest.map((i) => `${txt(i.label)}: ${line(i)}`).join('\n') };
  }
  // {models:[{name,strengths,weaknesses}]}  (machine_learning)
  if (!p.before && !p.left && Array.isArray(p.models) && p.models.length) {
    p.before = { label: 'Strengths', code: p.models.map((m) => `${txt(m.name)}: ${txt(m.strengths)}`).join('\n') };
    p.after = { label: 'Weaknesses', code: p.models.map((m) => `${txt(m.name)}: ${txt(m.weaknesses)}`).join('\n') };
  }
  // {comparisons:[{label,values[]}], x_labels[]}  (dsa growth tables)
  if (!p.before && !p.left && Array.isArray(p.comparisons) && p.comparisons.length) {
    const xs = Array.isArray(p.x_labels) ? p.x_labels.map(txt).join('  ') : '';
    p.before = { label: 'Inputs', code: xs };
    p.after = { label: 'Growth', code: p.comparisons.map((c) => `${txt(c.label)}: ${(c.values || []).map(txt).join('  ')}`).join('\n') };
  }
  for (const k of ['left_label', 'right_label', 'left_content', 'right_content', 'items', 'models', 'comparisons', 'x_labels']) delete p[k];
  if (p.left && !p.before) {
    p.before = {
      label: p.left.label || 'Before',
      code: p.left.result != null ? `Result: ${p.left.result}` : (p.left.code || ''),
    };
    delete p.left;
  }
  if (p.right && !p.after) {
    p.after = {
      label: p.right.label || 'After',
      code: p.right.result != null ? `Result: ${p.right.result}` : (p.right.code || ''),
    };
    delete p.right;
  }
}

// TerminalOutput: ensure output is always an array
function normalizeTerminalOutput(p) {
  // Authors also write `lines` (200+ lessons) — map it to `output`.
  if (p.output == null && p.lines != null) {
    p.output = Array.isArray(p.lines) ? p.lines.map((l) => (typeof l === 'string' ? l : String(l))) : String(p.lines);
    delete p.lines;
  }
  if (typeof p.output === 'string') {
    p.output = p.output.split('\n').filter(Boolean);
  }
}

// Stage item (string or {label|name|title, description|detail}) -> {label, detail?}
function stageOf(item, language) {
  const text = (v) => {
    if (v == null) return '';
    if (typeof v === 'string') return v;
    if (isLocaleMap(v)) return v[language] || v.en || '';
    return String(v);
  };
  if (item == null) return null;
  if (typeof item !== 'object') return { label: text(item) };
  const label = text(item.label ?? item.name ?? item.title ?? item.text);
  const detail = text(item.detail ?? item.description);
  if (!label && !detail) return null;
  return label && detail ? { label, detail } : { label: label || detail };
}

// FlowArrow: stages/steps/nodes/flows/from+to -> stages; branch -> label
function normalizeFlowArrow(p, language) {
  if (p.branch != null && !p.label) {
    p.label = typeof p.branch === 'string' ? p.branch : '';
  }
  delete p.branch;

  let stages = [];
  for (const key of ['stages', 'steps', 'nodes']) {
    if (Array.isArray(p[key]) && p[key].length) {
      stages = p[key].map((s) => stageOf(s, language)).filter(Boolean);
      break;
    }
  }
  if (!stages.length && Array.isArray(p.flows) && p.flows.length) {
    const names = (v) => (Array.isArray(v) ? v.join(', ') : v == null ? '' : String(v));
    stages = p.flows.map((f) => {
      if (f == null || typeof f !== 'object') return stageOf(f, language);
      const route = f.from != null || f.to != null ? `${names(f.from)} → ${names(f.to)}` : '';
      const label = stageOf({ label: f.label ?? f.name ?? f.title }, language)?.label || route;
      return label ? (route && label !== route ? { label, detail: route } : { label }) : null;
    }).filter(Boolean);
  }
  if (!stages.length && (p.from != null || p.to != null)) {
    stages = [p.from, p.to].filter((v) => v != null && v !== '').map((v) => ({ label: String(v) }));
  }
  for (const k of ['steps', 'nodes', 'flows', 'from', 'to']) delete p[k];
  p.stages = stages;
}

const slug = (s) => String(s).toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

// FlowDiagram: nodes always {id, label}; label-based edges resolve to ids
function normalizeFlowDiagram(p) {
  if (!Array.isArray(p.nodes)) return;
  const byLabel = new Map();
  const used = new Set();
  const uniq = (base) => {
    let id = base;
    for (let i = 2; used.has(id); i++) id = `${base}-${i}`;
    used.add(id);
    return id;
  };
  p.nodes = p.nodes.map((n, i) => {
    if (n == null || typeof n !== 'object') {
      const label = String(n ?? '');
      const id = uniq(slug(label) || `n${i}`);
      byLabel.set(label, id);
      return { id, label };
    }
    const label = String(n.label ?? n.name ?? n.title ?? n.text ?? n.id ?? `Node ${i + 1}`);
    const id = n.id != null ? String(n.id) : uniq(slug(label) || `n${i}`);
    used.add(id);
    if (!byLabel.has(label)) byLabel.set(label, id);
    return { ...n, id, label };
  });
  if (Array.isArray(p.edges)) {
    const ids = new Set(p.nodes.map((n) => n.id));
    const fix = (v) => (v != null && !ids.has(v) && byLabel.has(v) ? byLabel.get(v) : v);
    p.edges = p.edges.map((e) => {
      if (!e || typeof e !== 'object') return e;
      const out = { ...e };
      for (const k of ['from', 'to', 'source', 'target']) if (k in out) out[k] = fix(out[k]);
      return out;
    });
  }
}

const NORMALIZERS = {
  CodeStepper: normalizeCodeStepper,
  VariableBox: normalizeVariableBox,
  MemoryStack: normalizeMemoryStack,
  ConceptMap: normalizeConceptMap,
  ComparisonPanel: normalizeComparisonPanel,
  TerminalOutput: normalizeTerminalOutput,
  FlowArrow: normalizeFlowArrow,
  FlowDiagram: normalizeFlowDiagram,
};

/**
 * Normalize lesson JSON props to match component prop signatures.
 * Exported so the scroll-synced lesson layout (Classroom IntroPhase) can
 * normalize a single primitive without going through the full renderer.
 */
export function normalizeProps(type, raw, language) {
  const p = { ...raw };
  delete p.id;

  // duration_ms → duration
  if (p.duration_ms != null && p.duration == null) {
    p.duration = p.duration_ms;
    delete p.duration_ms;
  }

  // visual_theme → illustration
  if (p.visual_theme != null && p.illustration == null) {
    p.illustration = p.visual_theme;
    delete p.visual_theme;
  }

  // title/description/caption go to VisualCaption, never to the component.
  const caption = {
    title: captionText(p.title, language),
    description: captionText(p.description, language) || captionText(p.caption, language),
  };
  delete p.title;
  delete p.description;
  delete p.caption;

  NORMALIZERS[canonicalType(type)]?.(p, language);

  return { ...p, caption };
}
