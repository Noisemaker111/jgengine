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

const speckleRegions = (
  cx: number,
  cz: number,
  spread: number,
  count: number,
  seed: string,
): TerrainMaterialRegion[] => {
  const rng = seededRng(seed);
  const tones = [
    { low: "#8f6e3e", high: "#a3854c" },
    { low: "#ccae6e", high: "#e0c888" },
    { low: "#7c5c34", high: "#8f7042" },
    { low: "#b8935a", high: "#c9ac70" },
    { low: "#9a7c52", high: "#b09262" },
  ] as const;
  const regions: TerrainMaterialRegion[] = [];
  for (let index = 0; index < count; index += 1) {
    const angle = rng() * Math.PI * 2;
    const distance = spread * Math.sqrt(rng());
    const radius = 3 + rng() * 9;
    regions.push({
      shape: "circle",
      center: [cx + Math.cos(angle) * distance, cz + Math.sin(angle) * distance],
      radius,
      colors: tones[Math.floor(rng() * tones.length)]!,
      falloff: radius * 0.5,
    });
  }
  return regions;
};

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
  ...ZONES.flatMap((zone) =>
    speckleRegions(
      zone.center.x,
      zone.center.z,
      zone.flattenRadius * 1.6,
      zone.id === "windshear_waste" ? 90 : 36,
      `bl2-speckle-${zone.id}`,
    ),
  ),
  ...speckleRegions(ZONES[0]!.center.x + 18, ZONES[0]!.center.z + 34, 40, 40, "bl2-speckle-spawn"),
];

const terrainDescriptor = terrain({
  ...TERRAIN_BASE,
  materialRegions,
  detail: {
    rockColor: "#6f4f34",
    sandColor: "#caa568",
    snowColor: "#d8cbb0",
    rockSlopeStart: 0.34,
    snowHeight: 999,
    waterLevel: -999,
    detailScale: 12,
    macroScale: 24,
    roughness: 0.95,
    strength: 4,
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
      scrubClump(cx + Math.cos(angle) * distance, cz + Math.sin(angle) * distance, 9 + rng() * 6, `${seed}-${index}`),
    );
  }
  return clumps;
};

const windshear = ZONES[0]!;

const vegetation: readonly GrassEnvironmentDescriptor[] = [
  ...scrubClumps(windshear.center.x + 18, windshear.center.z + 34, 18, 4, "bl2-scrub-spawn"),
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
    radius: 2600,
    hazeStrength: 0.62,
    sunGlowStrength: 0.6,
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
