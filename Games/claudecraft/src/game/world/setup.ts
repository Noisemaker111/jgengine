import { command, keybind, proximityPrompt, type PositionedPrompt } from "@jgengine/core/interaction/proximityPrompt";
import type { GameContext } from "@jgengine/core/runtime/gameContext";

import { spawnAllMobs } from "../ai/mobs";
import { AUCTION_BOARD, auctionPrompts, placeAuctionBoard } from "../auction/systems";
import { placeCraftingWorld } from "../crafting/systems";
import { DELVES } from "../delves/catalog";
import { DELVE_PORTAL, placeDelveWorld } from "../delves/systems";
import { DUNGEONS } from "../dungeons/catalog";
import { NPCS } from "../entities/npcs/catalog";
import { MAILBOX, placeMailboxes } from "../mail/systems";
import { INTERACT_RANGE } from "../math/combat";
import { placeValeCup, VALE_CUP_ENTRANCE, VALE_CUP_STADIUM } from "../minigames/valeCup";
import { placeYumiShrine, YUMI_ENTRANCE, YUMI_SHRINE } from "../minigames/yumi";
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
  placeMailboxes(ctx);
  placeAuctionBoard(ctx);
  placeDelveWorld(ctx);
  placeValeCup(ctx);
  placeYumiShrine(ctx);
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

export function contentPrompts(ctx: GameContext): readonly PositionedPrompt[] {
  void ctx;
  const prompts: PositionedPrompt[] = [];
  for (const zone of ZONES) {
    prompts.push({
      id: `mail:${zone.id}`,
      position: { x: zone.hub.x - 7, z: zone.hub.z - 7 },
      prompt: proximityPrompt({
        radius: INTERACT_RANGE,
        display: keybind("interact"),
        invoke: command("mail.open", {}),
      }),
    });
  }
  for (const delve of DELVES) {
    prompts.push({
      id: `delve:${delve.id}`,
      position: { x: delve.entrance[0], z: delve.entrance[1] },
      priority: 2,
      prompt: proximityPrompt({
        radius: INTERACT_RANGE,
        display: keybind("interact"),
        invoke: command("delve.enter", { delveId: delve.id, tier: "normal" }),
      }),
    });
  }
  prompts.push({
    id: "valecup:enter",
    position: { x: VALE_CUP_ENTRANCE[0], z: VALE_CUP_ENTRANCE[1] },
    prompt: proximityPrompt({
      radius: INTERACT_RANGE,
      display: keybind("interact"),
      invoke: command("valecup.start", { wager: 0 }),
    }),
  });
  prompts.push({
    id: "yumi:enter",
    position: { x: YUMI_ENTRANCE[0], z: YUMI_ENTRANCE[1] },
    prompt: proximityPrompt({
      radius: INTERACT_RANGE,
      display: keybind("interact"),
      invoke: command("yumi.start", {}),
    }),
  });
  prompts.push(...auctionPrompts(ctx));
  return prompts;
}

export { AUCTION_BOARD, DELVE_PORTAL, MAILBOX, VALE_CUP_STADIUM, YUMI_SHRINE };

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
