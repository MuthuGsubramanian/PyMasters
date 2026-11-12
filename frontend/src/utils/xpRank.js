/**
 * Canonical PyMasters XP Rank system shared across Layout, Dashboard, and Profile.
 *
 * Rank tiers:
 * - Novice:       0 – 99 XP
 * - Apprentice:   100 – 499 XP
 * - Intermediate: 500 – 999 XP
 * - Advanced:     1,000 – 1,999 XP
 * - Expert:       2,000 – 4,999 XP
 * - Master:       5,000+ XP
 */

export const XP_RANK_BANDS = [
  {
    rank: 'Master',
    level: 6,
    floor: 5000,
    next: null,
    color: 'from-amber-400 to-yellow-500',
    badgeBg: 'bg-amber-500/10',
    badgeText: 'text-amber-700 dark:text-amber-300',
    badgeBorder: 'border-amber-500/30',
  },
  {
    rank: 'Expert',
    level: 5,
    floor: 2000,
    next: 5000,
    color: 'from-purple-400 to-violet-500',
    badgeBg: 'bg-purple-500/10',
    badgeText: 'text-purple-700 dark:text-purple-300',
    badgeBorder: 'border-purple-500/30',
  },
  {
    rank: 'Advanced',
    level: 4,
    floor: 1000,
    next: 2000,
    color: 'from-blue-400 to-cyan-500',
    badgeBg: 'bg-cyan-500/10',
    badgeText: 'text-cyan-700 dark:text-cyan-300',
    badgeBorder: 'border-cyan-500/30',
  },
  {
    rank: 'Intermediate',
    level: 3,
    floor: 500,
    next: 1000,
    color: 'from-green-400 to-emerald-500',
    badgeBg: 'bg-emerald-500/10',
    badgeText: 'text-emerald-700 dark:text-emerald-300',
    badgeBorder: 'border-emerald-500/30',
  },
  {
    rank: 'Apprentice',
    level: 2,
    floor: 100,
    next: 500,
    color: 'from-teal-400 to-cyan-500',
    badgeBg: 'bg-teal-500/10',
    badgeText: 'text-teal-700 dark:text-teal-300',
    badgeBorder: 'border-teal-500/30',
  },
  {
    rank: 'Novice',
    level: 1,
    floor: 0,
    next: 100,
    color: 'from-slate-400 to-slate-500',
    badgeBg: 'bg-accent-subtle',
    badgeText: 'text-accent-primary',
    badgeBorder: 'border-border-strong',
  },
];

export function getRankInfo(xp = 0) {
  const safeXp = Number.isFinite(Number(xp)) ? Math.max(0, Number(xp)) : 0;
  return XP_RANK_BANDS.find((band) => safeXp >= band.floor) || XP_RANK_BANDS[XP_RANK_BANDS.length - 1];
}

export function rankProgressPct(xp = 0) {
  const safeXp = Number.isFinite(Number(xp)) ? Math.max(0, Number(xp)) : 0;
  const band = getRankInfo(safeXp);
  if (band.next === null) return 100;
  return Math.min(100, Math.max(0, Math.round(((safeXp - band.floor) / Math.max(1, band.next - band.floor)) * 100)));
}

export function formatRankLabel(xp = 0, audienceMode = 'individual') {
  const info = getRankInfo(xp);
  if (audienceMode === 'education') {
    return `Level ${info.level}`;
  }
  return info.rank;
}
