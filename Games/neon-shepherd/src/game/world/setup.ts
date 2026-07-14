import type { GameContext } from "@jgengine/core/runtime/gameContext";
import type { BodySnapshot } from "@jgengine/core/scene/bodyBind";
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
  const bodies: BodySnapshot[] = [];
  for (const road of ROADS) {
    road.lanes.forEach((lane, laneIndex) => {
      bodies.push({ id: vehicleEntityId(road.id, laneIndex), kind: lane.vehicle, position: [9999, 0, road.z], role: "prop" });
    });
  }
  ctx.scene.entity.bind("vehicles").sync(bodies);
}

export function resetCreatureEntities(ctx: GameContext): void {
  const groundY = ctx.world.groundHeightAt(0, PARK_Z);
  ctx.scene.entity.bind("creatures").sync(
    CREATURES.map((creature): BodySnapshot => ({
      id: creature.id,
      kind: creature.id,
      position: [0, groundY, PARK_Z],
      role: "npc",
    })),
  );
}
