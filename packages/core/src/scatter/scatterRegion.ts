import {
  masksInfluence,
  type AvoidCorridor,
  type AvoidMasks,
  type AvoidZone,
  type Vec2,
} from "../world/geometry";
import { pickWeighted } from "../random/pick";
import { distanceToRing, pointInPolygon, polygonArea, ringBounds } from "../world/polygon";
import { scatter } from "./scatter";
import { SCATTER_INSTANCE_BUDGET } from "./scatterCoverage";
import type { SceneDocumentLike, ScenePathLike } from "../world/sceneShapes";
import type { TerrainNormal } from "../terrain/terrain";

/** The editor path kind that marks a closed polyline as a foliage/scatter region. */
export const SCATTER_PATH_KIND = "scatter";

/** One species/prop in a scatter region's palette, with a relative spawn weight. */
export interface ScatterPaletteEntry {
  item: string;
  weight: number;
}

/** How a scatter region fills its polygon: density, spacing, variation, and masking rules. */
export interface ScatterRegionRules {
  /** Items per square meter across the region's footprint. */
  density: number;
  /** Minimum spacing between placements in meters; 0 allows clumping. */
  minSpacing: number;
  /** Seed string — same seed reproduces the same field. */
  seed: string;
  minScale: number;
  maxScale: number;
  /** Yaw range in radians applied per placement. */
  minYaw: number;
  maxYaw: number;
  /** Lift every instance by this many meters off the ground. */
  verticalOffset: number;
  /** Orient instances to the terrain normal instead of straight up. */
  alignToNormal: boolean;
  /** Reject placements on ground steeper than this slope (rise/run); 0 disables. */
  maxSlope: number;
  minHeight: number;
  maxHeight: number;
  /** Thin placements out within this many meters of the region edge; 0 disables. */
  edgeFalloff: number;
  /** Grid jitter 0..1 — 0 is a rigid lattice, 1 fully scattered. */
  jitter: number;
  /** Weighted species palette; falls back to a single `grass` entry. */
  palette: readonly ScatterPaletteEntry[];
  /** Explicit no-scatter clearance discs this region always honors (manual exclusion). */
  avoid: readonly AvoidZone[];
  /** Honor document-wide clearance zones (tagged markers/paths) too; false = manual `avoid` only. */
  autoAvoid: boolean;
  /**
   * Metres, times each placement's scale, that this region's placements keep clear of every other
   * auto-avoiding region (a boulder keeps palms out of its footprint); 0 disables.
   */
  clearance: number;
}

/** Defaults a bare scatter region fills with: sparse grass, lightly spaced. */
export const SCATTER_DEFAULTS: ScatterRegionRules = {
  density: 0.15,
  minSpacing: 1.5,
  seed: "",
  minScale: 0.8,
  maxScale: 1.3,
  minYaw: 0,
  maxYaw: Math.PI * 2,
  verticalOffset: 0,
  alignToNormal: false,
  maxSlope: 0,
  minHeight: Number.NEGATIVE_INFINITY,
  maxHeight: Number.POSITIVE_INFINITY,
  edgeFalloff: 0,
  jitter: 1,
  palette: [{ item: "grass", weight: 1 }],
  avoid: [],
  autoAvoid: true,
  clearance: 0,
};

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

/** A resolvable scatter region: a closed polygon footprint plus its fill rules. */
export interface ScatterRegion {
  id: string;
  polygon: readonly Vec2[];
  rules: ScatterRegionRules;
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

function hash(text: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967296;
}

/**
 * Deterministic placements for one scatter region: scatter its polygon footprint at `density`
 * items/m² (respecting `minSpacing`), clip to the polygon, thin near the edge, drop placements
 * outside the slope/height mask, and derive item/scale/yaw from the region id + seed — so the same
 * saved region always grows the same field. Grounds each instance on `terrain` when provided.
 */
export function resolveScatterRegion(
  region: ScatterRegion,
  terrain?: ScatterTerrain,
  avoid?: AvoidMasks,
): ScatterInstance[] {
  const rules = region.rules;
  const bounds = region.polygon.length === 0 ? null : ringBounds(region.polygon);
  if (bounds === null || region.polygon.length < 3 || rules.density <= 0) return [];
  const ownDiscs = rules.avoid ?? [];
  const masks: AvoidMasks = {
    discs: avoid === undefined ? ownDiscs : ownDiscs.length === 0 ? avoid.discs : [...ownDiscs, ...avoid.discs],
    corridors: avoid?.corridors ?? [],
  };
  const hasMasks = masks.discs.length > 0 || masks.corridors.length > 0;
  const points = scatter({
    area: bounds,
    density: rules.density,
    minDistance: rules.minSpacing,
    jitter: rules.jitter,
    seed: `${region.id}:${rules.seed}`,
  });
  const instances: ScatterInstance[] = [];
  for (const point of points) {
    const p: Vec2 = [point.x, point.z];
    if (!pointInPolygon(region.polygon, p[0], p[1])) continue;

    // Clearance masks repel scatter: hard reject in the solid core, thin probabilistically in the feather.
    if (hasMasks) {
      const influence = masksInfluence(point.x, point.z, masks);
      if (influence >= 1) continue;
      if (influence > 0 && hash(`${region.id}:avoid:${point.index}`) < influence) continue;
    }

    if (rules.edgeFalloff > 0) {
      const edge = distanceToRing(region.polygon, p[0], p[1]);
      if (edge < rules.edgeFalloff && hash(`${region.id}:edge:${point.index}`) > edge / rules.edgeFalloff) continue;
    }

    let y = rules.verticalOffset;
    let normal: TerrainNormal | undefined;
    if (terrain !== undefined) {
      const height = terrain.sampleHeight(point.x, point.z);
      if (height < rules.minHeight || height > rules.maxHeight) continue;
      // A normal costs several height samples; only rules that read it pay for it.
      if (rules.maxSlope > 0 || rules.alignToNormal) {
        const n = terrain.sampleNormal(point.x, point.z);
        if (rules.maxSlope > 0) {
          const slope = Math.hypot(n[0], n[2]) / Math.max(n[1], 1e-9);
          if (slope > rules.maxSlope) continue;
        }
        if (rules.alignToNormal) normal = n;
      }
      y = height + rules.verticalOffset;
    }

    const scaleRoll = hash(`${region.id}:${rules.seed}:scale:${point.index}`);
    const yawRoll = hash(`${region.id}:${rules.seed}:yaw:${point.index}`);
    const itemRoll = hash(`${region.id}:${rules.seed}:item:${point.index}`);
    instances.push({
      id: `${region.id}/${point.index}`,
      regionId: region.id,
      item: pickWeighted(() => itemRoll, rules.palette, (entry) => entry.weight)?.item ?? rules.palette[0]?.item ?? "grass",
      x: point.x,
      y,
      z: point.z,
      rotationY: rules.minYaw + (rules.maxYaw - rules.minYaw) * yawRoll,
      scale: rules.minScale + (rules.maxScale - rules.minScale) * scaleRoll,
      ...(normal === undefined ? {} : { normal }),
    });
    // Bounded work: a single region never emits more than the shared instance budget, matching the
    // grass patch cap so the inspector's "capped at N (budget)" note is truthful. Placements are
    // generated in deterministic scatter order, so the truncated set is deterministic too.
    if (instances.length >= SCATTER_INSTANCE_BUDGET) break;
  }
  return instances;
}

function metaNumber(meta: Record<string, unknown> | undefined, key: string, fallback: number): number {
  const value = meta?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function metaString(meta: Record<string, unknown> | undefined, key: string, fallback: string): string {
  const value = meta?.[key];
  return typeof value === "string" ? value : fallback;
}

function metaBool(meta: Record<string, unknown> | undefined, key: string, fallback: boolean): boolean {
  const value = meta?.[key];
  return typeof value === "boolean" ? value : fallback;
}

/** Parses a scatter region's palette from meta: a weighted `palette` array, else a single `item`. */
export function readScatterPalette(meta: Record<string, unknown> | undefined): ScatterPaletteEntry[] {
  const raw = meta?.["palette"];
  if (Array.isArray(raw)) {
    const entries = raw
      .filter((entry): entry is { item: unknown; weight?: unknown } => typeof entry === "object" && entry !== null)
      .map((entry) => ({
        item: typeof entry.item === "string" ? entry.item : "grass",
        weight: typeof entry.weight === "number" && Number.isFinite(entry.weight) ? Math.max(0, entry.weight) : 1,
      }))
      .filter((entry) => entry.item.length > 0);
    if (entries.length > 0) return entries;
  }
  const single = metaString(meta, "item", "");
  if (single.length > 0) return [{ item: single, weight: 1 }];
  return [...SCATTER_DEFAULTS.palette];
}

/** True when an editor path is a foliage/scatter region. */
export function isScatterPath(path: ScenePathLike): boolean {
  return path.kind === SCATTER_PATH_KIND;
}

/** The path's scatter rules with defaults filled in; null for non-scatter paths. */
export function readScatterRules(path: ScenePathLike): ScatterRegionRules | null {
  if (!isScatterPath(path)) return null;
  const meta = path.meta;
  return {
    density: Math.max(0, metaNumber(meta, "density", SCATTER_DEFAULTS.density)),
    minSpacing: Math.max(0, metaNumber(meta, "minSpacing", SCATTER_DEFAULTS.minSpacing)),
    seed: metaString(meta, "seed", SCATTER_DEFAULTS.seed),
    minScale: metaNumber(meta, "minScale", SCATTER_DEFAULTS.minScale),
    maxScale: metaNumber(meta, "maxScale", SCATTER_DEFAULTS.maxScale),
    minYaw: metaNumber(meta, "minYaw", SCATTER_DEFAULTS.minYaw),
    maxYaw: metaNumber(meta, "maxYaw", SCATTER_DEFAULTS.maxYaw),
    verticalOffset: metaNumber(meta, "verticalOffset", SCATTER_DEFAULTS.verticalOffset),
    alignToNormal: metaBool(meta, "alignToNormal", SCATTER_DEFAULTS.alignToNormal),
    maxSlope: Math.max(0, metaNumber(meta, "maxSlope", SCATTER_DEFAULTS.maxSlope)),
    minHeight: metaNumber(meta, "minHeight", SCATTER_DEFAULTS.minHeight),
    maxHeight: metaNumber(meta, "maxHeight", SCATTER_DEFAULTS.maxHeight),
    edgeFalloff: Math.max(0, metaNumber(meta, "edgeFalloff", SCATTER_DEFAULTS.edgeFalloff)),
    jitter: metaNumber(meta, "jitter", SCATTER_DEFAULTS.jitter),
    palette: readScatterPalette(meta),
    avoid: readAvoidZones(meta),
    autoAvoid: metaBool(meta, "autoAvoid", SCATTER_DEFAULTS.autoAvoid),
    clearance: Math.max(0, metaNumber(meta, "clearance", SCATTER_DEFAULTS.clearance)),
  };
}

/**
 * Parses a region's manual clearance discs from `meta.avoid` (array of {x,z,radius,feather?}).
 * @internal — used by `readScatterRules`; games author `avoid` through the region inspector.
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

/** Builds a resolvable {@link ScatterRegion} from a scatter path (XZ polygon + rules), or null. */
export function scatterRegionFromPath(path: ScenePathLike): ScatterRegion | null {
  const rules = readScatterRules(path);
  if (rules === null || path.points.length < 3) return null;
  return {
    id: path.id,
    polygon: path.points.map((point) => [point.x, point.z] as Vec2),
    rules,
  };
}

/** Estimated placement count for a scatter path — density × polygon area, for a live UI readout. */
export function scatterRegionEstimate(path: ScenePathLike): { area: number; count: number } {
  const rules = readScatterRules(path);
  if (rules === null) return { area: 0, count: 0 };
  const area = polygonArea(path.points.map((point) => [point.x, point.z] as Vec2));
  return { area, count: Math.floor(area * rules.density) };
}

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
    const useAuto = region.rules.autoAvoid && options.autoAvoid !== false;
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
    if (region.rules.clearance <= 0) continue;
    const placed = resolveOne(region, []);
    cleared.set(region.id, placed);
    for (const instance of placed) clearDiscs.push({ x: instance.x, z: instance.z, radius: region.rules.clearance * instance.scale, feather: 0 });
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
  return out;
}

/** The discs that reach into `bounds`, so a region only tests the clearings it can touch. */
function discsNear(discs: readonly AvoidZone[], bounds: ReturnType<typeof ringBounds>): AvoidZone[] {
  return discs.filter((disc) => {
    const reach = disc.radius + (disc.feather ?? 0);
    return disc.x + reach >= bounds.minX && disc.x - reach <= bounds.maxX && disc.z + reach >= bounds.minZ && disc.z - reach <= bounds.maxZ;
  });
}
