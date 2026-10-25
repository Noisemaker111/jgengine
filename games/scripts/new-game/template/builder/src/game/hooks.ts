import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { wander } from "@jgengine/core/scene/behaviors";
import { defineStore } from "@jgengine/core/store/defineStore";
import type { WorldHookCall, WorldInstanceView, WorldRemoved } from "@jgengine/core/worldModel/worldModel";

import { idea } from "./idea";

/** What the code hooks of the realm's declaration do; they only see the world they are handed. */
const fact = (name: string) => `realm.${name}`;

/** What the player has in hand: the building being placed, the building looked at, the end card seen. */
export const tool = defineStore<{ armed: string | null; selected: string | null; dismissed: boolean }>(`${idea.spec}.tool`, { armed: null, selected: null, dismissed: false });

const walkerId = (instance: string) => `walker-${instance}`;

/** A home becoming ready puts one of its people on the streets around it. */
export function showWalker(ctx: GameContext, instance: WorldInstanceView): void {
  const isHome = instance.kind === "seat" || idea.buildings.find((building) => building.id === instance.kind)?.role === "home";
  if (!isHome || !instance.ready || instance.position === null || ctx.scene.entity.get(walkerId(instance.id)) !== null) return;
  const walkers = idea.people.walkers;
  const index = [...instance.id].reduce((sum, char) => sum + char.charCodeAt(0), 0) % walkers.length;
  const [x, z] = instance.position;
  ctx.scene.entity.spawn(`walker${index + 1}`, { id: walkerId(instance.id), position: [x + 3, ctx.world.groundHeightAt(x + 3, z + 3), z + 3], role: "npc", behaviors: [wander({ radius: 9 })] });
}

export function hideWalker(ctx: GameContext, removed: WorldRemoved): void {
  ctx.scene.entity.despawn(walkerId(removed.id));
  if (tool.read(ctx).selected === removed.id) tool.update(ctx, (state) => ({ ...state, selected: null }));
}

/** The settlement climbed a tier: say so and bank it. */
export function onTier(ctx: GameContext, call: WorldHookCall): void {
  const tier = idea.tiers[call.world.num(fact("tier")) - 1];
  ctx.game.notices.push({ text: `${tier?.label ?? "A new tier"}: new buildings unlocked`, tone: "success" });
  void ctx.game.save?.checkpoint();
}

/** The crowning build stands: the story ends and play goes on. */
export function onCrowned(ctx: GameContext, call: WorldHookCall): void {
  call.world.set(fact("won"), true);
  ctx.game.notices.push({ text: `${idea.name} is complete. Keep building if you like.`, tone: "success" });
  void ctx.game.save?.checkpoint();
}
