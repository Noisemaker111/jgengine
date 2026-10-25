import { useGameStore } from "@jgengine/react/hooks";
import { useGameContext } from "@jgengine/react/provider";
import type { WorldModel } from "@jgengine/core/worldModel/worldModel";

import { park } from "../park";

/** The park's world for a HUD: re-renders whenever the `brightway.world` store changes. */
export function usePark(): WorldModel {
  const ctx = useGameContext();
  useGameStore((live) => park.store.read(live));
  return park.of(ctx);
}

/** The flags every dialog and menu checks: game over, and the blue ribbon still on screen. */
export function parkFlags(w: WorldModel): { gameOver: boolean; ribbon: boolean; won: boolean } {
  const won = w.fact("park.won") === true;
  return { gameOver: w.fact("park.game_over") === true, won, ribbon: won && w.fact("park.win_dismissed") !== true };
}
