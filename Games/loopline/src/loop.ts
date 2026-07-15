import type { GameLoop } from "@jgengine/core/game/defineGame";
import type { GameContext } from "@jgengine/core/runtime/gameContext";

import { CLOSE_FRACTION, DAY_LENGTH, OPEN_FRACTION } from "./game/catalog";
import { pushToast, session } from "./game/session";
import { setupWorld } from "./game/world/setup";
import { currentMetrics, economyDayTick, tickRating } from "./game/sim/economy";
import { spawnGuests, tickGuests } from "./game/sim/guests";

function updateOpenState(ctx: GameContext): void {
  const fraction = ctx.time.calendar().dayFraction;
  const wantOpen = !session.gameOver && fraction >= OPEN_FRACTION && fraction <= CLOSE_FRACTION;
  if (wantOpen === session.open) return;
  session.open = wantOpen;
  pushToast(
    wantOpen ? `Day ${session.day} — gates open!` : "Gates closed for the night",
    "info",
    ctx.time.now(),
  );
}

export const loop: GameLoop<GameContext> = {
  onInit(ctx) {
    setupWorld(ctx);
    ctx.time.every(DAY_LENGTH, () => economyDayTick(ctx));
  },
  onNewPlayer() {},
  onTick(ctx, dt) {
    if (session.gameOver) return;
    updateOpenState(ctx);
    const metrics = currentMetrics();
    spawnGuests(ctx, dt, metrics.totalAppeal);
    tickGuests(ctx, dt, metrics.tracks);
    tickRating(ctx, dt, metrics);
  },
};
