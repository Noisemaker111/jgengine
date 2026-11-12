import {
  masksInfluence,
  type AvoidCorridor,
  type AvoidMasks,
  type AvoidZone,
  type Vec2,
} from "../world/geometry";
import { pickWeighted } from "../random/pick";
import { hashUnit } from "../random/rng";
import { defineGenerator, generatorSeed } from "../generator/generator";
import { defineParamSchema, parseParams, type ParamsOf } from "../generator/paramSchema";
import { distanceToRing, pointInPolygon, polygonArea, ringBounds } from "../world/polygon";
import { scatter } from "./scatter";
import { SCATTER_INSTANCE_BUDGET } from "./scatterCoverage";
import type { SceneDocumentLike, ScenePathLike } from "../world/sceneShapes";
import type { TerrainNormal } from "../terrain/terrain";

/** The editor path kind that marks a closed polyline as a foliage/scatter region. */
export const SCATTER_PATH_KIND = "scatter";

/**
 * The scatter region's params: one schema the inspector, `meta` parsing, the variant grid and
 * {@link SCATTER_GENERATOR} share. `palette` (what fills the area) leads and `density` is the single
 * coverage slider hoisted into the shared `CoverageSection`, so a region reads as Area → Assets →
 * Density like every other scatterable kind; the rest is kind-specific tuning. A region's footprint
 * (its polygon) and manual `avoid` discs are its shape, not params.
 */
export const SCATTER_SCHEMA = defineParamSchema({
  fields: [
    { type: "weightedList", key: "palette", label: "species (weighted)", itemLabel: "grass / tree id", default: [{ item: "grass", weight: 1 }], vary: false },
    { type: "range", key: "density", label: "density", min: 0, max: 2, step: 0.01, default: 0.15, unit: "/m²" },
    { type: "number", key: "minSpacing", label: "spacing", step: 0.25, default: 1.5, min: 0, explore: [0, 6] },
    { type: "number", key: "minScale", label: "min scale", step: 0.05, default: 0.8, min: 0, explore: [0.3, 1.5] },
    { type: "number", key: "maxScale", label: "max scale", step: 0.05, default: 1.3, min: 0, explore: [0.6, 2.5] },
    { type: "number", key: "minYaw", label: "min yaw (rad)", step: 0.05, default: 0, vary: false },
    { type: "number", key: "maxYaw", label: "max yaw (rad)", step: 0.05, default: Math.PI * 2, vary: false },
    { type: "range", key: "jitter", label: "jitter (0 lattice, 1 scattered)", min: 0, max: 1, step: 0.01, default: 1 },
    { type: "number", key: "maxSlope", label: "max slope", step: 0.05, default: 0, min: 0, vary: false },
    { type: "number", key: "minHeight", label: "lowest ground (m)", step: 0.5, default: -1e4, vary: false },
    { type: "number", key: "maxHeight", label: "highest ground (m)", step: 0.5, default: 1e4, vary: false },
    { type: "number", key: "edgeFalloff", label: "edge fade", step: 0.5, default: 0, min: 0, explore: [0, 8] },
    { type: "number", key: "verticalOffset", label: "lift (m)", step: 0.05, default: 0, vary: false },
    { type: "bool", key: "alignToNormal", label: "align to slope", default: false },
    { type: "bool", key: "autoAvoid", label: "auto-avoid gameplay spots", default: true, vary: false },
    { type: "number", key: "clearance", label: "clears others (m)", step: 0.25, default: 0, min: 0, vary: false },
    { type: "seed", key: "seed", label: "seed", default: "" },
  ],
});

/** A scatter region's parsed params. */
export type ScatterParams = ParamsOf<typeof SCATTER_SCHEMA>;

/** Default clearance radius (m) for an auto-avoided gameplay marker with no explicit `meta.clearance`. */
export const DEFAULT_MARKER_CLEARANCE = 3.5;

/** Marker/volume kinds that repel scatter and flatten terrain by default (spawns, objectives, vendors). */
export const DEFAULT_CLEARANCE_KINDS: readonly string[] = [
  "player_spawn",
  "spawn",
  "boss",
  "goal",
  "keep",
  "vendor",
  "chest",
  "travel",
];

/** A resolvable scatter region: a closed polygon footprint, its params and seed, and its own clearance discs. */
export interface ScatterRegion {
  id: string;
  /** The region's injected seed; placements hash `id` with it, so two regions with one seed still differ. */
  seed: string;
  polygon: readonly Vec2[];
  params: ScatterParams;
  /** Explicit no-scatter clearance discs this region always honors (manual exclusion). */
  avoid: readonly AvoidZone[];
}

/** A single placed scatter instance — grounded world position plus per-instance variation. */
export interface ScatterInstance {
  id: string;
  regionId: string;
  item: string;
  x: number;
  y: number;
  z: number;
  rotationY: number;
  scale: number;
  normal?: TerrainNormal;
}

/** Ground sampler a scatter resolve reads height/normal from (the sculpt terrain or the game's ground). */
export interface ScatterTerrain {
  sampleHeight(x: number, z: number): number;
  sampleNormal(x: number, z: number): TerrainNormal;
}

/**
 * Deterministic placements for one scatter region: scatter its polygon footprint at `density`
 * items/m² (respecting `minSpacing`), clip to the polygon, thin near the edge, drop placements
 * outside the slope/height mask, and derive item/scale/yaw from the region id + seed — so the same
 * saved region always grows the same field. Grounds each instance on `terrain` when provided. The
 * placement core {@link SCATTER_GENERATOR} grows its preview plot with.
 */
export function resolveScatterRegion(
  region: ScatterRegion,
  terrain?: ScatterTerrain,
  avoid?: AvoidMasks,
): ScatterInstance[] {
  const params = region.params;
  const bounds = region.polygon.length === 0 ? null : ringBounds(region.polygon);
  if (bounds === null || region.polygon.length < 3 || params.density <= 0) return [];
  const ownDiscs = region.avoid;
  const masks: AvoidMasks = {
    discs: avoid === undefined ? ownDiscs : ownDiscs.length === 0 ? avoid.discs : [...ownDiscs, ...avoid.discs],
    corridors: avoid?.corridors ?? [],
  };
  const hasMasks = masks.discs.length > 0 || masks.corridors.length > 0;
  const points = scatter({
    area: bounds,
    density: params.density,
    minDistance: params.minSpacing,
    jitter: params.jitter,
    seed: `${region.id}:${region.seed}`,
  });
  const instances: ScatterInstance[] = [];
  for (const point of points) {
    const p: Vec2 = [point.x, point.z];
    if (!pointInPolygon(region.polygon, p[0], p[1])) continue;

    // Clearance masks repel scatter: hard reject in the solid core, thin probabilistically in the feather.
    if (hasMasks) {
      const influence = masksInfluence(point.x, point.z, masks);
      if (influence >= 1) continue;
      if (influence > 0 && hashUnit(`${region.id}:avoid:${point.index}`) < influence) continue;
    }

    if (params.edgeFalloff > 0) {
      const edge = distanceToRing(region.polygon, p[0], p[1]);
      if (edge < params.edgeFalloff && hashUnit(`${region.id}:edge:${point.index}`) > edge / params.edgeFalloff) continue;
    }

    let y = params.verticalOffset;
    let normal: TerrainNormal | undefined;
    if (terrain !== undefined) {
      const height = terrain.sampleHeight(point.x, point.z);
      if (height < params.minHeight || height > params.maxHeight) continue;
      // A normal costs several height samples; only rules that read it pay for it.
      if (params.maxSlope > 0 || params.alignToNormal) {
        const n = terrain.sampleNormal(point.x, point.z);
        if (params.maxSlope > 0) {
          const slope = Math.hypot(n[0], n[2]) / Math.max(n[1], 1e-9);
          if (slope > params.maxSlope) continue;
        }
        if (params.alignToNormal) normal = n;
      }
      y = height + params.verticalOffset;
    }

    const scaleRoll = hashUnit(`${region.id}:${region.seed}:scale:${point.index}`);
    const yawRoll = hashUnit(`${region.id}:${region.seed}:yaw:${point.index}`);
    const itemRoll = hashUnit(`${region.id}:${region.seed}:item:${point.index}`);
    instances.push({
      id: `${region.id}/${point.index}`,
      regionId: region.id,
      item: pickWeighted(() => itemRoll, params.palette, (entry) => entry.weight)?.item ?? params.palette[0]?.item ?? "grass",
      x: point.x,
      y,
      z: point.z,
      rotationY: params.minYaw + (params.maxYaw - params.minYaw) * yawRoll,
      scale: params.minScale + (params.maxScale - params.minScale) * scaleRoll,
      ...(normal === undefined ? {} : { normal }),
    });
    // Bounded work: a single region never emits more than the shared instance budget, matching the
    // grass patch cap so the inspector's "capped at N (budget)" note is truthful. Placements are
    // generated in deterministic scatter order, so the truncated set is deterministic too.
    if (instances.length >= SCATTER_INSTANCE_BUDGET) break;
  }
  return instances;
}

/** True when an editor path is a foliage/scatter region. */
export function isScatterPath(path: ScenePathLike): boolean {
  return path.kind === SCATTER_PATH_KIND;
}

/**
 * Parses a region's manual clearance discs from `meta.avoid` (array of {x,z,radius,feather?}).
 * @internal — part of a region's shape, read by {@link scatterRegionFromPath}.
 */
export function readAvoidZones(meta: Record<string, unknown> | undefined): AvoidZone[] {
  const raw = meta?.["avoid"];
  if (!Array.isArray(raw)) return [];
  const zones: AvoidZone[] = [];
  for (const entry of raw) {
    if (typeof entry !== "object" || entry === null) continue;
    const e = entry as { x?: unknown; z?: unknown; radius?: unknown; feather?: unknown };
    if (typeof e.x !== "number" || typeof e.z !== "number" || typeof e.radius !== "number") continue;
    zones.push({
      x: e.x,
      z: e.z,
      radius: Math.max(0, e.radius),
      ...(typeof e.feather === "number" ? { feather: Math.max(0, e.feather) } : {}),
    });
  }
  return zones;
}

/**
 * Builds a resolvable {@link ScatterRegion} from a scatter path, or null: its XZ polygon, its `meta`
 * parsed against {@link SCATTER_SCHEMA}, and its seed (the schema's seed field, unset reading as "").
 */
export function scatterRegionFromPath(path: ScenePathLike): ScatterRegion | null {
  if (!isScatterPath(path) || path.points.length < 3) return null;
  return {
    id: path.id,
    seed: generatorSeed(SCATTER_SCHEMA, path.meta, ""),
    polygon: path.points.map((point) => [point.x, point.z] as Vec2),
    params: parseParams(SCATTER_SCHEMA, path.meta),
    avoid: readAvoidZones(path.meta),
  };
}

/** Estimated placement count for a scatter path — density × polygon area, for a live UI readout. */
export function scatterRegionEstimate(path: ScenePathLike): { area: number; count: number } {
  if (!isScatterPath(path)) return { area: 0, count: 0 };
  const area = polygonArea(path.points.map((point) => [point.x, point.z] as Vec2));
  return { area, count: Math.floor(area * parseParams(SCATTER_SCHEMA, path.meta).density) };
}

/** The output family of {@link SCATTER_GENERATOR}: a {@link ScatterPlot}. */
export const SCATTER_OUTPUT = "scatter-plot";

/** Side (m) of the square sample plot {@link SCATTER_GENERATOR} fills. */
export const SCATTER_PLOT_SIZE = 24;

/** A scatter region's params grown over a flat square sample plot centred on the origin. */
export interface ScatterPlot {
  /** Side of the plot in metres. */
  size: number;
  instances: ScatterInstance[];
}

/**
 * The scatter generator: a region's params and seed grown over a {@link SCATTER_PLOT_SIZE} m square
 * by the same placement core as {@link resolveScatterRegion}, so the variant grid previews how a
 * region's palette, density, spacing and scale read without the region's own footprint.
 * @capability scatter-region-generator grow a scatter region's params from a seed, for the editor's variant grid
 */
export const SCATTER_GENERATOR = defineGenerator({
  id: SCATTER_PATH_KIND,
  label: "Foliage / scatter",
  output: SCATTER_OUTPUT,
  schema: SCATTER_SCHEMA,
  generate(params, context): ScatterPlot {
    const half = SCATTER_PLOT_SIZE / 2;
    const polygon: Vec2[] = [[-half, -half], [half, -half], [half, half], [-half, half]];
    return { size: SCATTER_PLOT_SIZE, instances: resolveScatterRegion({ id: "plot", seed: context.seed, polygon, params, avoid: [] }) };
  },
});

/** Reads a gameplay object's clearance radius: explicit `meta.clearance`, else a kind default, else 0. */
function clearanceOf(
  kind: string,
  meta: Record<string, unknown> | undefined,
  kinds: readonly string[],
  defaultClearance: number,
): number {
  const explicit = meta?.["clearance"];
  if (typeof explicit === "number" && Number.isFinite(explicit)) return Math.max(0, explicit);
  return kinds.includes(kind) ? defaultClearance : 0;
}

/** Controls which gameplay objects auto-repel scatter (and, for markers, flatten terrain). */
export interface ClearanceOptions {
  /** Marker/volume/path kinds that auto-clear even without a `meta.clearance` tag. Default {@link DEFAULT_CLEARANCE_KINDS}. */
  kinds?: readonly string[];
  /** Restrict auto-clearing to these object ids only (any kind); overrides `kinds` when set. */
  ids?: readonly string[];
  /** Clearance radius (m) for a kind-matched object with no explicit tag. Default {@link DEFAULT_MARKER_CLEARANCE}. */
  defaultClearance?: number;
  /** Soft outer band (m) on every derived zone/corridor. Default 2. */
  feather?: number;
  /** Include a corridor along non-scatter paths (roads/routes) in {@link clearanceMasksFrom}. Default true. */
  includePaths?: boolean;
}

/**
 * Point-pad clearance **discs** from a document's markers/volumes — the terrain-flatten set (spawns,
 * plots, POIs get a level pad). A marker/volume contributes a disc when it carries `meta.clearance`
 * or its kind is in `kinds`. Paths are *not* included (they render draped, never flattened — see
 * {@link clearanceMasksFrom} for their foliage corridor). Pass `ids`/`kinds` to scope it.
 */
export function clearanceZonesFrom(doc: SceneDocumentLike, options: ClearanceOptions = {}): AvoidZone[] {
  const kinds = options.ids !== undefined ? [] : options.kinds ?? DEFAULT_CLEARANCE_KINDS;
  const idSet = options.ids === undefined ? null : new Set(options.ids);
  const defaultClearance = options.defaultClearance ?? DEFAULT_MARKER_CLEARANCE;
  const feather = options.feather ?? 2;
  const zones: AvoidZone[] = [];

  const consider = (id: string, kind: string, x: number, z: number, meta: Record<string, unknown> | undefined, extra: number) => {
    if (idSet !== null && !idSet.has(id)) return;
    const clearance = idSet !== null ? defaultClearance : clearanceOf(kind, meta, kinds, defaultClearance);
    if (clearance <= 0) return;
    zones.push({ x, z, radius: clearance + extra, feather });
  };

  for (const marker of doc.markers) consider(marker.id, marker.kind, marker.position.x, marker.position.z, marker.meta, 0);
  for (const volume of doc.volumes) consider(volume.id, volume.kind, volume.center.x, volume.center.z, volume.meta, volume.radius ?? 0);
  return zones;
}

/**
 * The full clearance region for scatter avoidance: point-pad {@link clearanceZonesFrom} **discs**
 * plus clean-edged **corridors** along non-scatter paths (each `halfWidth` = `path.width/2 +
 * clearance`). Corridors give a straight tree-line along a road instead of a scalloped disc chain —
 * this is what `resolveScatter` auto-avoids. Set `includePaths: false` to drop the path corridors.
 * @internal — `resolveScatter` builds these automatically; games rarely call it directly.
 */
export function clearanceMasksFrom(doc: SceneDocumentLike, options: ClearanceOptions = {}): AvoidMasks {
  const kinds = options.ids !== undefined ? [] : options.kinds ?? DEFAULT_CLEARANCE_KINDS;
  const idSet = options.ids === undefined ? null : new Set(options.ids);
  const defaultClearance = options.defaultClearance ?? DEFAULT_MARKER_CLEARANCE;
  const feather = options.feather ?? 2;
  const includePaths = options.includePaths ?? true;
  const corridors: AvoidCorridor[] = [];

  if (includePaths) {
    for (const path of doc.paths) {
      if (isScatterPath(path) || path.points.length < 2) continue;
      if (idSet !== null && !idSet.has(path.id)) continue;
      const clearance = idSet !== null ? defaultClearance : clearanceOf(path.kind, path.meta, kinds, defaultClearance);
      const explicit = typeof path.meta?.["clearance"] === "number";
      if (clearance <= 0 && !explicit) continue;
      const half = (path.width ?? 4) / 2 + (clearance > 0 ? clearance : defaultClearance);
      corridors.push({ points: path.points.map((point) => [point.x, point.z] as Vec2), halfWidth: half, feather });
    }
  }
  return { discs: clearanceZonesFrom(doc, options), corridors };
}

/** Extra inputs for {@link resolveScatter}: manual discs plus the auto-clearance toggle/scoping. */
export interface ResolveScatterOptions extends ClearanceOptions {
  /** Additional clearance discs applied to every region regardless of per-region `autoAvoid`. */
  avoid?: readonly AvoidZone[];
  /** Master switch for document-derived auto-clearance; false = per-region `avoid` (and `options.avoid`) only. */
  autoAvoid?: boolean;
}

/**
 * Every scatter region's placements across a document, grounded on `terrain` when provided. Regions
 * honor clearance masks: their own manual `avoid` discs, plus (when the region's `autoAvoid` is on and
 * `options.autoAvoid !== false`) the document-wide discs + path corridors from {@link clearanceMasksFrom}
 * — so foliage auto-clears spawns, plots, and paths without hand-carving the polygon.
 */
export function resolveScatter(
  doc: SceneDocumentLike,
  terrain?: ScatterTerrain,
  options: ResolveScatterOptions = {},
): readonly ScatterInstance[] {
  // The renderer and gameplay (harvest, navigation) resolve the same document on the same ground;
  // a plain call shares one result instead of placing every tree twice.
  const plain = Object.keys(options).length === 0;
  const byTerrain = plain ? resolvedScatter.get(doc) : undefined;
  const cached = byTerrain?.get(terrain ?? NO_TERRAIN);
  if (cached !== undefined) return cached;
  const resolved = resolveScatterUncached(doc, terrain, options);
  if (plain) {
    const map = byTerrain ?? new WeakMap<object, readonly ScatterInstance[]>();
    map.set(terrain ?? NO_TERRAIN, resolved);
    resolvedScatter.set(doc, map);
  }
  return resolved;
}

/**
 * Fills one authored path of a kind other than `scatter` with placements (a forest stand from its growth model). It
 * receives the clearance masks the region would honor; placements join the document's scatter, so rendering, solids,
 * harvest and navigation read them like any other.
 */
export type ScatterSource = (path: ScenePathLike, terrain: ScatterTerrain | undefined, masks: AvoidMasks) => readonly ScatterInstance[];

const scatterSources = new Map<string, ScatterSource>();

/**
 * Register the {@link ScatterSource} for a path kind; idempotent, last registration wins.
 * @capability scatter-source fill a non-scatter path kind with placements that join the document's scatter
 */
export function registerScatterSource(kind: string, source: ScatterSource): void {
  scatterSources.set(kind, source);
}

const NO_TERRAIN = {};
const resolvedScatter = new WeakMap<object, WeakMap<object, readonly ScatterInstance[]>>();

function resolveScatterUncached(
  doc: SceneDocumentLike,
  terrain: ScatterTerrain | undefined,
  options: ResolveScatterOptions,
): ScatterInstance[] {
  const baseDiscs = options.avoid ?? [];
  const auto: AvoidMasks =
    options.autoAvoid === false ? { discs: [], corridors: [] } : clearanceMasksFrom(doc, options);
  const regions: ScatterRegion[] = [];
  for (const path of doc.paths) {
    const region = scatterRegionFromPath(path);
    if (region !== null) regions.push(region);
  }
  const resolveOne = (region: ScatterRegion, extra: readonly AvoidZone[]): ScatterInstance[] => {
    const useAuto = region.params.autoAvoid && options.autoAvoid !== false;
    const masks: AvoidMasks = {
      discs: useAuto ? [...baseDiscs, ...auto.discs, ...extra] : baseDiscs,
      corridors: useAuto ? auto.corridors : [],
    };
    return resolveScatterRegion(region, terrain, masks);
  };
  // Clearing regions place first; each placement becomes a disc the other regions avoid.
  const cleared = new Map<string, ScatterInstance[]>();
  const clearDiscs: AvoidZone[] = [];
  for (const region of regions) {
    if (region.params.clearance <= 0) continue;
    const placed = resolveOne(region, []);
    cleared.set(region.id, placed);
    for (const instance of placed) clearDiscs.push({ x: instance.x, z: instance.z, radius: region.params.clearance * instance.scale, feather: 0 });
  }
  const out: ScatterInstance[] = [];
  for (const region of regions) {
    const own = cleared.get(region.id);
    if (own !== undefined) {
      out.push(...own);
      continue;
    }
    out.push(...resolveOne(region, clearDiscs.length === 0 ? [] : discsNear(clearDiscs, ringBounds(region.polygon))));
  }
  if (scatterSources.size > 0) {
    const sourceMasks: AvoidMasks = options.autoAvoid === false ? { discs: baseDiscs, corridors: [] } : { discs: [...baseDiscs, ...auto.discs, ...clearDiscs], corridors: auto.corridors };
    for (const path of doc.paths) {
      const source = scatterSources.get(path.kind);
      if (source !== undefined) out.push(...source(path, terrain, sourceMasks));
    }
  }
  return out;
}

/** The discs that reach into `bounds`, so a region only tests the clearings it can touch. */
function discsNear(discs: readonly AvoidZone[], bounds: ReturnType<typeof ringBounds>): AvoidZone[] {
  return discs.filter((disc) => {
    const reach = disc.radius + (disc.feather ?? 0);
    return disc.x + reach >= bounds.minX && disc.x - reach <= bounds.maxX && disc.z + reach >= bounds.minZ && disc.z - reach <= bounds.maxZ;
  });
}
