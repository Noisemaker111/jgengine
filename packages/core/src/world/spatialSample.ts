import { type Aabb, type Vec2, pointInAabb } from "./geometry";
import { pointInPolygon, polygonBounds } from "./scatterRegion";

/**
 * Deterministic spatial sampling — draw one or many positions from a geometric region under
 * explicit constraints, with an injected RNG, bounded attempts, and a structured pass/fail result.
 *
 * The three concerns stay separate on purpose (issue #940): a {@link SampleRegion} owns *where and
 * how* candidates are drawn (its distribution policy — area- vs radial-uniform, edge-biased, weighted
 * subregions); {@link SampleConstraints} own *which* candidates survive (include/exclude regions,
 * keep-out distance via disc/sphere exclusions, caller predicates, surface projection, minimum
 * separation); and {@link samplePoint}/{@link sampleBatch} own *how hard we try* (attempt budget and
 * fallback policy). Nothing silently accepts an invalid point — exhaustion is reported, not hidden.
 */

/** A 3D point `[x, y, z]` — the volume/surface counterpart to {@link Vec2}. */
export type Point3 = readonly [number, number, number];

/** A sampled point: 2D `[x, z]` or 3D `[x, y, z]`. Every point in one run shares its dimensionality. */
export type SamplePoint = readonly number[];

/**
 * A geometric region a sampler can draw from. Built-ins cover point sets, rect/box, circle/sphere,
 * annulus/shell, polygon, and weighted composites; {@link customRegion} wraps a caller-defined
 * sampler + bounds. `sample` draws one raw candidate under the region's own distribution policy;
 * `contains` is the membership test reused for include/exclude constraints and rejection.
 */
export interface SampleRegion<P extends SamplePoint = SamplePoint> {
  /** 2 for planar regions (`[x, z]`), 3 for volumetric/surface regions (`[x, y, z]`). */
  readonly dimensions: 2 | 3;
  /** True when the region can never yield a point (degenerate size, empty set) — reported, not sampled. */
  readonly isEmpty: boolean;
  /** Draw one raw candidate using `rng` (may still fail constraints). Consumes a fixed number of draws. */
  sample(rng: () => number): P;
  /** Membership test on the XZ (or XYZ) footprint — powers include gates and exclude keep-outs. */
  contains(point: P): boolean;
}

/**
 * Post-draw gates a candidate must clear. All are optional; an empty constraint set accepts every
 * in-region draw. `exclude` discs/spheres are the keep-out distance primitive ("no closer than R to
 * this center"); `accept` is a free-form caller predicate (biome, slope, ownership); `project` snaps
 * a candidate onto a surface/navmesh before validation and may reject by returning `null`.
 */
export interface SampleConstraints<P extends SamplePoint = SamplePoint> {
  /** Candidate must lie inside *every* listed region (intersection); omit for no inclusion gate. */
  include?: readonly SampleRegion<P>[];
  /** Candidate must lie outside *every* listed region — the keep-out/exclusion set. */
  exclude?: readonly SampleRegion<P>[];
  /** Extra caller acceptance test applied last; `false` rejects the candidate. */
  accept?: (point: P) => boolean;
  /** Optional surface/navmesh projection applied before validation; `null` rejects the candidate. */
  project?: (point: P) => P | null;
  /** Reject a candidate within this Euclidean distance of an already-accepted point in the same run. */
  minSeparation?: number;
}

/**
 * What to return when the attempt budget is exhausted. `"none"` yields no point (honest failure);
 * `"last-candidate"` returns the final rejected draw (post-projection); `{ point }` returns a caller
 * fixed fallback (a hand-placed safe spot). Explicit, so a caller never mistakes a fallback for a hit.
 */
export type FallbackPolicy<P extends SamplePoint = SamplePoint> =
  | "none"
  | "last-candidate"
  | { readonly point: P };

/** Why a sample ended: a clean hit, budget exhausted, or the region was degenerate. */
export type SampleReason = "accepted" | "exhausted" | "empty-region";

/** Structured single-sample outcome — never a bare point, so failure and fallback are visible. */
export interface SampleResult<P extends SamplePoint = SamplePoint> {
  /** True only for `"accepted"` — a genuine in-constraints hit (fallbacks are never `ok`). */
  readonly ok: boolean;
  /** The accepted point, or the fallback point, or `null` when no fallback applied. */
  readonly point: P | null;
  /** How many candidates were drawn (0 for an empty region). */
  readonly attempts: number;
  /** Outcome classification. */
  readonly reason: SampleReason;
  /** True when `point` came from the fallback policy rather than a passing draw. */
  readonly usedFallback: boolean;
}

/** Inputs for a single {@link samplePoint} draw. */
export interface SamplePointOptions<P extends SamplePoint = SamplePoint> {
  region: SampleRegion<P>;
  /** Injected deterministic RNG in `[0, 1)`; same stream → same result. */
  rng: () => number;
  constraints?: SampleConstraints<P>;
  /** Maximum candidates to draw before giving up. Default 30. Bounds the work. */
  maxAttempts?: number;
  /** What to return on exhaustion. Default `"none"`. */
  fallback?: FallbackPolicy<P>;
  /** Already-placed points the new point must respect `minSeparation` against (batch threads this). */
  placed?: readonly P[];
}

const DEFAULT_MAX_ATTEMPTS = 30;
const TWO_PI = Math.PI * 2;

function distanceSq(a: SamplePoint, b: SamplePoint): number {
  const n = a.length < b.length ? a.length : b.length;
  let sum = 0;
  for (let i = 0; i < n; i += 1) {
    const d = a[i]! - b[i]!;
    sum += d * d;
  }
  return sum;
}

/**
 * A uniform spatial hash over cells of `cellSize`, used to enforce minimum separation in O(1)
 * neighborhood checks instead of an O(n²) scan — the allocation-aware index behind batch spacing.
 * @internal
 */
class SeparationIndex<P extends SamplePoint> {
  private readonly buckets = new Map<string, P[]>();
  private readonly minSq: number;
  constructor(
    private readonly cellSize: number,
    private readonly dimensions: 2 | 3,
  ) {
    this.minSq = cellSize * cellSize;
  }
  private key(cell: readonly number[]): string {
    return cell.join(":");
  }
  private cellOf(point: P): number[] {
    const cell: number[] = [];
    for (let i = 0; i < this.dimensions; i += 1) cell.push(Math.floor(point[i]! / this.cellSize));
    return cell;
  }
  /** True when `point` sits within `cellSize` of any inserted point. */
  tooClose(point: P): boolean {
    const base = this.cellOf(point);
    const dims = this.dimensions;
    const stack: number[] = [];
    const walk = (axis: number): boolean => {
      if (axis === dims) {
        const bucket = this.buckets.get(this.key(stack));
        if (bucket !== undefined) for (const other of bucket) if (distanceSq(point, other) < this.minSq) return true;
        return false;
      }
      for (let d = -1; d <= 1; d += 1) {
        stack[axis] = base[axis]! + d;
        if (walk(axis + 1)) return true;
      }
      return false;
    };
    return walk(0);
  }
  insert(point: P): void {
    const key = this.key(this.cellOf(point));
    const bucket = this.buckets.get(key);
    if (bucket !== undefined) bucket.push(point);
    else this.buckets.set(key, [point]);
  }
}

function passesConstraints<P extends SamplePoint>(
  point: P,
  constraints: SampleConstraints<P> | undefined,
  index: SeparationIndex<P> | null,
): boolean {
  if (constraints === undefined) return index === null || !index.tooClose(point);
  if (constraints.include !== undefined) for (const region of constraints.include) if (!region.contains(point)) return false;
  if (constraints.exclude !== undefined) for (const region of constraints.exclude) if (region.contains(point)) return false;
  if (index !== null && index.tooClose(point)) return false;
  if (constraints.accept !== undefined && !constraints.accept(point)) return false;
  return true;
}

function resolveFallback<P extends SamplePoint>(
  fallback: FallbackPolicy<P> | undefined,
  last: P | null,
  attempts: number,
  reason: SampleReason,
): SampleResult<P> {
  if (fallback !== undefined && fallback !== "none") {
    if (fallback === "last-candidate") {
      if (last !== null) return { ok: false, point: last, attempts, reason, usedFallback: true };
    } else {
      return { ok: false, point: fallback.point, attempts, reason, usedFallback: true };
    }
  }
  return { ok: false, point: null, attempts, reason, usedFallback: false };
}

/**
 * Draw one point from `region` that clears every constraint, retrying up to `maxAttempts` times with
 * the injected `rng`, then apply the `fallback` policy. Returns a structured {@link SampleResult} —
 * a clean hit is `ok: true`; exhaustion or a degenerate region is reported with the attempt count and
 * an explicit fallback flag, never a silently-accepted bad point.
 *
 * @capability spatial-sample draw one deterministic position from a region under include/exclude/distance constraints
 */
export function samplePoint<P extends SamplePoint>(options: SamplePointOptions<P>): SampleResult<P> {
  const { region, rng, constraints } = options;
  const maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  if (region.isEmpty) return resolveFallback(options.fallback, null, 0, "empty-region");

  let index: SeparationIndex<P> | null = null;
  const minSeparation = constraints?.minSeparation ?? 0;
  const placed = options.placed ?? [];
  if (minSeparation > 0 && placed.length > 0) {
    index = new SeparationIndex<P>(minSeparation, region.dimensions);
    for (const point of placed) index.insert(point);
  }

  let last: P | null = null;
  let attempts = 0;
  while (attempts < maxAttempts) {
    attempts += 1;
    let candidate: P | null = region.sample(rng);
    if (constraints?.project !== undefined) candidate = constraints.project(candidate);
    if (candidate === null) continue;
    last = candidate;
    if (passesConstraints(candidate, constraints, index)) {
      return { ok: true, point: candidate, attempts, reason: "accepted", usedFallback: false };
    }
  }
  return resolveFallback(options.fallback, last, attempts, "exhausted");
}

/** Inputs for a {@link sampleBatch} draw of many spaced points. */
export interface SampleBatchOptions<P extends SamplePoint = SamplePoint> {
  region: SampleRegion<P>;
  rng: () => number;
  /** How many points to place. */
  count: number;
  constraints?: SampleConstraints<P>;
  /** Attempt budget **per point**. Default 30. */
  maxAttempts?: number;
}

/** Structured batch outcome: the placed points plus whether the full count was met. */
export interface SampleBatchResult<P extends SamplePoint = SamplePoint> {
  /** Accepted points in deterministic draw order. */
  readonly points: readonly P[];
  /** The requested count. */
  readonly requested: number;
  /** How many were actually placed (`<= requested`). */
  readonly placed: number;
  /** True when `placed === requested`. */
  readonly complete: boolean;
  /** Total candidates drawn across all points. */
  readonly attempts: number;
}

/**
 * Place up to `count` points from `region`, each clearing the shared constraints and honoring
 * `minSeparation` against every point already placed in this batch (via a spatial hash, not an
 * O(n²) scan). Order is deterministic for a given `rng` stream. Batches never silently under-fill:
 * the result reports `placed`, `complete`, and the total attempt count.
 *
 * @capability spatial-sample-batch place many deterministic spaced points from a region with minimum separation
 */
export function sampleBatch<P extends SamplePoint>(options: SampleBatchOptions<P>): SampleBatchResult<P> {
  const { region, rng, constraints } = options;
  const maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const requested = Math.max(0, Math.floor(options.count));
  const points: P[] = [];
  if (requested === 0 || region.isEmpty) {
    return { points, requested, placed: 0, complete: requested === 0, attempts: 0 };
  }

  const minSeparation = constraints?.minSeparation ?? 0;
  const index = minSeparation > 0 ? new SeparationIndex<P>(minSeparation, region.dimensions) : null;
  let attempts = 0;
  for (let i = 0; i < requested; i += 1) {
    let placed: P | null = null;
    let tries = 0;
    while (tries < maxAttempts) {
      tries += 1;
      attempts += 1;
      let candidate: P | null = region.sample(rng);
      if (constraints?.project !== undefined) candidate = constraints.project(candidate);
      if (candidate === null) continue;
      if (passesConstraints(candidate, constraints, index)) {
        placed = candidate;
        break;
      }
    }
    if (placed === null) break;
    points.push(placed);
    if (index !== null) index.insert(placed);
  }
  return { points, requested, placed: points.length, complete: points.length === requested, attempts };
}

// ---------------------------------------------------------------------------
// Distribution policies
// ---------------------------------------------------------------------------

/** Fill policy for a circle/ring: `"area"` = area-uniform (even density); `"radial"` = radius-uniform (clumps toward center). */
export type RadialDistribution = "area" | "radial";
/** Fill policy for a sphere/shell: `"volume"` = volume-uniform (even density); `"radial"` = radius-uniform. */
export type VolumeDistribution = "volume" | "radial";
/** Fill policy for a rect/box: `"uniform"` = even coverage; `"edge"` = biased to a boundary band. */
export type AreaDistribution = "uniform" | "edge";

// ---------------------------------------------------------------------------
// 2D region builders
// ---------------------------------------------------------------------------

/** A weighted member of a {@link weightedRegion} composite. */
export interface WeightedRegionEntry<P extends SamplePoint = SamplePoint> {
  region: SampleRegion<P>;
  /** Relative selection weight; non-positive entries are never chosen. */
  weight: number;
}

/**
 * A fixed set of candidate points sampled by (optionally weighted) selection — the "spawn point
 * table" region. `contains` is exact membership. Empty when the set is empty.
 *
 * @capability spatial-region-point-set sample from a fixed, optionally weighted candidate point table
 */
export function pointSetRegion(points: readonly Vec2[], options: { weights?: readonly number[] } = {}): SampleRegion<Vec2> {
  const pool = points.map((p) => [p[0], p[1]] as Vec2);
  const weights = options.weights;
  const total = weights === undefined ? pool.length : weights.reduce((sum, w) => sum + Math.max(0, w), 0);
  return {
    dimensions: 2,
    isEmpty: pool.length === 0 || total <= 0,
    sample(rng) {
      if (weights === undefined) return pool[Math.min(pool.length - 1, Math.floor(rng() * pool.length))]!;
      let roll = rng() * total;
      for (let i = 0; i < pool.length; i += 1) {
        roll -= Math.max(0, weights[i] ?? 0);
        if (roll <= 0) return pool[i]!;
      }
      return pool[pool.length - 1]!;
    },
    contains(point) {
      return pool.some((p) => p[0] === point[0] && p[1] === point[1]);
    },
  };
}

/**
 * An axis-aligned rectangle on the XZ plane. `"uniform"` spreads evenly (draws x then z);
 * `"edge"` biases onto a boundary band of `edgeThickness` meters (perimeter-weighted side, then
 * inward depth) — the two are never conflated, the caller opts in.
 */
export function rectRegion(
  area: Aabb,
  options: { distribution?: AreaDistribution; edgeThickness?: number } = {},
): SampleRegion<Vec2> {
  const width = area.maxX - area.minX;
  const depth = area.maxZ - area.minZ;
  const distribution = options.distribution ?? "uniform";
  const edgeThickness = Math.max(0, options.edgeThickness ?? Math.min(width, depth) * 0.25);
  return {
    dimensions: 2,
    isEmpty: !(width > 0) || !(depth > 0),
    sample(rng) {
      if (distribution === "edge") {
        const perim = 2 * (width + depth);
        const sidePick = rng() * perim;
        const t = rng();
        const inset = Math.min(edgeThickness, Math.min(width, depth) / 2) * rng();
        if (sidePick < width) return [area.minX + t * width, area.minZ + inset];
        if (sidePick < width + depth) return [area.maxX - inset, area.minZ + t * depth];
        if (sidePick < 2 * width + depth) return [area.minX + t * width, area.maxZ - inset];
        return [area.minX + inset, area.minZ + t * depth];
      }
      const x = area.minX + rng() * width;
      const z = area.minZ + rng() * depth;
      return [x, z];
    },
    contains(point) {
      return pointInAabb(point, area);
    },
  };
}

function radialRadius(rng: () => number, inner: number, outer: number, distribution: RadialDistribution): number {
  const u = rng();
  if (distribution === "area") return Math.sqrt(inner * inner + u * (outer * outer - inner * inner));
  return inner + u * (outer - inner);
}

/**
 * A filled circle. `"area"` is area-uniform (√-corrected radius, even density); `"radial"` is
 * radius-uniform (clumps toward the center). Angle is drawn first, then radius — matching the common
 * `angle = rng()·2π; r = rng()·R` idiom so migrations keep their stream.
 */
export function discRegion(center: Vec2, radius: number, options: { distribution?: RadialDistribution } = {}): SampleRegion<Vec2> {
  const distribution = options.distribution ?? "area";
  const r = Math.max(0, radius);
  return {
    dimensions: 2,
    isEmpty: !(r > 0),
    sample(rng) {
      const angle = rng() * TWO_PI;
      const dist = radialRadius(rng, 0, r, distribution);
      return [center[0] + Math.cos(angle) * dist, center[1] + Math.sin(angle) * dist];
    },
    contains(point) {
      return distanceSq(point, center) <= r * r;
    },
  };
}

/**
 * A ring (annulus) between `innerRadius` and `outerRadius`. `"area"` fills the band with even
 * density; `"radial"` spreads uniformly in radius. Angle first, then radius.
 */
export function annulusRegion(
  center: Vec2,
  innerRadius: number,
  outerRadius: number,
  options: { distribution?: RadialDistribution } = {},
): SampleRegion<Vec2> {
  const distribution = options.distribution ?? "area";
  const inner = Math.max(0, Math.min(innerRadius, outerRadius));
  const outer = Math.max(innerRadius, outerRadius, 0);
  return {
    dimensions: 2,
    isEmpty: !(outer > 0) || outer <= inner,
    sample(rng) {
      const angle = rng() * TWO_PI;
      const dist = radialRadius(rng, inner, outer, distribution);
      return [center[0] + Math.cos(angle) * dist, center[1] + Math.sin(angle) * dist];
    },
    contains(point) {
      const d2 = distanceSq(point, center);
      return d2 >= inner * inner && d2 <= outer * outer;
    },
  };
}

/**
 * An arbitrary closed polygon on the XZ plane. Candidates are drawn uniformly from the polygon's
 * bounding box and gated by point-in-polygon `contains`, so a run's draw count stays fixed (the
 * sampler's attempt budget bounds the rejection, not a hidden inner loop).
 *
 * @capability spatial-region-polygon sample within an arbitrary closed polygon on the XZ plane
 */
export function polygonRegion(polygon: readonly Vec2[]): SampleRegion<Vec2> {
  const bounds = polygonBounds(polygon);
  const width = bounds === null ? 0 : bounds.maxX - bounds.minX;
  const depth = bounds === null ? 0 : bounds.maxZ - bounds.minZ;
  return {
    dimensions: 2,
    isEmpty: bounds === null || polygon.length < 3 || !(width > 0) || !(depth > 0),
    sample(rng) {
      const b = bounds ?? { minX: 0, minZ: 0, maxX: 0, maxZ: 0 };
      return [b.minX + rng() * width, b.minZ + rng() * depth];
    },
    contains(point) {
      return pointInPolygon(point, polygon);
    },
  };
}

/**
 * A composite that first picks one member by weight, then delegates to its sampler — the
 * "weighted subregions" distribution policy. `contains` is true when any member contains the point.
 *
 * @capability spatial-region-weighted compose sub-regions behind a weighted selection policy
 */
export function weightedRegion<P extends SamplePoint>(entries: readonly WeightedRegionEntry<P>[]): SampleRegion<P> {
  const usable = entries.filter((e) => e.weight > 0 && !e.region.isEmpty);
  const total = usable.reduce((sum, e) => sum + e.weight, 0);
  const dimensions = entries[0]?.region.dimensions ?? 2;
  return {
    dimensions,
    isEmpty: usable.length === 0,
    sample(rng) {
      let roll = rng() * total;
      for (const entry of usable) {
        roll -= entry.weight;
        if (roll <= 0) return entry.region.sample(rng);
      }
      return usable[usable.length - 1]!.region.sample(rng);
    },
    contains(point) {
      return entries.some((e) => e.region.contains(point));
    },
  };
}

/**
 * Wrap a caller-defined sampler and bounds test as a {@link SampleRegion} — the escape hatch for
 * regions the built-ins do not cover (a navmesh cell, a heightfield mask, a spline tube).
 *
 * @capability spatial-region-custom wrap a caller-defined sampler and bounds test as a region
 */
export function customRegion<P extends SamplePoint>(spec: {
  dimensions: 2 | 3;
  sample: (rng: () => number) => P;
  contains: (point: P) => boolean;
  isEmpty?: boolean;
}): SampleRegion<P> {
  return {
    dimensions: spec.dimensions,
    isEmpty: spec.isEmpty ?? false,
    sample: spec.sample,
    contains: spec.contains,
  };
}

// ---------------------------------------------------------------------------
// 3D region builders
// ---------------------------------------------------------------------------

/**
 * An axis-aligned box `[min..max]` in 3D. Uniform density; draws x, y, z in order.
 *
 * @capability spatial-region-box sample uniformly within an axis-aligned 3D box
 */
export function boxRegion(min: Point3, max: Point3): SampleRegion<Point3> {
  const size: Point3 = [max[0] - min[0], max[1] - min[1], max[2] - min[2]];
  return {
    dimensions: 3,
    isEmpty: !(size[0] > 0) || !(size[1] > 0) || !(size[2] > 0),
    sample(rng) {
      return [min[0] + rng() * size[0], min[1] + rng() * size[1], min[2] + rng() * size[2]];
    },
    contains(point) {
      return (
        point[0] >= min[0] && point[0] <= max[0] &&
        point[1] >= min[1] && point[1] <= max[1] &&
        point[2] >= min[2] && point[2] <= max[2]
      );
    },
  };
}

function sphereDirection(rng: () => number): Point3 {
  const cosTheta = 1 - 2 * rng();
  const sinTheta = Math.sqrt(Math.max(0, 1 - cosTheta * cosTheta));
  const phi = rng() * TWO_PI;
  return [sinTheta * Math.cos(phi), sinTheta * Math.sin(phi), cosTheta];
}

function volumeRadius(rng: () => number, inner: number, outer: number, distribution: VolumeDistribution): number {
  const u = rng();
  if (distribution === "volume") return Math.cbrt(inner ** 3 + u * (outer ** 3 - inner ** 3));
  return inner + u * (outer - inner);
}

/**
 * A filled ball. `"volume"` is volume-uniform (∛-corrected radius); `"radial"` is radius-uniform.
 * Direction is drawn first (two draws), then radius.
 *
 * @capability spatial-region-sphere sample within a filled 3D ball, volume- or radius-uniform
 */
export function sphereRegion(center: Point3, radius: number, options: { distribution?: VolumeDistribution } = {}): SampleRegion<Point3> {
  const distribution = options.distribution ?? "volume";
  const r = Math.max(0, radius);
  return {
    dimensions: 3,
    isEmpty: !(r > 0),
    sample(rng) {
      const dir = sphereDirection(rng);
      const dist = volumeRadius(rng, 0, r, distribution);
      return [center[0] + dir[0] * dist, center[1] + dir[1] * dist, center[2] + dir[2] * dist];
    },
    contains(point) {
      return distanceSq(point, center) <= r * r;
    },
  };
}

/**
 * A spherical shell between `innerRadius` and `outerRadius`. `"volume"` fills the shell with even
 * density; `"radial"` spreads uniformly in radius. Direction first, then radius.
 *
 * @capability spatial-region-shell sample within a 3D spherical shell, volume- or radius-uniform
 */
export function shellRegion(
  center: Point3,
  innerRadius: number,
  outerRadius: number,
  options: { distribution?: VolumeDistribution } = {},
): SampleRegion<Point3> {
  const distribution = options.distribution ?? "volume";
  const inner = Math.max(0, Math.min(innerRadius, outerRadius));
  const outer = Math.max(innerRadius, outerRadius, 0);
  return {
    dimensions: 3,
    isEmpty: !(outer > 0) || outer <= inner,
    sample(rng) {
      const dir = sphereDirection(rng);
      const dist = volumeRadius(rng, inner, outer, distribution);
      return [center[0] + dir[0] * dist, center[1] + dir[1] * dist, center[2] + dir[2] * dist];
    },
    contains(point) {
      const d2 = distanceSq(point, center);
      return d2 >= inner * inner && d2 <= outer * outer;
    },
  };
}

// ---------------------------------------------------------------------------
// Stratified sampling
// ---------------------------------------------------------------------------

/** Inputs for {@link sampleStratified}: a grid over `area` with one jittered point per cell. */
export interface StratifiedOptions {
  area: Aabb;
  rng: () => number;
  /** Grid columns (X) and rows (Z). */
  cols: number;
  rows: number;
  /** Cell jitter 0..1 — 0 is a rigid lattice, 1 fills the whole cell. Default 1. */
  jitter?: number;
}

/**
 * Stratified 2D sampling: one jittered point per grid cell over `area`, in deterministic row-major
 * order. Unlike pure rejection sampling this guarantees even coverage (no clumps, no gaps) — the
 * distinct "stratified" distribution policy, kept separate from area-uniform draws.
 *
 * @capability spatial-sample-stratified evenly cover an area with one jittered point per grid cell, deterministic
 */
export function sampleStratified(options: StratifiedOptions): Vec2[] {
  const { area, rng } = options;
  const cols = Math.max(0, Math.floor(options.cols));
  const rows = Math.max(0, Math.floor(options.rows));
  const width = area.maxX - area.minX;
  const depth = area.maxZ - area.minZ;
  if (cols === 0 || rows === 0 || !(width > 0) || !(depth > 0)) return [];
  const jitter = Math.min(1, Math.max(0, options.jitter ?? 1));
  const cellW = width / cols;
  const cellD = depth / rows;
  const points: Vec2[] = [];
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const jx = 0.5 + jitter * (rng() - 0.5);
      const jz = 0.5 + jitter * (rng() - 0.5);
      points.push([area.minX + (col + jx) * cellW, area.minZ + (row + jz) * cellD]);
    }
  }
  return points;
}
