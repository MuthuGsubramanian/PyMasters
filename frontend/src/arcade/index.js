// Registry of arcade games on the client. Ids match backend/arcade/unlocks.py GAMES.
import { lazy } from 'react';
import { Crosshair, Dices, Worm } from 'lucide-react';

export const ARCADE_COMPONENTS = {
  snakes_ladders: lazy(() => import('./snakes-ladders/Game.jsx')),
  linked_snake: lazy(() => import('./linked-snake/Game.jsx')),
  code_slingshot: lazy(() => import('./code-slingshot/Game.jsx')),
};

export const ARCADE_ICONS = {
  snakes_ladders: Dices,
  linked_snake: Worm,
  code_slingshot: Crosshair,
};

export const ARCADE_TITLES = {
  snakes_ladders: 'Snakes & Ladders',
  linked_snake: 'Linked Snake',
  code_slingshot: 'Code Slingshot',
};

export const BOARD_TITLES = {
  variables: 'Variables', lists: 'Lists', dicts: 'Dicts', loops: 'Loops', conditionals: 'Conditionals',
  functions: 'Functions', containers: 'Containers', big_o: 'Big-O & Sorting',
};

export function hasArcadeComponent(gameId) {
  return Boolean(ARCADE_COMPONENTS[gameId]);
}
