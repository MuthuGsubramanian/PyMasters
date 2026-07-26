import { useProfile } from '../context/ProfileContext';
import { useTranslation } from '../i18n';

// Ergonomic i18n for the migration: reads the app-wide language from
// ProfileContext so a component just does `const { t } = useI18n()` and calls
// `t('some.key', 'English source')`. The English source is always passed so an
// untranslated string renders in English (never a raw key) — see i18n/index.js.
export default function useI18n() {
    const ctx = useProfile();
    return useTranslation((ctx && ctx.language) || 'en');
}
