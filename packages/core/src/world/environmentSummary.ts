import {
  DEFAULT_BUILDING_CONFIG,
  generateBuilding,
  resolveBuildingPalette,
  resolveBuildingProbabilities,
  type BuildingPalette,
  type BuildingProbabilities,
  type BuildingStyle,
  type BuildingVariantCounts,
  type GeneratedBuilding,
} from "./buildings";
import { buildingKitVariantCounts, type BuildingKit } from "./buildingKit";
import { deriveBuildingLots, type PlacedBuildingLot, type RoadFrontage } from "./buildingLots";
import type {
  BuildingEnvironmentDescriptor,
  EnvironmentArea,
  EnvironmentWorldFeature,
  TerrainEnvironmentDescriptor,
  WorldBounds,
} from "./features";
import type { Aabb } from "./geometry";
import { polylineLength } from "../roads/roads";
import { resolveTerrainField, resolveTerrainPalette, type TerrainPalette } from "./terrain";

/**
 * The buildings one `building()` descriptor places, always through the one frontage placer
 * ({@link deriveBuildingLots}): along its `along` roads; else, when the world's streets pass through
 * the settlement, along those streets near `position`; else in two rows facing a lane through
 * `position` (`spacing` wide). `roads` are the world's streets: no lot ever stands on their
 * carriageway or sidewalks.
 */
export function resolveStructureBuildings(
  descriptor: BuildingEnvironmentDescriptor,
  roads: readonly RoadFrontage[] = [],
): GeneratedBuilding[] {
  if (descriptor.along !== undefined) {
    return resolveFrontageBuildings(descriptor, descriptor.along, roads);
  }
  const perSide = Math.max(1, Math.ceil(descriptor.count / 2));
  const length = perSide * (descriptor.footprint.w + descriptor.spacing) + 1;
  const [x, z] = descriptor.position ?? [0, 0];
  const lane: RoadFrontage = { path: [[x - length / 2, z], [x + length / 2, z]], width: descriptor.spacing };
  let best = resolveFrontageBuildings(descriptor, { roads: [lane], setback: 0, maxLots: descriptor.count }, roads);
  if (best.length >= descriptor.count || roads.length === 0) return best;
  // A street runs through the settlement: line it, widening the catchment until the count fits.
  for (const reach of [1, 1.5, 2, 3]) {
    const half = (length / 2 + descriptor.footprint.d) * reach;
    const area = { center: [x, z] as const, halfExtents: [half, half] as const };
    const lined = resolveFrontageBuildings(descriptor, { roads, setback: 1, maxLots: descriptor.count, area }, []);
    if (lined.length > best.length) best = lined;
    if (best.length >= descriptor.count) break;
  }
  return best;
}

/** Spread seeded variant picks across exactly the models a kit binds, so no bound variant goes unused. */
function kitVariants(kit: BuildingKit | undefined): { variants?: Partial<BuildingVariantCounts> } {
  if (kit === undefined) return {};
  const variants = buildingKitVariantCounts(kit);
  return Object.keys(variants).length === 0 ? {} : { variants };
}

function hashU32(input: string): number {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 2246822507);
  hash ^= hash >>> 13;
  hash = Math.imul(hash, 3266489909);
  hash ^= hash >>> 16;
  return hash >>> 0;
}

/**
 * Build one street-aware building per road-frontage lot: massed at the lot center, its `rotationY`
 * set so the front faces the road (the renderer turns the whole building about `center`), floors
 * rolled deterministically from the descriptor's `stories` and the lot's road/side/index.
 */
function resolveFrontageBuildings(
  descriptor: BuildingEnvironmentDescriptor,
  along: NonNullable<BuildingEnvironmentDescriptor["along"]>,
  avoid: readonly RoadFrontage[],
): GeneratedBuilding[] {
  const seed = descriptor.seed ?? "buildings";
  const lots = deriveBuildingLots({
    roads: along.roads,
    footprint: descriptor.footprint,
    spacing: descriptor.spacing,
    maxLots: descriptor.count,
    seed: `${seed}:lots`,
    ...(along.setback === undefined ? {} : { setback: along.setback }),
    ...(along.bothSides === undefined ? {} : { bothSides: along.bothSides }),
    ...(along.area === undefined ? {} : { area: along.area }),
    ...(avoid.length === 0 ? {} : { avoid }),
  });
  const [floorsMin, floorsMax] = descriptor.stories;
  const bayWidth = DEFAULT_BUILDING_CONFIG.bayWidth;
  const variants = { ...kitVariants(descriptor.kit), probabilities: resolveBuildingProbabilities(descriptor.style, descriptor.probabilities) };
  return lots.map((lot, index) =>
    buildLot(lot, index, seed, floorsMin, floorsMax, bayWidth, descriptor.storyHeight, variants),
  );
}

function buildLot(
  lot: PlacedBuildingLot,
  index: number,
  seed: string,
  floorsMin: number,
  floorsMax: number,
  bayWidth: number,
  storyHeight: number,
  variants: { variants?: Partial<BuildingVariantCounts>; probabilities?: Partial<BuildingProbabilities> } = {},
): GeneratedBuilding {
  const lo = Math.min(floorsMin, floorsMax);
  const hi = Math.max(floorsMin, floorsMax);
  const floors = lo + Math.floor((hashU32(`${seed}:floors:${index}`) / 4294967296) * (hi - lo + 1));
  const baysWide = Math.max(1, Math.floor(lot.footprint.w / bayWidth));
  const baysDeep = Math.max(1, Math.floor(lot.footprint.d / bayWidth));
  const building = generateBuilding({
    id: `frontage-${index}`,
    seed: `${seed}:${index}`,
    center: lot.center,
    floors,
    baysWide,
    baysDeep,
    bayWidth,
    floorHeight: storyHeight,
    ...variants,
  });
  return { ...building, rotationY: lot.rotationY };
}

export interface TerrainHeightStats {
  min: number;
  max: number;
  mean: number;
  finite: boolean;
}

export interface TerrainSummary {
  bounds: WorldBounds;
  height: TerrainHeightStats;
  palette: TerrainPalette;
  waterLevel?: number;
}

export interface StructureSummary {
  style: BuildingStyle;
  palette: BuildingPalette;
  requested: number;
  buildings: number;
  parts: number;
  bounds: Aabb;
}

export interface VegetationSummary {
  area: EnvironmentArea;
  density: number;
}

export interface WaterSummary {
  level: number;
  bounds: WorldBounds;
}

export interface WeatherSummary {
  kind: "rain" | "snow";
  area: EnvironmentArea;
  density: number;
}

/** One road descriptor's resolved footprint: vertex count, width, and total centerline length. */
export interface RoadSummary {
  points: number;
  width: number;
  length: number;
}

export interface EnvironmentCounts {
  terrain: number;
  islands: number;
  structureGroups: number;
  buildings: number;
  buildingParts: number;
  vegetationFields: number;
  waterBodies: number;
  weatherSystems: number;
  roads: number;
}

export interface IslandSummary extends TerrainSummary {
  origin: readonly [number, number];
}

export interface EnvironmentSummary {
  terrain?: TerrainSummary;
  islands: readonly IslandSummary[];
  structures: readonly StructureSummary[];
  vegetation: readonly VegetationSummary[];
  water: readonly WaterSummary[];
  weather: readonly WeatherSummary[];
  roads: readonly RoadSummary[];
  counts: EnvironmentCounts;
  isEmpty: boolean;
}

const TERRAIN_SAMPLE_RESOLUTION = 16;

function sampleTerrainHeights(descriptor: TerrainEnvironmentDescriptor): TerrainHeightStats {
  const field = resolveTerrainField(descriptor);
  const halfW = descriptor.bounds.w / 2;
  const halfD = descriptor.bounds.d / 2;
  const steps = TERRAIN_SAMPLE_RESOLUTION;
  let min = Infinity;
  let max = -Infinity;
  let sum = 0;
  let finite = true;
  for (let ix = 0; ix <= steps; ix += 1) {
    for (let iz = 0; iz <= steps; iz += 1) {
      const x = -halfW + (descriptor.bounds.w * ix) / steps;
      const z = -halfD + (descriptor.bounds.d * iz) / steps;
      const height = field.sampleHeight(x, z);
      if (!Number.isFinite(height)) {
        finite = false;
        continue;
      }
      if (height < min) min = height;
      if (height > max) max = height;
      sum += height;
    }
  }
  const count = (steps + 1) * (steps + 1);
  if (!finite) return { min: NaN, max: NaN, mean: NaN, finite: false };
  return { min, max, mean: sum / count, finite: true };
}

function unionAabb(buildings: readonly GeneratedBuilding[]): Aabb {
  if (buildings.length === 0) return { minX: 0, minZ: 0, maxX: 0, maxZ: 0 };
  let minX = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxZ = -Infinity;
  for (const building of buildings) {
    if (building.bounds.minX < minX) minX = building.bounds.minX;
    if (building.bounds.minZ < minZ) minZ = building.bounds.minZ;
    if (building.bounds.maxX > maxX) maxX = building.bounds.maxX;
    if (building.bounds.maxZ > maxZ) maxZ = building.bounds.maxZ;
  }
  return { minX, minZ, maxX, maxZ };
}

function summarizeStructures(descriptor: BuildingEnvironmentDescriptor, roads: readonly RoadFrontage[]): StructureSummary {
  const buildings = resolveStructureBuildings(descriptor, roads);
  return {
    style: descriptor.style,
    palette: resolveBuildingPalette(descriptor.style, descriptor.palette),
    requested: descriptor.count,
    buildings: buildings.length,
    parts: buildings.reduce((sum, building) => sum + building.parts.length, 0),
    bounds: unionAabb(buildings),
  };
}

function summarizeTerrain(descriptor: TerrainEnvironmentDescriptor): TerrainSummary {
  return {
    bounds: descriptor.bounds,
    height: sampleTerrainHeights(descriptor),
    palette: resolveTerrainPalette(descriptor),
    ...(descriptor.waterLevel === undefined ? {} : { waterLevel: descriptor.waterLevel }),
  };
}

export function summarizeEnvironment(feature: EnvironmentWorldFeature): EnvironmentSummary {
  const terrain = feature.terrain === undefined ? undefined : summarizeTerrain(feature.terrain);
  const islands: IslandSummary[] = (feature.islands ?? []).map((entry) => ({
    ...summarizeTerrain({ ...entry, kind: "terrain" }),
    origin: entry.origin,
  }));
  const structures = (feature.structures ?? []).map((entry) => summarizeStructures(entry, feature.roads ?? []));
  const vegetation: VegetationSummary[] = (feature.vegetation ?? []).map((entry) => ({
    area: entry.area,
    density: entry.look.density,
  }));
  const water: WaterSummary[] = (feature.water ?? []).map((entry) => ({
    level: entry.level,
    bounds: entry.bounds,
  }));
  const weather: WeatherSummary[] = (feature.weather ?? []).map((entry) => ({
    kind: entry.kind,
    area: entry.area,
    density: entry.density,
  }));
  const roads: RoadSummary[] = (feature.roads ?? []).map((entry) => ({
    points: entry.path.length,
    width: entry.width,
    length: polylineLength(entry.path),
  }));

  const buildings = structures.reduce((sum, entry) => sum + entry.buildings, 0);
  const counts: EnvironmentCounts = {
    terrain: terrain === undefined ? 0 : 1,
    islands: islands.length,
    structureGroups: structures.length,
    buildings,
    buildingParts: structures.reduce((sum, entry) => sum + entry.parts, 0),
    vegetationFields: vegetation.length,
    waterBodies: water.length,
    weatherSystems: weather.length,
    roads: roads.length,
  };
  const isEmpty =
    counts.terrain === 0 &&
    counts.islands === 0 &&
    buildings === 0 &&
    counts.vegetationFields === 0 &&
    counts.waterBodies === 0 &&
    counts.weatherSystems === 0 &&
    counts.roads === 0;

  return {
    ...(terrain === undefined ? {} : { terrain }),
    islands,
    structures,
    vegetation,
    water,
    weather,
    roads,
    counts,
    isEmpty,
  };
}
