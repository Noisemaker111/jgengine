import type { BuildingPaletteOverrides, BuildingStyle } from "./buildings";

export interface WorldBounds {
  w: number;
  d: number;
}

export type TerrainMaterial = "grass" | "sand" | "snow" | "rock" | "ash" | "highland" | "slate";

export type EnvironmentVec2 = readonly [number, number];

export interface EnvironmentArea extends WorldBounds {
  h?: number;
  /** World-space center of the area; default `[0, 0]` (the world origin). Sites a weather/vegetation band away from the origin, like `building()`/`ocean()` `position`. */
  position?: EnvironmentVec2;
}

export interface TerrainColors {
  low?: string;
  high?: string;
  waterline?: string;
}

export interface TerrainFlattenMask {
  center: EnvironmentVec2;
  radius: number;
  /** Target flat height; defaults to the noise field's height at `center`. */
  height?: number;
  /** Extra blend-ring width outside `radius` where the flat height smoothsteps back to the noise value; default `radius * 0.5`. */
  falloff?: number;
}

/** A circular palette zone painted over the base terrain palette — snow caps, ash wastes, sand shores on one heightfield. */
export interface TerrainMaterialRegion {
  center: EnvironmentVec2;
  radius: number;
  /** Named palette preset for this region (see `TERRAIN_MATERIAL_PALETTES` in `world/terrain`); overridden field-by-field by `colors`. */
  material?: string;
  colors?: TerrainColors;
  /** Blend-ring width outside `radius` back to the surrounding palette; default `radius * 0.5`. */
  falloff?: number;
}

export interface TerrainEnvironmentConfig {
  bounds?: WorldBounds;
  height?: number;
  heightMap?: string;
  /**
   * Game-supplied height function replacing the built-in noise field — banded biomes, ridge walls,
   * terracing, anything expressible as `(x, z) => y`. `flatten` masks still carve into it, and both
   * the rendered ground and `ctx.world.ground` sample it. A function doesn't serialize; keep it pure.
   */
  heightField?: (x: number, z: number) => number;
  /** Named palette preset (see `TERRAIN_MATERIAL_PALETTES` in `world/terrain`); default "grass". Overridden field-by-field by `colors`. */
  material?: TerrainMaterial;
  /** Explicit low/high/waterline hex colors; any field left unset falls back to the resolved `material` preset. */
  colors?: TerrainColors;
  /** Palette zones blended over the base `material`/`colors` for multi-biome readability. */
  materialRegions?: readonly TerrainMaterialRegion[];
  segments?: number;
  seed?: string;
  frequency?: number;
  octaves?: number;
  ridged?: boolean;
  baseHeight?: number;
  waterLevel?: number;
  /** Flat pads carved into the noise field, e.g. for building pads or spawn circles. */
  flatten?: readonly TerrainFlattenMask[];
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
  area?: EnvironmentArea;
  density?: number;
  bladeHeight?: readonly [number, number];
  bladeWidth?: number;
  windStrength?: number;
  colors?: readonly string[];
  seed?: string;
}

export interface OceanEnvironmentConfig {
  bounds?: WorldBounds;
  position?: EnvironmentVec2;
  level?: number;
  waveHeight?: number;
  waveScale?: number;
  waveSpeed?: number;
  color?: string;
}

export interface SkyEnvironmentConfig {
  /** Fixed look used when `timeOfDay` is off (or no clock is available); default "day". */
  preset?: "day" | "dusk" | "night";
  /** Drive sun/sky from the world clock's `calendar().dayFraction` instead of the fixed `preset`. */
  timeOfDay?: boolean;
  horizonColor?: string;
  zenithColor?: string;
  sunIntensity?: number;
  ambientIntensity?: number;
  fog?: { color?: string; near?: number; far?: number };
}

export interface BuildingEnvironmentConfig {
  count?: number;
  position?: EnvironmentVec2;
  footprint?: WorldBounds;
  stories?: readonly [number, number];
  storyHeight?: number;
  spacing?: number;
  /** Named palette archetype (see `BUILDING_STYLE_PALETTES` in `world/buildings`); default "generic". Overridden part-by-part by `palette`. */
  style?: BuildingStyle;
  /** Explicit per-part-kind hex colors; any part left unset falls back to the resolved `style` palette. */
  palette?: BuildingPaletteOverrides;
  seed?: string;
}

export type PadSize = readonly [number, number] | { radius: number };

export interface PadEnvironmentConfig {
  center: EnvironmentVec2;
  size: PadSize;
  /** Surface offset above the terrain height at `center`; default `0.05` — just proud of the ground. */
  height?: number;
  color?: string;
  /** Rotation applied to rectangular pads; ignored for circular pads. */
  rotationY?: number;
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
> &
  Pick<OceanEnvironmentConfig, "position">;

export type BuildingEnvironmentDescriptor = { kind: "building" } & Required<
  Pick<BuildingEnvironmentConfig, "count" | "footprint" | "stories" | "storyHeight" | "spacing" | "style">
> &
  Pick<BuildingEnvironmentConfig, "seed" | "position" | "palette">;

export type PadEnvironmentDescriptor = { kind: "pad" } & Required<
  Pick<PadEnvironmentConfig, "center" | "size" | "height" | "color">
> &
  Pick<PadEnvironmentConfig, "rotationY">;

export type SkyEnvironmentDescriptor = { kind: "sky" } & Required<
  Pick<SkyEnvironmentConfig, "preset" | "timeOfDay">
> &
  Omit<SkyEnvironmentConfig, "preset" | "timeOfDay">;

export type WeatherEnvironmentDescriptor = RainEnvironmentDescriptor | SnowEnvironmentDescriptor;
export type VegetationEnvironmentDescriptor = GrassEnvironmentDescriptor;
export type WaterEnvironmentDescriptor = OceanEnvironmentDescriptor;
export type StructureEnvironmentDescriptor = BuildingEnvironmentDescriptor;

export type EnvironmentDescriptorList<T> = T | readonly T[];

export interface EnvironmentWorldConfig {
  terrain?: TerrainEnvironmentDescriptor;
  sky?: SkyEnvironmentDescriptor;
  weather?: EnvironmentDescriptorList<WeatherEnvironmentDescriptor>;
  vegetation?: EnvironmentDescriptorList<VegetationEnvironmentDescriptor>;
  water?: EnvironmentDescriptorList<WaterEnvironmentDescriptor>;
  structures?: EnvironmentDescriptorList<StructureEnvironmentDescriptor>;
  /** Ground pads, e.g. platforms or paved patches; each implicitly flattens the terrain beneath it. */
  pads?: readonly PadEnvironmentDescriptor[];
}

export interface EnvironmentWorldFeature {
  kind: "environment";
  terrain?: TerrainEnvironmentDescriptor;
  sky?: SkyEnvironmentDescriptor;
  weather?: readonly WeatherEnvironmentDescriptor[];
  vegetation?: readonly VegetationEnvironmentDescriptor[];
  water?: readonly WaterEnvironmentDescriptor[];
  structures?: readonly StructureEnvironmentDescriptor[];
  pads?: readonly PadEnvironmentDescriptor[];
}

export interface WorldGridCell {
  x: number;
  z: number;
  /** Extruded box height for this cell; falls back to the config's `baseHeight`, then `1`. */
  height?: number;
  /** Per-cell tint; falls back to the config's `defaultColor`. */
  color?: string;
}

/** Shared by `biomes()`/`voxel()`/`plots()`/`tilemap()` so the shell can render their declared content as instanced boxes without a hand-written renderer. */
export interface WorldGridConfig {
  cells?: readonly WorldGridCell[];
  /** World-unit size of one grid cell. Default 1. */
  cellSize?: number;
  /** Height used for cells that omit their own `height`. Default 1. */
  baseHeight?: number;
  /** Color used for cells that omit their own `color`. */
  defaultColor?: string;
}

export interface BiomesWorldConfig extends WorldGridConfig {
  map: string;
  zones: string;
  bounds?: WorldBounds;
}

export interface VoxelWorldConfig extends WorldGridConfig {
  seed: string;
  generate?: string;
  streaming?: { radius: number };
}

export interface PlotsWorldConfig extends WorldGridConfig {
  city?: string;
  interiors?: string;
}

export interface TilemapWorldConfig extends WorldGridConfig {
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

/** Derives implicit `TerrainFlattenMask`s carving each pad's footprint into the terrain beneath it. */
export function padFlattenMasks(pads: readonly PadEnvironmentDescriptor[]): readonly TerrainFlattenMask[] {
  return pads.map((padDescriptor) => ({
    center: padDescriptor.center,
    radius: padHalfExtent(padDescriptor.size) * 1.2,
  }));
}

function padHalfExtent(size: PadSize): number {
  return "radius" in size ? size.radius : Math.max(size[0], size[1]) / 2;
}

function withPadFlatten(
  terrainDescriptor: TerrainEnvironmentDescriptor | undefined,
  pads: readonly PadEnvironmentDescriptor[] | undefined,
): TerrainEnvironmentDescriptor | undefined {
  if (terrainDescriptor === undefined || pads === undefined || pads.length === 0) return terrainDescriptor;
  return {
    ...terrainDescriptor,
    flatten: [...(terrainDescriptor.flatten ?? []), ...padFlattenMasks(pads)],
  };
}

export function environment(config: EnvironmentWorldConfig = {}): EnvironmentWorldFeature {
  const weather = list(config.weather);
  const vegetation = list(config.vegetation);
  const water = list(config.water);
  const structures = list(config.structures);
  const terrainDescriptor = withPadFlatten(config.terrain, config.pads);

  return {
    kind: "environment",
    ...(terrainDescriptor === undefined ? {} : { terrain: terrainDescriptor }),
    ...(config.sky === undefined ? {} : { sky: config.sky }),
    ...(weather === undefined ? {} : { weather }),
    ...(vegetation === undefined ? {} : { vegetation }),
    ...(water === undefined ? {} : { water }),
    ...(structures === undefined ? {} : { structures }),
    ...(config.pads === undefined ? {} : { pads: config.pads }),
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
      ...(config.heightField === undefined ? {} : { heightField: config.heightField }),
      ...(config.material === undefined ? {} : { material: config.material }),
      ...(config.colors === undefined ? {} : { colors: config.colors }),
      ...(config.materialRegions === undefined ? {} : { materialRegions: config.materialRegions }),
      ...(config.segments === undefined ? {} : { segments: config.segments }),
      ...(config.seed === undefined ? {} : { seed: config.seed }),
      ...(config.frequency === undefined ? {} : { frequency: config.frequency }),
      ...(config.octaves === undefined ? {} : { octaves: config.octaves }),
      ...(config.ridged === undefined ? {} : { ridged: config.ridged }),
      ...(config.baseHeight === undefined ? {} : { baseHeight: config.baseHeight }),
      ...(config.waterLevel === undefined ? {} : { waterLevel: config.waterLevel }),
      ...(config.flatten === undefined ? {} : { flatten: config.flatten }),
    },
  );
}

export function sky(config: SkyEnvironmentConfig = {}): SkyEnvironmentDescriptor {
  return withOptional(
    {
      kind: "sky" as const,
      preset: config.preset ?? "day",
      timeOfDay: config.timeOfDay ?? false,
    },
    {
      ...(config.horizonColor === undefined ? {} : { horizonColor: config.horizonColor }),
      ...(config.zenithColor === undefined ? {} : { zenithColor: config.zenithColor }),
      ...(config.sunIntensity === undefined ? {} : { sunIntensity: config.sunIntensity }),
      ...(config.ambientIntensity === undefined ? {} : { ambientIntensity: config.ambientIntensity }),
      ...(config.fog === undefined ? {} : { fog: config.fog }),
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
    ...(config.position === undefined ? {} : { position: config.position }),
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
    {
      ...(config.seed === undefined ? {} : { seed: config.seed }),
      ...(config.position === undefined ? {} : { position: config.position }),
      ...(config.palette === undefined ? {} : { palette: config.palette }),
    },
  );
}

export function pad(config: PadEnvironmentConfig): PadEnvironmentDescriptor {
  return withOptional(
    {
      kind: "pad" as const,
      center: config.center,
      size: config.size,
      height: config.height ?? 0.05,
      color: config.color ?? "#8b8680",
    },
    config.rotationY === undefined ? undefined : { rotationY: config.rotationY },
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
