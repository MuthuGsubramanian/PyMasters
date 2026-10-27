// Keyboard-shortcut hygiene shared by the games: never steal keys from a modal
// dialog (release notes, support, confirmations) or from a text field.
export function modalOpen() {
  return typeof document !== 'undefined' && !!document.querySelector('[aria-modal="true"]');
}

export function shortcutsBlocked(e) {
  if (modalOpen()) return true;
  const tag = e?.target?.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || !!e?.target?.isContentEditable;
}
