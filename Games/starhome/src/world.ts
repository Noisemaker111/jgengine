import type { PhysicsConfig } from "@jgengine/core/game/defineGame";
import { resolveTerrainField, type TerrainField } from "@jgengine/core/world/terrain";
import { environment, sky, terrain, type WorldFeature } from "@jgengine/core/world/features";

import { HABITAT } from "./game/palette";

export const WORLD_SEED = "starhome-habitat-2026";
export const DAY_LENGTH = 210;
export const PLOT = { minX: -26, maxX: 26, minZ: -26, maxZ: 26 } as const;

const terrainDescriptor = terrain({
  bounds: { w: 240, d: 240 },
  seed: WORLD_SEED,
  material: "rock",
  height: 14,
  frequency: 0.008,
  octaves: 4,
  colors: { low: HABITAT.groundLow, high: HABITAT.groundHigh, waterline: HABITAT.flora },
  flatten: [{ center: [0, 0], radius: 46 }],
});

export const world: WorldFeature = environment({
  terrain: terrainDescriptor,
  sky: sky({
    preset: "dusk",
    timeOfDay: true,
    horizonColor: HABITAT.horizon,
    zenithColor: HABITAT.zenith,
    sunIntensity: 1.5,
    ambientIntensity: 0.95,
    fog: { color: HABITAT.fog, near: 160, far: 900 },
  }),
});

export const terrainField: TerrainField = resolveTerrainField(terrainDescriptor);

export const physics: PhysicsConfig = { gravity: -24 };
