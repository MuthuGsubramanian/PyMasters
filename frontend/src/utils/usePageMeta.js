import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

const SITE_ORIGIN = 'https://pymasters.net';
const DEFAULT_TITLE = 'PyMasters — AI-Powered Python Learning Platform with Vaathiyaar';

function upsertLinkTag(rel, href) {
  if (typeof document === 'undefined') return;
  let el = document.head.querySelector(`link[rel="${rel}"]`);
  if (!el) {
    el = document.createElement('link');
    el.setAttribute('rel', rel);
    document.head.appendChild(el);
  }
  el.setAttribute('href', href);
}

function upsertMetaTag(attr, key, content) {
  if (typeof document === 'undefined' || !content) return;
  let el = document.head.querySelector(`meta[${attr}="${key}"]`);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

export function buildCanonicalUrl(pathname = '/') {
  const clean = pathname === '/' ? '/' : String(pathname || '/').replace(/\/+$/, '') || '/';
  return `${SITE_ORIGIN}${clean}`;
}

export function syncRouteCanonical(pathname) {
  const url = buildCanonicalUrl(pathname);
  upsertLinkTag('canonical', url);
  upsertMetaTag('property', 'og:url', url);
}

/**
 * Dynamically updates document.title, canonical link, OpenGraph URL/title,
 * and optional meta description for public & authenticated routes.
 */
export function usePageMeta({ title, description, canonicalPath } = {}) {
  const location = useLocation();
  const targetPath = canonicalPath || location.pathname;

  useEffect(() => {
    if (title) {
      const formatted = title.includes('PyMasters') ? title : `${title} — PyMasters`;
      document.title = formatted;
      upsertMetaTag('property', 'og:title', formatted);
    }
    if (description) {
      upsertMetaTag('name', 'description', description);
      upsertMetaTag('property', 'og:description', description);
    }
    syncRouteCanonical(targetPath);
  }, [title, description, targetPath]);
}

/**
 * Router-level observer mounted in App.jsx so every route transition keeps
 * <link rel="canonical"> and <meta property="og:url"> accurate.
 */
export function RouteMetaSync() {
  const { pathname } = useLocation();

  useEffect(() => {
    syncRouteCanonical(pathname);
    if (pathname === '/') {
      document.title = DEFAULT_TITLE;
    }
  }, [pathname]);

  return null;
}

export default usePageMeta;
