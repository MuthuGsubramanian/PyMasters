/**
 * Labels for the org console's points stats.
 *
 * The number is AVG / MAX of users.points over the org's members: each member's all-time total from lessons,
 * practice challenges and games anywhere on PyMasters (not progress through the org's own curriculum).
 * Professional orgs (enterprise, training centre) get plain "points" wording; schools keep XP.
 */
const HINT = 'All-time, from lessons, practice and games';

export function pointsLabels(mode) {
    if (mode === 'professional') return { avg: 'Avg points per member', top: 'Highest points', unit: 'points', hint: HINT };
    return { avg: 'Avg XP', top: 'Top XP', unit: 'XP', hint: HINT };
}
