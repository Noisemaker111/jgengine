import type { PhysicsConfig } from "@jgengine/core/game/defineGame";
import {
  environment,
  sky,
  terrain,
  type EnvironmentWorldFeature,
} from "@jgengine/core/world/features";

import { GRAVITY, JUMP_VELOCITY } from "./game/tuning";

export const world: EnvironmentWorldFeature = environment({
  terrain: terrain({
    bounds: { w: 320, d: 320 },
    height: 0,
    colors: { low: "#3a2f4a", high: "#4a3d5e", waterline: "#3a2f4a" },
    segments: 16,
  }),
  sky: sky({
    preset: "day",
    horizonColor: "#f2c48c",
    zenithColor: "#5b4f78",
    sunIntensity: 1.5,
    ambientIntensity: 1.35,
    fog: { color: "#4a4066", near: 160, far: 420 },
  }),
});

export const physics: PhysicsConfig = { gravity: GRAVITY, jumpVelocity: JUMP_VELOCITY };
