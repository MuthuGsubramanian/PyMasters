import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, BookOpen, CheckCircle2, MessageCircleQuestion, XCircle } from 'lucide-react';
import { Button } from '../../components/ui';

function formatAnswer(item, answer) {
  if (answer === null || answer === undefined) return '—';
  if (item?.kind === 'choice' && Array.isArray(item.choices) && typeof answer === 'number') return item.choices[answer];
  if (item?.kind === 'line_then_choice' && Array.isArray(answer)) {
    const [line, choice] = answer;
    return `line ${Number(line) + 1} → ${item.choices?.[choice] ?? choice}`;
  }
  return String(answer);
}

/**
 * Shown after each answer: right/wrong, the correct answer, the one-line why, and
 * two ways forward (open the lesson, ask Vaathiyaar). Enter/Space advance.
 *
 * `verdict` is the client-side guess shown immediately; the server's reveal
 * (correct answer + why) arrives with the round result, so when `revealItem` is
 * missing we show only what the learner answered.
 */
export function Reveal({ item, revealItem, learnerResponse, gameTitle, onNext }) {
  const correct = revealItem?.correct;
  const yourAnswer = formatAnswer(item, learnerResponse);
  const rightAnswer = revealItem ? formatAnswer(item, revealItem.answer) : null;

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onNext?.(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onNext]);

  const ask = () => {
    const code = item?.prompt?.code || item?.prompt?.text || '';
    const message = `In Play (${gameTitle}) I answered "${yourAnswer}" to this:\n\n${code}\n\n` +
      (rightAnswer ? `The right answer was "${rightAnswer}". Why?` : 'Was I right? Explain the idea behind it.');
    window.dispatchEvent(new CustomEvent('pm:vaathiyaar-ask', { detail: { message } }));
  };

  return (
    <section aria-live="polite" className="rounded-2xl border border-border-default bg-bg-elevated p-4 sm:p-5 flex flex-col gap-3">
      <div className="flex items-center gap-2">
        {correct === true && <CheckCircle2 className="text-emerald-600 dark:text-emerald-300" size={22} aria-hidden="true" />}
        {correct === false && <XCircle className="text-red-600 dark:text-red-300" size={22} aria-hidden="true" />}
        <p className="font-semibold text-text-primary">
          {correct === true ? 'Correct' : correct === false ? 'Not quite' : 'Answer recorded'}
        </p>
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
        <dt className="text-text-muted">You said</dt>
        <dd className="font-mono text-text-primary whitespace-pre-wrap break-words">{yourAnswer}</dd>
        {rightAnswer !== null && correct === false && (
          <>
            <dt className="text-text-muted">Answer</dt>
            <dd className="font-mono text-text-primary whitespace-pre-wrap break-words">{rightAnswer}</dd>
          </>
        )}
      </dl>
      {revealItem?.why && <p className="text-sm text-text-secondary leading-relaxed">{revealItem.why}</p>}
      <div className="flex flex-wrap items-center gap-2 pt-1">
        {revealItem?.lesson_id && (
          <Button as={Link} to={`/dashboard/classroom/${revealItem.lesson_id}`} variant="outline" size="sm" className="min-h-11">
            <BookOpen size={14} /> Open lesson
          </Button>
        )}
        <Button variant="outline" size="sm" onClick={ask} className="min-h-11">
          <MessageCircleQuestion size={14} /> Ask Vaathiyaar
        </Button>
        <Button onClick={onNext} size="sm" className="ml-auto min-h-11" autoFocus>
          Next <ArrowRight size={14} />
        </Button>
      </div>
    </section>
  );
}

export default Reveal;
