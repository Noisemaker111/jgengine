import type { BuildingPaletteOverrides, BuildingProbabilities, BuildingStyle } from "../buildings/buildings";
import type { BuildingKit } from "../buildings/buildingKit";
import type { AvoidZone } from "./geometry";
import type { TerrainPathProfile } from "../terrain/pathTerrain";
import type { PlaceWorldFeature } from "../placement/place";
import type { TerraformSnapshot } from "../terrain/terraform";
import type { SpriteAtlas } from "../assets/spriteAtlas";
import type { VolumetricCloudsConfig } from "../sky/volumetricClouds";
import { warnOnce } from "../devtools/warnOnce";
import type { SurfaceMaterialSpec } from "../material/surfaceMaterialGenerator";
import { flattenGrassLook, readGrassLook, type GrassLook, type GrassLookGroups } from "@jgengine/core/grass/grassKind";
import type { GrassStyleSettings } from "@jgengine/core/grass/grassStyle";
import type { GrassSpeciesId } from "@jgengine/core/grass/grassSpecies";

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

export interface TerrainDetailConfig {
  rockColor?: string;
  sandColor?: string;
  snowColor?: string;
  rockSlopeStart?: number;
  snowHeight?: number;
  /** Water level for the sand band; defaults to the terrain's `waterLevel`, and no band is drawn when the terrain has none. */
  waterLevel?: number;
  detailScale?: number;
  macroScale?: number;
  roughness?: number;
  /** Overall detail intensity 0..1. Default 1. */
  strength?: number;
  /**
   * Per-surface ground response 0..1 for painted layers: grass, dirt, gravel, rock, sand, mud, snow
   * and road each draw their own procedural albedo, roughness and micro-normal, meet along
   * noise-broken edges, and slopes turn to rock. Default 1; 0 keeps flat painted colour.
   */
  surfaceStrength?: number;
  /**
   * Slope in degrees from horizontal where a scanned surface or paint layer switches from its
   * top-down projection to side projections (triplanar), so cliffs are not smeared. Default 45.
   */
  scanTriplanarAngle?: number;
  sweeps?: { dry?: readonly [number, number, number]; wet?: readonly [number, number, number] };
  /** Real PBR texture maps blended over the procedural detail — the seam for `@jgengine/assets` `buildMaterialCatalog` output. Omit to keep the procedural-only look. */
  material?: TerrainDetailMaterialConfig;
  surfaces?: TerrainSurfacesConfig;
}

export interface TerrainSurfaceLayer extends SurfaceMaterialSpec {
  scan?: TerrainMaterialMaps;
  /** World metres one tile covers. Default 5 ground, 4 sand, 8 rock. */
  tile?: number;
  /**
   * 0..1 how much the terrain's own colour (biome tint and sweeps for ground, `sandColor`,
   * `rockColor`) recolours the map while keeping its grain. Default 0.8 ground (so biome tints carry), 0 sand and rock.
   */
  tint?: number;
}

export interface TerrainSurfacesConfig {
  ground?: TerrainSurfaceLayer;
  sand?: TerrainSurfaceLayer;
  rock?: TerrainSurfaceLayer;
}

/**
 * PBR map URLs for a real ground texture — the same shape
 * `libraryTerrainMaterial(name).maps` from `@jgengine/assets` returns. Kept dependency-free here so
 * `core` never imports the assets package; any URLs (pulled maps, a CDN, a data URI) satisfy it.
 * Omitted roughness keeps the terrain scalar; omitted AO skips occlusion sampling.
 */
export interface TerrainMaterialMaps {
  color: string;
  normal: string;
  roughness?: string;
  ao?: string;
  /**
   * Height map. Scanned terrain surfaces and paint layers use it to decide which layer breaks
   * through at a blend edge; pass the URL only when the pulled set actually ships one — never invent it.
   */
  displacement?: string;
}

/**
 * Real PBR texture applied over the ground surface — the seam that lets a game put a
 * `buildMaterialCatalog` material on terrain. Blends with, never replaces, the procedural detail
 * shader: color/roughness/ao tile the maps by world position, `strength` fades them over the
 * existing vertex-colour + noise look.
 */
export interface TerrainDetailMaterialConfig {
  maps: TerrainMaterialMaps;
  repeat?: number;
  /** Blend strength of the texture over the procedural/vertex-colour base, 0..1. Default 1. */
  strength?: number;
  /**
   * How much of the map's OWN colour replaces the terrain's authored colour, 0..1. Default 1 —
   * at which the map's albedo wins and the biome tint, macro sweeps, and slope-rock blend under it
   * are painted over, so a whole region flattens to the texture's single hue. Drop toward 0 to keep
   * the authored colour and take only the map's grain (its light and shade), which is what a
   * hand-tinted world wants from a stock PBR set.
   */
  tint?: number;
  /**
   * What a failed map load does. Scanned maps are pulled by a game's asset step, not committed, so a
   * checkout without them looks exactly like a broken one. `"procedural"` (default) keeps the
   * authored procedural ground and logs one warning naming the map; `"fail"` hands the error to the
   * presentation retry screen, which is what a view that cannot render without the scan asks for.
   */
  missing?: "procedural" | "fail";
}

export interface TerrainFlattenMask {
  center: EnvironmentVec2;
  radius: number;
  /** Target flat height; defaults to the noise field's height at `center`. */
  height?: number;
  falloff?: number;
}

export interface TerrainRegionStyle {
  material?: TerrainMaterial;
  colors?: TerrainColors;
  /** Blend-ring width outside the region core back to the surrounding palette; default: half the region's characteristic size. */
  falloff?: number;
}

export interface TerrainCircleRegion extends TerrainRegionStyle {
  shape?: "circle";
  center: EnvironmentVec2;
  radius: number;
}

/** A ribbon palette zone following a centerline — roads and rivers, instead of chaining overlapping circles. */
export interface TerrainPolylineRegion extends TerrainRegionStyle {
  shape: "polyline";
  points: readonly EnvironmentVec2[];
  /** Full ribbon width; the painted core extends `width / 2` either side of the centerline. `falloff` defaults to `width * 0.5`. */
  width: number;
}

/** A palette zone filling a closed outline — a biome drawn as a shape (swamp, snowfield, redwood stand). `falloff` defaults to 16. */
export interface TerrainPolygonRegion extends TerrainRegionStyle {
  shape: "polygon";
  points: readonly EnvironmentVec2[];
}

export interface TerrainRectRegion extends TerrainRegionStyle {
  shape: "rect";
  center: EnvironmentVec2;
  /** Half-extents along the region's local x and z before rotation. `falloff` defaults to half the smaller extent. */
  halfExtents: EnvironmentVec2;
  /** Rotation about the world y axis in radians; default 0. */
  rotationY?: number;
}

export type TerrainMaterialRegion = TerrainCircleRegion | TerrainPolylineRegion | TerrainRectRegion | TerrainPolygonRegion;

export interface BiomeFog {
  color?: string;
  near?: number;
  far?: number;
  density?: number;
}

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
  fade?: number;
  material?: TerrainMaterial;
  colors?: TerrainColors;
  fog?: BiomeFog;
  sky?: BiomeSky;
  weather?: "rain" | "snow";
}

export interface TerrainEnvironmentConfig {
  bounds?: WorldBounds;
  height?: number;
  heightMap?: string;
  /**
   * Game-supplied height function replacing the built-in noise field — banded biomes, ridge walls,
   * terracing, anything expressible as `(x, z) => y`. `flatten` masks still carve into it, and both
   * the rendered ground and `ctx.world.ground` sample it. A function doesn't serialize; keep it pure
   * unless `heightRevision` tracks changes.
   */
  heightField?: (x: number, z: number) => number;
  /** Revision of a changing height function; return undefined if its changes cannot be tracked. */
  heightRevision?: () => number | undefined;
  material?: TerrainMaterial;
  colors?: TerrainColors;
  materialRegions?: readonly TerrainMaterialRegion[];
  biomeBands?: readonly BiomeBand[];
  /**
   * Grid segments per axis, or `[x, z]` for a non-square grid. Honoured as-is for compatibility,
   * but a count says nothing about ground detail until you know the bounds — prefer `cellSize`.
   */
  segments?: number | readonly [x: number, z: number];
  /**
   * Ground resolution as world units per quad — the density form of `segments`. The per-axis grid is
   * derived from `bounds`, so the same `cellSize` on a bigger world spends more cells instead of
   * stretching one fixed count over it. Set this or `segments`, never both.
   *
   * A world that needs mixed density next (a coarse far ring around a fine playable core, or bands
   * that tighten over a painted path) would carry `density?: readonly { cellSize: number; radius?: number }[]`
   * in place of this single number. Not built.
   */
  cellSize?: number;
  seed?: string;
  frequency?: number;
  octaves?: number;
  ridged?: boolean;
  baseHeight?: number;
  waterLevel?: number;
  coast?: TerrainCoast;
  flatten?: readonly TerrainFlattenMask[];
  pathProfiles?: readonly TerrainPathProfile[];
  detail?: TerrainDetailConfig | false;
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

/**
 * Config for {@link grass}: where the patch grows, an optional named `species` to start from, plus any group of
 * {@link GrassLook} knobs (`blade`, `tuft`, `colour`, `season`, `mix`, `flowers`, `growth`, `wind`, ...). Set only
 * what you care about; unset knobs take the species (or the shared grass defaults) and every knob is clamped to a
 * range that still reads as full ground cover.
 */
export interface GrassEnvironmentConfig extends GrassLookGroups {
  species?: GrassSpeciesId;
  area?: EnvironmentArea;
  /** World-space center `[x, z]` of the band, matching `building()`/`ocean()` — sugar for `area.position`, letting a biome zone site its own vegetation away from the origin. */
  position?: EnvironmentVec2;
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
  waveScale?: number;
  waveSpeed?: number;
  color?: string;
  palette?: OceanPalette;
  horizon?: boolean;
  /** Metres of water you see through before it takes its colour: clear shallows want 3 or more. Default 1.2. */
  clarity?: number;
  /** Bed-map texels per side for shallows and shore foam; more gives a finer shoreline. Default about one per two metres, at most 256. */
  bedResolution?: number;
}

export interface OceanPalette {
  deep?: string;
  crest?: string;
  foam?: string;
  /** How much of the sky the surface mirrors, 0..1 (default 0.7). */
  fresnel?: number;
}

/**
 * Where the sun sits, as a compass bearing and a height above the horizon, both in degrees.
 * `azimuth` 0 points toward -Z (north), 90 toward +X (east); `elevation` 90 is straight overhead.
 */
export interface SkySunConfig {
  /** Compass bearing of the sun in degrees; 0 = -Z, 90 = +X. Default 0. */
  azimuth?: number;
  /** Height above the horizon in degrees; 0 sits on the horizon, 90 is overhead. Default 68. */
  elevation?: number;
}

export interface SkyEnvironmentConfig {
  preset?: "day" | "dusk" | "night";
  /** Drive sun/sky from the world clock's `calendar().dayFraction` instead of the fixed `preset`. */
  timeOfDay?: boolean;
  /**
   * Horizon tint at noon. Under `timeOfDay` this only sets the noon keyframe; dawn, dusk, and night
   * still crossfade through the engine presets, so an authored tint is visible for part of the day.
   */
  horizonColor?: string;
  /** Zenith tint at noon; same `timeOfDay` crossfade caveat as `horizonColor`. */
  zenithColor?: string;
  dayHold?: number;
  sunIntensity?: number;
  ambientIntensity?: number;
  sunColor?: string;
  fogColor?: string;
  moonIntensity?: number;
  moonColor?: string;
  /**
   * Sun placement for the dome glow and the sky-owned sun light. With a fixed `preset` this is the
   * sun's exact direction; under `timeOfDay` it is where the sun stands at noon and the day arc
   * swings around that bearing. Unset with an authored `lighting.directional` light, the shell takes
   * the first directional light's direction so the dome sun agrees with the shadows.
   */
  sun?: SkySunConfig;
  /** Sky-dome sphere radius in world units. Enlarge for a playfield sited far from the origin so the viewer never exits the dome. The dome draws on the far plane, so any radius shows. Default 260. */
  radius?: number;
  hazeStrength?: number;
  sunGlowStrength?: number;
  gradientExponent?: number;
  cloudiness?: number;
  fog?: { color?: string; near?: number; far?: number };
  volumetricClouds?: VolumetricCloudsConfig;
}

export interface BuildingFrontageRoad {
  path: readonly EnvironmentVec2[];
  width: number;
  /** Sidewalk on each side: metres, a `road()` sidewalk band, or `false`/absent for none. Lots stand behind it. */
  sidewalk?: number | { width: number } | false;
}

/**
 * Street-aware placement for `building()`: instead of a grid scattered around `position`, lots are
 * stepped along each road's frontage, offset by a consistent setback (a curb + sidewalk strip), and
 * turned so every building FRONT faces its road. `footprint` (`w` = frontage width, `d` = depth) and
 * `spacing` (along-road gap) are shared with the grid mode. Deterministic and bounded by `maxLots`.
 */
export interface BuildingFrontageConfig {
  roads: readonly BuildingFrontageRoad[];
  setback?: number;
  bothSides?: boolean;
  /** Clip region; lots whose center falls outside are dropped. Omit to keep every lot. */
  area?: { center?: EnvironmentVec2; halfExtents: EnvironmentVec2 };
  /** Hard cap on emitted lots so a long network stays bounded. Default 400. */
  maxLots?: number;
}

export interface BuildingEnvironmentConfig {
  count?: number;
  position?: EnvironmentVec2;
  footprint?: WorldBounds;
  stories?: readonly [number, number];
  storyHeight?: number;
  spacing?: number;
  style?: BuildingStyle;
  palette?: BuildingPaletteOverrides;
  /** Facade part probabilities (windows, shopfronts, awnings, …); unset parts follow the `style`. */
  probabilities?: Partial<BuildingProbabilities>;
  seed?: string;
  /**
   * Street-aware placement: derive lots along the given roads' frontage (facing each street, set
   * back by a sidewalk strip) instead of the grid around `position`. See {@link BuildingFrontageConfig}.
   */
  along?: BuildingFrontageConfig;
  kit?: BuildingKit;
  solid?: boolean;
}

export type PadSize = readonly [number, number] | { radius: number };

export interface PadEnvironmentConfig {
  center: EnvironmentVec2;
  size: PadSize;
  height?: number;
  /** Absolute world-space Y for the pad surface — a landing pad on a rooftop, a floating platform. Skips the implicit terrain flatten (there's no ground to flatten toward). */
  elevation?: number;
  color?: string;
  rotationY?: number;
}

export type TerrainEnvironmentDescriptor = { kind: "terrain" } & Required<
  Pick<TerrainEnvironmentConfig, "bounds" | "height">
> &
  Omit<TerrainEnvironmentConfig, "bounds" | "height">;

export interface TerrainCoast {
  /** Island centre `[x, z]` of the ring shore. Default `[0, 0]`. */
  center?: readonly [number, number];
  /** Mean shore distance from the centre in metres, for a ring shore. Needed unless `outlines` is set. */
  radius?: number;
  /**
   * Authored shorelines in world XZ, one closed ring per landmass (main island, islets): land is inside a
   * ring. Replaces the ring shore; `wobble` still roughens the line so a coarse outline reads as coves.
   */
  outlines?: readonly (readonly (readonly [number, number])[])[];
  /** Shore stretch per axis `[x, z]` (1 = round). Default `[1, 1]`. */
  stretch?: readonly [number, number];
  /** Metres over which land falls from full height to the shore. Default `radius * 0.25`, or 120 with `outlines`. */
  falloff?: number;
  shoreHeight?: number;
  seaFloor?: number;
  /** Metres the sea floor takes to reach `seaFloor` past the shore. Default 120. */
  shelf?: number;
  /** 0..1 how much the shoreline wanders (bays, capes). Default 0.25. */
  wobble?: number;
  seed?: string;
}

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

export interface GrassEnvironmentDescriptor {
  kind: "grass";
  area: EnvironmentArea;
  look: GrassLook;
  meta: Readonly<Record<string, unknown>>;
}

export type OceanEnvironmentDescriptor = { kind: "ocean" } & Required<
  Pick<OceanEnvironmentConfig, "bounds" | "level" | "waveHeight" | "waveScale" | "waveSpeed" | "color">
> &
  Pick<OceanEnvironmentConfig, "position" | "levelAt" | "palette" | "horizon" | "clarity" | "bedResolution">;

export type BuildingEnvironmentDescriptor = { kind: "building" } & Required<
  Pick<BuildingEnvironmentConfig, "count" | "footprint" | "stories" | "storyHeight" | "spacing" | "style">
> &
  Pick<BuildingEnvironmentConfig, "seed" | "position" | "palette" | "probabilities" | "along" | "kit" | "solid">;

export type PadEnvironmentDescriptor = { kind: "pad" } & Required<
  Pick<PadEnvironmentConfig, "center" | "size" | "height" | "color">
> &
  Pick<PadEnvironmentConfig, "rotationY" | "elevation">;

export type SkyEnvironmentDescriptor = { kind: "sky" } & Required<
  Pick<SkyEnvironmentConfig, "preset" | "timeOfDay">
> &
  Omit<SkyEnvironmentConfig, "preset" | "timeOfDay">;

export interface RoadEnvironmentConfig {
  path: readonly (readonly [number, number])[];
  width?: number;
  color?: string;
  markings?: boolean;
  markingColor?: string;
  /** Lift above the terrain to avoid z-fighting; stagger overlapping roads. Default 0.08. */
  elevation?: number;
  /**
   * Sidewalk bands on both edges, raised a kerb above the carriageway; `false` for none.
   * Default `{ width: 2.6, color: "#a7adb8" }`. `slabs` is the paving slab length in metres, joints
   * square to the kerb (default 1.5); `false` for none, as a paver scan carries its own joints.
   * `kerb` is the kerb height in metres (default 0.14; US kerbs run 0.15).
   */
  sidewalk?: { width?: number; color?: string; slabs?: number | false; kerb?: number } | false;
  surface?: string | false;
  materials?: RoadSurfaceScans;
  closed?: boolean;
  /**
   * Fillet radius for sharp bends, metres, so a turn reads as an arc instead of overlapping
   * rectangles. Default `max(1.5, width × 0.9)`; 0 keeps hard corners.
   */
  cornerRadius?: number;
  /** Tyre ruts and polished lanes, 0..1. Default 1 on soft ground, 0.6 on paving. */
  wear?: number;
  edgeSoftness?: number;
}

/**
 * The scanned carriageway every paved road wears unless it names its own `materials.road`: the
 * library's `asphalt/dry` (ambientCG Asphalt003), exactly `librarySurfaceScan("asphalt/dry")`.
 * A game that has not pulled the scan keeps the procedural asphalt.
 */
export const DEFAULT_ROAD_SCAN: TerrainDetailMaterialConfig = {
  maps: {
    color: "/materials/ambientcg-asphalt003/color.jpg",
    normal: "/materials/ambientcg-asphalt003/normal.jpg",
    roughness: "/materials/ambientcg-asphalt003/roughness.jpg",
    ao: "/materials/ambientcg-asphalt003/ao.jpg",
    displacement: "/materials/ambientcg-asphalt003/displacement.jpg",
  },
  repeat: 4,
  strength: 1,
  tint: 1,
};

/** @internal */
export function isAsphaltSurface(surface: string | false | undefined): boolean {
  return surface === undefined || surface === "road" || surface === "asphalt" || surface === "street";
}

export interface RoadSurfaceScans {
  road?: TerrainDetailMaterialConfig;
  sidewalk?: TerrainDetailMaterialConfig;
  curb?: TerrainDetailMaterialConfig;
}

export type RoadEnvironmentDescriptor = { kind: "road" } & Required<
  Pick<RoadEnvironmentConfig, "path" | "width" | "color" | "markings" | "markingColor" | "elevation">
> & {
  sidewalk: { width: number; color: string; slabs?: number | false; kerb?: number } | false;
  surface?: string | false;
  /** Scanned surfaces per layer; a paved road carries {@link DEFAULT_ROAD_SCAN} on `road` unless it names one. */
  materials?: RoadSurfaceScans;
  /** Fillet radius for bends, metres; 0 for hard corners. Absent means `max(1.5, width × 0.9)`. */
  cornerRadius?: number;
  closed?: boolean;
  wear?: number;
  edgeSoftness?: number;
};

export type WeatherEnvironmentDescriptor = RainEnvironmentDescriptor | SnowEnvironmentDescriptor;
export type VegetationEnvironmentDescriptor = GrassEnvironmentDescriptor;
export type WaterEnvironmentDescriptor = OceanEnvironmentDescriptor;
export type StructureEnvironmentDescriptor = BuildingEnvironmentDescriptor;

export type EnvironmentDescriptorList<T> = T | readonly T[];

export interface EnvironmentWorldConfig {
  terrain?: TerrainEnvironmentDescriptor;
  islands?: readonly TerrainIslandDescriptor[];
  sky?: SkyEnvironmentDescriptor;
  weather?: EnvironmentDescriptorList<WeatherEnvironmentDescriptor>;
  vegetation?: EnvironmentDescriptorList<VegetationEnvironmentDescriptor>;
  water?: EnvironmentDescriptorList<WaterEnvironmentDescriptor>;
  structures?: EnvironmentDescriptorList<StructureEnvironmentDescriptor>;
  roads?: EnvironmentDescriptorList<RoadEnvironmentDescriptor>;
  roadSource?: LiveRoadSource;
  pads?: readonly PadEnvironmentDescriptor[];
  sculpt?: TerraformSnapshot | undefined;
  clearings?: readonly AvoidZone[];
  /**
   * The world's grass style (realism 0 cartoon .. 1 photoreal, any slider by hand, or a preset): every
   * `grass()` band draws with it unless its own `style` overrides it. A scene document's
   * `environment.grassStyle` reaches here through `environmentContentFromDocument`.
   */
  grassStyle?: GrassStyleSettings;
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
  sculpt?: TerraformSnapshot;
  clearings?: readonly AvoidZone[];
  roadSource?: LiveRoadSource;
}

export interface LiveRoadSource {
  current(): readonly RoadEnvironmentDescriptor[];
  subscribe(listener: () => void): () => void;
}

export interface WorldGridCell {
  x: number;
  z: number;
  height?: number;
  color?: string;
}

/** Shared by `biomes()`/`voxel()`/`plots()`/`tilemap()` so the shell can render their declared content as instanced boxes without a hand-written renderer. */
export interface WorldGridConfig {
  cells?: readonly WorldGridCell[];
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
  tileSet?: { atlas: SpriteAtlas; tiles: Record<string, string> };
  sortingLayer?: string;
}

export type WorldFeature =
  | PlaceWorldFeature
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

/** Composes an `environment()` feature from terrain, sky, weather, vegetation, water, structures, roads, and pads.
 *
 * Legacy dressing-in-code path — not how a world is defined. A world is the place you play in
 * (`world()` from `world/place`: ground + laws); sky look, foliage scatter, props, and sculpt are
 * scene content authored in the editor. Reach for `environment()` only when consuming
 * editor/preset-written scene data (`environmentContentFromDocument`) or maintaining an existing
 * game; never scaffold new worlds from it.
 *
 * @capability world-environment compose editor/preset-derived outdoor dressing — terrain, weather, water, structures — into a legacy environment feature
 */
export function environment(config: EnvironmentWorldConfig = {}): EnvironmentWorldFeature {
  const explicitWeather = list(config.weather);
  const bandWeather = bandWeatherDescriptors(config.terrain);
  const weatherAll = [...(explicitWeather ?? []), ...bandWeather];
  const weather = weatherAll.length === 0 ? undefined : weatherAll;
  const declared = list(config.vegetation);
  const grassStyle = config.grassStyle;
  const vegetation = declared === undefined || grassStyle === undefined ? declared : declared.map((band) => ({ ...band, look: readGrassLook(band.meta, grassStyle) }));
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
    ...(config.roadSource === undefined ? {} : { roadSource: config.roadSource }),
  };
}

/**
 * Vertex ceiling for a terrain grid derived from `cellSize`. A density target that reads fine
 * ("0.4 m cells") can quietly ask for millions of vertices on a large world; past this the
 * declaration fails with its own numbers instead of booting a ground mesh nobody can afford.
 */
const TERRAIN_VERTEX_CEILING = 1_000_000;

function gridVertices(bounds: WorldBounds, cellSize: number): { x: number; z: number; vertices: number } {
  const x = Math.max(1, Math.round(bounds.w / cellSize));
  const z = Math.max(1, Math.round(bounds.d / cellSize));
  return { x, z, vertices: (x + 1) * (z + 1) };
}

/** Smallest `cellSize` whose derived grid fits the ceiling — quoted back in the failure, so the fix is one number. */
function minimumCellSize(bounds: WorldBounds): number {
  let lo = Math.sqrt((bounds.w * bounds.d) / TERRAIN_VERTEX_CEILING) * 0.5;
  let hi = Math.max(bounds.w, bounds.d, 1);
  for (let step = 0; step < 64; step += 1) {
    const mid = (lo + hi) / 2;
    if (gridVertices(bounds, mid).vertices > TERRAIN_VERTEX_CEILING) lo = mid;
    else hi = mid;
  }
  return hi;
}

/**
 * Resolves the authored grid: `segments` passes through, `cellSize` derives a per-axis count from the
 * bounds. Both forms in one declaration is an error rather than a silent precedence rule, because the
 * pair produces exactly the accidental density this API exists to remove.
 */
function terrainSegments(
  bounds: WorldBounds,
  config: TerrainEnvironmentConfig,
): number | readonly [x: number, z: number] | undefined {
  const { segments, cellSize } = config;
  if (segments !== undefined && cellSize !== undefined) {
    throw new Error(
      "terrain: set segments or cellSize, not both — cellSize (world units per quad) derives the grid from the bounds, segments counts it directly. Keep cellSize and drop segments.",
    );
  }
  if (cellSize === undefined) return segments;
  if (!Number.isFinite(cellSize) || cellSize <= 0) {
    throw new Error(`terrain: cellSize must be a positive number of world units per quad (got ${cellSize})`);
  }
  const { x, z, vertices } = gridVertices(bounds, cellSize);
  if (vertices > TERRAIN_VERTEX_CEILING) {
    // Rounded up: the quoted cell size has to pass the same check, not read well and fail again.
    const minimum = Math.ceil(minimumCellSize(bounds) * 1_000) / 1_000;
    throw new Error(
      `terrain: cellSize ${cellSize} on ${bounds.w}×${bounds.d} bounds is ${x}×${z} cells = ${vertices.toLocaleString("en-US")} vertices, over the ${TERRAIN_VERTEX_CEILING.toLocaleString("en-US")}-vertex ceiling. Use cellSize ${minimum} or larger, or shrink the bounds.`,
    );
  }
  return x === z ? x : ([x, z] as const);
}

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
  const bounds = config.bounds ?? { w: 512, d: 512 };
  const segments = terrainSegments(bounds, config);
  return withOptional(
    {
      kind: "terrain" as const,
      bounds,
      height: config.height ?? 0,
    },
    {
      ...(config.heightMap === undefined ? {} : { heightMap: config.heightMap }),
      ...(config.heightField === undefined ? {} : { heightField: config.heightField }),
      ...(config.heightRevision === undefined ? {} : { heightRevision: config.heightRevision }),
      ...(config.material === undefined ? {} : { material: config.material }),
      ...(config.colors === undefined ? {} : { colors: config.colors }),
      ...(config.materialRegions === undefined ? {} : { materialRegions: config.materialRegions }),
      ...(config.biomeBands === undefined ? {} : { biomeBands: config.biomeBands }),
      ...(segments === undefined ? {} : { segments }),
      ...(config.seed === undefined ? {} : { seed: config.seed }),
      ...(config.frequency === undefined ? {} : { frequency: config.frequency }),
      ...(config.octaves === undefined ? {} : { octaves: config.octaves }),
      ...(config.ridged === undefined ? {} : { ridged: config.ridged }),
      ...(config.baseHeight === undefined ? {} : { baseHeight: config.baseHeight }),
      ...(config.waterLevel === undefined ? {} : { waterLevel: config.waterLevel }),
      ...(config.coast === undefined ? {} : { coast: config.coast }),
      ...(config.flatten === undefined ? {} : { flatten: config.flatten }),
      ...(config.pathProfiles === undefined ? {} : { pathProfiles: config.pathProfiles }),
      ...(config.detail === undefined ? {} : { detail: config.detail }),
    },
  );
}

export function sky(config: SkyEnvironmentConfig = {}): SkyEnvironmentDescriptor {
  if (config.timeOfDay === true && (config.zenithColor !== undefined || config.horizonColor !== undefined)) {
    warnOnce(
      "sky-timeofday-tint",
      "[jgengine] sky(): zenithColor/horizonColor only set the noon keyframe under timeOfDay; dawn, dusk, and night crossfade through the engine presets. Drop timeOfDay for a fixed tint.",
    );
  }
  return withOptional(
    {
      kind: "sky" as const,
      preset: config.preset ?? "day",
      timeOfDay: config.timeOfDay ?? false,
    },
    {
      ...(config.horizonColor === undefined ? {} : { horizonColor: config.horizonColor }),
      ...(config.zenithColor === undefined ? {} : { zenithColor: config.zenithColor }),
      ...(config.dayHold === undefined ? {} : { dayHold: config.dayHold }),
      ...(config.sunIntensity === undefined ? {} : { sunIntensity: config.sunIntensity }),
      ...(config.ambientIntensity === undefined ? {} : { ambientIntensity: config.ambientIntensity }),
      ...(config.sunColor === undefined ? {} : { sunColor: config.sunColor }),
      ...(config.fogColor === undefined ? {} : { fogColor: config.fogColor }),
      ...(config.moonIntensity === undefined ? {} : { moonIntensity: config.moonIntensity }),
      ...(config.moonColor === undefined ? {} : { moonColor: config.moonColor }),
      ...(config.sun === undefined ? {} : { sun: { ...config.sun } }),
      ...(config.radius === undefined ? {} : { radius: config.radius }),
      ...(config.hazeStrength === undefined ? {} : { hazeStrength: config.hazeStrength }),
      ...(config.sunGlowStrength === undefined ? {} : { sunGlowStrength: config.sunGlowStrength }),
      ...(config.gradientExponent === undefined ? {} : { gradientExponent: config.gradientExponent }),
      ...(config.cloudiness === undefined ? {} : { cloudiness: config.cloudiness }),
      ...(config.fog === undefined ? {} : { fog: config.fog }),
      ...(config.volumetricClouds === undefined ? {} : { volumetricClouds: config.volumetricClouds }),
    },
  );
}

function withAreaPosition(area: EnvironmentArea, position: EnvironmentVec2 | undefined): EnvironmentArea {
  return position !== undefined && area.position === undefined ? { ...area, position } : area;
}

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

export function grass(config: GrassEnvironmentConfig = {}): GrassEnvironmentDescriptor {
  const { area, position, species, ...groups } = config;
  const meta = { ...(species === undefined ? {} : { species }), ...flattenGrassLook(groups) };
  return {
    kind: "grass" as const,
    area: withAreaPosition(area ?? { w: 128, d: 128 }, position),
    look: readGrassLook(meta),
    meta,
  };
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
    ...(config.levelAt === undefined ? {} : { levelAt: config.levelAt }),
    ...(config.palette === undefined ? {} : { palette: { ...config.palette } }),
    ...(config.horizon === undefined ? {} : { horizon: config.horizon }),
    ...(config.clarity === undefined ? {} : { clarity: config.clarity }),
    ...(config.bedResolution === undefined ? {} : { bedResolution: config.bedResolution }),
  };
}

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
        : {
            width: config.sidewalk?.width ?? 2.6,
            color: config.sidewalk?.color ?? "#a7adb8",
            ...(config.sidewalk?.slabs === undefined ? {} : { slabs: config.sidewalk.slabs }),
            ...(config.sidewalk?.kerb === undefined ? {} : { kerb: Math.max(0, config.sidewalk.kerb) }),
          },
    ...(config.surface === undefined ? {} : { surface: config.surface }),
    ...roadMaterials(config),
    ...(config.cornerRadius === undefined ? {} : { cornerRadius: Math.max(0, config.cornerRadius) }),
    ...(config.closed === true ? { closed: true } : {}),
    ...(config.wear === undefined ? {} : { wear: Math.min(1, Math.max(0, config.wear)) }),
    ...(config.edgeSoftness === undefined ? {} : { edgeSoftness: Math.max(0, config.edgeSoftness) }),
  };
}

function roadMaterials(config: RoadEnvironmentConfig): { materials?: RoadSurfaceScans } {
  const paved = isAsphaltSurface(config.surface);
  if (!paved || config.materials?.road !== undefined) return config.materials === undefined ? {} : { materials: config.materials };
  return { materials: { ...config.materials, road: DEFAULT_ROAD_SCAN } };
}

export function island(config: TerrainIslandConfig): TerrainIslandDescriptor {
  const { origin, ...terrainConfig } = config;
  const { kind: _kind, ...descriptor } = terrain(terrainConfig);
  return { ...descriptor, kind: "island", origin };
}

/** Declares a cluster of procedurally-massed buildings for `environment()` — count, footprint, stories, style. Pass `along` to line road frontage instead of gridding around `position`. */
export function building(config: BuildingEnvironmentConfig = {}): BuildingEnvironmentDescriptor {
  return withOptional(
    {
      kind: "building" as const,
      // In frontage mode the road network sizes the district; `count` becomes an upper bound, so a
      // caller that just says `along` gets a filled street rather than a single grid building.
      count: config.count ?? (config.along === undefined ? 1 : config.along.maxLots ?? 400),
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
      ...(config.probabilities === undefined ? {} : { probabilities: config.probabilities }),
      ...(config.along === undefined ? {} : { along: config.along }),
      ...(config.kit === undefined ? {} : { kit: config.kit }),
      ...(config.solid === undefined ? {} : { solid: config.solid }),
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
