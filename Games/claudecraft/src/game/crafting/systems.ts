import { evaluateSkillCheck, type SkillCheckConfig } from "@jgengine/core/interaction/skillCheck";
import { command, keybind, proximityPrompt, type PositionedPrompt } from "@jgengine/core/interaction/proximityPrompt";
import { seededRng } from "@jgengine/core/random/rng";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { perContext } from "@jgengine/core/runtime/perContext";

import { FISH_TABLE, FISHING_SPOTS, RECIPES, RECIPE_SKILL } from "./catalog";
import { INTERACT_RANGE } from "../math/combat";
import { professionsOf } from "../professions/gathering";
import { fishingStore, professionsStore } from "../session/stores";
import { ZONES } from "../world/zones";

export { RECIPES, RECIPE_SKILL };

export const FORGE = "hub_forge";
export const FISHING_SPOT = "fishing_spot";

export const FISHING_CHECK: SkillCheckConfig = {
  trackWidth: 1,
  zone: { start: 0.38, end: 0.62 },
  markerPeriod: 1.6,
  window: 6,
};

const fishingSessionsOf = perContext(() => new Map<string, number>());
const fishRoll = seededRng("claudecraft-fishing");

export function placeCraftingWorld(ctx: GameContext): void {
  for (const zone of ZONES) {
    const x = zone.hub.x - 8;
    const z = zone.hub.z + 8;
    ctx.scene.object.place(FORGE, x, ctx.world.groundHeightAt(x, z), z);
  }
  for (const spot of FISHING_SPOTS) {
    const [x, z] = spot.position;
    ctx.scene.object.place(FISHING_SPOT, x, ctx.world.groundHeightAt(x, z), z);
  }
}

export function craftingPrompts(ctx: GameContext): readonly PositionedPrompt[] {
  void ctx;
  const prompts: PositionedPrompt[] = ZONES.map((zone) => ({
    id: `forge:${zone.id}`,
    position: { x: zone.hub.x - 8, z: zone.hub.z + 8 },
    prompt: proximityPrompt({
      radius: INTERACT_RANGE,
      display: keybind("interact"),
      invoke: command("craft.open", {}),
    }),
  }));
  for (const spot of FISHING_SPOTS) {
    prompts.push({
      id: `fish:${spot.id}`,
      position: { x: spot.position[0], z: spot.position[1] },
      prompt: proximityPrompt({
        radius: INTERACT_RANGE,
        display: keybind("interact"),
        invoke: command("fishing.cast", {}),
      }),
    });
  }
  return prompts;
}

export function craftRecipe(ctx: GameContext, userId: string, recipeId: string): void {
  const recipe = RECIPES.find((entry) => entry.id === recipeId);
  if (recipe === undefined) return;
  const say = (text: string) => ctx.scene.entity.floatText({ instanceId: userId, text, kind: "info" });
  const skills = professionsOf(ctx, userId);
  const skillReq = RECIPE_SKILL[recipeId] ?? 0;
  if (skills.crafting < skillReq) {
    say(`Requires crafting ${skillReq}`);
    return;
  }
  for (const input of recipe.inputs) {
    if (ctx.player.inventory.count("bags", input.itemId) < input.count) {
      say(`Missing ${input.itemId.replaceAll("_", " ")}`);
      return;
    }
  }
  for (const input of recipe.inputs) ctx.player.inventory.take("bags", input.itemId, input.count);
  for (const output of recipe.outputs) {
    const rejection = ctx.player.inventory.put("bags", output.itemId, output.count);
    if (rejection !== null) say("Bags are full");
  }
  if (skills.crafting < Math.min(300, skillReq + 40)) {
    professionsStore.write(ctx, userId, { ...skills, crafting: skills.crafting + 1 });
  }
  say("Crafted!");
}

export function castFishing(ctx: GameContext, userId: string): void {
  const now = ctx.time.now();
  const fishingSessions = fishingSessionsOf(ctx);
  const startedAt = fishingSessions.get(userId);
  if (startedAt === undefined) {
    fishingSessions.set(userId, now);
    fishingStore.write(ctx, userId, { startedAt: now });
    return;
  }
  fishingSessions.delete(userId);
  fishingStore.clear(ctx, userId);
  const result = evaluateSkillCheck(FISHING_CHECK, now - startedAt);
  const say = (text: string) => ctx.scene.entity.floatText({ instanceId: userId, text, kind: "info" });
  if (!result.success) {
    say(result.timedOut ? "The fish got away..." : "It slipped the hook!");
    return;
  }
  const skills = professionsOf(ctx, userId);
  const eligible = FISH_TABLE.filter((entry) => entry.minSkill <= skills.fishing);
  const totalWeight = eligible.reduce((sum, entry) => sum + entry.weight, 0);
  let pick = fishRoll() * totalWeight;
  let caught = eligible[0];
  for (const entry of eligible) {
    pick -= entry.weight;
    if (pick <= 0) {
      caught = entry;
      break;
    }
  }
  if (caught === undefined) return;
  ctx.player.inventory.put("bags", caught.itemId, 1);
  say(`Caught ${caught.itemId.replaceAll("_", " ")}!`);
  if (skills.fishing < 300) {
    professionsStore.write(ctx, userId, { ...skills, fishing: skills.fishing + 1 });
  }
}
