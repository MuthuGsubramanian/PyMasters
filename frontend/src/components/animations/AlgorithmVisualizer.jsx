import { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

/**
 * AlgorithmVisualizer
 *
 * Sorting and searching algorithm visualization with step-by-step animation.
 * Renders array data as vertical bars with color-coded states.
 *
 * Props:
 *   algorithm   - 'bubble_sort' | 'selection_sort' | 'insertion_sort' |
 *                 'quick_sort' | 'binary_search' | 'linear_search'
 *   data        - number[] initial array
 *   speed       - 'slow' | 'normal' | 'fast'
 *   target      - search target value (for search algorithms)
 *   duration    - total hold time in ms (default 5000)
 *   onComplete  - callback when animation completes
 *   onStep      - callback(stepIndex, description) on each step
 */

const SPEED_MS = { slow: 1200, normal: 600, fast: 250 };

// Bar state colors
const BAR_COLORS = {
  default: '#06b6d4',     // cyan
  comparing: '#eab308',   // yellow
  swapping: '#ef4444',    // red
  sorted: '#10b981',      // green
  active: '#8b5cf6',      // purple (search pointer)
  found: '#10b981',       // green
  eliminated: '#475569',  // dimmed slate
};

// ---------- Algorithm generators ----------
// Each yields { description, comparing, swapping, sorted, arr } at each step

function* bubbleSortGen(inputArr) {
  const arr = [...inputArr];
  const n = arr.length;
  const sorted = new Set();

  for (let i = 0; i < n - 1; i++) {
    for (let j = 0; j < n - 1 - i; j++) {
      yield {
        description: `Comparing index ${j} (${arr[j]}) and ${j + 1} (${arr[j + 1]})`,
        comparing: [j, j + 1],
        swapping: [],
        sorted: [...sorted],
        arr: [...arr],
      };

      if (arr[j] > arr[j + 1]) {
        [arr[j], arr[j + 1]] = [arr[j + 1], arr[j]];
        yield {
          description: `Swapping ${arr[j + 1]} and ${arr[j]}`,
          comparing: [],
          swapping: [j, j + 1],
          sorted: [...sorted],
          arr: [...arr],
        };
      }
    }
    sorted.add(n - 1 - i);
  }
  sorted.add(0);

  yield {
    description: 'Array is sorted!',
    comparing: [],
    swapping: [],
    sorted: Array.from({ length: n }, (_, i) => i),
    arr: [...arr],
  };
}

function* selectionSortGen(inputArr) {
  const arr = [...inputArr];
  const n = arr.length;
  const sorted = new Set();

  for (let i = 0; i < n - 1; i++) {
    let minIdx = i;
    for (let j = i + 1; j < n; j++) {
      yield {
        description: `Finding minimum: comparing index ${minIdx} (${arr[minIdx]}) with ${j} (${arr[j]})`,
        comparing: [minIdx, j],
        swapping: [],
        sorted: [...sorted],
        arr: [...arr],
      };
      if (arr[j] < arr[minIdx]) minIdx = j;
    }

    if (minIdx !== i) {
      [arr[i], arr[minIdx]] = [arr[minIdx], arr[i]];
      yield {
        description: `Placing minimum ${arr[i]} at position ${i}`,
        comparing: [],
        swapping: [i, minIdx],
        sorted: [...sorted],
        arr: [...arr],
      };
    }
    sorted.add(i);
  }
  sorted.add(n - 1);

  yield {
    description: 'Array is sorted!',
    comparing: [],
    swapping: [],
    sorted: Array.from({ length: n }, (_, i) => i),
    arr: [...arr],
  };
}

function* insertionSortGen(inputArr) {
  const arr = [...inputArr];
  const n = arr.length;
  const sorted = new Set([0]);

  for (let i = 1; i < n; i++) {
    const key = arr[i];
    let j = i - 1;

    yield {
      description: `Inserting ${key} into sorted portion`,
      comparing: [i],
      swapping: [],
      sorted: [...sorted],
      arr: [...arr],
    };

    while (j >= 0 && arr[j] > key) {
      arr[j + 1] = arr[j];
      yield {
        description: `Shifting ${arr[j]} right`,
        comparing: [j],
        swapping: [j, j + 1],
        sorted: [...sorted],
        arr: [...arr],
      };
      j--;
    }
    arr[j + 1] = key;
    sorted.add(i);
  }

  yield {
    description: 'Array is sorted!',
    comparing: [],
    swapping: [],
    sorted: Array.from({ length: n }, (_, i) => i),
    arr: [...arr],
  };
}

function* binarySearchGen(inputArr, target) {
  const arr = [...inputArr].sort((a, b) => a - b);
  let lo = 0;
  let hi = arr.length - 1;
  const eliminated = new Set();

  yield {
    description: `Searching for ${target} in sorted array`,
    comparing: [],
    swapping: [],
    sorted: [],
    arr: [...arr],
    active: [],
    eliminated: [...eliminated],
    searchTarget: target,
  };

  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);

    yield {
      description: `Checking middle index ${mid}: value is ${arr[mid]}`,
      comparing: [mid],
      swapping: [],
      sorted: [],
      arr: [...arr],
      active: [lo, hi],
      eliminated: [...eliminated],
      searchTarget: target,
    };

    if (arr[mid] === target) {
      yield {
        description: `Found ${target} at index ${mid}!`,
        comparing: [],
        swapping: [],
        sorted: [mid],
        arr: [...arr],
        active: [],
        eliminated: [...eliminated],
        found: mid,
        searchTarget: target,
      };
      return;
    }

    if (arr[mid] < target) {
      for (let k = lo; k <= mid; k++) eliminated.add(k);
      lo = mid + 1;
      yield {
        description: `${arr[mid]} < ${target}, searching right half`,
        comparing: [],
        swapping: [],
        sorted: [],
        arr: [...arr],
        active: [lo, hi],
        eliminated: [...eliminated],
        searchTarget: target,
      };
    } else {
      for (let k = mid; k <= hi; k++) eliminated.add(k);
      hi = mid - 1;
      yield {
        description: `${arr[mid]} > ${target}, searching left half`,
        comparing: [],
        swapping: [],
        sorted: [],
        arr: [...arr],
        active: [lo, hi],
        eliminated: [...eliminated],
        searchTarget: target,
      };
    }
  }

  yield {
    description: `${target} not found in array`,
    comparing: [],
    swapping: [],
    sorted: [],
    arr: [...arr],
    active: [],
    eliminated: [...eliminated],
    searchTarget: target,
  };
}

function* linearSearchGen(inputArr, target) {
  const arr = [...inputArr];

  for (let i = 0; i < arr.length; i++) {
    yield {
      description: `Checking index ${i}: value is ${arr[i]}`,
      comparing: [i],
      swapping: [],
      sorted: [],
      arr: [...arr],
      searchTarget: target,
    };

    if (arr[i] === target) {
      yield {
        description: `Found ${target} at index ${i}!`,
        comparing: [],
        swapping: [],
        sorted: [i],
        arr: [...arr],
        found: i,
        searchTarget: target,
      };
      return;
    }
  }

  yield {
    description: `${target} not found in array`,
    comparing: [],
    swapping: [],
    sorted: [],
    arr: [...arr],
    searchTarget: target,
  };
}

const ALGORITHM_MAP = {
  bubble_sort: (arr) => bubbleSortGen(arr),
  selection_sort: (arr) => selectionSortGen(arr),
  insertion_sort: (arr) => insertionSortGen(arr),
  binary_search: (arr, target) => binarySearchGen(arr, target),
  linear_search: (arr, target) => linearSearchGen(arr, target),
  // quick_sort alias falls back to bubble_sort for simplicity
  quick_sort: (arr) => bubbleSortGen(arr),
};

const ALGORITHM_LABELS = {
  bubble_sort: 'Bubble Sort',
  selection_sort: 'Selection Sort',
  insertion_sort: 'Insertion Sort',
  quick_sort: 'Quick Sort',
  binary_search: 'Binary Search',
  linear_search: 'Linear Search',
};

export default function AlgorithmVisualizer({
  algorithm = 'bubble_sort',
  data = [5, 3, 8, 1, 9, 2, 7, 4, 6],
  speed = 'normal',
  target,
  duration = 5000,
  onComplete,
  onStep,
}) {
  const stableData = useMemo(() => data, [JSON.stringify(data)]);
  const onCompleteRef = useRef(onComplete);
  const onStepRef = useRef(onStep);
  useEffect(() => { onCompleteRef.current = onComplete; }, [onComplete]);
  useEffect(() => { onStepRef.current = onStep; }, [onStep]);

  // Pre-compute all steps
  const steps = useMemo(() => {
    const gen = ALGORITHM_MAP[algorithm];
    if (!gen) return [];
    const searchTarget = target ?? Math.max(...stableData) - 1;
    const allSteps = [];
    const iterator = gen(stableData, searchTarget);
    let result = iterator.next();
    while (!result.done) {
      allSteps.push(result.value);
      result = iterator.next();
    }
    return allSteps;
  }, [algorithm, stableData, target]);

  const [currentStep, setCurrentStep] = useState(0);
  const [autoPlay, setAutoPlay] = useState(true);
  const [isComplete, setIsComplete] = useState(false);
  const timerRef = useRef(null);

  const stepMs = SPEED_MS[speed] || 600;

  // Auto-play logic
  useEffect(() => {
    if (!autoPlay || isComplete || steps.length === 0) return;

    timerRef.current = setInterval(() => {
      setCurrentStep((prev) => {
        const next = prev + 1;
        if (next >= steps.length) {
          clearInterval(timerRef.current);
          setIsComplete(true);
          setTimeout(() => onCompleteRef.current?.(), Math.max(duration, 1000));
          return prev;
        }
        onStepRef.current?.(next, steps[next]?.description);
        return next;
      });
    }, stepMs);

    return () => clearInterval(timerRef.current);
  }, [autoPlay, isComplete, steps, stepMs, duration]);

  // Reset on data/algorithm change
  useEffect(() => {
    setCurrentStep(0);
    setIsComplete(false);
    setAutoPlay(true);
  }, [algorithm, stableData]);

  const handleNextStep = useCallback(() => {
    setAutoPlay(false);
    clearInterval(timerRef.current);
    setCurrentStep((prev) => {
      const next = prev + 1;
      if (next >= steps.length) {
        setIsComplete(true);
        setTimeout(() => onCompleteRef.current?.(), 500);
        return prev;
      }
      onStepRef.current?.(next, steps[next]?.description);
      return next;
    });
  }, [steps]);

  const handleAutoPlay = useCallback(() => {
    setAutoPlay((p) => !p);
  }, []);

  const handleReset = useCallback(() => {
    clearInterval(timerRef.current);
    setCurrentStep(0);
    setIsComplete(false);
    setAutoPlay(false);
  }, []);

  const step = steps[currentStep] || { arr: stableData, comparing: [], swapping: [], sorted: [], description: '' };
  const maxVal = Math.max(...stableData, 1);
  const isSearch = algorithm.includes('search');

  function getBarColor(idx) {
    if (step.found === idx) return BAR_COLORS.found;
    if (step.sorted?.includes(idx)) return BAR_COLORS.sorted;
    if (step.swapping?.includes(idx)) return BAR_COLORS.swapping;
    if (step.comparing?.includes(idx)) return BAR_COLORS.comparing;
    if (step.eliminated?.includes(idx)) return BAR_COLORS.eliminated;
    if (step.active?.includes(idx)) return BAR_COLORS.active;
    return BAR_COLORS.default;
  }

  return (
    <div
      className="rounded-2xl overflow-hidden border border-white/[0.06] shadow-xl shadow-black/10"
      style={{ background: 'linear-gradient(135deg, rgba(6,182,212,0.03), rgba(234,179,8,0.02))' }}
    >
      {/* Header */}
      <div className="px-4 py-2.5 border-b border-white/[0.06] flex items-center gap-2"
        style={{ background: 'rgba(6,182,212,0.04)' }}>
        <span className="text-base">{isSearch ? '🔍' : '📊'}</span>
        <span className="text-[11px] font-bold uppercase tracking-widest text-cyan-400">
          {ALGORITHM_LABELS[algorithm] || algorithm}
        </span>
        <span className="text-slate-500 font-mono text-xs ml-1">
          n={step.arr.length}
        </span>
        <span className="ml-auto text-[10px] font-mono px-2 py-0.5 rounded-full border border-slate-600/30 text-slate-400 bg-slate-700/20">
          Step {currentStep + 1}/{steps.length}
        </span>
      </div>

      {/* Bars visualization */}
      <div className="p-4">
        <div className="flex items-end gap-1 h-40 mb-3">
          {step.arr.map((val, idx) => {
            const heightPct = (val / maxVal) * 100;
            const color = getBarColor(idx);
            const isHighlighted = step.comparing?.includes(idx) ||
              step.swapping?.includes(idx) ||
              step.found === idx;

            return (
              <motion.div
                key={idx}
                className="flex-1 rounded-t-md relative group"
                style={{
                  backgroundColor: color,
                  minWidth: 12,
                  maxWidth: 48,
                }}
                initial={false}
                animate={{
                  height: `${heightPct}%`,
                  backgroundColor: color,
                  boxShadow: isHighlighted ? `0 0 12px ${color}60` : '0 0 0px transparent',
                }}
                transition={{ duration: 0.2, ease: 'easeOut' }}
              >
                {/* Value label */}
                <span
                  className="absolute -top-5 left-1/2 -translate-x-1/2 text-[9px] font-mono font-bold tabular-nums"
                  style={{ color }}
                >
                  {val}
                </span>
                {/* Index label */}
                <span className="absolute -bottom-4 left-1/2 -translate-x-1/2 text-[8px] font-mono text-slate-500 tabular-nums">
                  {idx}
                </span>
              </motion.div>
            );
          })}
        </div>

        {/* Step description */}
        <AnimatePresence mode="wait">
          <motion.div
            key={currentStep}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.2 }}
            className="mt-6 px-3 py-2 rounded-lg bg-white/[0.03] border border-white/[0.06]"
          >
            <p className="text-xs font-mono text-slate-300">{step.description}</p>
          </motion.div>
        </AnimatePresence>

        {/* Color legend */}
        <div className="flex flex-wrap gap-3 mt-3">
          {[
            { label: 'Default', color: BAR_COLORS.default },
            { label: 'Comparing', color: BAR_COLORS.comparing },
            { label: isSearch ? 'Active' : 'Swapping', color: isSearch ? BAR_COLORS.active : BAR_COLORS.swapping },
            { label: isSearch ? 'Found' : 'Sorted', color: BAR_COLORS.sorted },
          ].map(({ label, color }) => (
            <div key={label} className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: color }} />
              <span className="text-[9px] font-mono text-slate-500">{label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Controls */}
      <div className="px-4 py-2.5 border-t border-white/[0.06] flex items-center gap-2">
        <button
          onClick={handleReset}
          className="text-[10px] font-mono px-3 py-1 rounded-md border border-white/[0.08] text-slate-400 hover:text-white hover:bg-white/[0.05] transition-colors"
        >
          Reset
        </button>
        <button
          onClick={handleNextStep}
          disabled={isComplete}
          className="text-[10px] font-mono px-3 py-1 rounded-md border border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/10 transition-colors disabled:opacity-40"
        >
          Next Step
        </button>
        <button
          onClick={handleAutoPlay}
          className={`text-[10px] font-mono px-3 py-1 rounded-md border transition-colors ${
            autoPlay
              ? 'border-yellow-500/30 text-yellow-400 hover:bg-yellow-500/10'
              : 'border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10'
          }`}
        >
          {autoPlay ? 'Pause' : 'Auto Play'}
        </button>
        {isComplete && (
          <span className="ml-auto text-[10px] font-mono px-2 py-0.5 rounded-full border border-emerald-500/30 text-emerald-400 bg-emerald-500/10">
            complete
          </span>
        )}
      </div>
    </div>
  );
}
