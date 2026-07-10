import { resolveTerrainField, type TerrainField } from "@jgengine/core/world/terrain";
import { building, environment, ocean, sky, terrain, type WorldFeature } from "@jgengine/core/world/features";

import { DUNE_GOLD, OASIS_GREEN, PALE_SUN, SHADOW_OCHRE } from "./game/palette";
import { CITY, OASES, RUINS, SOUTH_GATE, WORLD_BOUNDS } from "./game/world/sites";

export const DUNE_SEED = "dune-nomads-caravan-2026";

const flattenSites = [
  { center: [SOUTH_GATE.x, SOUTH_GATE.z] as const, radius: 60 },
  { center: [CITY.x, CITY.z] as const, radius: 110 },
  ...OASES.map((oasis) => ({ center: [oasis.x, oasis.z] as const, radius: oasis.waterRadius + 26 })),
];

const terrainDescriptor = terrain({
  bounds: WORLD_BOUNDS,
  seed: DUNE_SEED,
  material: "sand",
  height: 30,
  frequency: 0.0035,
  octaves: 5,
  ridged: true,
  colors: { low: SHADOW_OCHRE, high: DUNE_GOLD, waterline: OASIS_GREEN },
  flatten: flattenSites,
});

export const world: WorldFeature = environment({
  terrain: terrainDescriptor,
  sky: sky({
    preset: "day",
    horizonColor: PALE_SUN,
    zenithColor: "#d9e6ee",
    sunIntensity: 1.35,
    ambientIntensity: 0.7,
    fog: { color: PALE_SUN, near: 260, far: 1700 },
  }),
  water: OASES.map((oasis) =>
    ocean({
      position: [oasis.x, oasis.z],
      bounds: { w: oasis.waterRadius * 2, d: oasis.waterRadius * 2 },
      level: 0.15,
      waveHeight: 0.1,
      waveScale: 5,
      waveSpeed: 0.3,
      color: OASIS_GREEN,
    }),
  ),
  structures: [
    ...OASES.map((oasis, index) =>
      building({
        position: [oasis.x + 18, oasis.z - 12],
        count: oasis.tentCount,
        footprint: { w: 5, d: 5 },
        stories: [1, 1],
        storyHeight: 2.4,
        spacing: 3,
        style: "desert",
        seed: `${DUNE_SEED}-tents-${index}`,
      }),
    ),
    building({
      position: [CITY.x, CITY.z],
      count: 16,
      footprint: { w: 11, d: 11 },
      stories: [2, 7],
      storyHeight: 3.6,
      spacing: 4.5,
      style: "desert",
      palette: { wall: "#8a6a42", storefront: "#4a3620" },
      seed: `${DUNE_SEED}-city`,
    }),
    ...RUINS.map((ruin, index) =>
      building({
        position: [ruin.x, ruin.z],
        count: Math.max(1, Math.round(ruin.pillarCount / 2)),
        footprint: { w: 4, d: 4 },
        stories: [1, 2],
        storyHeight: 2.6,
        spacing: 5,
        style: "ruin",
        seed: `${DUNE_SEED}-ruins-${index}`,
      }),
    ),
  ],
});

export const terrainField: TerrainField = resolveTerrainField(terrainDescriptor);
