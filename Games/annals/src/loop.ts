import type { GameContext } from "@jgengine/core/runtime/gameContext";

import { isCaravan, scheduleCaravans, tickCaravans } from "./game/caravans";
import { YEAR_SECONDS } from "./game/calendar";
import { record, resetChronicle } from "./game/chronicle";
import { ageNotablesYearly, initPeople, monarch } from "./game/people";
import { initPools, scheduleSim } from "./game/sim";

interface FocusCommandInput {
  point: { x: number; y: number; z: number };
  entity: string | null;
  object: string | null;
}

export function onInit(ctx: GameContext): void {
  ctx.game.commands.define("pauseToggle", {
    apply(state) {
      state.time.toggle();
      return state;
    },
  });
  ctx.game.commands.define("cycleSpeed", {
    apply(state) {
      state.time.cycleSpeed();
      return state;
    },
  });
  ctx.game.commands.define<FocusCommandInput>("annals.focus", {
    apply(state, input) {
      const userId = state.player.userId;
      if (input.entity !== null && isCaravan(input.entity)) {
        state.player.possession.own(userId, input.entity);
        state.player.possession.possess(userId, input.entity);
      } else {
        const active = state.player.possession.active(userId);
        if (active !== userId) state.player.possession.disown(userId, active);
      }
      return state;
    },
  });

  resetChronicle();
  initPeople();
  initPools();
  scheduleSim(ctx);
  scheduleCaravans(ctx);
  ctx.time.every(YEAR_SECONDS, () => ageNotablesYearly(ctx));

  const ruler = monarch();
  if (ruler !== undefined) {
    record(ctx, "coronation", `The Annals open in the reign of ${ruler.name}, ${ruler.epithet}.`);
  }
}

export function onNewPlayer(_ctx: GameContext): void {}

export function onTick(ctx: GameContext, dt: number): void {
  tickCaravans(ctx, dt);
}
