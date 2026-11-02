// Return-to-after-login: a signed-out visitor opening a shared deep link (e.g. a lesson URL from a
// LinkedIn post) is sent to /login?next=<path>; after signing in they land back on that path.
// `next` comes from the URL, so anyone can craft it — safeNextPath() decides what we are willing to follow.
const KEY = 'pm_return_to';

/**
 * Return `raw` if it is safe to navigate to after login, otherwise null.
 * `raw` is untrusted text from the query string (already URL-decoded by URLSearchParams).
 *
 * This is the open-redirect guard: a link like
 *   https://pymasters.net/login?next=https://evil.example/fake-login
 * must never send a freshly signed-in learner to another site. Two layers: a strict shape check (one leading
 * "/", not "//" or "/\", no whitespace or control characters), then the browser's own URL parser must agree
 * the result stays on our origin — so encodings we did not think of are judged the way navigation will be.
 */
export function safeNextPath(raw) {
    if (typeof raw !== 'string' || !/^\/(?![/\\])[^\s\x00-\x1f]*$/.test(raw)) return null;
    let url;
    try { url = new URL(raw, window.location.origin); } catch { return null; }
    if (url.origin !== window.location.origin) return null;
    if (url.pathname === '/login' || url.pathname.startsWith('/login/')) return null;   // no loop back to sign-in
    return url.pathname + url.search + url.hash;
}

/** Remember the target across the OAuth round trip (GitHub/LinkedIn leave and re-enter /login). */
export function rememberReturnTo(raw) {
    const path = safeNextPath(raw);
    try {
        if (path) sessionStorage.setItem(KEY, path);
    } catch { /* private mode */ }
}

/** Read and clear the remembered target; `fallback` when there is none. */
export function takeReturnTo(fallback) {
    try {
        const path = safeNextPath(sessionStorage.getItem(KEY));
        sessionStorage.removeItem(KEY);
        return path || fallback;
    } catch {
        return fallback;
    }
}
