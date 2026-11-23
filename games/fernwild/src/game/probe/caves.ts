import type { GameContext } from "@jgengine/core/runtime/gameContext";
import {
  cavePrompts,
  cavesView,
} from "../caves";

/** What proofs and flows read about caves: its part of the capture probe. */
export function cavesProbe(ctx: GameContext) {
  const caves = cavesView(ctx);
  return {
    // Metres into the cave the survivor stands in, to a decimetre; -1 outside every cave.
    caveDepth: caves.inside === null ? -1 : Math.round(caves.inside.depth * 10) / 10,
    pedestals: caves.caves.filter((cave) => cave.artifact !== null).length,
    // 1 while an artifact's pedestal is in reach, so E would take it.
    atPedestal: cavePrompts(ctx).length > 0 ? 1 : 0,
  };
}
