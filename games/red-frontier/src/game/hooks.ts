import { setGamePhase } from "@jgengine/core/game/gamePhase";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { defineStore } from "@jgengine/core/store/defineStore";
import type { WorldHookCall } from "@jgengine/core/worldModel/worldModel";

import { idea } from "./idea";

/** What the code hooks of the colony's declaration do; they only see the world they are handed. */
const fact = (name: string) => `colony.${name}`;

/**
 * What the player has in hand and in view: the structure being placed, how many colonists are
 * selected (the shell owns the selection; this mirrors its size so the HUD redraws) and the end card.
 */
export const tool = defineStore<{ armed: string | null; selected: number; dismissed: boolean }>(`${idea.spec}.tool`, { armed: null, selected: 0, dismissed: false });

/** The winning build stands. */
export function onCrowned(ctx: GameContext, call: WorldHookCall): void {
  call.world.set(fact("won"), true);
  ctx.game.notices.push({ text: `${idea.name} will last. Keep going if you like.`, tone: "success" });
  void ctx.game.save?.checkpoint();
}

/** The last colonist is gone. */
export function onFallen(ctx: GameContext, call: WorldHookCall): void {
  call.world.set(fact("lost"), true);
  ctx.game.notices.push({ text: `${idea.name} is lost`, tone: "deny" });
  setGamePhase(ctx, "ended");
}

/** A structure finished: a little flourish where it stands. */
export function onBuilt(ctx: GameContext, call: WorldHookCall): void {
  if (call.target !== null) ctx.scene.entity.vfx({ preset: "shockwave", from: call.target, radius: 3 });
}
