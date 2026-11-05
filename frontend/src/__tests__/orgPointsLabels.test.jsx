import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { pointsLabels } from '../utils/orgStatLabels';

// Via a variable: vite rewrites a literal `new URL('..', import.meta.url)` into an asset URL.
const read = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8');

// The console's "Avg XP" is AVG(users.points) over the org's members (backend/routes/organizations.py
// org_analytics; the Overview fallback averages member.xp || member.points). users.points is each member's
// all-time total from lessons, practice challenges and games anywhere on PyMasters, not progress through
// the org's curriculum, so "Avg progress (XP)" would overstate it.
describe('org console points labels', () => {
  it('professional orgs see plain "points per member" wording, not game XP', () => {
    const l = pointsLabels('professional');
    expect(l.avg).toBe('Avg points per member');
    expect(l.top).toBe('Highest points');
    expect(l.unit).toBe('points');
    expect(`${l.avg} ${l.top}`).not.toMatch(/XP|progress/i);
  });

  it('schools keep XP wording', () => {
    expect(pointsLabels('education')).toMatchObject({ avg: 'Avg XP', top: 'Top XP', unit: 'XP' });
  });

  it('every audience gets a hint saying what the number really is', () => {
    for (const mode of ['professional', 'education', 'individual']) {
      expect(pointsLabels(mode).hint).toBe('All-time, from lessons, practice and games');
    }
  });

  it('the console uses the labels instead of hard-coded "Avg XP" / "Top XP"', () => {
    const src = read('../pages/OrgDashboard.jsx');
    expect(src).not.toMatch(/label="(Avg|Top) XP"|<TH>XP<\/TH>|\|\| 0\} XP</);
    expect(src).toMatch(/pointsLabels\(/);
  });
});
