import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { nearestSupplyDrop, supplyDropPrompts } from "../supplyDrops";

/** What proofs and flows read about supplyDrops: its part of the capture probe. */
export function supplyDropsProbe(ctx: GameContext) {
  const crate = nearestSupplyDrop(ctx);
  return {
    // The nearest supply crate: metres away, metres still to fall (0 once down), 1 once landed; -1, -1, 0 with none.
    crateDistance: crate === null ? -1 : Math.round(crate.distance),
    crateAltitude: crate === null ? -1 : Math.round(crate.altitude),
    crateLanded: crate?.landed === true ? 1 : 0,
    // 1 while a landed crate is in reach, so E would open it.
    atCrate: supplyDropPrompts(ctx).length > 0 ? 1 : 0,
  };
}
