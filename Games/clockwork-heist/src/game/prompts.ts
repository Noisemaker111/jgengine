import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { command, gauge, label, type PositionedPrompt } from "@jgengine/core/interaction/proximityPrompt";
import { SIDE_LOOT_DEFS, TREASURE_DEFS } from "./items/treasures";
import { SERVANT_DOOR_SPAWN } from "./entities/player";
import type { HeistState } from "./state/heistState";

export function heistPrompts(ctx: GameContext): PositionedPrompt[] {
  const heist = ctx.game.store.get("heist") as HeistState | undefined;
  if (heist === undefined || heist.status !== "playing") return [];

  const prompts: PositionedPrompt[] = [];
  for (const treasure of TREASURE_DEFS) {
    if (heist.collectedTreasureIds.includes(treasure.id)) continue;
    prompts.push({
      id: `prompt:${treasure.id}`,
      position: { x: treasure.position[0], z: treasure.position[2] },
      priority: 10,
      prompt: { radius: treasure.promptRadius, display: gauge("grabTreasure"), invoke: null },
    });
  }
  for (const loot of SIDE_LOOT_DEFS) {
    if (heist.collectedLootIds.includes(loot.id)) continue;
    prompts.push({
      id: `prompt:${loot.id}`,
      position: { x: loot.position[0], z: loot.position[2] },
      priority: 5,
      prompt: { radius: loot.promptRadius, display: gauge("grabLoot"), invoke: null },
    });
  }
  prompts.push({
    id: "prompt:exit",
    position: { x: SERVANT_DOOR_SPAWN[0], z: SERVANT_DOOR_SPAWN[2] },
    priority: 20,
    prompt: { radius: 2.4, display: label("Slip into the night"), invoke: command("heist.exit") },
  });
  return prompts;
}
