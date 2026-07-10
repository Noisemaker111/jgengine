import type { PhysicsConfig } from "@jgengine/core/game/defineGame";
import { environment, sky, terrain } from "@jgengine/core/world/features";

import { TRACK_SEED } from "./game/track/geometry";
import { GRID_VIOLET, VOID_COLOR } from "./game/track/palette";

export const world = environment({
  terrain: terrain({
    bounds: { w: 220, d: 220 },
    height: 0.4,
    frequency: 0.01,
    octaves: 2,
    seed: `${TRACK_SEED}-ground`,
    material: "rock",
    colors: { low: VOID_COLOR, high: "#1c1830", waterline: GRID_VIOLET },
  }),
  sky: sky({
    preset: "night",
    horizonColor: GRID_VIOLET,
    zenithColor: VOID_COLOR,
    fog: { color: VOID_COLOR, near: 60, far: 220 },
  }),
});

export const physics: PhysicsConfig = { gravity: -24 };
