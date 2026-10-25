import { setGamePhase } from "@jgengine/core/game/gamePhase";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { defineStore } from "@jgengine/core/store/defineStore";
import type { WorldHookCall } from "@jgengine/core/worldModel/worldModel";

import { idea } from "./idea";

/** What the code hooks of the hold's declaration do; they only see the world they are handed. */
const fact = (name: string) => `hold.${name}`;

/** What the player has in hand: the tower being placed, the tower looked at. */
export const tool = defineStore<{ armed: string | null; selected: string | null }>(`${idea.spec}.tool`, { armed: null, selected: null });

/** The last life is gone: the run is over. */
export function onFallen(ctx: GameContext, call: WorldHookCall): void {
  call.world.set(fact("lost"), true);
  ctx.game.notices.push({ text: `${idea.core.label} has fallen`, tone: "deny" });
  setGamePhase(ctx, "ended");
}

/** Every wave held: the run is won. */
export function onVictory(ctx: GameContext, call: WorldHookCall): void {
  call.world.set(fact("won"), true);
  ctx.game.notices.push({ text: `${idea.core.label} holds. ${idea.foe} are broken.`, tone: "success" });
  setGamePhase(ctx, "ended");
}

/** A tower finished building: a little flourish where it stands. */
export function onBuilt(ctx: GameContext, call: WorldHookCall): void {
  if (call.target === null) return;
  ctx.scene.entity.vfx({ preset: "shockwave", from: call.target, radius: 2.5 });
}
