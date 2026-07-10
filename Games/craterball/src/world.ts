import type { PhysicsConfig } from "@jgengine/core/game/defineGame";
import { environment, sky, terrain, type WorldFeature } from "@jgengine/core/world/features";
import { ARENA_BOUNDS_D, ARENA_BOUNDS_W } from "./game/arena/geometry";

export const world: WorldFeature = environment({
  terrain: terrain({
    bounds: { w: ARENA_BOUNDS_W, d: ARENA_BOUNDS_D },
    height: 0,
    material: "rock",
    colors: { low: "#23201d", high: "#cdb891", waterline: "#3a3630" },
    segments: 128,
    seed: "craterball-pitch",
  }),
  sky: sky({
    preset: "day",
    horizonColor: "#5a2a12",
    zenithColor: "#160f0c",
    sunIntensity: 1.35,
    ambientIntensity: 0.5,
    fog: { color: "#241a14", near: 70, far: 210 },
  }),
});

export const physics: PhysicsConfig = { gravity: -24 };
