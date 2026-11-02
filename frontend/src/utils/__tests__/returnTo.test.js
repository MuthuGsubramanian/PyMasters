import { describe, it, expect } from 'vitest';
import { safeNextPath } from '../returnTo';

describe('safeNextPath (open-redirect guard for /login?next=)', () => {
  it('accepts in-app paths, keeping query and hash', () => {
    expect(safeNextPath('/dashboard/classroom/logistic_regression')).toBe('/dashboard/classroom/logistic_regression');
    expect(safeNextPath('/dashboard/classroom?track=dsa#top')).toBe('/dashboard/classroom?track=dsa#top');
  });

  it('rejects anything that could leave pymasters.net', () => {
    for (const bad of [
      'https://evil.example/login',
      '//evil.example/login',           // protocol-relative
      '/\\evil.example',                // browsers treat \ like /
      'javascript:alert(1)',
      ' /dashboard',                    // leading whitespace
      'dashboard',                      // not absolute
    ]) {
      expect(safeNextPath(bad)).toBeNull();
    }
  });

  it('does not loop back into the auth pages, and handles empty input', () => {
    expect(safeNextPath('/login')).toBeNull();
    expect(safeNextPath('/login?next=/x')).toBeNull();
    expect(safeNextPath('')).toBeNull();
    expect(safeNextPath(null)).toBeNull();
  });
});
