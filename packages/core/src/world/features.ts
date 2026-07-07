export interface WorldBounds {
  w: number;
  d: number;
}

export type EnvironmentVec2 = readonly [number, number];

export interface EnvironmentArea extends WorldBounds {
  h?: number;
}

export interface TerrainEnvironmentConfig {
  bounds?: WorldBounds;
  height?: number;
  heightMap?: string;
  material?: string;
  seed?: string;
}

export interface RainEnvironmentConfig {
  area?: EnvironmentArea;
  density?: number;
  speed?: number;
  dropLength?: number;
  wind?: EnvironmentVec2;
  color?: string;
}

export interface SnowEnvironmentConfig {
  area?: EnvironmentArea;
  density?: number;
  speed?: number;
  flakeSize?: number;
  drift?: number;
  wind?: EnvironmentVec2;
  color?: string;
}

export interface GrassEnvironmentConfig {
  area?: WorldBounds;
  density?: number;
  bladeHeight?: readonly [number, number];
  bladeWidth?: number;
  windStrength?: number;
  colors?: readonly string[];
  seed?: string;
}

export interface OceanEnvironmentConfig {
  bounds?: WorldBounds;
  level?: number;
  waveHeight?: number;
  waveScale?: number;
  waveSpeed?: number;
  color?: string;
}

export interface BuildingEnvironmentConfig {
  count?: number;
  footprint?: WorldBounds;
  stories?: readonly [number, number];
  storyHeight?: number;
  spacing?: number;
  style?: string;
  seed?: string;
}

export type TerrainEnvironmentDescriptor = { kind: "terrain" } & Required<
  Pick<TerrainEnvironmentConfig, "bounds" | "height">
> &
  Omit<TerrainEnvironmentConfig, "bounds" | "height">;

export type RainEnvironmentDescriptor = { kind: "rain" } & Required<
  Pick<RainEnvironmentConfig, "area" | "density" | "speed" | "dropLength" | "wind" | "color">
>;

export type SnowEnvironmentDescriptor = { kind: "snow" } & Required<
  Pick<SnowEnvironmentConfig, "area" | "density" | "speed" | "flakeSize" | "drift" | "wind" | "color">
>;

export type GrassEnvironmentDescriptor = { kind: "grass" } & Required<
  Pick<GrassEnvironmentConfig, "area" | "density" | "bladeHeight" | "bladeWidth" | "windStrength" | "colors">
> &
  Pick<GrassEnvironmentConfig, "seed">;

export type OceanEnvironmentDescriptor = { kind: "ocean" } & Required<
  Pick<OceanEnvironmentConfig, "bounds" | "level" | "waveHeight" | "waveScale" | "waveSpeed" | "color">
>;

export type BuildingEnvironmentDescriptor = { kind: "building" } & Required<
  Pick<BuildingEnvironmentConfig, "count" | "footprint" | "stories" | "storyHeight" | "spacing" | "style">
> &
  Pick<BuildingEnvironmentConfig, "seed">;

export type WeatherEnvironmentDescriptor = RainEnvironmentDescriptor | SnowEnvironmentDescriptor;
export type VegetationEnvironmentDescriptor = GrassEnvironmentDescriptor;
export type WaterEnvironmentDescriptor = OceanEnvironmentDescriptor;
export type StructureEnvironmentDescriptor = BuildingEnvironmentDescriptor;

export type EnvironmentDescriptorList<T> = T | readonly T[];

export interface EnvironmentWorldConfig {
  terrain?: TerrainEnvironmentDescriptor;
  weather?: EnvironmentDescriptorList<WeatherEnvironmentDescriptor>;
  vegetation?: EnvironmentDescriptorList<VegetationEnvironmentDescriptor>;
  water?: EnvironmentDescriptorList<WaterEnvironmentDescriptor>;
  structures?: EnvironmentDescriptorList<StructureEnvironmentDescriptor>;
}

export interface EnvironmentWorldFeature {
  kind: "environment";
  terrain?: TerrainEnvironmentDescriptor;
  weather?: readonly WeatherEnvironmentDescriptor[];
  vegetation?: readonly VegetationEnvironmentDescriptor[];
  water?: readonly WaterEnvironmentDescriptor[];
  structures?: readonly StructureEnvironmentDescriptor[];
}

export interface BiomesWorldConfig {
  map: string;
  zones: string;
  bounds?: WorldBounds;
}

export interface VoxelWorldConfig {
  seed: string;
  generate?: string;
  streaming?: { radius: number };
}

export interface PlotsWorldConfig {
  city?: string;
  interiors?: string;
}

export interface TilemapWorldConfig {
  map: string;
}

export type WorldFeature =
  | ({ kind: "biomes" } & BiomesWorldConfig)
  | ({ kind: "voxel" } & VoxelWorldConfig)
  | ({ kind: "plots" } & PlotsWorldConfig)
  | ({ kind: "tilemap" } & TilemapWorldConfig)
  | EnvironmentWorldFeature
  | { kind: "flat" };

function list<T extends object>(value: EnvironmentDescriptorList<T> | undefined): readonly T[] | undefined {
  if (value === undefined) {
    return undefined;
  }
  return Array.isArray(value) ? value : [value as T];
}

function withOptional<TBase extends object, TOptional extends object>(
  base: TBase,
  optional: TOptional | undefined,
): TBase | (TBase & TOptional) {
  return optional === undefined ? base : { ...base, ...optional };
}

export function environment(config: EnvironmentWorldConfig = {}): EnvironmentWorldFeature {
  const weather = list(config.weather);
  const vegetation = list(config.vegetation);
  const water = list(config.water);
  const structures = list(config.structures);

  return {
    kind: "environment",
    ...(config.terrain === undefined ? {} : { terrain: config.terrain }),
    ...(weather === undefined ? {} : { weather }),
    ...(vegetation === undefined ? {} : { vegetation }),
    ...(water === undefined ? {} : { water }),
    ...(structures === undefined ? {} : { structures }),
  };
}

export function terrain(config: TerrainEnvironmentConfig = {}): TerrainEnvironmentDescriptor {
  return withOptional(
    {
      kind: "terrain" as const,
      bounds: config.bounds ?? { w: 512, d: 512 },
      height: config.height ?? 0,
    },
    {
      ...(config.heightMap === undefined ? {} : { heightMap: config.heightMap }),
      ...(config.material === undefined ? {} : { material: config.material }),
      ...(config.seed === undefined ? {} : { seed: config.seed }),
    },
  );
}

export function rain(config: RainEnvironmentConfig = {}): RainEnvironmentDescriptor {
  return {
    kind: "rain",
    area: config.area ?? { w: 256, d: 256, h: 80 },
    density: config.density ?? 0.65,
    speed: config.speed ?? 18,
    dropLength: config.dropLength ?? 0.8,
    wind: config.wind ?? [0, 0],
    color: config.color ?? "#9ec8ff",
  };
}

export function snow(config: SnowEnvironmentConfig = {}): SnowEnvironmentDescriptor {
  return {
    kind: "snow",
    area: config.area ?? { w: 256, d: 256, h: 80 },
    density: config.density ?? 0.35,
    speed: config.speed ?? 2.4,
    flakeSize: config.flakeSize ?? 0.08,
    drift: config.drift ?? 0.4,
    wind: config.wind ?? [0, 0],
    color: config.color ?? "#ffffff",
  };
}

export function grass(config: GrassEnvironmentConfig = {}): GrassEnvironmentDescriptor {
  return withOptional(
    {
      kind: "grass" as const,
      area: config.area ?? { w: 128, d: 128 },
      density: config.density ?? 4,
      bladeHeight: config.bladeHeight ?? [0.25, 0.9],
      bladeWidth: config.bladeWidth ?? 0.035,
      windStrength: config.windStrength ?? 0.35,
      colors: config.colors ?? ["#3f7d2d", "#66a83f"],
    },
    config.seed === undefined ? undefined : { seed: config.seed },
  );
}

export function ocean(config: OceanEnvironmentConfig = {}): OceanEnvironmentDescriptor {
  return {
    kind: "ocean",
    bounds: config.bounds ?? { w: 1024, d: 1024 },
    level: config.level ?? 0,
    waveHeight: config.waveHeight ?? 1.2,
    waveScale: config.waveScale ?? 18,
    waveSpeed: config.waveSpeed ?? 0.55,
    color: config.color ?? "#1d7fa3",
  };
}

export function building(config: BuildingEnvironmentConfig = {}): BuildingEnvironmentDescriptor {
  return withOptional(
    {
      kind: "building" as const,
      count: config.count ?? 1,
      footprint: config.footprint ?? { w: 8, d: 8 },
      stories: config.stories ?? [1, 4],
      storyHeight: config.storyHeight ?? 3,
      spacing: config.spacing ?? 2,
      style: config.style ?? "generic",
    },
    config.seed === undefined ? undefined : { seed: config.seed },
  );
}

export function biomes(config: BiomesWorldConfig): WorldFeature {
  return { kind: "biomes", ...config };
}

export function voxel(config: VoxelWorldConfig): WorldFeature {
  return { kind: "voxel", ...config };
}

export function plots(config: PlotsWorldConfig = {}): WorldFeature {
  return { kind: "plots", ...config };
}

export function tilemap(config: TilemapWorldConfig): WorldFeature {
  return { kind: "tilemap", ...config };
}

export function flat(): WorldFeature {
  return { kind: "flat" };
}
