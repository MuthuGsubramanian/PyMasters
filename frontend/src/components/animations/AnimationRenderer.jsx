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
import VisualCaption from './VisualCaption';
import { PlayableVisual, getStepTotal } from './VisualControls';
import { normalizeProps } from './normalize';

// Exported so the scroll-synced lesson layout (Classroom IntroPhase) can
// normalize a single primitive without going through the full renderer.
export { normalizeProps } from './normalize';

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

function applySpeed(props, speedMultiplier) {
  if (!props || speedMultiplier === 1) return props;
  const out = { ...props };
  if (typeof out.duration === 'number') {
    out.duration = Math.round(out.duration / speedMultiplier);
  }
  return out;
}

/**
 * One primitive on its own, with its caption: the same normalisation and locale
 * resolution as the full renderer, but no sequence, sync or particle wiring.
 * Step-based types get the playback controls, starting paused (the learner
 * presses Play). Used by the "How it works" topic explainer.
 */
export function PrimitiveView({ type, props: rawProps, language = 'en' }) {
  const Component = PRIMITIVE_MAP[type];
  if (!Component || type === 'ParticleEffect' || type === 'particle_effect') return null;
  const { caption, ...componentProps } = normalizeProps(type, rawProps || {}, language);
  const props = resolveProps(componentProps, language, '');
  const stepTotal = getStepTotal(type, props);
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <VisualCaption title={caption?.title} />
      {stepTotal > 0 ? (
        <PlayableVisual total={stepTotal} autoPlay={false}>
          {(step) => <Component {...props} controlledStep={step} />}
        </PlayableVisual>
      ) : (
        <Component {...props} />
      )}
      <VisualCaption description={caption?.description} />
    </div>
  );
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
          const { type: _type, sync_with: _syncWith, ...rest } = primitive;
          return rest;
        })();

        const normalized = normalizeProps(pType, rawProps, language);
        const { caption, ...componentProps } = normalized;
        let props = resolveProps(componentProps, language, storyContent);
        props = applySpeed(props, speedMultiplier);

        const isCurrentStep = idx === currentStep;
        const stepTotal = getStepTotal(pType, props);

        // Wire sync props
        const syncProps = {};
        if (['VariableBox', 'variable_box', 'Terminal', 'TerminalOutput', 'terminal_output'].includes(pType) || primitive.sync_with) {
          syncProps.syncStep = syncStep;
        }
        if (['CodeStepper', 'code_stepper'].includes(pType)) {
          syncProps.onStep = handleCodeStep;
        }

        return (
          <div key={`${pType}-${idx}`} className="flex flex-col gap-2">
            <VisualCaption title={caption?.title} />
            {stepTotal > 0 ? (
              <PlayableVisual
                total={stepTotal}
                onComplete={isCurrentStep ? () => handleStepComplete(idx) : undefined}
              >
                {(step) => <Component {...props} {...syncProps} controlledStep={step} />}
              </PlayableVisual>
            ) : (
              <Component
                {...props}
                {...syncProps}
                onComplete={isCurrentStep ? () => handleStepComplete(idx) : undefined}
              />
            )}
            <VisualCaption description={caption?.description} />
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
