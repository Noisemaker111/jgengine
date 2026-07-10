import type { PhysicsConfig } from "@jgengine/core/game/defineGame";
import { environment, sky, snow, terrain, type WorldFeature } from "@jgengine/core/world/features";

export const world: WorldFeature = environment({
  terrain: terrain({
    bounds: { w: 420, d: 420 },
    height: 5,
    frequency: 0.012,
    octaves: 3,
    baseHeight: 0,
    seed: "frostbite-circuit-lake",
    material: "snow",
    colors: { low: "#a8dadc", high: "#f1faee", waterline: "#0d1b2a" },
    flatten: [{ center: [0, 0], radius: 108, height: 0, falloff: 32 }],
  }),
  sky: sky({
    preset: "day",
    horizonColor: "#a8dadc",
    zenithColor: "#0d1b2a",
    sunIntensity: 0.85,
    ambientIntensity: 0.5,
    fog: { color: "#0d1b2a", near: 90, far: 340 },
  }),
  weather: snow({
    area: { w: 420, d: 420, h: 60 },
    density: 0.4,
    speed: 2.1,
    flakeSize: 0.07,
    drift: 0.5,
    color: "#f1faee",
  }),
});

export const physics: PhysicsConfig = { gravity: -22 };
