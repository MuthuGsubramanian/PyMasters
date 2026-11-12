#!/usr/bin/env node
/**
 * Reusable Google Play Console AngularDart Automation Toolkit via Eighty Browser CDP (port 9222).
 * Complements `play_publish_api.py` for Play Console steps that require or benefit from Console UI:
 *   - `inspect`            : Audits /publishing, /policy-center, /app-dashboard (blockers + 12-tester gate).
 *   - `set-sign-in-details`: Fills App Access / Sign-in details (`Add details` drawer) for review crawlers.
 *   - `sync-listing`       : Uploads Fastlane icon, featureGraphic, phoneScreenshots & en-GB/en-US texts.
 *   - `release-track`      : Releases or promotes an AAB on internal/alpha/beta/production & submits review.
 *
 * Requires Node 20+ (built-in fetch & WebSocket). Zero external packages.
 */
import fs from 'node:fs';
import path from 'node:path';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const ALPHA_DEFAULT_TRACK_ID = '4701408359510548633';

function parseCli(argv) {
  const cmd = argv[2];
  const opts = { cdpPort: 9222, submit: false };
  for (let i = 3; i < argv.length; i++) {
    const k = argv[i];
    if (k === '--submit') { opts.submit = true; continue; }
    if (k.startsWith('--') && i + 1 < argv.length) {
      opts[k.slice(2)] = argv[++i];
    }
  }
  return { cmd, opts };
}

async function withConsoleSession(port, fn) {
  const tab = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' })).json();
  const ws = new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let seq = 0;
  const pending = new Map();
  const events = [];
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.method) { events.push(m); return; }
    if (m.id && pending.has(m.id)) {
      const p = pending.get(m.id);
      pending.delete(m.id);
      if (m.error) p.rej(new Error(JSON.stringify(m.error)));
      else p.res(m.result || {});
    }
  };
  const cdp = (method, params = {}) => new Promise((res, rej) => {
    const id = ++seq;
    pending.set(id, { res, rej });
    ws.send(JSON.stringify({ id, method, params }));
  });
  const js = async (expression) => {
    const r = await cdp('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error(`JS error: ${JSON.stringify(r.exceptionDetails)}`);
    return r?.result?.value;
  };
  const clickAt = async (x, y) => {
    for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) {
      await cdp('Input.dispatchMouseEvent', { type, x: Math.round(x), y: Math.round(y), button: 'left', clickCount: 1 });
      await sleep(75);
    }
  };
  const clickButton = async (regexSrc, { scroll = true, preferLast = false } = {}) => {
    const info = await js(`(() => {
      const rx = new RegExp(${JSON.stringify(regexSrc)}, 'i');
      const cleanLabel = (el) => {
        const clone = el.cloneNode(true);
        clone.querySelectorAll('material-icon, i.material-icons, .material-icons-extended, [aria-hidden="true"]').forEach(n => n.remove());
        return (clone.innerText || el.getAttribute('aria-label') || '').replace(/\\s+/g, ' ').trim();
      };
      const matches = [...document.querySelectorAll('button, material-button, [role="button"], a')].filter((b) => {
        const r = b.getBoundingClientRect();
        if (r.width < 5 || r.height < 5 || !b.offsetParent) return false;
        if (b.disabled || b.getAttribute('aria-disabled') === 'true') return false;
        return rx.test(cleanLabel(b));
      });
      if (!matches.length) return null;
      const hit = ${preferLast ? 'matches[matches.length - 1]' : 'matches[0]'};
      if (${scroll}) hit.scrollIntoView({ block: 'center' });
      const r = hit.getBoundingClientRect();
      return { text: cleanLabel(hit), x: r.left + r.width / 2, y: r.top + r.height / 2 };
    })()`);
    if (!info) return null;
    await sleep(220);
    await clickAt(info.x, info.y);
    return info.text;
  };
  const typeText = async (txt) => {
    await cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: 'a', modifiers: 2 });
    await cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: 'a', modifiers: 2 });
    await cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Backspace', windowsVirtualKeyCode: 8 });
    await cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Backspace', windowsVirtualKeyCode: 8 });
    for (const ch of txt) {
      if (ch === '\n') {
        await cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', windowsVirtualKeyCode: 13 });
        await cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', windowsVirtualKeyCode: 13 });
      } else {
        await cdp('Input.dispatchKeyEvent', { type: 'char', text: ch });
      }
      await sleep(6);
    }
    await cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', windowsVirtualKeyCode: 9 });
    await cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Tab', windowsVirtualKeyCode: 9 });
  };
  const findFileInputs = async () => {
    const doc = await cdp('DOM.getDocument', { depth: -1, pierce: true });
    const ids = [];
    const walk = (n) => {
      if (n.nodeName === 'INPUT' && n.attributes) {
        for (let i = 0; i < n.attributes.length; i += 2) {
          if (n.attributes[i] === 'type' && n.attributes[i + 1] === 'file') ids.push(n.backendNodeId);
        }
      }
      (n.children || []).forEach(walk);
      (n.shadowRoots || []).forEach(walk);
    };
    walk(doc.root);
    return ids;
  };
  const waitEvent = async (name, timeoutMs = 6000) => {
    const idx = events.findIndex((e) => e.method === name);
    if (idx >= 0) return events.splice(idx, 1)[0];
    const end = Date.now() + timeoutMs;
    while (Date.now() < end) {
      await sleep(150);
      const j = events.findIndex((e) => e.method === name);
      if (j >= 0) return events.splice(j, 1)[0];
    }
    return null;
  };
  const navigateWait = async (url, predicateJs, timeoutSec = 25) => {
    await cdp('Page.bringToFront');
    await cdp('Page.navigate', { url });
    for (let i = 0; i < timeoutSec; i++) {
      await sleep(1000);
      if (await js(predicateJs)) break;
    }
    await sleep(1000);
  };

  try {
    await cdp('Page.enable');
    await cdp('DOM.enable');
    await cdp('Runtime.enable');
    await cdp('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
    await cdp('Page.bringToFront');
    return await fn({ cdp, js, clickAt, clickButton, typeText, findFileInputs, events, waitEvent, navigateWait });
  } finally {
    await cdp('Emulation.clearDeviceMetricsOverride').catch(() => {});
    ws.close();
    await fetch(`http://127.0.0.1:${port}/json/close/${tab.id}`).catch(() => {});
  }
}

function baseUrl(opts) {
  const devId = opts['dev-id'];
  const appId = opts['app-id'];
  if (!devId || !appId) throw new Error('--dev-id and --app-id are required');
  return `https://play.google.com/console/u/0/developers/${devId}/app/${appId}`;
}

async function cmdInspect(s, opts) {
  const base = baseUrl(opts);
  await s.navigateWait(`${base}/publishing`, `(document.body?.innerText || '').includes('Publishing overview')`);
  // Allow async pre-review checks skeleton up to 15s to settle
  for (let i = 0; i < 15; i++) {
    const hasSubmitEnabled = await s.js(`[...document.querySelectorAll('button, material-button')].some(b => /Submit .*changes for review/i.test(b.innerText || '') && !b.disabled && b.getAttribute('aria-disabled') !== 'true')`);
    const hasIssueBanner = await s.js(`/View issues/i.test(document.body?.innerText || '')`);
    if (hasSubmitEnabled || hasIssueBanner) break;
    await sleep(1000);
  }
  const pubSummary = await s.js(`(document.body?.innerText || '').slice(0, 2200)`);
  console.log('=== PUBLISHING OVERVIEW ===\n', pubSummary);

  await s.navigateWait(`${base}/app-dashboard`, `(document.body?.innerText || '').includes('Production')`);
  const dashSummary = await s.js(`(document.body?.innerText || '').slice(0, 1800)`);
  console.log('\n=== APP DASHBOARD (PRODUCTION GATE) ===\n', dashSummary);
}

async function cmdSetSignInDetails(s, opts) {
  const base = baseUrl(opts);
  let username = opts.username || '';
  let password = opts.password || '';
  if (opts['credentials-file']) {
    const data = JSON.parse(fs.readFileSync(opts['credentials-file'], 'utf8'));
    username ||= data.username || data.email || '';
    password ||= data.password || '';
  }
  if (!username || !password) throw new Error('Provide --credentials-file OR --username + --password');
  const labelName = opts.name || 'Standard Reviewer Account';
  const instructions = opts.instructions || 'Sign in using the username and password provided above to access all app screens and features.';

  await s.navigateWait(`${base}/app-content/testing-credentials`, `/Is any part of your app restricted/i.test(document.body?.innerText || '')`);
  const yesCoord = await s.js(`(() => {
    const radios = [...document.querySelectorAll('material-radio, [role="radio"]')];
    const hit = radios.find(r => /^Yes/i.test((r.innerText || '').trim())) || radios[0];
    if (!hit) return null;
    hit.scrollIntoView({ block: 'center' });
    const rect = hit.getBoundingClientRect();
    return { x: rect.left + 20, y: rect.top + rect.height / 2 };
  })()`);
  if (yesCoord) { await s.clickAt(yesCoord.x, yesCoord.y); await sleep(1200); }

  await s.clickButton('Add\\s*(details|instructions)');
  await sleep(1500);

  const values = [labelName, username, password, instructions];
  for (let idx = 0; idx < values.length; idx++) {
    const coord = await s.js(`(() => {
      const els = [...document.querySelectorAll('input, textarea')].filter(e => e.offsetParent && e.type !== 'radio' && e.type !== 'checkbox');
      const el = els[${idx}];
      if (!el) return null;
      el.scrollIntoView({ block: 'center' });
      const r = el.getBoundingClientRect();
      return { x: r.left + Math.min(40, r.width / 2), y: r.top + r.height / 2 };
    })()`);
    if (!coord) throw new Error(`Missing drawer input index ${idx}`);
    await sleep(120);
    await s.clickAt(coord.x, coord.y);
    await sleep(100);
    await s.typeText(values[idx]);
    await sleep(120);
  }

  const cb = await s.js(`(() => {
    const cbs = [...document.querySelectorAll('material-checkbox, [role="checkbox"]')].filter(c => c.offsetParent);
    const hit = cbs[cbs.length - 1];
    if (!hit || hit.getAttribute('aria-checked') === 'true') return null;
    hit.scrollIntoView({ block: 'center' });
    const r = hit.getBoundingClientRect();
    return { x: r.left + 16, y: r.top + r.height / 2 };
  })()`);
  if (cb) { await s.clickAt(cb.x, cb.y); await sleep(400); }

  console.log('Clicked Add:', await s.clickButton('^Add$', { preferLast: true }));
  await sleep(2000);
  console.log('Clicked Save:', await s.clickButton('^Save$', { preferLast: true }));
  await sleep(3000);
}

async function cmdSyncListing(s, opts) {
  const base = baseUrl(opts);
  const metaDir = opts['metadata-dir'];
  if (!metaDir) throw new Error('--metadata-dir is required');
  const shortDesc = fs.readFileSync(path.join(metaDir, 'short_description.txt'), 'utf8').trim();
  const fullDesc = fs.readFileSync(path.join(metaDir, 'full_description.txt'), 'utf8').trim();

  await s.navigateWait(`${base}/store-listings/default/edit`, `document.querySelectorAll('textarea').length >= 1`);

  const setTexts = () => s.js(`(() => {
    const inputs = [...document.querySelectorAll('input')].filter(i => i.offsetParent && i.type !== 'file' && i.type !== 'search');
    const shortEl = inputs[1];
    if (shortEl) {
      shortEl.focus(); shortEl.value = ${JSON.stringify(shortDesc)};
      shortEl.dispatchEvent(new Event('input', { bubbles: true }));
      shortEl.dispatchEvent(new Event('change', { bubbles: true }));
      shortEl.blur();
    }
    const ta = [...document.querySelectorAll('textarea')].find(t => t.offsetParent);
    if (ta) {
      ta.focus(); ta.value = ${JSON.stringify(fullDesc)};
      ta.dispatchEvent(new Event('input', { bubbles: true }));
      ta.dispatchEvent(new Event('change', { bubbles: true }));
      ta.blur();
    }
    return { shortLen: shortEl?.value?.length || 0, fullLen: ta?.value?.length || 0 };
  })()`);

  console.log('Default locale texts:', await setTexts());

  // Upload phone screenshots if present (3rd "Add assets" slot on default listing)
  const shotsDir = path.join(metaDir, 'images', 'phoneScreenshots');
  if (fs.existsSync(shotsDir)) {
    const shots = fs.readdirSync(shotsDir).filter((f) => f.endsWith('.png')).sort().slice(0, 8);
    if (shots.length) {
      const addCoord = await s.js(`(() => {
        const adds = [...document.querySelectorAll('button, material-button')].filter(b => (b.innerText || '').trim() === 'Add assets' && b.getBoundingClientRect().width > 20);
        const target = adds[2] || adds[adds.length - 1];
        if (!target) return null;
        target.scrollIntoView({ block: 'center' });
        const r = target.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      })()`);
      if (addCoord) {
        await s.clickAt(addCoord.x, addCoord.y);
        await sleep(1200);
        for (const fname of shots) {
          const inputs = await s.findFileInputs();
          if (!inputs.length) break;
          await s.cdp('DOM.setFileInputFiles', { backendNodeId: inputs[0], files: [path.join(shotsDir, fname)] });
          for (let i = 0; i < 20; i++) {
            await sleep(700);
            if (await s.js(`!!document.querySelector(${JSON.stringify(`button[aria-label="Remove ${fname}"]`)})`)) break;
          }
        }
        await s.js(`document.querySelector('button[aria-label="Close side panel"]')?.click()`);
        await sleep(600);
      }
    }
  }

  if (await s.clickButton('^Next$', { preferLast: true })) {
    await sleep(2500);
    console.log('Secondary locale texts:', await setTexts());
    await sleep(600);
    console.log('Saved listing:', await s.clickButton('^Save$', { preferLast: true }));
    await sleep(4000);
  } else {
    console.log('Saved listing:', await s.clickButton('^Save$', { preferLast: true }));
    await sleep(4000);
  }
}

async function cmdReleaseTrack(s, opts) {
  const base = baseUrl(opts);
  const track = opts.track || 'internal';
  const aabPath = opts.aab ? path.resolve(opts.aab) : '';
  const vCode = opts['version-code'] || '';
  const vName = opts['version-name'] || '';
  const notes = opts['notes-file'] ? fs.readFileSync(opts['notes-file'], 'utf8').trim() : 'Bug fixes and stability improvements.';
  const trackRoute = track === 'internal'
    ? 'internal-testing'
    : track === 'alpha'
      ? (opts['track-id'] || ALPHA_DEFAULT_TRACK_ID)
      : track;

  await s.cdp('Page.setInterceptFileChooserDialog', { enabled: true });
  await s.navigateWait(`${base}/tracks/${trackRoute}`, `/(Edit release|Create new release)/i.test(document.body?.innerText || '')`);

  const entered = await s.clickButton('^(Edit release|Create new release)$');
  console.log(`Track ${track} clicked:`, entered);
  await sleep(3500);

  let attached = false;
  if (vCode && vName && await s.js(`new RegExp(${JSON.stringify(`\\b${vCode}\\b.*${vName.replaceAll('.', '\\.')}`)}, 's').test(document.body?.innerText || '')`)) {
    attached = true;
  }
  if (!attached && vCode && await s.clickButton('Add from library')) {
    await sleep(3000);
    const cb = await s.js(`(() => {
      const rows = [...document.querySelectorAll('ess-row, tr, [role="row"], .particle-table-row')];
      const rx = new RegExp(${JSON.stringify(`\\b${vCode}\\b`)});
      const hit = rows.find(r => rx.test(r.innerText || '') && (${JSON.stringify(vName)} ? (r.innerText || '').includes(${JSON.stringify(vName)}) : true));
      if (!hit) return null;
      const box = hit.querySelector('material-checkbox, [role="checkbox"], input[type="checkbox"]') || hit;
      box.scrollIntoView({ block: 'center' });
      const r = box.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    })()`);
    if (cb) {
      await s.clickAt(cb.x, cb.y);
      await sleep(1200);
      await s.clickButton('^Add to release$', { preferLast: true });
      await sleep(3000);
      attached = true;
    }
  }
  if (!attached) {
    if (!aabPath || !fs.existsSync(aabPath)) throw new Error(`Bundle not in library and missing --aab (${aabPath})`);
    s.events.length = 0;
    await s.clickButton('^Upload$');
    const fc = await s.waitEvent('Page.fileChooserOpened', 6000);
    if (fc?.params?.backendNodeId) {
      await s.cdp('DOM.setFileInputFiles', { backendNodeId: fc.params.backendNodeId, files: [aabPath] });
    } else {
      const inputs = await s.findFileInputs();
      if (!inputs.length) throw new Error('No file input found for AAB upload');
      await s.cdp('DOM.setFileInputFiles', { backendNodeId: inputs[0], files: [aabPath] });
    }
    for (let i = 0; i < 60; i++) {
      await sleep(2000);
      const txt = await s.js('document.body?.innerText || ""');
      if (vCode && (txt.includes(`${vCode} (${vName})`) || new RegExp(`\\b${vCode}\\b`).test(txt))) {
        console.log(`AAB processed in ${(i + 1) * 2}s`);
        break;
      }
    }
  }

  const taggedNotes = `<en-GB>\n${notes}\n</en-GB>\n<en-US>\n${notes}\n</en-US>`;
  await s.js(`(() => {
    const notes = ${JSON.stringify(taggedNotes)};
    for (const ta of [...document.querySelectorAll('textarea')].filter(t => t.offsetParent)) {
      ta.focus();
      ta.value = notes;
      ta.dispatchEvent(new Event('input', { bubbles: true }));
      ta.dispatchEvent(new Event('change', { bubbles: true }));
      ta.blur();
    }
  })()`);
  await sleep(1500);

  console.log('Clicked Next:', await s.clickButton('^Next$', { preferLast: true }));
  await sleep(4000);
  console.log('Clicked Save/Publish:', await s.clickButton('^(Save and publish|Save|Rollout|Start rollout|Go to overview|Go to publishing overview)$', { preferLast: true }));
  await sleep(2500);
  console.log('Clicked Confirm:', await s.clickButton('^(Save and publish|Publish|Rollout|Go to publishing overview|Go to overview|Save)$', { preferLast: true }));
  await sleep(4500);

  if (opts.submit) {
    await s.navigateWait(`${base}/publishing`, `(document.body?.innerText || '').includes('Publishing overview')`);
    let sub = null;
    for (let i = 0; i < 25; i++) {
      await sleep(1000);
      sub = await s.clickButton('(Submit|Send) .*changes for review', { preferLast: true });
      if (sub) break;
    }
    if (sub) {
      await sleep(2500);
      console.log('Confirmed review submission:', await s.clickButton('^(Submit changes for review|Send changes for review|Submit|Send)$', { preferLast: true }));
      await sleep(4000);
    } else {
      console.log('WARNING: Submit button still disabled on /publishing. Summary:');
      console.log(await s.js(`(document.body?.innerText || '').slice(0, 1500)`));
    }
  }
}

async function main() {
  const { cmd, opts } = parseCli(process.argv);
  const port = Number(opts['cdp-port'] || opts.cdpPort || 9222);
  await withConsoleSession(port, async (s) => {
    if (cmd === 'inspect') return await cmdInspect(s, opts);
    if (cmd === 'set-sign-in-details') return await cmdSetSignInDetails(s, opts);
    if (cmd === 'sync-listing') return await cmdSyncListing(s, opts);
    if (cmd === 'release-track') return await cmdReleaseTrack(s, opts);
    throw new Error('Unknown command. Use: inspect | set-sign-in-details | sync-listing | release-track');
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
