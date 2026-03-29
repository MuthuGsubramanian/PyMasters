import { useState, useCallback } from 'react';
import StoryCard from './StoryCard';
import CodeStepper from './CodeStepper';
import VariableBox from './VariableBox';
import TerminalOutput from './TerminalOutput';
import ParticleEffect from './ParticleEffect';
import FlowArrow from './FlowArrow';
import DataStructure from './DataStructure';
import MemoryStack from './MemoryStack';
import ComparisonPanel from './ComparisonPanel';
import ConceptMap from './ConceptMap';
import LoopVisualizer from './LoopVisualizer';
import FlowDiagram from './FlowDiagram';
import ExecutionVisualizer from './ExecutionVisualizer';
import NeuralNetworkVisualizer from './NeuralNetworkVisualizer';
import AlgorithmVisualizer from './AlgorithmVisualizer';
import TreeVisualizer from './TreeVisualizer';

// Maps primitive type strings to components (PascalCase + snake_case)
const PRIMITIVE_MAP = {
  StoryCard, story_card: StoryCard,
  CodeStepper, code_stepper: CodeStepper,
  VariableBox, variable_box: VariableBox,
  Terminal: TerminalOutput, TerminalOutput, terminal_output: TerminalOutput,
  ParticleEffect, particle_effect: ParticleEffect,
  FlowArrow, flow_arrow: FlowArrow,
  DataStructure, data_structure: DataStructure,
  MemoryStack, memory_stack: MemoryStack,
  ComparisonPanel, comparison_panel: ComparisonPanel,
  ConceptMap, concept_map: ConceptMap,
  LoopVisualizer, loop_visualizer: LoopVisualizer,
  FlowDiagram, flow_diagram: FlowDiagram,
  ExecutionVisualizer, execution_visualizer: ExecutionVisualizer,
  NeuralNetworkVisualizer, neural_network: NeuralNetworkVisualizer,
  AlgorithmVisualizer, algorithm_visualizer: AlgorithmVisualizer,
  TreeVisualizer, tree_visualizer: TreeVisualizer,
};

// Keys whose values are locale maps ({"en": "...", "ta": "..."})
const LOCALE_KEYS = new Set([
  'content', 'label', 'description', 'instruction', 'title', 'explanation',
]);

// Keys whose values are structured data (NOT locale maps)
const STRUCT_KEYS = new Set([
  'before', 'after', 'left', 'right', 'nodes', 'edges', 'frames',
  'operations', 'steps', 'data', 'slots', 'children', 'variables',
  'highlightSequence', 'stepDescriptions', 'values', 'output',
  'animate_sequence', 'animation', 'practice_challenge', 'profile_update',
  'executionPath', 'executionSteps', 'collection', 'iterations',
]);

/**
 * Check if an object looks like a locale map: keys are 2-char language codes
 */
function isLocaleMap(obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return false;
  const keys = Object.keys(obj);
  if (keys.length === 0) return false;
  return keys.every(k => /^[a-z]{2}$/.test(k));
}

/**
 * Resolve a value if it's a locale map or story_variant reference.
 */
function resolveValue(value, language, storyContent) {
  if (typeof value === 'string') {
    if (value === 'story_variant' || value.startsWith('story_variant')) {
      return storyContent;
    }
    return value;
  }
  if (isLocaleMap(value)) {
    return value[language] ?? value['en'] ?? Object.values(value)[0] ?? '';
  }
  return value;
}

/**
 * Resolve locale-like props in an object. Only resolves known locale keys
 * and objects that look like locale maps. Leaves structured data untouched.
 */
function resolveProps(props, language, storyContent) {
  if (!props) return {};
  const resolved = {};
  for (const [key, value] of Object.entries(props)) {
    if (STRUCT_KEYS.has(key)) {
      // Structured data — pass through as-is
      resolved[key] = value;
    } else if (LOCALE_KEYS.has(key) || typeof value === 'string') {
      resolved[key] = resolveValue(value, language, storyContent);
    } else if (isLocaleMap(value)) {
      resolved[key] = resolveValue(value, language, storyContent);
    } else {
      resolved[key] = value;
    }
  }
  return resolved;
}

/**
 * Normalize lesson JSON props to match component prop signatures.
 */
function normalizeProps(type, raw, language) {
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

  // CodeStepper: steps → code + highlightSequence + stepDescriptions
  if ((type === 'CodeStepper' || type === 'code_stepper') && p.steps && !p.code) {
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

  // VariableBox: value → values
  if (type === 'VariableBox' || type === 'variable_box') {
    if (p.value != null && !p.values) {
      p.values = p.animate_sequence || [p.value];
      delete p.value;
      delete p.animate_sequence;
    }
    delete p.data_type;
    delete p.color;
  }

  // MemoryStack: slots → frames
  if ((type === 'MemoryStack' || type === 'memory_stack') && p.slots && !p.frames) {
    p.frames = p.slots.map(s => ({
      name: s.label || s.name || 'frame',
      variables: s.variables || (s.value != null ? { value: s.value } : {})
    }));
    p.operations = p.slots.map(() => 'push');
    delete p.slots;
  }

  // ConceptMap: normalize nodes — handle {label, children} format
  if (type === 'ConceptMap' || type === 'concept_map') {
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

  // ComparisonPanel: left/right → before/after
  if (type === 'ComparisonPanel' || type === 'comparison_panel') {
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
    // Remove description — it's for the lesson, not the component
    delete p.description;
  }

  // Terminal: ensure output is always an array
  if (type === 'Terminal' || type === 'TerminalOutput' || type === 'terminal_output') {
    if (typeof p.output === 'string') {
      p.output = p.output.split('\n').filter(Boolean);
    }
  }

  // FlowArrow: branch → label
  if (type === 'FlowArrow' || type === 'flow_arrow') {
    if (p.branch && !p.label) {
      p.label = typeof p.branch === 'string' ? p.branch : '';
      delete p.branch;
    }
  }

  return p;
}

function applySpeed(props, speedMultiplier) {
  if (!props || speedMultiplier === 1) return props;
  const out = { ...props };
  if (typeof out.duration === 'number') {
    out.duration = Math.round(out.duration / speedMultiplier);
  }
  return out;
}

export default function AnimationRenderer({
  sequence: rawSequence = [],
  storyContent = '',
  speedMultiplier = 1.0,
  language = 'en',
  onSequenceComplete,
}) {
  // Ensure sequence is always a valid array
  const sequence = Array.isArray(rawSequence) ? rawSequence : [];

  const [currentStep, setCurrentStep] = useState(0);
  const [syncStep, setSyncStep] = useState(0);
  const [particleActive, setParticleActive] = useState(false);
  const [particleTrigger, setParticleTrigger] = useState(0);

  const handleStepComplete = useCallback(
    (stepIndex) => {
      const nextStep = stepIndex + 1;
      if (nextStep >= sequence.length) {
        setParticleActive(true);
        setParticleTrigger((t) => t + 1);
        onSequenceComplete?.();
      } else {
        setCurrentStep(nextStep);
      }
    },
    [sequence.length, onSequenceComplete]
  );

  const handleCodeStep = useCallback((stepIdx) => {
    setSyncStep(stepIdx);
  }, []);

  const visiblePrimitives = sequence.slice(0, currentStep + 1);

  const particlePrimitive = sequence.find(
    (s) => s.type === 'particle_effect' || s.type === 'ParticleEffect'
  );
  const particleEffect =
    particlePrimitive?.props?.effect ?? particlePrimitive?.effect ?? 'success_confetti';

  return (
    <div className="relative flex flex-col gap-6">
      {visiblePrimitives.map((primitive, idx) => {
        const pType = primitive.type;
        if (pType === 'particle_effect' || pType === 'ParticleEffect') {
          return null;
        }

        const Component = PRIMITIVE_MAP[pType];
        if (!Component) {
          console.warn(`[AnimationRenderer] Unknown primitive: "${pType}"`);
          // Skip unknown primitives and auto-advance
          if (idx === currentStep) {
            setTimeout(() => handleStepComplete(idx), 100);
          }
          return null;
        }

        // Extract props — either from .props or from the primitive object directly
        const rawProps = primitive.props ?? (() => {
          const { type, sync_with, ...rest } = primitive;
          return rest;
        })();

        const normalized = normalizeProps(pType, rawProps, language);
        let props = resolveProps(normalized, language, storyContent);
        props = applySpeed(props, speedMultiplier);

        const isCurrentStep = idx === currentStep;

        // Wire sync props
        const syncProps = {};
        if (['VariableBox', 'variable_box', 'Terminal', 'TerminalOutput', 'terminal_output'].includes(pType) || primitive.sync_with) {
          syncProps.syncStep = syncStep;
        }
        if (['CodeStepper', 'code_stepper'].includes(pType)) {
          syncProps.onStep = handleCodeStep;
        }

        return (
          <div key={`${pType}-${idx}`}>
            <Component
              {...props}
              {...syncProps}
              onComplete={isCurrentStep ? () => handleStepComplete(idx) : undefined}
            />
          </div>
        );
      })}

      <ParticleEffect
        effect={particleEffect}
        trigger={particleTrigger}
        active={particleActive}
      />
    </div>
  );
}
