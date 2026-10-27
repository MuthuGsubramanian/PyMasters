// Unlock helpers shared by the toast, the Play page and tests (no components here: fast refresh).
import { ARCADE_TITLES, BOARD_TITLES } from './index';

export const UNLOCK_EVENT = 'pm:arcade-unlocked';
export const HIDE_AFTER_MS = 6000;

export function labelForKey(key) {
  const [kind, id] = String(key).split(':');
  if (kind === 'game') return { kind: 'game', title: ARCADE_TITLES[id] || id };
  return { kind: 'board', title: BOARD_TITLES[id] || id };
}

