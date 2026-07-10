import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { PARK_Z } from "../constants";
import { CREATURES } from "../entities/creatures/catalog";
import { PROP_PLACEMENTS } from "../objects/catalog";
import { ROADS } from "../roads/catalog";

export function placeProps(ctx: GameContext): void {
  for (const prop of PROP_PLACEMENTS) {
    const y = ctx.world.groundHeightAt(prop.x, prop.z);
    ctx.scene.object.place(prop.type, prop.x, y, prop.z, {
      instanceId: prop.instanceId,
      rotation: prop.rotationY,
    });
  }
}

export function vehicleEntityId(roadId: string, laneIndex: number): string {
  return `vehicle-${roadId}-${laneIndex}`;
}

export function spawnVehiclePool(ctx: GameContext): void {
  for (const road of ROADS) {
    road.lanes.forEach((lane, laneIndex) => {
      const id = vehicleEntityId(road.id, laneIndex);
      if (ctx.scene.entity.get(id) !== null) return;
      ctx.scene.entity.spawn(lane.vehicle, {
        id,
        position: [9999, 0, road.z],
        role: "prop",
      });
    });
  }
}

export function resetCreatureEntities(ctx: GameContext): void {
  const groundY = ctx.world.groundHeightAt(0, PARK_Z);
  for (const creature of CREATURES) {
    if (ctx.scene.entity.get(creature.id) !== null) ctx.scene.entity.despawn(creature.id);
    ctx.scene.entity.spawn(creature.id, {
      id: creature.id,
      position: [0, groundY, PARK_Z],
      role: "npc",
    });
  }
}
