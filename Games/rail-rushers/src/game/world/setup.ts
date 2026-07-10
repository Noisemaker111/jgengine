import type { GameContext } from "@jgengine/core/runtime/gameContext";

import { HANDCAR_ENTITY, trainCatalogId } from "../entities/catalog";
import { JUNCTION_STAND_OBJECT, STATION_HOUSE_OBJECT } from "../objects/catalog";
import { JUNCTION_NODE_IDS, RAIL_NODES } from "../rail/network";
import { TRAINS } from "../rail/schedule";
import { generateTracksideProps } from "./dressing";

function placeIdempotent(
  ctx: GameContext,
  catalogId: string,
  x: number,
  z: number,
  instanceId: string,
  rotationY = 0,
  scale?: number,
): void {
  ctx.scene.object.remove(instanceId);
  ctx.scene.object.place(catalogId, x, ctx.world.groundHeightAt(x, z), z, {
    instanceId,
    rotation: rotationY,
    visual: scale === undefined ? undefined : { scale },
  });
}

export function setupWorld(ctx: GameContext): void {
  for (const nodeId of JUNCTION_NODE_IDS) {
    const node = RAIL_NODES.find((n) => n.id === nodeId)!;
    placeIdempotent(ctx, JUNCTION_STAND_OBJECT, node.position[0], node.position[1], `stand-${nodeId}`);
  }

  for (const node of RAIL_NODES) {
    if (node.kind !== "station") continue;
    placeIdempotent(ctx, STATION_HOUSE_OBJECT, node.position[0] + 8, node.position[1], `house-${node.id}`);
  }

  for (const prop of generateTracksideProps()) {
    placeIdempotent(ctx, prop.catalogId, prop.x, prop.z, prop.instanceId, prop.rotationY, prop.scale);
  }
}

export function spawnMovers(ctx: GameContext, playerPosition: readonly [number, number, number], playerHeading: number): void {
  ctx.scene.entity.despawn(ctx.player.userId);
  ctx.scene.entity.spawn(HANDCAR_ENTITY, {
    id: ctx.player.userId,
    position: playerPosition,
    rotationY: playerHeading,
    role: "player",
  });

  for (const train of TRAINS) {
    ctx.scene.entity.despawn(train.id);
    ctx.scene.entity.spawn(trainCatalogId(train.id), {
      id: train.id,
      position: playerPosition,
      rotationY: 0,
      role: "npc",
    });
  }
}
