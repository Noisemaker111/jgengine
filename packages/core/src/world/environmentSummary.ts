import { generateBuildingDistrict, type GeneratedBuilding } from "./buildings";
import type {
  BuildingEnvironmentDescriptor,
  EnvironmentWorldFeature,
  TerrainEnvironmentDescriptor,
  WorldBounds,
} from "./features";
import type { Aabb } from "./geometry";
import { resolveTerrainField } from "./terrain";

export function resolveStructureBuildings(descriptor: BuildingEnvironmentDescriptor): GeneratedBuilding[] {
  const columns = Math.max(1, Math.ceil(Math.sqrt(descriptor.count)));
  const rows = Math.max(1, Math.ceil(descriptor.count / columns));
  const spacing = descriptor.spacing;
  const [centerX, centerZ] = descriptor.position ?? [0, 0];
  const origin: readonly [number, number] = [
    centerX - ((columns - 1) * (descriptor.footprint.w + spacing)) / 2,
    centerZ - ((rows - 1) * (descriptor.footprint.d + spacing)) / 2,
  ];
  return generateBuildingDistrict({
    rows,
    columns,
    origin,
    lotSize: descriptor.footprint,
    streetWidth: spacing,
    floorRange: descriptor.stories,
    base: { floorHeight: descriptor.storyHeight },
    ...(descriptor.seed === undefined ? {} : { seed: descriptor.seed }),
  }).slice(0, descriptor.count);
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
  waterLevel?: number;
}

export interface StructureSummary {
  style: string;
  requested: number;
  buildings: number;
  parts: number;
  bounds: Aabb;
}

export interface VegetationSummary {
  area: WorldBounds;
  density: number;
}

export interface WaterSummary {
  level: number;
  bounds: WorldBounds;
}

export interface WeatherSummary {
  kind: "rain" | "snow";
  density: number;
}

export interface EnvironmentCounts {
  terrain: number;
  structureGroups: number;
  buildings: number;
  buildingParts: number;
  vegetationFields: number;
  waterBodies: number;
  weatherSystems: number;
}

export interface EnvironmentSummary {
  terrain?: TerrainSummary;
  structures: readonly StructureSummary[];
  vegetation: readonly VegetationSummary[];
  water: readonly WaterSummary[];
  weather: readonly WeatherSummary[];
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

function summarizeStructures(descriptor: BuildingEnvironmentDescriptor): StructureSummary {
  const buildings = resolveStructureBuildings(descriptor);
  return {
    style: descriptor.style,
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
    ...(descriptor.waterLevel === undefined ? {} : { waterLevel: descriptor.waterLevel }),
  };
}

export function summarizeEnvironment(feature: EnvironmentWorldFeature): EnvironmentSummary {
  const terrain = feature.terrain === undefined ? undefined : summarizeTerrain(feature.terrain);
  const structures = (feature.structures ?? []).map(summarizeStructures);
  const vegetation: VegetationSummary[] = (feature.vegetation ?? []).map((entry) => ({
    area: entry.area,
    density: entry.density,
  }));
  const water: WaterSummary[] = (feature.water ?? []).map((entry) => ({
    level: entry.level,
    bounds: entry.bounds,
  }));
  const weather: WeatherSummary[] = (feature.weather ?? []).map((entry) => ({
    kind: entry.kind,
    density: entry.density,
  }));

  const buildings = structures.reduce((sum, entry) => sum + entry.buildings, 0);
  const counts: EnvironmentCounts = {
    terrain: terrain === undefined ? 0 : 1,
    structureGroups: structures.length,
    buildings,
    buildingParts: structures.reduce((sum, entry) => sum + entry.parts, 0),
    vegetationFields: vegetation.length,
    waterBodies: water.length,
    weatherSystems: weather.length,
  };
  const isEmpty =
    counts.terrain === 0 &&
    buildings === 0 &&
    counts.vegetationFields === 0 &&
    counts.waterBodies === 0 &&
    counts.weatherSystems === 0;

  return {
    ...(terrain === undefined ? {} : { terrain }),
    structures,
    vegetation,
    water,
    weather,
    counts,
    isEmpty,
  };
}
