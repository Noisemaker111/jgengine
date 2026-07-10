import { command, keybind, proximityPrompt, type PositionedPrompt } from "@jgengine/core/interaction/proximityPrompt";
import type { GameContext } from "@jgengine/core/runtime/gameContext";

import { spawnAllMobs } from "../ai/mobs";
import { NPCS } from "../entities/npcs/catalog";
import { INTERACT_RANGE } from "../math/combat";
import { ZONES } from "./zones";

export function setupWorld(ctx: GameContext): void {
  for (const npc of NPCS) {
    const [x, z] = npc.position;
    ctx.scene.entity.spawn(npc.id, {
      id: `npc:${npc.id}`,
      position: [x, ctx.world.groundHeightAt(x, z), z],
      rotationY: Math.PI,
    });
  }
  spawnAllMobs(ctx);
}

export function npcPrompts(ctx: GameContext): readonly PositionedPrompt[] {
  const prompts: PositionedPrompt[] = [];
  for (const npc of NPCS) {
    const entity = ctx.scene.entity.get(`npc:${npc.id}`);
    if (entity === null || npc.dialogueId === undefined) continue;
    prompts.push({
      id: `talk:${npc.id}`,
      position: { x: entity.position[0], z: entity.position[2] },
      prompt: proximityPrompt({
        radius: INTERACT_RANGE,
        display: keybind("interact"),
        invoke: command("dialogue.open", { npcId: npc.id }),
      }),
    });
  }
  return prompts;
}

export function graveyardOf(x: number, z: number): readonly [number, number] {
  let best: readonly [number, number] = [ZONES[0].graveyard.x, ZONES[0].graveyard.z];
  let bestDist = Number.POSITIVE_INFINITY;
  for (const zone of ZONES) {
    const dist = Math.hypot(x - zone.graveyard.x, z - zone.graveyard.z);
    if (dist < bestDist) {
      bestDist = dist;
      best = [zone.graveyard.x, zone.graveyard.z];
    }
  }
  return best;
}
