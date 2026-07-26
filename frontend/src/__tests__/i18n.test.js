/**
 * i18n dictionary parity: every language offered in the picker must have a
 * registered dictionary covering the full English key set — otherwise that
 * language silently renders English (the exact bug found in live testing
 * 2026-07-26: only en/ta were registered out of 8 offered languages).
 */
import { describe, it, expect } from 'vitest';
import { SUPPORTED_LANGUAGES, useTranslation } from '../i18n';
import en from '../i18n/en.json';
import ta from '../i18n/ta.json';
import te from '../i18n/te.json';
import ml from '../i18n/ml.json';
import fr from '../i18n/fr.json';
import es from '../i18n/es.json';
import it_ from '../i18n/it.json';
import ko from '../i18n/ko.json';

const DICTS = { en, ta, te, ml, fr, es, it: it_, ko };

describe('i18n dictionaries', () => {
  it('every supported language has a dictionary', () => {
    for (const { code } of SUPPORTED_LANGUAGES) {
      expect(DICTS[code], `missing dictionary for ${code}`).toBeTruthy();
    }
  });

  it('every dictionary covers the full English key set', () => {
    const enKeys = Object.keys(en);
    for (const [code, dict] of Object.entries(DICTS)) {
      const missing = enKeys.filter((k) => !(k in dict));
      expect(missing, `${code}.json missing keys: ${missing.join(', ')}`).toEqual([]);
    }
  });

  it('non-English dictionaries are actually translated (spot check)', () => {
    // Keys whose values must differ from English in every other language.
    const PROBES = ['nav.classroom', 'support.title', 'tutor.title', 'common.close'];
    for (const [code, dict] of Object.entries(DICTS)) {
      if (code === 'en') continue;
      const translated = PROBES.some((k) => dict[k] && dict[k] !== en[k]);
      expect(translated, `${code}.json looks untranslated for probes`).toBe(true);
    }
  });

  it('placeholders survive translation', () => {
    for (const [code, dict] of Object.entries(DICTS)) {
      expect(dict['tutor.tz_hint'], `${code} tutor.tz_hint must keep {tz}`).toContain('{tz}');
    }
  });

  it('t() resolves locale > english > default', () => {
    const { t } = useTranslation('ta');
    expect(t('nav.classroom', 'Classroom')).toBe(ta['nav.classroom']);
    expect(t('nonexistent.key', 'Inline default')).toBe('Inline default');
  });
});
