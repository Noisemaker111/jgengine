import type { PhysicsConfig } from "@jgengine/core/game/defineGame";
import { resolveTerrainField, type TerrainField } from "@jgengine/core/world/terrain";
import { building, environment, sky, terrain, type WorldFeature } from "@jgengine/core/world/features";
import { PANDORA } from "./game/palette";
import { BANDIT_CAMP, FLYNT_PERCH, FYRESTONE, SKAG_GULLY, WORLD_BOUNDS } from "./game/world/sites";

export const PANDORA_SEED = "pandora-arid-badlands-2026";

const terrainDescriptor = terrain({
  bounds: WORLD_BOUNDS,
  seed: PANDORA_SEED,
  material: "rock",
  height: 22,
  frequency: 0.006,
  octaves: 5,
  ridged: true,
  colors: { low: PANDORA.rockLow, high: PANDORA.rockHigh },
  flatten: [
    { center: [FYRESTONE.x, FYRESTONE.z] as const, radius: 42 },
    { center: [BANDIT_CAMP.x, BANDIT_CAMP.z] as const, radius: 34 },
    { center: [SKAG_GULLY.x, SKAG_GULLY.z] as const, radius: 28 },
    { center: [FLYNT_PERCH.x, FLYNT_PERCH.z] as const, radius: 30 },
  ],
});

export const world: WorldFeature = environment({
  terrain: terrainDescriptor,
  sky: sky({
    preset: "day",
    horizonColor: PANDORA.horizon,
    zenithColor: PANDORA.sky,
    sunIntensity: 1.5,
    ambientIntensity: 0.75,
    fog: { color: PANDORA.fog, near: 180, far: 900 },
  }),
  structures: [
    building({
      position: [FYRESTONE.x, FYRESTONE.z],
      count: 9,
      footprint: { w: 7, d: 7 },
      stories: [1, 2],
      storyHeight: 3,
      spacing: 5,
      style: "desert",
      palette: { wall: "#a06a3c", storefront: "#5a3b1e" },
      seed: `${PANDORA_SEED}-fyrestone`,
    }),
    building({
      position: [BANDIT_CAMP.x, BANDIT_CAMP.z],
      count: 7,
      footprint: { w: 6, d: 6 },
      stories: [1, 1],
      storyHeight: 2.6,
      spacing: 4,
      style: "ruin",
      seed: `${PANDORA_SEED}-banditcamp`,
    }),
    building({
      position: [FLYNT_PERCH.x, FLYNT_PERCH.z],
      count: 5,
      footprint: { w: 8, d: 8 },
      stories: [1, 3],
      storyHeight: 3.2,
      spacing: 5,
      style: "ruin",
      seed: `${PANDORA_SEED}-flynt`,
    }),
  ],
});

export const terrainField: TerrainField = resolveTerrainField(terrainDescriptor);

export const physics: PhysicsConfig = { gravity: -30, jumpVelocity: 8.4, projectileObstacles: true };
