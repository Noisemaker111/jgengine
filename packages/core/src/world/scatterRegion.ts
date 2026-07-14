import type { EditorDocument, EditorPath } from "../editor/types";
import { type Aabb, type Vec2 } from "./geometry";
import { scatter } from "./scatter";
import type { TerrainNormal } from "./terrain";

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
};

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

/** Ray-casting point-in-polygon test on the XZ plane. */
export function pointInPolygon(point: Vec2, polygon: readonly Vec2[]): boolean {
  let inside = false;
  const [px, pz] = point;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const [xi, zi] = polygon[i]!;
    const [xj, zj] = polygon[j]!;
    if (zi > pz !== zj > pz && px < ((xj - xi) * (pz - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

function distanceToSegment(px: number, pz: number, ax: number, az: number, bx: number, bz: number): number {
  const dx = bx - ax;
  const dz = bz - az;
  const lenSq = dx * dx + dz * dz || 1;
  let t = ((px - ax) * dx + (pz - az) * dz) / lenSq;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return Math.hypot(px - (ax + dx * t), pz - (az + dz * t));
}

/** Shortest distance from a point to a polygon's boundary. */
export function distanceToPolygonEdge(point: Vec2, polygon: readonly Vec2[]): number {
  let best = Number.POSITIVE_INFINITY;
  const [px, pz] = point;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const [xi, zi] = polygon[i]!;
    const [xj, zj] = polygon[j]!;
    best = Math.min(best, distanceToSegment(px, pz, xi, zi, xj, zj));
  }
  return best;
}

/** Axis-aligned bounds of a polygon, or null if it has no points. */
export function polygonBounds(polygon: readonly Vec2[]): Aabb | null {
  if (polygon.length === 0) return null;
  let minX = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxZ = -Infinity;
  for (const [x, z] of polygon) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (z < minZ) minZ = z;
    if (z > maxZ) maxZ = z;
  }
  return { minX, minZ, maxX, maxZ };
}

/** Shoelace area of a polygon (always non-negative), in square meters. */
export function polygonArea(polygon: readonly Vec2[]): number {
  if (polygon.length < 3) return 0;
  let sum = 0;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const [xi, zi] = polygon[i]!;
    const [xj, zj] = polygon[j]!;
    sum += xj * zi - xi * zj;
  }
  return Math.abs(sum) / 2;
}

function pickWeighted(palette: readonly ScatterPaletteEntry[], roll: number): string {
  if (palette.length === 0) return "grass";
  const total = palette.reduce((sum, entry) => sum + Math.max(0, entry.weight), 0);
  if (total <= 0) return palette[0]!.item;
  let acc = roll * total;
  for (const entry of palette) {
    acc -= Math.max(0, entry.weight);
    if (acc <= 0) return entry.item;
  }
  return palette[palette.length - 1]!.item;
}

/**
 * Deterministic placements for one scatter region: scatter its polygon footprint at `density`
 * items/m² (respecting `minSpacing`), clip to the polygon, thin near the edge, drop placements
 * outside the slope/height mask, and derive item/scale/yaw from the region id + seed — so the same
 * saved region always grows the same field. Grounds each instance on `terrain` when provided.
 */
export function resolveScatterRegion(region: ScatterRegion, terrain?: ScatterTerrain): ScatterInstance[] {
  const rules = region.rules;
  const bounds = polygonBounds(region.polygon);
  if (bounds === null || region.polygon.length < 3 || rules.density <= 0) return [];
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
    if (!pointInPolygon(p, region.polygon)) continue;

    if (rules.edgeFalloff > 0) {
      const edge = distanceToPolygonEdge(p, region.polygon);
      if (edge < rules.edgeFalloff && hash(`${region.id}:edge:${point.index}`) > edge / rules.edgeFalloff) continue;
    }

    let y = rules.verticalOffset;
    let normal: TerrainNormal | undefined;
    if (terrain !== undefined) {
      const height = terrain.sampleHeight(point.x, point.z);
      if (height < rules.minHeight || height > rules.maxHeight) continue;
      const n = terrain.sampleNormal(point.x, point.z);
      if (rules.maxSlope > 0) {
        const slope = Math.hypot(n[0], n[2]) / Math.max(n[1], 1e-9);
        if (slope > rules.maxSlope) continue;
      }
      y = height + rules.verticalOffset;
      if (rules.alignToNormal) normal = n;
    }

    const scaleRoll = hash(`${region.id}:${rules.seed}:scale:${point.index}`);
    const yawRoll = hash(`${region.id}:${rules.seed}:yaw:${point.index}`);
    const itemRoll = hash(`${region.id}:${rules.seed}:item:${point.index}`);
    instances.push({
      id: `${region.id}/${point.index}`,
      regionId: region.id,
      item: pickWeighted(rules.palette, itemRoll),
      x: point.x,
      y,
      z: point.z,
      rotationY: rules.minYaw + (rules.maxYaw - rules.minYaw) * yawRoll,
      scale: rules.minScale + (rules.maxScale - rules.minScale) * scaleRoll,
      ...(normal === undefined ? {} : { normal }),
    });
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
export function isScatterPath(path: EditorPath): boolean {
  return path.kind === SCATTER_PATH_KIND;
}

/** The path's scatter rules with defaults filled in; null for non-scatter paths. */
export function readScatterRules(path: EditorPath): ScatterRegionRules | null {
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
  };
}

/** Builds a resolvable {@link ScatterRegion} from a scatter path (XZ polygon + rules), or null. */
export function scatterRegionFromPath(path: EditorPath): ScatterRegion | null {
  const rules = readScatterRules(path);
  if (rules === null || path.points.length < 3) return null;
  return {
    id: path.id,
    polygon: path.points.map((point) => [point.x, point.z] as Vec2),
    rules,
  };
}

/** Estimated placement count for a scatter path — density × polygon area, for a live UI readout. */
export function scatterRegionEstimate(path: EditorPath): { area: number; count: number } {
  const rules = readScatterRules(path);
  if (rules === null) return { area: 0, count: 0 };
  const area = polygonArea(path.points.map((point) => [point.x, point.z] as Vec2));
  return { area, count: Math.floor(area * rules.density) };
}

/** Every scatter region's placements across a document, grounded on `terrain` when provided. */
export function resolveScatter(doc: EditorDocument, terrain?: ScatterTerrain): ScatterInstance[] {
  const out: ScatterInstance[] = [];
  for (const path of doc.paths) {
    const region = scatterRegionFromPath(path);
    if (region !== null) out.push(...resolveScatterRegion(region, terrain));
  }
  return out;
}
