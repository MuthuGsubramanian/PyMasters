// Registry of playable games on the client. Ids match backend/games/catalog.py.
// Games without a component yet are shown as "coming soon" on the Play page.
import { lazy } from 'react';
import { Boxes, Flag, Mountain, ScatterChart, Terminal, Timer } from 'lucide-react';

export const GAME_COMPONENTS = {
  output_oracle: lazy(() => import('./output-oracle/Game.jsx')),
  gradient_golf: lazy(() => import('./gradient-golf/Game.jsx')),
  bug_hunt: lazy(() => import('./bug-hunt/Game.jsx')),
  shape_sorter: lazy(() => import('./shape-sorter/Game.jsx')),
};

export const GAME_ICONS = {
  output_oracle: Terminal,
  bug_hunt: Flag,
  shape_sorter: Boxes,
  big_o_sprint: Timer,
  gradient_golf: Mountain,
  overfit_detective: ScatterChart,
};

export function hasComponent(gameId) {
  return Boolean(GAME_COMPONENTS[gameId]);
}
