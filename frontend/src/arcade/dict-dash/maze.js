// 19×13 maze: '#' wall, '.' pellet, 'o' power pellet (corners carry the answers), 'P' player,
// 'G' ghost pen, ' ' open floor (row 6 is a side tunnel).
export const MAZE = [
  '###################',
  '#o.......#.......o#',
  '#.##.###.#.###.##.#',
  '#.................#',
  '#.##.#.#####.#.##.#',
  '#....#.......#....#',
  ' ....##.#G#.##.... ',
  '#....#.......#....#',
  '#.##.#.#####.#.##.#',
  '#.................#',
  '#.##.###.#.###.##.#',
  '#o.......P.......o#',
  '###################',
];

export const LEVEL_PALETTES = [
  { wall: '#2563eb', glow: '#60a5fa', bg: '#030712', pellet: '#fde68a' },
  { wall: '#7c3aed', glow: '#c084fc', bg: '#0b0618', pellet: '#fbcfe8' },
  { wall: '#059669', glow: '#34d399', bg: '#02110c', pellet: '#fef08a' },
  { wall: '#dc2626', glow: '#f87171', bg: '#140404', pellet: '#fde68a' },
];
