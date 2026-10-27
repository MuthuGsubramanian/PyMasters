import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { PartyPopper, X } from 'lucide-react';
import { usePlayT } from '../games/engine/i18n';
import { HIDE_AFTER_MS, UNLOCK_EVENT, labelForKey } from './unlocks';
import { play as sfx } from './engine/sfx';

/**
 * Mounted once in the app shell: shows "New game unlocked: …" the moment a lesson completion
 * (or the arcade catalog) reports new keys. The bell carries the same notification.
 */
export function UnlockToast() {
  const t = usePlayT();
  const [keys, setKeys] = useState(null);

  useEffect(() => {
    const onUnlock = (e) => {
      const list = Array.isArray(e.detail) ? e.detail : e.detail?.keys;
      if (list && list.length) { setKeys(list); sfx('win'); }
    };
    window.addEventListener(UNLOCK_EVENT, onUnlock);
    return () => window.removeEventListener(UNLOCK_EVENT, onUnlock);
  }, []);

  useEffect(() => {
    if (!keys) return undefined;
    const id = setTimeout(() => setKeys(null), HIDE_AFTER_MS);
    return () => clearTimeout(id);
  }, [keys]);

  if (!keys) return null;
  const labels = keys.map(labelForKey);
  const kinds = new Set(labels.map((l) => l.kind));
  const kindWord = kinds.size === 1 && kinds.has('board') ? t('arcade.toast_board', 'board') : t('arcade.toast_game', 'game');
  return (
    <div data-unlock-toast role="status" aria-live="polite"
      className="fixed left-1/2 -translate-x-1/2 top-4 z-[60] max-w-md w-[calc(100%-2rem)] rounded-2xl border border-accent-primary/50 bg-bg-elevated shadow-xl p-4 flex items-start gap-3">
      <PartyPopper className="text-accent-primary shrink-0" size={22} aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-text-primary">{t('arcade.toast_title', 'New {kind} unlocked', { kind: kindWord })}</p>
        <p className="text-sm text-text-secondary">{labels.map((l) => l.title).join(', ')}</p>
        <Link to="/dashboard/play#arcade" className="text-sm font-medium text-accent-primary underline-offset-2 hover:underline" onClick={() => setKeys(null)}>
          {t('arcade.toast_open', 'Open the Arcade')}
        </Link>
      </div>
      <button type="button" data-dismiss onClick={() => setKeys(null)} aria-label={t('arcade.dismiss', 'Dismiss')} className="min-w-9 min-h-9 rounded-lg text-text-muted hover:text-text-primary flex items-center justify-center">
        <X size={16} />
      </button>
    </div>
  );
}

export default UnlockToast;
