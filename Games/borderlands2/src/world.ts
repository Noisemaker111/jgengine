import type { PhysicsConfig } from "@jgengine/core/game/defineGame";
import { resolveTerrainField, type TerrainField } from "@jgengine/core/world/terrain";
import { seededRng } from "@jgengine/core/random/rng";
import {
  building,
  environment,
  grass,
  sky,
  terrain,
  type GrassEnvironmentDescriptor,
  type TerrainMaterialRegion,
  type WorldFeature,
} from "@jgengine/core/world/features";
import { PANDORA } from "./game/palette";
import { ROUTES, SPUR_ROUTES, SIDE_POIS, roadFlattenMasks } from "./game/world/level";
import { WORLD_BOUNDS, ZONES } from "./game/world/zones";

export const PANDORA_SEED = "pandora-arid-badlands-2026";

const TERRAIN_BASE = {
  bounds: WORLD_BOUNDS,
  seed: PANDORA_SEED,
  material: "rock",
  height: 52,
  frequency: 0.0035,
  octaves: 5,
  ridged: true,
  segments: 340,
  colors: { low: PANDORA.rockLow, high: PANDORA.rockHigh },
} as const;

export const CLIMB_SLOPE_LIMIT = 0.85;

const rawField = resolveTerrainField(terrain(TERRAIN_BASE));

const roadPoints = (points: readonly { x: number; z: number }[]) =>
  points.map((point) => [point.x, point.z] as const);

const materialRegions: readonly TerrainMaterialRegion[] = [
  ...ZONES.map(
    (zone): TerrainMaterialRegion => ({
      shape: "circle",
      center: [zone.center.x, zone.center.z],
      radius: zone.flattenRadius * 0.92,
      colors: { low: "#b39058", high: "#cdae74" },
      falloff: zone.flattenRadius * 0.4,
    }),
  ),
  ...SIDE_POIS.map(
    (poi): TerrainMaterialRegion => ({
      shape: "circle",
      center: [poi.x, poi.z],
      radius: poi.radius * 0.9,
      colors: { low: "#9c7c48", high: "#b8975c" },
      falloff: poi.radius * 0.4,
    }),
  ),
  ...[...ROUTES, ...SPUR_ROUTES].map(
    (route): TerrainMaterialRegion => ({
      shape: "polyline",
      points: roadPoints(route.points),
      width: 16,
      colors: { low: "#7a5c3a", high: "#8f6e46" },
      falloff: 9,
    }),
  ),
];

const terrainDescriptor = terrain({
  ...TERRAIN_BASE,
  materialRegions,
  detail: {
    rockColor: "#6f4f34",
    sandColor: "#caa568",
    snowColor: "#d8cbb0",
    rockSlopeStart: 0.36,
    snowHeight: 999,
    detailScale: 4.5,
    macroScale: 60,
    roughness: 0.95,
    strength: 1,
  },
  flatten: [
    ...ZONES.map((zone) => ({
      center: [zone.center.x, zone.center.z] as const,
      radius: zone.flattenRadius,
    })),
    ...roadFlattenMasks((x, z) => rawField.sampleHeight(x, z)),
  ],
});

const SCRUB_COLORS = ["#b39a4e", "#cbb469", "#e2d288"] as const;

const scrubClump = (x: number, z: number, size: number, seed: string): GrassEnvironmentDescriptor =>
  grass({
    area: { w: size, d: size, position: [x, z] },
    density: 1,
    bladeHeight: [0.18, 0.5],
    bladeWidth: 0.11,
    windStrength: 0.45,
    colors: [...SCRUB_COLORS],
    seed,
  });

const scrubClumps = (
  cx: number,
  cz: number,
  spread: number,
  count: number,
  seed: string,
): GrassEnvironmentDescriptor[] => {
  const rng = seededRng(seed);
  const clumps: GrassEnvironmentDescriptor[] = [];
  for (let index = 0; index < count; index += 1) {
    const angle = rng() * Math.PI * 2;
    const distance = spread * (0.15 + rng() * 0.85);
    clumps.push(
      scrubClump(cx + Math.cos(angle) * distance, cz + Math.sin(angle) * distance, 22, `${seed}-${index}`),
    );
  }
  return clumps;
};

const vegetation: readonly GrassEnvironmentDescriptor[] = [
  ...ZONES.flatMap((zone) => scrubClumps(zone.center.x, zone.center.z, zone.flattenRadius * 1.3, 6, `bl2-scrub-${zone.id}`)),
  ...SIDE_POIS.flatMap((poi) => scrubClumps(poi.x, poi.z, poi.radius, 3, `bl2-scrub-${poi.id}`)),
];

export const world: WorldFeature = environment({
  terrain: terrainDescriptor,
  vegetation,
  sky: sky({
    preset: "day",
    horizonColor: "#e6c48d",
    zenithColor: "#7fa9c4",
    sunIntensity: 1.55,
    ambientIntensity: 0.82,
    fog: { color: PANDORA.fog, near: 260, far: 1200 },
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
