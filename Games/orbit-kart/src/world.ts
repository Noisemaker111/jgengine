import type { PhysicsConfig } from "@jgengine/core/game/defineGame";
import { environment, sky, terrain, type WorldFeature } from "@jgengine/core/world/features";
import { ARENA_SIZE } from "./game/constants";
import { PALETTE } from "./game/theme";

export const world: WorldFeature = environment({
  terrain: terrain({
    bounds: { w: ARENA_SIZE, d: ARENA_SIZE },
    height: 0,
    material: "rock",
    colors: { low: PALETTE.spaceIndigo, high: PALETTE.spaceIndigo, waterline: PALETTE.spaceIndigo },
    segments: 2,
    seed: "orbit-kart-void",
  }),
  sky: sky({
    preset: "night",
    horizonColor: "#241f52",
    zenithColor: "#05040f",
    fog: { color: "#0a0820", near: 260, far: 520 },
  }),
});

export const physics: PhysicsConfig = { gravity: 0 };
