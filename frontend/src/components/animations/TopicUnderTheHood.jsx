import { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { PrimitiveView } from './AnimationRenderer';
import { Rich } from './UnderTheHood';
import { useTranslation } from '../../i18n';

// "How it works": the lesson's authored `under_the_hood` explainer of the topic itself
// ({summary, steps: [{title, body, visual?}], takeaway}; strings may be {en, ta}).
// One step at a time, learner-paced: nothing advances on a timer.

const BTN = 'inline-flex items-center justify-center gap-1.5 min-w-[44px] min-h-[44px] rounded-lg border border-border-default '
  + 'bg-bg-elevated px-3 text-sm font-semibold text-text-primary hover:border-border-strong hover:bg-bg-surface transition-colors '
  + 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus disabled:opacity-40 disabled:cursor-not-allowed';
const LABEL = 'text-xs font-semibold uppercase tracking-wider text-text-secondary';

const EDITABLE = 'input, textarea, select, [contenteditable=""], [contenteditable="true"], .cm-content';

// Learner language, then English, then the first entry.
function pick(v, language) {
  if (v == null) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'object' && !Array.isArray(v)) return String(v[language] ?? v.en ?? Object.values(v)[0] ?? '');
  return String(v);
}

export default function TopicUnderTheHood({ content, language = 'en' }) {
  const { t } = useTranslation(language);
  const steps = (Array.isArray(content?.steps) ? content.steps : []).filter((s) => s && typeof s === 'object');
  const total = steps.length;
  const [rawIndex, setIndex] = useState(0);
  const index = Math.min(rawIndex, Math.max(0, total - 1));
  const step = steps[index];
  const last = index === total - 1;
  const prev = () => setIndex(Math.max(0, index - 1));
  const next = () => setIndex(Math.min(total - 1, index + 1));

  const onKeyDown = (e) => {
    // A step-based visual inside handles its own arrows first.
    if (e.defaultPrevented || (e.target.closest && e.target.closest(EDITABLE))) return;
    if (e.key === 'ArrowRight') { e.preventDefault(); next(); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); prev(); }
  };

  const visual = step?.visual && typeof step.visual === 'object' ? step.visual : null;

  return (
    <section aria-label={t('uth.ui_tab_topic', 'How it works')} className="flex min-w-0 flex-col gap-4 text-text-primary">
      <p data-uth-topic="summary" className="max-w-prose text-base leading-relaxed text-text-primary">
        <Rich text={pick(content?.summary, language)} />
      </p>
      {total > 0 && (
        <div
          data-uth-topic="stepper"
          role="group"
          aria-label={t('uth.ui_tab_steps', 'Steps')}
          tabIndex={0}
          onKeyDown={onKeyDown}
          className="flex min-w-0 flex-col gap-3 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
        >
          <article className="flex min-w-0 flex-col gap-3 rounded-xl border border-border-default bg-bg-elevated p-3 sm:p-4">
            <div aria-live="polite" aria-atomic="true">
              <p data-uth-topic="counter" className={LABEL}>
                {t('uth.topic_step', 'Step {n} of {total}').replace('{n}', index + 1).replace('{total}', total)}
              </p>
              <h4 data-uth-topic="title" className="mt-1 text-base font-semibold leading-snug text-text-primary">
                {pick(step.title, language)}
              </h4>
            </div>
            <p data-uth-topic="body" className="max-w-prose text-sm leading-relaxed text-text-primary">
              <Rich text={pick(step.body, language)} />
            </p>
            {visual && (
              <div data-uth-topic="visual" className="min-w-0 max-w-full overflow-x-auto">
                <PrimitiveView key={index} type={visual.type} props={visual.props} language={language} />
              </div>
            )}
          </article>
          {last && (
            <div data-uth-topic="takeaway" className="rounded-xl border border-border-strong bg-bg-surface p-3 sm:p-4">
              <p className={LABEL}>{t('uth.topic_takeaway', 'Takeaway')}</p>
              <p className="mt-1 max-w-prose text-sm font-medium leading-relaxed text-text-primary">
                <Rich text={pick(content?.takeaway, language)} />
              </p>
            </div>
          )}
          <div className="flex items-center justify-between gap-2">
            <button type="button" className={BTN} onClick={prev} disabled={index === 0}>
              <ChevronLeft size={18} aria-hidden="true" />
              {t('uth.topic_back', 'Back')}
            </button>
            <button type="button" className={BTN} onClick={next} disabled={last}>
              {t('uth.topic_next', 'Next')}
              <ChevronRight size={18} aria-hidden="true" />
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
