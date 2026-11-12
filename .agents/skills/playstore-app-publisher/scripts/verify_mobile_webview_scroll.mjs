#!/usr/bin/env node
/**
 * Generalized Mobile Touch-Scroll & Anti-Pull-to-Refresh Verification via Eighty Browser CDP (port 9222).
 * Verifies real touch swipe gestures across public and optional authenticated WebView routes:
 *   1. No horizontal overflow (scrollWidth <= innerWidth).
 *   2. Upward finger drag scrolls the active container/document DOWN cleanly (scrollDelta > 0 on tall pages).
 *   3. Downward finger drag scrolls back UP without triggering a page reload or navigation reset.
 *   4. `overscroll-behavior-y` is disabled (`none` or `contain`) on `html`/`body` to prevent WebView refresh traps.
 *
 * Zero external dependencies (requires Node 20+ with built-in fetch & WebSocket).
 *
 * Usage:
 *   node verify_mobile_webview_scroll.mjs \
 *     --origin https://example.com \
 *     --routes "/,/pricing,/guides" \
 *     --auth-routes "/dashboard,/dashboard/classroom,/dashboard/playground" \
 *     --login-path "/login" \
 *     --credentials-file ~/.config/myapp/reviewer_credentials.json
 */
import fs from 'node:fs';

function parseArgs(argv) {
  const out = {
    origin: '',
    routes: ['/'],
    authRoutes: [],
    loginPath: '/login',
    credentialsFile: '',
    width: 390,
    height: 844,
    cdpPort: 9222,
  };
  for (let i = 2; i < argv.length; i++) {
    const k = argv[i];
    const v = argv[i + 1];
    if (k === '--origin' && v) { out.origin = v.replace(/\/+$/, ''); i++; }
    else if (k === '--routes' && v) { out.routes = v.split(',').map((s) => s.trim()).filter(Boolean); i++; }
    else if (k === '--auth-routes' && v) { out.authRoutes = v.split(',').map((s) => s.trim()).filter(Boolean); i++; }
    else if (k === '--login-path' && v) { out.loginPath = v.trim(); i++; }
    else if (k === '--credentials-file' && v) { out.credentialsFile = v.trim(); i++; }
    else if (k === '--width' && v) { out.width = Number(v); i++; }
    else if (k === '--height' && v) { out.height = Number(v); i++; }
    else if (k === '--cdp-port' && v) { out.cdpPort = Number(v); i++; }
  }
  if (!out.origin) {
    console.error('Usage: node verify_mobile_webview_scroll.mjs --origin https://... [--routes ...] [--auth-routes ...] [--credentials-file ...]');
    process.exit(2);
  }
  return out;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function createTab(port) {
  const res = await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' });
  return await res.json();
}

async function connectCdp(wsUrl) {
  const ws = new WebSocket(wsUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let seq = 0;
  let navEvents = 0;
  const pending = new Map();
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.method === 'Page.frameNavigated' && !m.params?.frame?.parentId) navEvents++;
    if (m.id && pending.has(m.id)) {
      const p = pending.get(m.id);
      pending.delete(m.id);
      if (m.error) p.rej(new Error(JSON.stringify(m.error)));
      else p.res(m.result || {});
    }
  };
  const call = (method, params = {}) => new Promise((res, rej) => {
    const id = ++seq;
    pending.set(id, { res, rej });
    ws.send(JSON.stringify({ id, method, params }));
  });
  const js = async (expression) => {
    const r = await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error(`JS Error: ${JSON.stringify(r.exceptionDetails)}`);
    return r?.result?.value;
  };
  return {
    ws,
    call,
    js,
    getNavEvents: () => navEvents,
    resetNavEvents: () => { navEvents = 0; },
  };
}

async function touchDrag(call, x, startY, endY, steps = 10) {
  await call('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x: Math.round(x), y: Math.round(startY), radiusX: 12, radiusY: 12, force: 1, id: 1 }],
  });
  for (let s = 1; s <= steps; s++) {
    const y = startY + ((endY - startY) * s) / steps;
    await call('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x: Math.round(x), y: Math.round(y), radiusX: 12, radiusY: 12, force: 1, id: 1 }],
    });
    await sleep(16);
  }
  await call('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await sleep(450);
}

const READ_METRICS_JS = `(() => {
  const doc = document.documentElement;
  const main = document.querySelector('main');
  const mainStyle = main ? getComputedStyle(main) : null;
  const bodyStyle = document.body ? getComputedStyle(document.body) : null;
  const htmlStyle = getComputedStyle(doc);
  return {
    href: location.href,
    innerW: window.innerWidth,
    innerH: window.innerHeight,
    scrollW: doc.scrollWidth,
    docScrollH: Math.max(doc.scrollHeight, document.body?.scrollHeight || 0),
    windowY: Math.round(window.scrollY),
    mainY: main ? Math.round(main.scrollTop) : null,
    mainScrollH: main ? main.scrollHeight : null,
    mainClientH: main ? main.clientHeight : null,
    mainOverflowY: mainStyle ? mainStyle.overflowY : null,
    htmlOverscrollY: htmlStyle.overscrollBehaviorY,
    bodyOverscrollY: bodyStyle ? bodyStyle.overscrollBehaviorY : null,
    marker: window.__pymScrollMarker || null,
  };
})()`;

async function waitLoaded(js) {
  for (let i = 0; i < 30; i++) {
    await sleep(350);
    const ok = await js(`document.readyState === 'complete' && (document.body?.innerText || '').trim().length > 20`);
    if (ok) break;
  }
  await sleep(700);
}

async function loginIfNeeded(cdp, cfg) {
  const raw = fs.readFileSync(cfg.credentialsFile, 'utf8');
  const creds = JSON.parse(raw);
  const username = creds.username || creds.email;
  const password = creds.password;
  if (!username || !password) throw new Error('Credentials file must contain username/email and password');

  await cdp.call('Page.navigate', { url: `${cfg.origin}${cfg.loginPath}` });
  await waitLoaded(cdp.js);

  // Fill visible username + password inputs via native React setter & submit
  const submitted = await cdp.js(`(() => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    const inputs = [...document.querySelectorAll('input')].filter((i) => i.offsetParent);
    const u = inputs.find((i) => i.type === 'text' || i.type === 'email' || /user|email/i.test(i.placeholder || i.name || ''));
    const p = inputs.find((i) => i.type === 'password');
    if (!u || !p) return false;
    setter.call(u, ${JSON.stringify(username)});
    u.dispatchEvent(new Event('input', { bubbles: true }));
    setter.call(p, ${JSON.stringify(password)});
    p.dispatchEvent(new Event('input', { bubbles: true }));
    const btn = [...document.querySelectorAll('button[type="submit"], button')].find((b) => b.offsetParent && /sign in|log in|submit/i.test(b.innerText || ''));
    btn?.click();
    return !!btn;
  })()`);
  if (!submitted) throw new Error('Could not find login form inputs/submit button');

  for (let i = 0; i < 25; i++) {
    await sleep(400);
    const href = await cdp.js('location.pathname');
    if (href && !href.startsWith(cfg.loginPath)) return href;
  }
  throw new Error(`Login stayed on ${await cdp.js('location.pathname')}`);
}

async function auditRoute(cdp, cfg, route) {
  const url = `${cfg.origin}${route}`;
  await cdp.call('Page.navigate', { url });
  await waitLoaded(cdp.js);
  cdp.resetNavEvents();
  await cdp.js(`window.__pymScrollMarker = 'alive_' + Date.now();`);

  const before = await cdp.js(READ_METRICS_JS);
  const cx = cfg.width / 2;

  // Swipe finger UP to scroll page DOWN
  await touchDrag(cdp.call, cx, cfg.height * 0.78, cfg.height * 0.22);
  await touchDrag(cdp.call, cx, cfg.height * 0.78, cfg.height * 0.22);
  const afterDown = await cdp.js(READ_METRICS_JS);

  // Swipe finger DOWN (simulating scroll up / pull-to-refresh gesture)
  await touchDrag(cdp.call, cx, cfg.height * 0.25, cfg.height * 0.80);
  await touchDrag(cdp.call, cx, cfg.height * 0.25, cfg.height * 0.80);
  const afterUp = await cdp.js(READ_METRICS_JS);

  const navCount = cdp.getNavEvents();
  const markerSurvived = afterUp.marker === before.marker && afterUp.marker !== null;
  const overflowPx = before.scrollW - before.innerW;
  const maxWindowScroll = Math.max(0, before.docScrollH - before.innerH);
  const maxMainScroll = (before.mainScrollH !== null && before.mainClientH !== null && before.mainOverflowY === 'auto')
    ? Math.max(0, before.mainScrollH - before.mainClientH)
    : 0;
  const maxScrollablePx = Math.max(maxWindowScroll, maxMainScroll);
  const minExpectedDown = Math.min(80, Math.floor(maxScrollablePx * 0.7));
  const minExpectedUp = Math.min(40, Math.floor(minExpectedDown * 0.5));

  const downDelta = Math.max(afterDown.windowY - before.windowY, (afterDown.mainY ?? 0) - (before.mainY ?? 0));
  const upDelta = Math.max(afterDown.windowY - afterUp.windowY, (afterDown.mainY ?? 0) - (afterUp.mainY ?? 0));

  const issues = [];
  if (overflowPx > 2) issues.push(`horizontal overflow ${overflowPx}px (${before.scrollW} > ${before.innerW})`);
  if (!['none', 'contain'].includes(before.htmlOverscrollY)) issues.push(`html overscroll-behavior-y=${before.htmlOverscrollY}`);
  if (!['none', 'contain'].includes(before.bodyOverscrollY)) issues.push(`body overscroll-behavior-y=${before.bodyOverscrollY}`);
  if (navCount > 0 || !markerSurvived) issues.push(`unintended reload/navigation during swipe (navEvents=${navCount}, markerSurvived=${markerSurvived})`);
  if (maxScrollablePx > 40 && downDelta < minExpectedDown) {
    issues.push(`page appears scrollable (max=${maxScrollablePx}px) but downward scroll delta was only ${downDelta}px`);
  }
  if (downDelta >= 40 && upDelta < minExpectedUp) {
    issues.push(`scrolled down ${downDelta}px cleanly, but upward swipe only returned ${upDelta}px`);
  }

  return {
    route,
    pass: issues.length === 0,
    overflowPx,
    docScrollH: before.docScrollH,
    viewportH: before.innerH,
    windowY: [before.windowY, afterDown.windowY, afterUp.windowY],
    mainY: before.mainY !== null ? [before.mainY, afterDown.mainY, afterUp.mainY] : null,
    overscrollY: [before.htmlOverscrollY, before.bodyOverscrollY],
    markerSurvived,
    issues,
  };
}

async function main() {
  const cfg = parseArgs(process.argv);
  const tab = await createTab(cfg.cdpPort);
  const cdp = await connectCdp(tab.webSocketDebuggerUrl);
  const results = [];

  try {
    await cdp.call('Page.enable');
    await cdp.call('Emulation.setDeviceMetricsOverride', {
      width: cfg.width,
      height: cfg.height,
      deviceScaleFactor: 2.625,
      mobile: true,
    });
    await cdp.call('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });

    for (const r of cfg.routes) {
      results.push(await auditRoute(cdp, cfg, r));
    }

    if (cfg.authRoutes.length) {
      if (!cfg.credentialsFile) throw new Error('--auth-routes requires --credentials-file');
      const landed = await loginIfNeeded(cdp, cfg);
      console.log(`Authenticated reviewer session landed on: ${landed}`);
      for (const r of cfg.authRoutes) {
        results.push(await auditRoute(cdp, cfg, r));
      }
    }
  } finally {
    await cdp.call('Emulation.setTouchEmulationEnabled', { enabled: false }).catch(() => {});
    await cdp.call('Emulation.clearDeviceMetricsOverride').catch(() => {});
    cdp.ws.close();
    await fetch(`http://127.0.0.1:${cfg.cdpPort}/json/close/${tab.id}`).catch(() => {});
  }

  console.log(JSON.stringify(results, null, 2));
  const failed = results.filter((r) => !r.pass);
  if (failed.length) {
    console.error(`\nFAILED ${failed.length}/${results.length} mobile touch-scroll checks`);
    process.exit(1);
  }
  console.log(`\nALL ${results.length}/${results.length} mobile touch-scroll & overflow checks PASSED at ${cfg.width}x${cfg.height}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
