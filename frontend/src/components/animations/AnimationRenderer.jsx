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

// Maps primitive type strings to components
const PRIMITIVE_MAP = {
  story_card: StoryCard,
  code_stepper: CodeStepper,
  variable_box: VariableBox,
  terminal_output: TerminalOutput,
  particle_effect: ParticleEffect,
  flow_arrow: FlowArrow,
  data_structure: DataStructure,
  memory_stack: MemoryStack,
  comparison_panel: ComparisonPanel,
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
  const particlePrimitive = sequence.find((s) => s.type === 'particle_effect');
  const particleEffect = particlePrimitive?.props?.effect ?? 'success_confetti';

  return (
    <div className="relative flex flex-col gap-6">
      {visiblePrimitives.map((primitive, idx) => {
        if (primitive.type === 'particle_effect') {
          // Handled separately below
          return null;
        }

        const Component = PRIMITIVE_MAP[primitive.type];
        if (!Component) {
          console.warn(`[AnimationRenderer] Unknown primitive type: "${primitive.type}"`);
          return null;
        }

        let props = resolveProps(primitive.props ?? {}, language, storyContent);
        props = applySpeed(props, speedMultiplier);

        const isCurrentStep = idx === currentStep;

        // Wire sync props
        const syncProps = {};
        if (primitive.type === 'variable_box' || primitive.type === 'terminal_output') {
          syncProps.syncStep = syncStep;
        }
        if (primitive.type === 'code_stepper') {
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
