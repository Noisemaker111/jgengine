import type { PhysicsConfig } from "@jgengine/core/game/defineGame";
import { environment, sky, terrain, type WorldFeature } from "@jgengine/core/world/features";

import { COURSE_LENGTH } from "./game/course/course";

const CAUSEWAY_WIDTH = 12;
const COURSE_MARGIN = 40;

export const world: WorldFeature = environment({
  terrain: terrain({
    bounds: { w: CAUSEWAY_WIDTH, d: COURSE_LENGTH + COURSE_MARGIN },
    height: 0,
    baseHeight: 0,
    material: "rock",
    colors: { low: "#151022", high: "#6d5f8d", waterline: "#ffd166" },
    segments: 24,
  }),
  sky: sky({
    preset: "night",
    horizonColor: "#3a2a55",
    zenithColor: "#0e0a18",
    fog: { color: "#1c1430", near: 24, far: 200 },
  }),
});

export const physics: PhysicsConfig = { gravity: -20, jumpVelocity: 0 };
