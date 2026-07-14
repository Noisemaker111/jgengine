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

  ctx.scene.entity.bind("caravan").sync([
    { id: ctx.player.userId, kind: CAMEL_LEAD_KIND, position, rotationY: heading, role: "player" },
    ...PACK_ENTITY_IDS.map((id) => ({ id, kind: CAMEL_PACK_KIND, position, rotationY: heading, role: "npc" as const })),
    { id: RIVAL_RACER_ID, kind: CAMEL_RIVAL_KIND, position, rotationY: heading, role: "npc" as const },
  ]);
}
