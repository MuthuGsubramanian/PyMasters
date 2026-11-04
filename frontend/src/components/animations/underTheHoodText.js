// Plain-language sentences for the "Under the hood" heap-trace events.
// Texts live in the i18n dictionaries as uth.<kind>; the English below is the
// inline fallback. Code identifiers are wrapped in backticks and never translated.
// A backticked placeholder whose value is missing is replaced (backticks included)
// by a neutral localized word (uth.w_*), so we never show empty backticks.

export const PRIORITY = [
  'exception', 'alias', 'mutate', 'rebind', 'new_object', 'call', 'return', 'bind', 'unbind',
];

const EN = {
  new_object: 'Python creates a new {type} object in memory.',
  bind: '`{name}` now points to the object. Names are labels, not boxes.',
  rebind: '`{name}` now points to a different object; the old one is untouched.',
  alias: '`{name}` and `{other}` now point to the same {type} object. Nothing was copied.',
  mutate: 'The {type} itself changed (same object, new contents). Every name pointing to it sees the change.',
  call: 'Python calls `{func}`. A new frame holds its local names.',
  return: '`{func}` finishes and hands control back to its caller.',
  unbind: '`{name}` is gone. The name no longer points to anything.',
  exception: 'An error, `{name}`, happens here, so this line cannot finish normally.',
  exception_anon: 'An error happens here, so this line cannot finish normally.',
  line: 'Python runs line {line}.',
  w_name: 'a name',
  w_name_acc: 'a name',
  w_other: 'a name',
  w_other_acc: 'a name',
  w_func: 'a function',
  w_func_acc: 'a function',
};

// `{x}` with an optional Tamil accusative suffix "-ஐ" glued on.
const TICKED = /`\{(\w+)\}`(-ஐ)?/g;

function fill(template, params, t) {
  const out = template
    .replace(TICKED, (m, k, suffix) => {
      const v = params[k];
      if (v != null && v !== '') return `\`${v}\`${suffix || ''}`;
      const key = `w_${k}${suffix ? '_acc' : ''}`;
      return t(`uth.${key}`, EN[key] || EN.w_name);
    })
    .replace(/\{(\w+)\}/g, (m, k) => (params[k] != null && params[k] !== '' ? String(params[k]) : m));
  return out.charAt(0).toUpperCase() + out.slice(1);
}

export function explainEvent(event, t) {
  const kind = event && event.kind;
  if (!kind || !EN[kind]) return '';
  let { name, other } = event;
  if (kind === 'alias' && !name && other) [name, other] = [other, undefined];
  const key = kind === 'exception' && !name ? 'exception_anon' : kind;
  return fill(t(`uth.${key}`, EN[key]), {
    name,
    other,
    func: event.func,
    type: event.type ? `\`${event.type}\`` : '`object`',
  }, t);
}

export function headline(events) {
  if (!events || !events.length) return null;
  let best = null;
  let bestRank = Infinity;
  for (const ev of events) {
    const rank = PRIORITY.indexOf(ev.kind);
    if (rank !== -1 && rank < bestRank) {
      best = ev;
      bestRank = rank;
    }
  }
  return best;
}

// Add the object type (looked up from the step's objects) so sentences can say "list".
function withType(ev, step) {
  if (ev.type || !ev.ref) return ev;
  const obj = step.objects && step.objects[ev.ref];
  return obj && obj.type ? { ...ev, type: obj.type } : ev;
}

export function explainStep(step, t) {
  const events = ((step && step.events) || []).map((e) => withType(e, step));
  const top = headline(events);
  if (!top) {
    return {
      headline: fill(t('uth.line', EN.line), { line: step ? step.line : '' }, t),
      details: [],
    };
  }
  return {
    headline: explainEvent(top, t),
    details: events.filter((e) => e !== top).map((e) => explainEvent(e, t)).filter(Boolean),
  };
}
