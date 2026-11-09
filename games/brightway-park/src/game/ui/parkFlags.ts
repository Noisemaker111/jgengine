import type { WorldModel } from "@jgengine/core/worldModel/worldModel";

/** The flags every dialog and menu checks: game over, and the blue ribbon still on screen. */
export function parkFlags(w: WorldModel): { gameOver: boolean; ribbon: boolean; won: boolean } {
  const won = w.fact("park.won") === true;
  return { gameOver: w.fact("park.game_over") === true, won, ribbon: won && w.fact("park.win_dismissed") !== true };
}
