/**
 * LIFO back-handler stack bridged to `window.__pymastersHandleBack()` so the
 * Android native shell (`MainActivity.kt` `OnBackPressedCallback`) can close
 * open drawers, chat popovers, voice modals, or step back from an active lesson
 * before popping browser history or exiting the app.
 */

const handlers = [];

function ensureGlobalBridge() {
  if (typeof window === 'undefined') return;
  if (!window.__pymastersHandleBack) {
    window.__pymastersHandleBack = () => {
      for (let i = handlers.length - 1; i >= 0; i -= 1) {
        try {
          if (handlers[i]()) return true;
        } catch {
          // Ignore individual handler failures so back navigation never deadlocks.
        }
      }
      return false;
    };
  }
}

ensureGlobalBridge();

export function registerAndroidBackHandler(handler) {
  if (typeof window === 'undefined' || typeof handler !== 'function') {
    return () => {};
  }
  ensureGlobalBridge();
  handlers.push(handler);
  return () => {
    const idx = handlers.lastIndexOf(handler);
    if (idx !== -1) handlers.splice(idx, 1);
  };
}
