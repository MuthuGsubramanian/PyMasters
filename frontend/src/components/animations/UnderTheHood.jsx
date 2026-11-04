import { useId, useLayoutEffect, useRef, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { PlayableVisual } from './VisualControls';
import { explainStep } from './underTheHoodText';
import { useTranslation } from '../../i18n';
import useMediaQuery from '../../hooks/useMediaQuery';
import useReducedMotion from '../../hooks/useReducedMotion';
import { explainError } from '../../utils/errorExplainer';

// "Under the hood": steps through a heap trace (backend tracer, mode="heap") and shows
// the code with the current line, the names in every frame (innermost on top) and the
// objects they point to, plus a plain-language sentence for what just happened.
// Desktop: arrows from names to object boxes. Phones (< 640 px): names above objects,
// each name carries a ref chip (`o3`) matching the object box's chip.

const CHIP = 'inline-flex items-center rounded-md border border-border-default bg-bg-inset px-1.5 py-0.5 font-mono text-xs text-text-secondary';
const PANEL = 'rounded-xl border border-border-default bg-bg-elevated p-3';
const LABEL = 'text-xs font-semibold uppercase tracking-wider text-text-secondary';
const REF_RE = /^o\d+$/;

function fmt(s, params) {
  return String(s).replace(/\{(\w+)\}/g, (m, k) => (params[k] != null ? String(params[k]) : m));
}

// Sentences mark code identifiers with backticks: show them as <code>.
function Rich({ text }) {
  const parts = String(text || '').split('`');
  return parts.map((p, i) => (i % 2
    ? <code key={i} className="rounded bg-bg-inset px-1 font-mono text-[0.95em]">{p}</code>
    : <span key={i}>{p}</span>));
}

function RefChip({ id }) {
  return <span data-uth-chip="" className={CHIP}>{id}</span>;
}

// `line` is the line Python runs next; `ranLine` is the line that just ran, which is what the
// step's explanation describes (the tracer reports each line before running it).
function CodePanel({ code, line, ranLine, t, reducedMotion }) {
  const lines = String(code || '').replace(/\n$/, '').split('\n');
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <p className={LABEL}>{t('uth.ui_code', 'Code')}</p>
      <div data-uth="code" className="min-w-0 overflow-x-auto rounded-xl border border-border-default bg-bg-code py-2 font-mono text-sm text-code-foreground">
        <div className="min-w-max">
          {lines.map((src, i) => {
            const active = i + 1 === line;
            const ran = !active && i + 1 === ranLine;
            return (
              <div
                key={i}
                aria-current={active ? 'step' : undefined}
                data-uth-ran={ran ? '' : undefined}
                className={`flex border-l-2 pr-3 ${reducedMotion ? '' : 'transition-colors duration-200'} ${
                  active ? 'border-cyan-400 bg-cyan-400/15' : ran ? 'border-amber-400 bg-amber-400/10' : 'border-transparent'}`}
              >
                <span className={`w-9 shrink-0 select-none pr-3 text-right text-xs leading-6 tabular-nums ${
                  active ? 'font-semibold text-cyan-300' : ran ? 'font-semibold text-amber-300' : 'text-code-foreground/70'}`}
                >
                  {i + 1}
                </span>
                <span className="whitespace-pre leading-6">{src || ' '}</span>
                {ran && (
                  <span className="ml-3 shrink-0 self-center rounded bg-amber-400/15 px-1.5 font-sans text-xs font-semibold leading-5 text-amber-300">
                    {t('uth.ui_just_ran', 'just ran')}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// Objects in the order a learner meets them: names of the innermost frame first,
// then objects held inside containers, then anything else.
function orderObjects(step, framesTopDown) {
  const objects = step.objects || {};
  const seen = [];
  const add = (r) => { if (objects[r] && !seen.includes(r)) seen.push(r); };
  for (const f of framesTopDown) Object.values(f.names || {}).forEach(add);
  for (let i = 0; i < seen.length; i++) {
    for (const it of objects[seen[i]].items || []) {
      (Array.isArray(it) ? it : [it]).forEach((v) => { if (typeof v === 'string' && REF_RE.test(v)) add(v); });
    }
  }
  Object.keys(objects).forEach(add);
  return seen;
}

function changedSets(step) {
  const objs = new Set();
  const names = new Set();
  for (const ev of step.events || []) {
    if ((ev.kind === 'mutate' || ev.kind === 'new_object') && ev.ref) objs.add(ev.ref);
    if (ev.kind === 'bind' || ev.kind === 'rebind' || ev.kind === 'alias') {
      if (ev.name) names.add(`${ev.func || ''}:${ev.name}`);
    }
  }
  return { objs, names };
}

function ItemValue({ v, objects }) {
  if (typeof v === 'string' && (objects[v] || REF_RE.test(v))) return <RefChip id={v} />;
  return <span className="font-mono">{String(v)}</span>;
}

function ObjectBox({ id, obj, changed, objects, reducedMotion, t }) {
  const items = Array.isArray(obj.items) ? obj.items : null;
  const isPairs = items && items.length > 0 && Array.isArray(items[0]);
  const more = items && typeof obj.len === 'number' && obj.len > items.length ? obj.len - items.length : 0;
  return (
    <div
      data-uth-obj={id}
      data-changed={changed ? 'true' : 'false'}
      className={`min-w-0 rounded-lg border bg-bg-surface p-2 ${reducedMotion ? '' : 'transition-shadow duration-500'} ${
        changed
          ? 'border-amber-600 ring-2 ring-amber-600 dark:border-amber-400 dark:ring-amber-400/70'
          : 'border-border-default'}`}
    >
      <div className="mb-1 flex flex-wrap items-center gap-1.5">
        <RefChip id={id} />
        <span className="rounded-md bg-accent-subtle px-1.5 py-0.5 font-mono text-xs font-semibold text-text-primary">
          {obj.type}
        </span>
      </div>
      {items ? (
        <div className="flex flex-wrap gap-1 text-sm text-text-primary">
          {items.length === 0 && <span className="font-mono">{obj.repr}</span>}
          {items.map((it, i) => (isPairs && Array.isArray(it) ? (
            <span key={i} data-uth-item="" className="inline-flex min-w-0 items-center gap-1 break-all rounded border border-border-default px-1.5 py-0.5">
              <ItemValue v={it[0]} objects={objects} />
              <span aria-hidden="true" className="text-text-secondary">:</span>
              <ItemValue v={it[1]} objects={objects} />
            </span>
          ) : (
            <span key={i} data-uth-item="" className="inline-flex min-w-0 break-all rounded border border-border-default px-1.5 py-0.5">
              <ItemValue v={it} objects={objects} />
            </span>
          )))}
          {more > 0 && <span className="px-1 text-xs text-text-secondary">{fmt(t('uth.ui_more_objects', '+{n} more'), { n: more })}</span>}
        </div>
      ) : (
        <code className="block break-all font-mono text-sm text-text-primary">{obj.repr}</code>
      )}
    </div>
  );
}

function FrameList({ frames, step, changedNames, phone, t }) {
  const anyNames = frames.some((f) => Object.keys(f.names || {}).length > 0);
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <p className={LABEL}>{t('uth.ui_names', 'Names')}</p>
      {!anyNames && frames.length <= 1 ? (
        <p className="text-sm text-text-secondary">{t('uth.ui_no_names', 'No names yet')}</p>
      ) : frames.map((f, fi) => {
        if (f.hidden) {
          return (
            <p key={`h${fi}`} className="px-1 text-xs italic text-text-secondary">
              {fmt(t('uth.ui_hidden_frames', '{n} more frames hidden'), { n: f.hidden })}
            </p>
          );
        }
        const names = Object.entries(f.names || {});
        const current = fi === 0;
        return (
          <div
            key={`${f.func}${f.depth}`}
            data-uth-frame={f.func}
            className={`rounded-lg border p-2 ${current ? 'border-accent-primary' : 'border-border-default'} bg-bg-surface`}
          >
            <p className="mb-1 text-xs font-semibold text-text-secondary">
              {f.func === '<module>' ? t('uth.ui_global', 'Main program') : <code className="font-mono text-text-primary">{`${f.func}()`}</code>}
            </p>
            {names.length === 0 ? (
              <p className="text-sm text-text-secondary">{t('uth.ui_no_names', 'No names yet')}</p>
            ) : (
              <ul className="flex flex-col gap-1">
                {names.map(([name, ref]) => {
                  const hot = changedNames.has(`${f.func}:${name}`) && f.depth === (step.depth ?? f.depth);
                  return (
                    <li
                      key={name}
                      data-uth-name={name}
                      data-ref={ref}
                      className={`flex min-h-[28px] items-center justify-between gap-2 rounded-md px-1.5 ${hot ? 'bg-amber-400/15' : ''}`}
                    >
                      <span className="sr-only">{fmt(t('uth.ui_points_to', '{name} points to {ref}'), { name, ref })}</span>
                      <code aria-hidden="true" className="min-w-0 break-all font-mono text-sm font-semibold text-text-primary">{name}</code>
                      {phone
                        ? <RefChip id={ref} />
                        : <span data-uth-anchor="" aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full bg-text-secondary" />}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        );
      })}
    </div>
  );
}

// Arrows from each name's anchor dot to its object box, measured after layout.
function useArrows(boxRef, deps) {
  const [paths, setPaths] = useState([]);
  useLayoutEffect(() => {
    const box = boxRef.current;
    if (!box) return undefined;
    const measure = () => {
      const c = box.getBoundingClientRect();
      const next = [];
      box.querySelectorAll('[data-uth-name]').forEach((row) => {
        const ref = row.getAttribute('data-ref') || '';
        if (!REF_RE.test(ref)) return; // refs are o1, o2, ...; anything else is not a safe selector
        const anchor = row.querySelector('[data-uth-anchor]');
        const target = box.querySelector(`[data-uth-obj="${ref}"]`);
        if (!anchor || !target) return;
        const a = anchor.getBoundingClientRect();
        const b = target.getBoundingClientRect();
        if (!a.width && !b.width) return;
        const x1 = a.right - c.left + 2;
        const y1 = a.top + a.height / 2 - c.top;
        const x2 = b.left - c.left - 2;
        const y2 = b.top + Math.min(18, b.height / 2) - c.top;
        const dx = Math.max(24, (x2 - x1) / 2);
        next.push(`M${x1},${y1} C${x1 + dx},${y1} ${x2 - dx},${y2} ${x2},${y2}`);
      });
      setPaths((prev) => (prev.join('|') === next.join('|') ? prev : next));
    };
    measure();
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', measure);
      return () => window.removeEventListener('resize', measure);
    }
    const ro = new ResizeObserver(measure);
    ro.observe(box);
    return () => ro.disconnect();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return paths;
}

function Memory({ step, phone, reducedMotion, t }) {
  const boxRef = useRef(null);
  const markerId = `uth-arrow-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const framesTopDown = [...(step.frames || [])].reverse();
  const objects = step.objects || {};
  const order = orderObjects(step, framesTopDown);
  const { objs: changedObjs, names: changedNames } = changedSets(step);
  const paths = useArrows(boxRef, [step, phone]);

  const objectsCol = (
    <div className="flex min-w-0 flex-col gap-2">
      <p className={LABEL}>{t('uth.ui_objects', 'Objects')}</p>
      {order.length === 0 && <p className="text-sm text-text-secondary">{t('uth.ui_no_objects', 'No objects yet')}</p>}
      {order.map((id) => (
        <ObjectBox key={id} id={id} obj={objects[id]} objects={objects} changed={changedObjs.has(id)} reducedMotion={reducedMotion} t={t} />
      ))}
      {step.more_objects > 0 && (
        <p className="text-xs text-text-secondary">{fmt(t('uth.ui_more_objects', '+{n} more'), { n: step.more_objects })}</p>
      )}
    </div>
  );
  const namesCol = <FrameList frames={framesTopDown} step={step} changedNames={changedNames} phone={phone} t={t} />;

  if (phone) {
    return <div className={`${PANEL} flex min-w-0 flex-col gap-4`}>{namesCol}{objectsCol}</div>;
  }
  return (
    <div ref={boxRef} className={`${PANEL} relative grid min-w-0 grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] gap-x-12`}>
      {namesCol}
      {objectsCol}
      <svg data-uth="arrows" aria-hidden="true" className="pointer-events-none absolute inset-0 h-full w-full overflow-visible text-text-secondary">
        <defs>
          <marker id={markerId} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10 z" fill="currentColor" />
          </marker>
        </defs>
        {paths.map((d, i) => (
          <path key={i} d={d} fill="none" stroke="currentColor" strokeWidth="1.5" markerEnd={`url(#${markerId})`} />
        ))}
      </svg>
    </div>
  );
}

function ErrorBanner({ error, t, language }) {
  const stepLimit = error.type === 'StepLimit';
  const raw = `${error.type || 'Error'}: ${error.message || ''}`;
  // The what/fix hint is English-only; other locales keep the localized title.
  const english = !language || language === 'en';
  const ex = stepLimit || !english ? null : explainError(raw);
  const helpful = ex && ex.title !== ex.type;
  return (
    <div role="alert" className="flex gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2.5 text-sm text-text-primary">
      <AlertTriangle size={18} aria-hidden="true" className="mt-0.5 shrink-0 text-amber-600 dark:text-amber-300" />
      <div className="min-w-0">
        {stepLimit ? (
          <p className="font-semibold">{t('uth.ui_step_limit', 'This program takes many steps, so only the first part is shown.')}</p>
        ) : (
          <>
            <p className="font-semibold">
              {t('uth.ui_error', 'Python stopped with an error')}
              {error.line ? ` (${fmt(t('uth.ui_on_line', 'line {line}'), { line: error.line })})` : ''}
            </p>
            <p className="mt-0.5 break-words font-mono">{raw}</p>
            {helpful && <p data-uth="error-hint" className="mt-1 text-text-secondary">{ex.what} {ex.fix}</p>}
          </>
        )}
      </div>
    </div>
  );
}

function StepView({ step, prev, code, stdout, phone, reducedMotion, t }) {
  const { headline, details } = explainStep(step, t);
  const output = stdout ? stdout.slice(0, Math.max(0, step.out || 0)) : '';
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div className="grid min-w-0 gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
        <CodePanel code={code} line={step.line} ranLine={prev ? prev.line : null} t={t} reducedMotion={reducedMotion} />
        <Memory step={step} phone={phone} reducedMotion={reducedMotion} t={t} />
      </div>
      <div className={PANEL}>
        <p data-uth="headline" aria-live="polite" className="text-sm font-semibold leading-relaxed text-text-primary">
          <Rich text={headline} />
        </p>
        {details.length > 0 && (
          <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm leading-relaxed text-text-secondary">
            {details.map((d, i) => <li key={i}><Rich text={d} /></li>)}
          </ul>
        )}
      </div>
      {stdout ? (
        <div className={PANEL}>
          <p className={LABEL}>{t('uth.ui_output', 'Output')}</p>
          <pre data-uth="output" className="mt-1 max-h-32 overflow-auto whitespace-pre-wrap break-words font-mono text-sm text-text-primary">{output}</pre>
        </div>
      ) : null}
    </div>
  );
}

export default function UnderTheHood({ code, trace, language = 'en' }) {
  const { t } = useTranslation(language);
  const phone = useMediaQuery('(max-width: 639px)');
  const reducedMotion = useReducedMotion();
  const steps = (trace && Array.isArray(trace.steps) ? trace.steps : []).filter(Boolean);
  const error = trace && trace.error;

  return (
    <section aria-label={t('uth.ui_title', 'Under the hood')} className="flex min-w-0 flex-col gap-3 text-text-primary">
      {error ? <ErrorBanner error={error} t={t} language={language} /> : null}
      {steps.length > 0 ? (
        <PlayableVisual total={steps.length}>
          {(i) => (
            <StepView
              step={steps[Math.min(i, steps.length - 1)]}
              prev={i > 0 ? steps[Math.min(i, steps.length - 1) - 1] : null}
              code={code}
              stdout={trace.stdout || ''}
              phone={phone}
              reducedMotion={reducedMotion}
              t={t}
            />
          )}
        </PlayableVisual>
      ) : !error ? (
        <p className="text-sm text-text-secondary">{t('uth.ui_no_steps', 'Nothing to show yet.')}</p>
      ) : null}
    </section>
  );
}
