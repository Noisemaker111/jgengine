import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { perContext } from "@jgengine/core/runtime/perContext";

import { DAY_LENGTH } from "./catalog";
import { park } from "./park";
import { savePark } from "./persistence";
import { closeDay } from "./sim/economy";

/**
 * Midnight is a clock event at the next whole day, re-armed from each midnight so it stays on the
 * day boundary. Arming it again (after a load or a fresh park rewinds the clock) cancels the timer
 * armed before, so a day never closes twice.
 */
const armed = perContext(() => ({ cancel: () => {} }));

export function armMidnight(ctx: GameContext): void {
  const slot = armed(ctx);
  slot.cancel();
  const nextMidnight = (Math.floor(ctx.time.now() / DAY_LENGTH) + 1) * DAY_LENGTH;
  slot.cancel = ctx.time.at(nextMidnight, () => {
    const over = () => park.of(ctx).fact("park.game_over") === true;
    if (!over()) closeDay(ctx);
    savePark(ctx);
    if (!over()) armMidnight(ctx);
  });
}
