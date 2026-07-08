import type { PhysicsConfig } from "@jgengine/core/game/defineGame";
import {
  environment,
  sky,
  terrain,
  type EnvironmentWorldFeature,
} from "@jgengine/core/world/features";

import { GRAVITY } from "./game/tuning";

// The living-room floor is a flat terrain at height 0. Because the voxel
// controller treats terrain height as a support floor, this is where a player
// lands when a trapdoor drops them off the table — and where the blast scatters
// everyone. Big bounds so a hard blast never flings anyone off the edge of the
// world. Warm, low light sells a cozy living room at dusk.
export const world: EnvironmentWorldFeature = environment({
  terrain: terrain({
    bounds: { w: 220, d: 220 },
    height: 0,
    colors: { low: "#3a2f4a", high: "#4a3d5e", waterline: "#3a2f4a" },
    segments: 16,
  }),
  // "day" is the only preset that honors sunIntensity/ambientIntensity overrides
  // (dusk/night hardcode theirs), so we drive a bright warm living-room glow here.
  sky: sky({
    preset: "day",
    horizonColor: "#f2c48c",
    zenithColor: "#5b4f78",
    sunIntensity: 1.5,
    ambientIntensity: 1.35,
    fog: { color: "#4a4066", near: 110, far: 280 },
  }),
});

export const physics: PhysicsConfig = { gravity: GRAVITY };
