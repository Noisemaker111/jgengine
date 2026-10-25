import type { GameContext } from "@jgengine/core/runtime/gameContext";

import { parkPlayer, raceSystem } from "./game/race";
import { career } from "./game/spec";

/** The rules tick here: the career's world spec, then the race loop. */
export const systems = [career.system, raceSystem];

/** The player's car waits on the grid, in the garage. */
export function onNewPlayer(ctx: GameContext): void {
  parkPlayer(ctx);
}
