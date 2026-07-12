import type { PhysicsConfig } from "@jgengine/core/game/defineGame";
import { resolveTerrainField, type TerrainField } from "@jgengine/core/world/terrain";
import { building, environment, sky, terrain, type WorldFeature } from "@jgengine/core/world/features";
import { PANDORA } from "./game/palette";
import { roadFlattenMasks } from "./game/world/level";
import { WORLD_BOUNDS, ZONES } from "./game/world/zones";

export const PANDORA_SEED = "pandora-arid-badlands-2026";

const TERRAIN_BASE = {
  bounds: WORLD_BOUNDS,
  seed: PANDORA_SEED,
  material: "rock",
  height: 30,
  frequency: 0.004,
  octaves: 5,
  ridged: true,
  colors: { low: PANDORA.rockLow, high: PANDORA.rockHigh },
} as const;

const rawField = resolveTerrainField(terrain(TERRAIN_BASE));

const terrainDescriptor = terrain({
  ...TERRAIN_BASE,
  flatten: [
    ...ZONES.map((zone) => ({
      center: [zone.center.x, zone.center.z] as const,
      radius: zone.flattenRadius,
    })),
    ...roadFlattenMasks((x, z) => rawField.sampleHeight(x, z)),
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
    fog: { color: PANDORA.fog, near: 220, far: 1100 },
  }),
  structures: ZONES.filter((zone) => zone.settlement !== undefined).map((zone) => {
    const settlement = zone.settlement!;
    return building({
      position: [zone.center.x, zone.center.z],
      count: settlement.count,
      footprint: { w: settlement.footprint, d: settlement.footprint },
      stories: [settlement.stories[0], settlement.stories[1]],
      storyHeight: 3,
      spacing: 5,
      style: settlement.style,
      ...(settlement.palette !== undefined ? { palette: settlement.palette } : {}),
      seed: `${PANDORA_SEED}-${zone.id}`,
    });
  }),
});

export const terrainField: TerrainField = resolveTerrainField(terrainDescriptor);

export const physics: PhysicsConfig = { gravity: -30, jumpVelocity: 8.4, projectileObstacles: true };
