import type { GameContext } from "@jgengine/core/runtime/gameContext";
import type { EntityPosition } from "@jgengine/core/scene/entityStore";
import { npc_marshal } from "../entities/npcs/catalog";
import { kobold_elite, forest_wolf, kobold_grunt } from "../entities/enemies/catalog";
import { town_square } from "./zones";

export const TOWN_SPAWN: EntityPosition = [0, 0, 0];

export interface MobSpawnPoint {
  catalogId: string;
  position: EntityPosition;
}

export const MOB_SPAWNS: MobSpawnPoint[] = [
  { catalogId: kobold_grunt.id, position: [14, 0, 58] },
  { catalogId: kobold_grunt.id, position: [22, 0, 66] },
  { catalogId: kobold_grunt.id, position: [10, 0, 72] },
  { catalogId: forest_wolf.id, position: [-18, 0, 84] },
  { catalogId: forest_wolf.id, position: [-26, 0, 94] },
  { catalogId: kobold_elite.id, position: [6, 0, 128] },
];

export function setupWorld(ctx: GameContext): void {
  ctx.scene.object.place("campfire", 4, 0, 6, { instanceId: "campfire_town", parentSpace: town_square.id });
  ctx.scene.object.place("campfire", 16, 0, 62, { instanceId: "campfire_kobold_camp" });
  ctx.scene.object.place("supply_crate", -3, 0, 8, { instanceId: "crate_town", parentSpace: town_square.id });
  ctx.scene.entity.spawn(npc_marshal.id, {
    id: "npc_marshal_town",
    position: [3, 0, 10],
    role: "npc",
    movement: { walkSpeed: npc_marshal.walkSpeed },
  });
}
