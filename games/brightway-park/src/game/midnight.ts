import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { perContext } from "@jgengine/core/runtime/perContext";

import { DAY_LENGTH } from "./catalog";
import { park } from "./park";
import { savePark } from "./persistence";
import { closeDay } from "./sim/economy";

/**
 * Midnight is a simulation event at the next whole day on the clock. Arming it again (after a load
 * or a fresh park rewinds the clock) retires the chain armed before, so a day never closes twice.
 */
const chain = perContext(() => ({ generation: 0 }));

export function armMidnight(ctx: GameContext): void {
  const generation = ++chain(ctx).generation;
  schedule(ctx, generation);
}

function schedule(ctx: GameContext, generation: number): void {
  const midnight = (Math.floor(ctx.time.now() / DAY_LENGTH) + 1) * DAY_LENGTH;
  ctx.time.at(midnight, () => {
    if (chain(ctx).generation !== generation) return;
    const over = () => park.of(ctx).fact("park.game_over") === true;
    if (!over()) closeDay(ctx);
    savePark(ctx);
    if (!over()) schedule(ctx, generation);
  });
}
