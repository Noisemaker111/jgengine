import type { PhysicsConfig } from "@jgengine/core/game/defineGame";
import { environment, sky, terrain, type TerrainFlattenMask, type WorldFeature } from "@jgengine/core/world/features";

import { RAIL_NODES } from "./game/rail/network";

const FLATTEN_MASKS: readonly TerrainFlattenMask[] = RAIL_NODES.map((node) => ({
  center: node.position,
  radius: node.kind === "station" ? 12 : node.kind === "junction" ? 7 : 5,
  falloff: 8,
}));

export const world: WorldFeature = environment({
  terrain: terrain({
    bounds: { w: 200, d: 460 },
    height: 16,
    frequency: 0.012,
    octaves: 3,
    baseHeight: 0,
    seed: "rail-rushers-mountain",
    material: "rock",
    colors: { low: "#386641", high: "#a98467", waterline: "#6b705c" },
    flatten: FLATTEN_MASKS,
  }),
  sky: sky({
    preset: "day",
    horizonColor: "#f2e8cf",
    zenithColor: "#4f6b63",
    sunIntensity: 1.15,
    ambientIntensity: 0.65,
    fog: { color: "#f2e8cf", near: 90, far: 420 },
  }),
});

export const physics: PhysicsConfig = { gravity: -24 };
