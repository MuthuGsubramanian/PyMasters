// Registry of arcade games on the client. Ids match backend/arcade/unlocks.py GAMES.
import { lazy } from 'react';
import { Car, Crosshair, Dices, Ghost, Rocket, Worm, Zap } from 'lucide-react';

export const ARCADE_COMPONENTS = {
  snakes_ladders: lazy(() => import('./snakes-ladders/Game.jsx')),
  linked_snake: lazy(() => import('./linked-snake/Game.jsx')),
  code_slingshot: lazy(() => import('./code-slingshot/Game.jsx')),
  loop_runner: lazy(() => import('./loop-runner/Game.jsx')),
  bug_invaders: lazy(() => import('./bug-invaders/Game.jsx')),
  dict_dash: lazy(() => import('./dict-dash/Game.jsx')),
  big_o_grand_prix: lazy(() => import('./grand-prix/Game.jsx')),
};

export const ARCADE_ICONS = {
  snakes_ladders: Dices,
  linked_snake: Worm,
  code_slingshot: Crosshair,
  loop_runner: Zap,
  bug_invaders: Rocket,
  dict_dash: Ghost,
  big_o_grand_prix: Car,
};

export const ARCADE_TITLES = {
  snakes_ladders: 'Snakes & Ladders',
  linked_snake: 'Linked Snake',
  code_slingshot: 'Code Slingshot',
  loop_runner: 'Loop Runner',
  bug_invaders: 'Bug Invaders',
  dict_dash: 'Dict Dash',
  big_o_grand_prix: 'Big-O Grand Prix',
};

export const BOARD_TITLES = {
  variables: 'Variables', lists: 'Lists', dicts: 'Dicts', loops: 'Loops', conditionals: 'Conditionals',
  functions: 'Functions', containers: 'Containers', big_o: 'Big-O & Sorting',
};

export function hasArcadeComponent(gameId) {
  return Boolean(ARCADE_COMPONENTS[gameId]);
}
