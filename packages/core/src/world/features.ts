import type { BuildingPaletteOverrides, BuildingStyle } from "./buildings";
import type { AvoidZone } from "./geometry";
import type { TerraformSnapshot } from "./terraform";

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

/**
 * Procedural detail-surface layer for terrain: a noise-driven shader that keeps the
 * biome-tinted base ground (from `colors`/`biomeBands`) and blends distinct rock,
 * sand, and snow over it by slope, height, and waterline — turning a flat
 * vertex-colour surface into varied, textured-reading ground with no image assets.
 */
export interface TerrainDetailConfig {
  /** Steep-slope rock colour. Default "#6f7175". */
  rockColor?: string;
  /** Waterline/beach sand colour. Default "#c2b283". */
  sandColor?: string;
  /** High-altitude snow colour. Default "#eef3f7". */
  snowColor?: string;
  /** Slope (0 flat … 1 vertical) at which rock starts taking over. Default 0.42. */
  rockSlopeStart?: number;
  /** World height above which snow appears. Default 26. */
  snowHeight?: number;
  /** Water level for the sand band; defaults to the terrain's `waterLevel`. */
  waterLevel?: number;
  /** Fine detail noise wavelength in world units. Default 5. */
  detailScale?: number;
  /** Large-scale colour-variation wavelength in world units. Default 45. */
  macroScale?: number;
  /** Surface roughness of the detail material. Default 0.9. */
  roughness?: number;
  /** Overall detail intensity 0..1. Default 1. */
  strength?: number;
  /** Real PBR texture maps blended over the procedural detail — the seam for `@jgengine/assets` `buildMaterialCatalog` output. Omit to keep the procedural-only look. */
  material?: TerrainDetailMaterialConfig;
}

/**
 * PBR map URLs for a real ground texture — the same shape
 * `buildMaterialCatalog({ basePath }).resolve(id)!.maps` from `@jgengine/assets` returns. Kept
 * dependency-free here so `core` never imports the assets package; any URLs (pulled maps, a CDN, a
 * data URI) satisfy it.
 */
export interface TerrainMaterialMaps {
  color: string;
  normal: string;
  roughness: string;
  ao: string;
  displacement: string;
}

/**
 * Real PBR texture applied over the ground surface — the seam that lets a game put a
 * `buildMaterialCatalog` material on terrain. Blends with, never replaces, the procedural detail
 * shader: color/roughness/ao tile the maps by world position, `strength` fades them over the
 * existing vertex-colour + noise look.
 */
export interface TerrainDetailMaterialConfig {
  /** e.g. `buildMaterialCatalog({ basePath: "/materials" }).resolve("material/grass")!.maps`. */
  maps: TerrainMaterialMaps;
  /** World units per texture tile; smaller tiles the texture more densely. Default 4. */
  repeat?: number;
  /** Blend strength of the texture over the procedural/vertex-colour base, 0..1. Default 1. */
  strength?: number;
}

export interface TerrainFlattenMask {
  center: EnvironmentVec2;
  radius: number;
  /** Target flat height; defaults to the noise field's height at `center`. */
  height?: number;
  /** Extra blend-ring width outside `radius` where the flat height smoothsteps back to the noise value; default `radius * 0.5`. */
  falloff?: number;
}

/** Palette and blend fields shared by every `TerrainMaterialRegion` shape. */
export interface TerrainRegionStyle {
  /** Named palette preset for this region (see `TERRAIN_MATERIAL_PALETTES` in `world/terrain`); overridden field-by-field by `colors`. */
  material?: TerrainMaterial;
  colors?: TerrainColors;
  /** Blend-ring width outside the region core back to the surrounding palette; default: half the region's characteristic size. */
  falloff?: number;
}

/** A circular palette zone painted over the base terrain palette — snow caps, ash wastes, spawn circles. */
export interface TerrainCircleRegion extends TerrainRegionStyle {
  shape?: "circle";
  center: EnvironmentVec2;
  radius: number;
}

/** A ribbon palette zone following a centerline — roads and rivers, instead of chaining overlapping circles. */
export interface TerrainPolylineRegion extends TerrainRegionStyle {
  shape: "polyline";
  /** Centerline vertices in world XZ; needs at least two points. */
  points: readonly EnvironmentVec2[];
  /** Full ribbon width; the painted core extends `width / 2` either side of the centerline. `falloff` defaults to `width * 0.5`. */
  width: number;
}

/** A rectangular palette zone, optionally rotated about the world y axis — plazas, fields, districts. */
export interface TerrainRectRegion extends TerrainRegionStyle {
  shape: "rect";
  center: EnvironmentVec2;
  /** Half-extents along the region's local x and z before rotation. `falloff` defaults to half the smaller extent. */
  halfExtents: EnvironmentVec2;
  /** Rotation about the world y axis in radians; default 0. */
  rotationY?: number;
}

/**
 * A palette zone painted over the base terrain palette. Circle (the default when no `shape` is given),
 * `polyline` ribbons for roads/rivers, and rotatable `rect` districts all paint fully inside their core
 * and blend back across `falloff`; later regions in the list win overlaps.
 */
export type TerrainMaterialRegion = TerrainCircleRegion | TerrainPolylineRegion | TerrainRectRegion;

/** Per-band fog override cross-faded along z by `createBiomeFogSampler`; unset fields fall through to the base sky fog. */
export interface BiomeFog {
  color?: string;
  near?: number;
  far?: number;
  density?: number;
}

/** Per-band sky/light override cross-faded along z by `createBiomeSkySampler`; unset fields fall through to the base sky. */
export interface BiomeSky {
  horizonColor?: string;
  zenithColor?: string;
  sunIntensity?: number;
  ambientIntensity?: number;
}

/**
 * A z-ordered ground palette zone — the linear-boundary counterpart to the radial `materialRegions`.
 * Adjacent bands cross-fade into each other across a `fade`-wide window centered on the midpoint z
 * between their centers, so a multi-biome world (vale → marsh → peaks along z) blends its ground
 * color instead of hard-switching. Bands may also carry per-zone `fog`, `sky`, and `weather`. Order
 * the list by ascending `z`.
 */
export interface BiomeBand {
  /** World-space center z of the zone. */
  z: number;
  /** Cross-fade window width straddling the boundary to the next band. Default 64. */
  fade?: number;
  /** Named palette preset for the zone (see `TERRAIN_MATERIAL_PALETTES`); overridden field-by-field by `colors`. */
  material?: TerrainMaterial;
  /** Explicit low/high/waterline hex colors for the zone. */
  colors?: TerrainColors;
  /** Fog color/near/far/density for the zone, cross-faded per camera z; unset fields keep the base sky fog. */
  fog?: BiomeFog;
  /** Sky horizon/zenith colors and sun/ambient intensity for the zone, cross-faded per camera z; unset fields keep the base sky. */
  sky?: BiomeSky;
  /** Precipitation covering the zone — expands into a full-width weather strip centered at `[0, z]`, `fade`-deep. */
  weather?: "rain" | "snow";
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
  /** Ordered z-banded ground palettes that cross-fade along the world's z axis (vale → marsh → peaks). Painted under `materialRegions`. */
  biomeBands?: readonly BiomeBand[];
  segments?: number;
  seed?: string;
  frequency?: number;
  octaves?: number;
  ridged?: boolean;
  baseHeight?: number;
  waterLevel?: number;
  /** Flat pads carved into the noise field, e.g. for building pads or spawn circles. */
  flatten?: readonly TerrainFlattenMask[];
  /** Procedural detail surface (noise-driven rock/sand/snow over the biome base). Omit for the flat vertex-colour ground. */
  detail?: TerrainDetailConfig;
}

export interface RainEnvironmentConfig {
  /**
   * `w`/`d`/`h` size a wrap-volume of raindrops **anchored to and re-centered on the camera every
   * frame** — not a world-space region. `area.position` (and the `position` sugar below) has **no
   * visual effect** on rain/snow: the shell's `RainField`/`SnowField` always run `followCamera` and
   * never apply the mesh's transform, only `camera.position`. Keep `w`/`d`/`h` near camera scale
   * (roughly 50-120 per axis) so drops stay a visible size at normal view distance — sizing the
   * volume to a world region (e.g. matching a district's footprint) spreads the same drop count
   * across that much more space until they're sub-pixel and the storm reads as empty sky, even
   * though `summarizeEnvironment` shows the layer exists. Reach for `density`, `width`, and `opacity`
   * to make a storm read heavier/taller instead of enlarging `area`.
   */
  area?: EnvironmentArea;
  /** World-space center `[x, z]` of the band, matching `building()`/`ocean()` — sugar for `area.position`. No visual effect on rain/snow (see `area`); kept for API symmetry with other weather-adjacent features. */
  position?: EnvironmentVec2;
  density?: number;
  speed?: number;
  dropLength?: number;
  wind?: EnvironmentVec2;
  color?: string;
  /** Streak width of each raindrop quad, in world units. Default 0.018 — raise for a heavier-reading storm without enlarging `area`. */
  width?: number;
  /** Drop opacity, 0-1. Default 0.48 — raise for a denser-reading storm without enlarging `area`. */
  opacity?: number;
}

export interface SnowEnvironmentConfig {
  /**
   * `w`/`d`/`h` size a wrap-volume of snowflakes **anchored to and re-centered on the camera every
   * frame** — not a world-space region. `area.position` (and the `position` sugar below) has **no
   * visual effect** on rain/snow: the shell's `RainField`/`SnowField` always run `followCamera` and
   * never apply the mesh's transform, only `camera.position`. Keep `w`/`d`/`h` near camera scale
   * (roughly 50-120 per axis) so flakes stay a visible size at normal view distance — sizing the
   * volume to a world region (e.g. matching a district's footprint) spreads the same flake count
   * across that much more space until they're sub-pixel and the storm reads as empty sky, even
   * though `summarizeEnvironment` shows the layer exists. Reach for `density`, `flakeSize`, and
   * `opacity` to make a storm read heavier instead of enlarging `area`.
   */
  area?: EnvironmentArea;
  /** World-space center `[x, z]` of the band, matching `building()`/`ocean()` — sugar for `area.position`. No visual effect on rain/snow (see `area`); kept for API symmetry with other weather-adjacent features. */
  position?: EnvironmentVec2;
  density?: number;
  speed?: number;
  flakeSize?: number;
  drift?: number;
  wind?: EnvironmentVec2;
  color?: string;
  /** Flake opacity, 0-1. Default 0.86 — raise for a denser-reading storm without enlarging `area`. */
  opacity?: number;
}

export interface GrassEnvironmentConfig {
  area?: EnvironmentArea;
  /** World-space center `[x, z]` of the band, matching `building()`/`ocean()` — sugar for `area.position`, letting a biome zone site its own vegetation away from the origin. */
  position?: EnvironmentVec2;
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
  /**
   * Scheduled water level as a function of game-time seconds — tides, floods, draining chambers.
   * Wins over `level` (which stays the initial/static value); `waterSurfaceFromDescriptor` bakes it
   * into `WaterSurface.height`, and the shell repositions the rendered ocean from it every frame.
   * A function doesn't serialize; keep it pure and deterministic (compose with `time/stateSchedule`).
   */
  levelAt?: (time: number) => number;
  waveHeight?: number;
  /** Primary Gerstner wavelength in world units (shared with shell Ocean `waveScale`; default 18). */
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
  /** Sky-dome sphere radius in world units. Enlarge for a playfield sited far from the origin so the viewer never exits the dome. Default 260. */
  radius?: number;
  /** Horizon haze-band strength: 0 removes the dusty band, ~1 makes it heavy. Default 0.5. */
  hazeStrength?: number;
  /** Sun-glow brightness multiplier around the sun disc. Default 1. */
  sunGlowStrength?: number;
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
  /** Surface offset above the terrain height at `center`; default `0.05` — just proud of the ground. Ignored when `elevation` is set. */
  height?: number;
  /** Absolute world-space Y for the pad surface — a landing pad on a rooftop, a floating platform. Skips the implicit terrain flatten (there's no ground to flatten toward). */
  elevation?: number;
  color?: string;
  /** Rotation applied to rectangular pads; ignored for circular pads. */
  rotationY?: number;
}

export type TerrainEnvironmentDescriptor = { kind: "terrain" } & Required<
  Pick<TerrainEnvironmentConfig, "bounds" | "height">
> &
  Omit<TerrainEnvironmentConfig, "bounds" | "height">;

/** A bounded terrain patch floating at its own altitude — sky islands, arena platforms, split landmasses with void between. */
export interface TerrainIslandConfig extends TerrainEnvironmentConfig {
  /** World-space center of the island; its `bounds` rect surrounds this point. */
  origin: EnvironmentVec2;
}

export type TerrainIslandDescriptor = Omit<TerrainEnvironmentDescriptor, "kind"> & {
  kind: "island";
  origin: EnvironmentVec2;
};

export type RainEnvironmentDescriptor = { kind: "rain" } & Required<
  Pick<RainEnvironmentConfig, "area" | "density" | "speed" | "dropLength" | "wind" | "color" | "width" | "opacity">
>;

export type SnowEnvironmentDescriptor = { kind: "snow" } & Required<
  Pick<SnowEnvironmentConfig, "area" | "density" | "speed" | "flakeSize" | "drift" | "wind" | "color" | "opacity">
>;

export type GrassEnvironmentDescriptor = { kind: "grass" } & Required<
  Pick<GrassEnvironmentConfig, "area" | "density" | "bladeHeight" | "bladeWidth" | "windStrength" | "colors">
> &
  Pick<GrassEnvironmentConfig, "seed">;

export type OceanEnvironmentDescriptor = { kind: "ocean" } & Required<
  Pick<OceanEnvironmentConfig, "bounds" | "level" | "waveHeight" | "waveScale" | "waveSpeed" | "color">
> &
  Pick<OceanEnvironmentConfig, "position" | "levelAt">;

export type BuildingEnvironmentDescriptor = { kind: "building" } & Required<
  Pick<BuildingEnvironmentConfig, "count" | "footprint" | "stories" | "storyHeight" | "spacing" | "style">
> &
  Pick<BuildingEnvironmentConfig, "seed" | "position" | "palette">;

export type PadEnvironmentDescriptor = { kind: "pad" } & Required<
  Pick<PadEnvironmentConfig, "center" | "size" | "height" | "color">
> &
  Pick<PadEnvironmentConfig, "rotationY" | "elevation">;

export type SkyEnvironmentDescriptor = { kind: "sky" } & Required<
  Pick<SkyEnvironmentConfig, "preset" | "timeOfDay">
> &
  Omit<SkyEnvironmentConfig, "preset" | "timeOfDay">;

/** Config for {@link road}: a flat asphalt ribbon draped over the terrain along a centerline. */
export interface RoadEnvironmentConfig {
  /** Centerline vertices in world XZ; at least two points. */
  path: readonly (readonly [number, number])[];
  /** Ribbon width in world units. Default 8. */
  width?: number;
  /** Asphalt color. Default "#3b3e47". */
  color?: string;
  /** Paint a dashed centerline. Default true. */
  markings?: boolean;
  /** Centerline dash color. Default "#e8c74a". */
  markingColor?: string;
  /** Lift above the terrain to avoid z-fighting; stagger overlapping roads. Default 0.08. */
  elevation?: number;
  /** Sidewalk bands on both edges; `false` for none. Default `{ width: 2.6, color: "#a7adb8" }`. */
  sidewalk?: { width?: number; color?: string } | false;
}

/** Resolved road descriptor produced by {@link road} and rendered by the shell environment scene. */
export type RoadEnvironmentDescriptor = { kind: "road" } & Required<
  Pick<RoadEnvironmentConfig, "path" | "width" | "color" | "markings" | "markingColor" | "elevation">
> & {
  /** Resolved sidewalk band, or `false` when the road has none. */
  sidewalk: { width: number; color: string } | false;
};

export type WeatherEnvironmentDescriptor = RainEnvironmentDescriptor | SnowEnvironmentDescriptor;
export type VegetationEnvironmentDescriptor = GrassEnvironmentDescriptor;
export type WaterEnvironmentDescriptor = OceanEnvironmentDescriptor;
export type StructureEnvironmentDescriptor = BuildingEnvironmentDescriptor;

export type EnvironmentDescriptorList<T> = T | readonly T[];

export interface EnvironmentWorldConfig {
  terrain?: TerrainEnvironmentDescriptor;
  /** Disconnected landmasses at independent altitudes over the base `terrain` (or over void without one) — see `island()`. */
  islands?: readonly TerrainIslandDescriptor[];
  sky?: SkyEnvironmentDescriptor;
  weather?: EnvironmentDescriptorList<WeatherEnvironmentDescriptor>;
  vegetation?: EnvironmentDescriptorList<VegetationEnvironmentDescriptor>;
  water?: EnvironmentDescriptorList<WaterEnvironmentDescriptor>;
  structures?: EnvironmentDescriptorList<StructureEnvironmentDescriptor>;
  /** Road ribbons draped over the terrain — see `road()`. */
  roads?: EnvironmentDescriptorList<RoadEnvironmentDescriptor>;
  /** Ground pads, e.g. platforms or paved patches; each implicitly flattens the terrain beneath it. */
  pads?: readonly PadEnvironmentDescriptor[];
  /**
   * An authored editor {@link TerraformSnapshot} whose offsets layer over the base terrain — the
   * editor-to-runtime ground seam. The same snapshot in a game's `editorLayers.terrain` renders and
   * collides identically at runtime.
   */
  sculpt?: TerraformSnapshot;
  /**
   * Clearance discs flattened into the ground (spawns, plots, paths) — the terrain half of a
   * clearance zone whose foliage half is scatter's `avoid`. Derive them from a document with
   * `clearanceZonesFrom`.
   */
  clearings?: readonly AvoidZone[];
}

export interface EnvironmentWorldFeature {
  kind: "environment";
  terrain?: TerrainEnvironmentDescriptor;
  islands?: readonly TerrainIslandDescriptor[];
  sky?: SkyEnvironmentDescriptor;
  weather?: readonly WeatherEnvironmentDescriptor[];
  vegetation?: readonly VegetationEnvironmentDescriptor[];
  water?: readonly WaterEnvironmentDescriptor[];
  structures?: readonly StructureEnvironmentDescriptor[];
  roads?: readonly RoadEnvironmentDescriptor[];
  pads?: readonly PadEnvironmentDescriptor[];
  /** Authored sculpt snapshot layered over the base terrain — see {@link EnvironmentWorldConfig.sculpt}. */
  sculpt?: TerraformSnapshot;
  /** Clearance discs flattened into the ground — see {@link EnvironmentWorldConfig.clearings}. */
  clearings?: readonly AvoidZone[];
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

/** A declared world shape — biomes, voxel grid, plots, tilemap, environment, or flat — passed to `defineGame`. */
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

/** Derives implicit `TerrainFlattenMask`s carving each pad's footprint into the terrain beneath it. Elevated pads (absolute `elevation`) float free and carve nothing. */
export function padFlattenMasks(pads: readonly PadEnvironmentDescriptor[]): readonly TerrainFlattenMask[] {
  return pads
    .filter((padDescriptor) => padDescriptor.elevation === undefined)
    .map((padDescriptor) => ({
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

/** Expands each `biomeBand.weather` into a full-width precipitation strip centered on the band's z, `fade`-deep. */
function bandWeatherDescriptors(
  terrainDescriptor: TerrainEnvironmentDescriptor | undefined,
): readonly WeatherEnvironmentDescriptor[] {
  const bands = terrainDescriptor?.biomeBands;
  if (bands === undefined || bands.length === 0) return [];
  const width = terrainDescriptor!.bounds.w;
  const out: WeatherEnvironmentDescriptor[] = [];
  for (const band of bands) {
    if (band.weather === undefined) continue;
    const area: EnvironmentArea = { w: width, d: band.fade ?? 64, h: 80 };
    const position: EnvironmentVec2 = [0, band.z];
    out.push(band.weather === "rain" ? rain({ area, position }) : snow({ area, position }));
  }
  return out;
}

/** Composes an `environment()` world feature from terrain, sky, weather, vegetation, water, structures, roads, and pads. */
export function environment(config: EnvironmentWorldConfig = {}): EnvironmentWorldFeature {
  const explicitWeather = list(config.weather);
  const bandWeather = bandWeatherDescriptors(config.terrain);
  const weatherAll = [...(explicitWeather ?? []), ...bandWeather];
  const weather = weatherAll.length === 0 ? undefined : weatherAll;
  const vegetation = list(config.vegetation);
  const water = list(config.water);
  const structures = list(config.structures);
  const roads = list(config.roads);
  const terrainDescriptor = withPadFlatten(config.terrain, config.pads);

  return {
    kind: "environment",
    ...(terrainDescriptor === undefined ? {} : { terrain: terrainDescriptor }),
    ...(config.islands === undefined || config.islands.length === 0 ? {} : { islands: config.islands }),
    ...(config.sky === undefined ? {} : { sky: config.sky }),
    ...(weather === undefined ? {} : { weather }),
    ...(vegetation === undefined ? {} : { vegetation }),
    ...(water === undefined ? {} : { water }),
    ...(structures === undefined ? {} : { structures }),
    ...(roads === undefined ? {} : { roads }),
    ...(config.pads === undefined ? {} : { pads: config.pads }),
    ...(config.sculpt === undefined ? {} : { sculpt: config.sculpt }),
    ...(config.clearings === undefined || config.clearings.length === 0 ? {} : { clearings: config.clearings }),
  };
}

/** Declares a heightfield terrain patch for `environment()` — bounds, noise, materials, and flatten masks. */
export function terrain(config: TerrainEnvironmentConfig = {}): TerrainEnvironmentDescriptor {
  if (
    config.baseHeight !== undefined &&
    config.height === undefined &&
    config.heightField === undefined &&
    typeof console !== "undefined"
  ) {
    console.warn(
      "[jgengine:terrain] baseHeight is set but height is not — height is the noise amplitude (defaulting to 0 here), so this terrain is a flat plateau at baseHeight. Set height explicitly (height: 0 for an intentional plateau) to silence this.",
    );
  }
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
      ...(config.biomeBands === undefined ? {} : { biomeBands: config.biomeBands }),
      ...(config.segments === undefined ? {} : { segments: config.segments }),
      ...(config.seed === undefined ? {} : { seed: config.seed }),
      ...(config.frequency === undefined ? {} : { frequency: config.frequency }),
      ...(config.octaves === undefined ? {} : { octaves: config.octaves }),
      ...(config.ridged === undefined ? {} : { ridged: config.ridged }),
      ...(config.baseHeight === undefined ? {} : { baseHeight: config.baseHeight }),
      ...(config.waterLevel === undefined ? {} : { waterLevel: config.waterLevel }),
      ...(config.flatten === undefined ? {} : { flatten: config.flatten }),
      ...(config.detail === undefined ? {} : { detail: config.detail }),
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
      ...(config.radius === undefined ? {} : { radius: config.radius }),
      ...(config.hazeStrength === undefined ? {} : { hazeStrength: config.hazeStrength }),
      ...(config.sunGlowStrength === undefined ? {} : { sunGlowStrength: config.sunGlowStrength }),
      ...(config.fog === undefined ? {} : { fog: config.fog }),
    },
  );
}

function withAreaPosition(area: EnvironmentArea, position: EnvironmentVec2 | undefined): EnvironmentArea {
  return position !== undefined && area.position === undefined ? { ...area, position } : area;
}

/**
 * Practical ceiling (world units per axis) past which an author-specified rain/snow `area` is almost
 * certainly a world-region size mistakenly handed to the camera-anchored wrap-volume — see the
 * `area` doc on `RainEnvironmentConfig`/`SnowEnvironmentConfig`.
 */
const WEATHER_AREA_CAMERA_SCALE_HINT = 120;

function warnIfOversizedWeatherArea(kind: "rain" | "snow", area: EnvironmentArea): void {
  if (typeof console === "undefined") return;
  if (
    area.w <= WEATHER_AREA_CAMERA_SCALE_HINT &&
    area.d <= WEATHER_AREA_CAMERA_SCALE_HINT &&
    (area.h ?? 0) <= WEATHER_AREA_CAMERA_SCALE_HINT
  ) {
    return;
  }
  console.warn(
    `[jgengine:${kind}] area ${area.w}x${area.d}x${area.h ?? "default"} is far larger than the camera-anchored wrap-volume ${kind}() actually renders — area.position is ignored, and an oversized area.w/d/h just spreads drops/flakes thinner until they're sub-pixel at normal view distance, not wider visible coverage. Keep area near camera scale (~50-120 per axis); use density/width/opacity (or flakeSize for snow) to make a storm read heavier instead.`,
  );
}

/** Declares a rainfall weather effect for `environment()` — area, density, speed, wind, and drop width/opacity. */
export function rain(config: RainEnvironmentConfig = {}): RainEnvironmentDescriptor {
  const area = withAreaPosition(config.area ?? { w: 256, d: 256, h: 80 }, config.position);
  if (config.area !== undefined) warnIfOversizedWeatherArea("rain", area);
  return {
    kind: "rain",
    area,
    density: config.density ?? 0.65,
    speed: config.speed ?? 18,
    dropLength: config.dropLength ?? 0.8,
    wind: config.wind ?? [0, 0],
    color: config.color ?? "#9ec8ff",
    width: config.width ?? 0.018,
    opacity: config.opacity ?? 0.48,
  };
}

/** Declares a snowfall weather effect for `environment()` — area, density, drift, wind, and flake opacity. */
export function snow(config: SnowEnvironmentConfig = {}): SnowEnvironmentDescriptor {
  const area = withAreaPosition(config.area ?? { w: 256, d: 256, h: 80 }, config.position);
  if (config.area !== undefined) warnIfOversizedWeatherArea("snow", area);
  return {
    kind: "snow",
    area,
    density: config.density ?? 0.35,
    speed: config.speed ?? 2.4,
    flakeSize: config.flakeSize ?? 0.08,
    drift: config.drift ?? 0.4,
    wind: config.wind ?? [0, 0],
    color: config.color ?? "#ffffff",
    opacity: config.opacity ?? 0.86,
  };
}

/** Declares a grass vegetation patch for `environment()` — area, blade sizing, density, and colors. */
export function grass(config: GrassEnvironmentConfig = {}): GrassEnvironmentDescriptor {
  return withOptional(
    {
      kind: "grass" as const,
      area: withAreaPosition(config.area ?? { w: 128, d: 128 }, config.position),
      density: config.density ?? 4,
      bladeHeight: config.bladeHeight ?? [0.25, 0.9],
      bladeWidth: config.bladeWidth ?? 0.035,
      windStrength: config.windStrength ?? 0.35,
      colors: config.colors ?? ["#3f7d2d", "#66a83f"],
    },
    config.seed === undefined ? undefined : { seed: config.seed },
  );
}

/** Declares an ocean water body for `environment()` — bounds, level, and wave tuning. */
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
    ...(config.levelAt === undefined ? {} : { levelAt: config.levelAt }),
  };
}

/** Declare a road ribbon for an `environment()` world; the shell drapes and renders it over the terrain. */
export function road(config: RoadEnvironmentConfig): RoadEnvironmentDescriptor {
  if (config.path.length < 2) {
    throw new Error("road: path needs at least two points");
  }
  return {
    kind: "road",
    path: config.path,
    width: config.width ?? 8,
    color: config.color ?? "#3b3e47",
    markings: config.markings ?? true,
    markingColor: config.markingColor ?? "#e8c74a",
    elevation: config.elevation ?? 0.08,
    sidewalk:
      config.sidewalk === false
        ? false
        : { width: config.sidewalk?.width ?? 2.6, color: config.sidewalk?.color ?? "#a7adb8" },
  };
}

export function island(config: TerrainIslandConfig): TerrainIslandDescriptor {
  const { origin, ...terrainConfig } = config;
  const { kind: _kind, ...descriptor } = terrain(terrainConfig);
  return { ...descriptor, kind: "island", origin };
}

/** Declares a cluster of procedurally-massed buildings for `environment()` — count, footprint, stories, style. */
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
    {
      ...(config.rotationY === undefined ? {} : { rotationY: config.rotationY }),
      ...(config.elevation === undefined ? {} : { elevation: config.elevation }),
    },
  );
}

/** Declares a biome-painted world — the whole-world alternative to a single `environment()` terrain. */
export function biomes(config: BiomesWorldConfig): WorldFeature {
  return { kind: "biomes", ...config };
}

/** Declares a voxel-grid world for block-based games. */
export function voxel(config: VoxelWorldConfig): WorldFeature {
  return { kind: "voxel", ...config };
}

/** Declares a subdivided-plots world — farming, base-building, and other parcel-based layouts. */
export function plots(config: PlotsWorldConfig = {}): WorldFeature {
  return { kind: "plots", ...config };
}

/** Declares a 2D tilemap world from a map string. */
export function tilemap(config: TilemapWorldConfig): WorldFeature {
  return { kind: "tilemap", ...config };
}

/** Declares an empty flat world — the minimal `WorldFeature` for games with no terrain of their own. */
export function flat(): WorldFeature {
  return { kind: "flat" };
}
