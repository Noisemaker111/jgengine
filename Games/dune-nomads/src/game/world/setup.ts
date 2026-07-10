import type { GameContext } from "@jgengine/core/runtime/gameContext";

import { CAMEL_LEAD_KIND, CAMEL_PACK_KIND, CAMEL_RIVAL_KIND } from "../entities/kinds";
import { RIVAL_RACER_ID } from "../race/track";
import { DUNE_SEED, terrainField } from "../../world";
import { generateProps } from "./props";
import { SOUTH_GATE } from "./sites";

export const PACK_ENTITY_IDS: readonly string[] = ["pack-0", "pack-1", "pack-2", "pack-3"];

export function placeDuneProps(ctx: GameContext): void {
  for (const prop of generateProps(DUNE_SEED)) {
    const y = terrainField.sampleHeight(prop.x, prop.z);
    ctx.scene.object.place(prop.kind, prop.x, y, prop.z, {
      instanceId: prop.id,
      rotation: prop.rotationY,
      visual: { scale: prop.scale },
    });
  }
}

export function spawnCaravan(ctx: GameContext, heading: number): void {
  const y = terrainField.sampleHeight(SOUTH_GATE.x, SOUTH_GATE.z);
  const position: readonly [number, number, number] = [SOUTH_GATE.x, y, SOUTH_GATE.z];

  ctx.scene.entity.spawn(CAMEL_LEAD_KIND, {
    id: ctx.player.userId,
    position,
    rotationY: heading,
    role: "player",
  });

  for (const id of PACK_ENTITY_IDS) {
    ctx.scene.entity.spawn(CAMEL_PACK_KIND, { id, position, rotationY: heading, role: "npc" });
  }

  ctx.scene.entity.spawn(CAMEL_RIVAL_KIND, { id: RIVAL_RACER_ID, position, rotationY: heading, role: "npc" });
}
