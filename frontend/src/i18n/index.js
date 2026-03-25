import en from './en.json';
import ta from './ta.json';

const translations = { en, ta };

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
 * useTranslation(language) — returns { t } where t(key) looks up the key in
 * translations[language] and falls back to English if the language or key is
 * not found.
 */
export function useTranslation(language = 'en') {
  const langDict = translations[language] || {};
  const fallback = translations['en'] || {};

  function t(key) {
    return langDict[key] ?? fallback[key] ?? key;
  }

  return { t };
}
