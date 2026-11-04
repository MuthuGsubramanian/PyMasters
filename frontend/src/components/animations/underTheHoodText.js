// Plain-language sentences for the "Under the hood" heap-trace events.
// Texts live in the i18n dictionaries as uth.<kind>; the English below is the
// inline fallback. Code identifiers are wrapped in backticks and never translated.

export const PRIORITY = [
  'exception', 'alias', 'mutate', 'rebind', 'new_object', 'call', 'return', 'bind', 'unbind',
];

const EN = {
  new_object: 'Python creates a new {type} object in memory.',
  bind: '`{name}` now points to the object. Names are labels, not boxes.',
  bind_anon: 'A name now points to the object. Names are labels, not boxes.',
  rebind: '`{name}` now points to a different object; the old one is untouched.',
  rebind_anon: 'A name now points to a different object; the old one is untouched.',
  alias: '`{name}` and `{other}` now point to the same {type} object. Nothing was copied.',
  alias_anon: '`{name}` and another name now point to the same {type} object. Nothing was copied.',
  mutate: 'The {type} itself changed (same object, new contents). Every name pointing to it sees the change.',
  call: 'Python calls `{func}`. A new frame holds its local names.',
  return: '`{func}` finishes and hands control back to its caller.',
  unbind: '`{name}` is gone. The name no longer points to anything.',
  unbind_anon: 'A name is gone. It no longer points to anything.',
  exception: 'An error, `{name}`, happens here, so this line cannot finish normally.',
  line: 'Python runs line {line}.',
};

function fill(template, params) {
  return template.replace(/\{(\w+)\}/g, (m, k) => (params[k] != null ? String(params[k]) : m));
}

export function explainEvent(event, t) {
  const kind = event && event.kind;
  if (!kind || !EN[kind]) return '';
  const type = event.type ? `\`${event.type}\`` : '`object`';
  const anon = kind === 'alias' ? !event.other : ['bind', 'rebind', 'unbind'].includes(kind) && !event.name;
  const key = anon ? `${kind}_anon` : kind;
  return fill(t(`uth.${key}`, EN[key]), {
    name: event.name ?? '',
    other: event.other ?? '',
    func: event.func ?? '',
    type,
  });
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
      headline: fill(t('uth.line', EN.line), { line: step ? step.line : '' }),
      details: [],
    };
  }
  return {
    headline: explainEvent(top, t),
    details: events.filter((e) => e !== top).map((e) => explainEvent(e, t)).filter(Boolean),
  };
}
