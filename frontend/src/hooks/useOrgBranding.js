import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { getOrgBranding } from '../api';

/**
 * Per-organization portal branding ("white-label lite").
 *
 * Reads GET /api/org/{id}/branding once per org per session (in-memory cache)
 * and keeps a localStorage copy (`pm_org_branding_<id>`) so the next page load
 * paints with the org's colours before the network answers. The `/my` payload
 * also inlines `branding` on each org, which `activeOrg.branding` surfaces for
 * the very first paint after login.
 *
 * Only the instance created with `{ applyTheme: true }` (the authenticated
 * Layout shell) writes CSS custom properties; every other caller just reads.
 * That keeps unmounting a reader (e.g. the dashboard) from un-theming the app.
 *
 * State lives in module-level caches; components re-read them on a version
 * bump, so no setState runs synchronously inside an effect.
 */

const HEX = /^#[0-9a-fA-F]{6}$/;
const THEME_VARS = ['--accent-primary', '--primary', '--secondary'];
const EVENT = 'pm:org-branding';
const memCache = new Map();   // orgId -> { branding, preset, type }   (server truth)
const attempted = new Set();  // orgIds whose fetch finished (ok or failed)
const inflight = new Map();   // orgId -> Promise (dedupes concurrent mounts)
const storageCache = new Map(); // orgId -> parsed localStorage copy (stable identity)

const storageKey = (orgId) => `pm_org_branding_${orgId}`;

function readStorage(orgId) {
  if (storageCache.has(orgId)) return storageCache.get(orgId);
  let parsed = null;
  try {
    const raw = localStorage.getItem(storageKey(orgId));
    parsed = raw ? JSON.parse(raw) : null;
  } catch {
    parsed = null;
  }
  const entry = parsed && typeof parsed === 'object' && parsed.branding ? parsed : null;
  storageCache.set(orgId, entry);
  return entry;
}

function writeStorage(orgId, data) {
  try {
    localStorage.setItem(storageKey(orgId), JSON.stringify(data));
  } catch {
    /* storage unavailable (private mode / quota) -- memory cache still works */
  }
}

function notify(orgId) {
  try {
    window.dispatchEvent(new CustomEvent(EVENT, { detail: { orgId } }));
  } catch {
    /* CustomEvent unavailable -- readers still refresh on next mount */
  }
}

/** Set / clear the theme tokens for a branding object. Only colours the org
 *  actually saved are written; otherwise the inline override is removed so the
 *  stylesheet defaults (light + .dark) come back. */
export function applyBrandingTheme(branding) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement.style;
  const primary = branding?.primary_color;
  const accent = branding?.accent_color;
  if (primary && HEX.test(primary)) {
    root.setProperty('--accent-primary', primary);
    root.setProperty('--primary', primary);
  } else {
    root.removeProperty('--accent-primary');
    root.removeProperty('--primary');
  }
  if (accent && HEX.test(accent)) {
    root.setProperty('--secondary', accent);
  } else {
    root.removeProperty('--secondary');
  }
}

export function clearBrandingTheme() {
  if (typeof document === 'undefined') return;
  const root = document.documentElement.style;
  THEME_VARS.forEach((v) => root.removeProperty(v));
}

/** Called after a successful PUT so every mounted hook instance (shell, navbar,
 *  dashboard) picks up the new branding without a refetch. */
export function publishOrgBranding(orgId, data) {
  if (!orgId || !data?.branding) return;
  const entry = { branding: data.branding, preset: data.preset || null, type: data.type || null };
  memCache.set(orgId, entry);
  attempted.add(orgId);
  writeStorage(orgId, entry);
  notify(orgId);
}

function fetchBranding(orgId) {
  if (inflight.has(orgId)) return inflight.get(orgId);
  const p = getOrgBranding(orgId)
    .then((r) => {
      const d = r?.data || {};
      if (!d.branding) throw new Error('no branding in response');
      const fresh = { branding: d.branding, preset: d.preset || null, type: d.type || null };
      memCache.set(orgId, fresh);
      writeStorage(orgId, fresh);
    })
    .catch(() => { /* keep cached / inline branding; defaults are fine */ })
    .finally(() => {
      attempted.add(orgId);
      inflight.delete(orgId);
      notify(orgId);
    });
  inflight.set(orgId, p);
  return p;
}

const inlineCache = new WeakMap(); // activeOrg.branding object -> wrapped entry

/** Best available entry for an org: server truth, then last-session copy,
 *  then whatever `/my` inlined on the activeOrg object. Every branch returns a
 *  stable object identity so effects keyed on `entry` do not re-fire per render. */
function resolveEntry(orgId, inlineBranding, inlineType) {
  if (!orgId) return null;
  if (memCache.has(orgId)) return memCache.get(orgId);
  const stored = readStorage(orgId);
  if (stored) return stored;
  if (inlineBranding && typeof inlineBranding === 'object') {
    if (!inlineCache.has(inlineBranding)) {
      inlineCache.set(inlineBranding, { branding: inlineBranding, preset: null, type: inlineType || null });
    }
    return inlineCache.get(inlineBranding);
  }
  return null;
}

export default function useOrgBranding({ applyTheme = false } = {}) {
  const { activeOrg } = useAuth();
  const orgId = activeOrg?.org_id || activeOrg?.id || null;
  const inlineBranding = activeOrg?.branding || null;
  const inlineType = activeOrg?.type || activeOrg?.org_type || null;

  // Bumped (asynchronously) whenever the module caches change for this org;
  // its only job is to force a re-render so `resolveEntry` re-reads the caches.
  const [, setVersion] = useState(0);

  // Subscribe to cache updates for this org and kick off the one-time fetch.
  useEffect(() => {
    if (!orgId) return undefined;
    const onUpdate = (e) => {
      if (e?.detail?.orgId === orgId) setVersion((v) => v + 1);
    };
    window.addEventListener(EVENT, onUpdate);
    if (!memCache.has(orgId) && !attempted.has(orgId)) fetchBranding(orgId);
    return () => window.removeEventListener(EVENT, onUpdate);
  }, [orgId]);

  const entry = resolveEntry(orgId, inlineBranding, inlineType);
  const loading = !!orgId && !memCache.has(orgId) && !attempted.has(orgId);

  // Theme side effect: write tokens for whatever we currently know, clear them
  // when there is no active org, and un-theme on unmount (logout tears the
  // shell down; a fresh login re-applies from cache or /my).
  useEffect(() => {
    if (!applyTheme) return undefined;
    if (entry?.branding) applyBrandingTheme(entry.branding);
    else clearBrandingTheme();
    return () => clearBrandingTheme();
  }, [applyTheme, entry]);

  return {
    branding: entry?.branding || null,
    preset: entry?.preset || null,
    type: entry?.type || null,
    orgId,
    loading,
  };
}
