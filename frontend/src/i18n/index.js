import en from './en.json';
import ta from './ta.json';
import te from './te.json';
import ml from './ml.json';
import fr from './fr.json';
import es from './es.json';
import it from './it.json';
import ko from './ko.json';

// Every language offered in SUPPORTED_LANGUAGES must have a dictionary here —
// before 2026-07-26 only en/ta were registered, so the other six silently
// rendered English (found in live testing). Parity is enforced by
// src/__tests__/i18n.test.js.
const translations = { en, ta, te, ml, fr, es, it, ko };

export const SUPPORTED_LANGUAGES = [
  { code: 'en', name: 'English',    flag: '🇬🇧' },
  { code: 'ta', name: 'தமிழ்',      flag: '🇮🇳' },
  { code: 'te', name: 'తెలుగు',     flag: '🇮🇳' },
  { code: 'ml', name: 'മലയാളം',    flag: '🇮🇳' },
  { code: 'fr', name: 'Français',   flag: '🇫🇷' },
  { code: 'es', name: 'Español',    flag: '🇪🇸' },
  { code: 'it', name: 'Italiano',   flag: '🇮🇹' },
  { code: 'ko', name: '한국어',      flag: '🇰🇷' },
];

export const BLOCKED_LANGUAGES = [
  {
    code: 'hi',
    name: 'Hindi',
    message: 'Hindi is not supported on PyMasters. Please choose another language.',
  },
];

/**
 * useTranslation(language) — returns { t } where `t(key, defaultText)` resolves
 * to the current locale's string, else the English string, else the inline
 * `defaultText` (the English source passed at the call site), else the key.
 *
 * The `defaultText` fallback is what makes a PARTIAL migration safe: every
 * migrated string passes its own English source, so an untranslated (or even
 * un-keyed) string renders the English text — identical to the pre-migration
 * behaviour — instead of leaking a raw key. So the layer is never "worse than
 * none," and locales can be filled in incrementally.
 */
export function useTranslation(language = 'en') {
  const langDict = translations[language] || {};
  const fallback = translations['en'] || {};

  function t(key, defaultText) {
    return langDict[key] ?? fallback[key] ?? defaultText ?? key;
  }

  return { t };
}
