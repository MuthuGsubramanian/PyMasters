// Client-side mirror of the level rules in backend/games/engine.py. The server
// is the authority on scores and XP; these only drive immediate UI feedback.

export const LEVEL_UP_ACCURACY = 0.8
export const LEVEL_DOWN_ACCURACY = 0.4
export const MAX_LEVEL = 6

export function accuracy(correct, total) {
  return total > 0 ? correct / total : 0
}

export function nextLevel(level, acc) {
  if (acc >= LEVEL_UP_ACCURACY) return Math.min(MAX_LEVEL, level + 1)
  if (acc < LEVEL_DOWN_ACCURACY) return Math.max(1, level - 1)
  return level
}

export function medianMs(itemMs) {
  const vals = Object.values(itemMs || {}).filter((v) => typeof v === 'number' && v >= 0).sort((a, b) => a - b)
  if (!vals.length) return null
  const mid = vals.length >> 1
  return vals.length % 2 ? vals[mid] : (vals[mid - 1] + vals[mid]) / 2
}
