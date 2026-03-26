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

// Maps primitive type strings to components (supports both PascalCase and snake_case)
const PRIMITIVE_MAP = {
  StoryCard: StoryCard,
  story_card: StoryCard,
  CodeStepper: CodeStepper,
  code_stepper: CodeStepper,
  VariableBox: VariableBox,
  variable_box: VariableBox,
  Terminal: TerminalOutput,
  TerminalOutput: TerminalOutput,
  terminal_output: TerminalOutput,
  ParticleEffect: ParticleEffect,
  particle_effect: ParticleEffect,
  FlowArrow: FlowArrow,
  flow_arrow: FlowArrow,
  DataStructure: DataStructure,
  data_structure: DataStructure,
  MemoryStack: MemoryStack,
  memory_stack: MemoryStack,
  ComparisonPanel: ComparisonPanel,
  comparison_panel: ComparisonPanel,
  ConceptMap: ConceptMap,
  concept_map: ConceptMap,
};

/**
 * Resolve a localized string prop.
 * - If the value is a plain string starting with "story_variant", return storyContent
 * - If the value is an object, return value[language] ?? value['en'] ?? value[Object.keys(value)[0]]
 * - Otherwise return as-is
 */
function resolveContent(value, language, storyContent) {
  if (typeof value === 'string') {
    if (value === 'story_variant' || value.startsWith('story_variant')) {
      return storyContent;
    }
    return value;
  }
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value[language] ?? value['en'] ?? Object.values(value)[0];
  }
  return value;
}

/**
 * Recursively resolve all string/object props in a props object.
 */
function resolveProps(props, language, storyContent) {
  if (!props) return {};
  const resolved = {};
  for (const [key, value] of Object.entries(props)) {
    if (typeof value === 'string' || (value && typeof value === 'object' && !Array.isArray(value))) {
      resolved[key] = resolveContent(value, language, storyContent);
    } else {
      resolved[key] = value;
    }
  }
  return resolved;
}

/**
 * Normalize lesson JSON props to match component prop signatures.
 * Lesson JSON may use different names than what components expect.
 */
function normalizeProps(type, raw) {
  const p = { ...raw };
  // Remove internal fields
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

  // CodeStepper: steps → code + highlightSequence
  if ((type === 'CodeStepper' || type === 'code_stepper') && p.steps && !p.code) {
    const code = p.steps.map(s => s.code || s.line || s).join('\n');
    const seq = p.steps.map((_, i) => i + 1);
    p.code = code;
    p.highlightSequence = seq;
    p.speed = p.speed || 'normal';
    delete p.steps;
  }

  // VariableBox: value → values (wrap single in array), animate_sequence
  if ((type === 'VariableBox' || type === 'variable_box')) {
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
      variables: s.variables || s.value ? { value: s.value } : {}
    }));
    p.operations = p.slots.map(() => 'push');
    delete p.slots;
  }

  // ConceptMap: ensure nodes have id and label
  if ((type === 'ConceptMap' || type === 'concept_map') && p.nodes) {
    p.nodes = p.nodes.map((n, i) => ({
      id: n.id || `n${i}`,
      label: n.label || n.text || n
    }));
  }

  // FlowArrow: branch → label fallback
  if ((type === 'FlowArrow' || type === 'flow_arrow')) {
    if (p.branch && !p.label) {
      p.label = p.branch;
      delete p.branch;
    }
  }

  return p;
}

/**
 * Apply speedMultiplier to duration props.
 */
function applySpeed(props, speedMultiplier) {
  if (!props || speedMultiplier === 1) return props;
  const out = { ...props };
  if (typeof out.duration === 'number') {
    out.duration = Math.round(out.duration / speedMultiplier);
  }
  return out;
}

export default function AnimationRenderer({
  sequence = [],
  storyContent = '',
  speedMultiplier = 1.0,
  language = 'en',
  onSequenceComplete,
}) {
  const [currentStep, setCurrentStep] = useState(0);
  const [syncStep, setSyncStep] = useState(0);
  const [particleActive, setParticleActive] = useState(false);
  const [particleTrigger, setParticleTrigger] = useState(0);

  const handleStepComplete = useCallback(
    (stepIndex) => {
      const nextStep = stepIndex + 1;

      if (nextStep >= sequence.length) {
        // Sequence complete — fire particles
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

  // Render primitives up to and including currentStep
  const visiblePrimitives = sequence.slice(0, currentStep + 1);

  // Find the particle effect primitive in the sequence if any
  const particlePrimitive = sequence.find((s) => s.type === 'particle_effect' || s.type === 'ParticleEffect');
  const particleEffect = particlePrimitive?.props?.effect ?? particlePrimitive?.effect ?? 'success_confetti';

  return (
    <div className="relative flex flex-col gap-6">
      {visiblePrimitives.map((primitive, idx) => {
        const pType = primitive.type;
        if (pType === 'particle_effect' || pType === 'ParticleEffect') {
          // Handled separately below
          return null;
        }

        const Component = PRIMITIVE_MAP[pType];
        if (!Component) {
          console.warn(`[AnimationRenderer] Unknown primitive type: "${pType}"`);
          return null;
        }

        // Props can be nested under primitive.props OR directly on the primitive object
        const rawProps = primitive.props ?? (() => {
          const { type, sync_with, ...rest } = primitive;
          return rest;
        })();
        const normalized = normalizeProps(pType, rawProps);
        let props = resolveProps(normalized, language, storyContent);
        props = applySpeed(props, speedMultiplier);

        const isCurrentStep = idx === currentStep;

        // Wire sync props
        const syncProps = {};
        const syncTypes = ['variable_box', 'VariableBox', 'terminal_output', 'Terminal', 'TerminalOutput'];
        const stepperTypes = ['code_stepper', 'CodeStepper'];
        if (syncTypes.includes(pType) || primitive.sync_with) {
          syncProps.syncStep = syncStep;
        }
        if (stepperTypes.includes(pType)) {
          syncProps.onStep = handleCodeStep;
        }

        return (
          <div key={`${primitive.type}-${idx}`} className="animate-in fade-in">
            <Component
              {...props}
              {...syncProps}
              onComplete={isCurrentStep ? () => handleStepComplete(idx) : undefined}
            />
          </div>
        );
      })}

      {/* Global particle overlay */}
      <ParticleEffect
        effect={particleEffect}
        trigger={particleTrigger}
        active={particleActive}
      />
    </div>
  );
}
