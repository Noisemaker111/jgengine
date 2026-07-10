import { command, keybind, proximityPrompt, type PositionedPrompt } from "@jgengine/core/interaction/proximityPrompt";
import type { GameContext } from "@jgengine/core/runtime/gameContext";

import { spawnAllMobs } from "../ai/mobs";
import { placeCraftingWorld } from "../crafting/systems";
import { DUNGEONS } from "../dungeons/catalog";
import { NPCS } from "../entities/npcs/catalog";
import { INTERACT_RANGE } from "../math/combat";
import { placeGatherNodes } from "../professions/gathering";
import { ZONES } from "./zones";

export const STRONGBOX = "gilded_strongbox";

export function setupWorld(ctx: GameContext): void {
  for (const npc of NPCS) {
    const [x, z] = npc.position;
    ctx.scene.entity.spawn(npc.id, {
      id: `npc:${npc.id}`,
      position: [x, ctx.world.groundHeightAt(x, z), z],
      rotationY: Math.PI,
    });
  }
  for (const zone of ZONES) {
    const x = zone.hub.x + 7;
    const z = zone.hub.z - 7;
    ctx.scene.object.place(STRONGBOX, x, ctx.world.groundHeightAt(x, z), z);
  }
  spawnAllMobs(ctx);
  placeGatherNodes(ctx);
  placeCraftingWorld(ctx);
}

export function dungeonPrompts(ctx: GameContext): readonly PositionedPrompt[] {
  void ctx;
  const prompts: PositionedPrompt[] = [];
  for (const dungeon of DUNGEONS) {
    prompts.push({
      id: `enter:${dungeon.id}`,
      position: { x: dungeon.entrance[0], z: dungeon.entrance[1] },
      priority: 2,
      prompt: proximityPrompt({
        radius: INTERACT_RANGE,
        display: keybind("interact"),
        invoke: command("dungeon.enter", { dungeonId: dungeon.id }),
      }),
    });
    prompts.push({
      id: `exit:${dungeon.id}`,
      position: { x: dungeon.inside[0], z: dungeon.inside[1] },
      prompt: proximityPrompt({
        radius: 3,
        display: keybind("interact"),
        invoke: command("dungeon.exit", { dungeonId: dungeon.id }),
      }),
    });
  }
  return prompts;
}

export function strongboxPrompts(ctx: GameContext): readonly PositionedPrompt[] {
  return ZONES.map((zone) => ({
    id: `bank:${zone.id}`,
    position: { x: zone.hub.x + 7, z: zone.hub.z - 7 },
    prompt: proximityPrompt({
      radius: INTERACT_RANGE,
      display: keybind("interact"),
      invoke: command("bank.open", {}),
    }),
  }));
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
