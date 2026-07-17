import type { TerrainField } from "./terrain";

/** A world-space point on the ground plane as an `[x, z]` pair. */
export type GroundPoint = readonly [number, number];

/** A height sampler over the ground: world elevation at any `x`/`z`. */
export type HeightSampler = (x: number, z: number) => number;

/** An axis-aligned XZ rectangle to generate terrain-readability guides within. */
export interface GuideRegion {
  minX: number;
  minZ: number;
  maxX: number;
  maxZ: number;
}

function assertRegion(region: GuideRegion): void {
  if (!(region.maxX > region.minX) || !(region.maxZ > region.minZ)) {
    throw new Error("terrainGuides: region must have maxX > minX and maxZ > minZ");
  }
}

function clampInt(value: number, min: number, max: number): number {
  const v = Math.round(value);
  return v < min ? min : v > max ? max : v;
}

/**
 * A sampled height grid over a region — the shared substrate contour extraction and elevation
 * summaries both read, so a caller can sample once and derive several guides from it.
 * @internal — an intermediate; games call {@link extractContours} / {@link summarizeElevation} directly.
 */
export interface HeightGrid {
  region: GuideRegion;
  /** Sample columns and rows (each is `resolution + 1` points across its axis). */
  cols: number;
  rows: number;
  /** Row-major heights, length `cols * rows` (row `r`, column `c` at index `r * cols + c`). */
  heights: Float64Array;
  min: number;
  max: number;
}

/**
 * Samples `sampleHeight` on a `(resolution + 1)²` grid across `region`, capturing the min/max seen —
 * the bounded, budget-capped scan every guide derives from. `resolution` is clamped to `[1, maxSamples]`.
 * @internal — building block behind the public guide generators.
 */
export function sampleHeightGrid(
  sampleHeight: HeightSampler,
  region: GuideRegion,
  resolution = 128,
  maxSamples = 256,
): HeightGrid {
  assertRegion(region);
  const res = clampInt(resolution, 1, Math.max(1, Math.round(maxSamples)));
  const cols = res + 1;
  const rows = res + 1;
  const heights = new Float64Array(cols * rows);
  const spanX = region.maxX - region.minX;
  const spanZ = region.maxZ - region.minZ;
  let min = Infinity;
  let max = -Infinity;
  for (let r = 0; r < rows; r += 1) {
    const z = region.minZ + (r / res) * spanZ;
    for (let c = 0; c < cols; c += 1) {
      const x = region.minX + (c / res) * spanX;
      const h = sampleHeight(x, z);
      heights[r * cols + c] = h;
      if (h < min) min = h;
      if (h > max) max = h;
    }
  }
  return { region, cols, rows, heights, min, max };
}

/** A single iso-elevation contour traced across a region as a flat list of XZ line segments. */
export interface ContourLine {
  /** The world elevation (`y`) this contour follows. */
  level: number;
  /** Whether this is a major (emphasised) contour rather than a minor one. */
  major: boolean;
  /**
   * Flat segment endpoints `[x0, z0, x1, z1, ...]` — every four numbers is one XZ segment. Draw each
   * at `y = level` to drape it on the surface; the contour is exact iso-height so it hugs terrain.
   */
  segments: readonly number[];
}

/** Shaping for {@link extractContours}: region, vertical spacing, emphasis cadence, and sample budget. */
export interface ContourOptions {
  region: GuideRegion;
  /** Vertical spacing between adjacent contour lines, in world units. Must be `> 0`. */
  interval: number;
  /** Every Nth line (counting from `y = 0`) is a major contour. Default `5`; `<= 1` makes all major. */
  majorEvery?: number;
  /** Samples per axis for the marching-squares grid. Default `128`, clamped to `[1, maxSamples]`. */
  resolution?: number;
  /** Hard per-axis sample cap so extraction stays within an explicit budget. Default `256`. */
  maxSamples?: number;
}

function lerpPoint(
  ax: number,
  az: number,
  av: number,
  bx: number,
  bz: number,
  bv: number,
  level: number,
): readonly [number, number] {
  const denom = bv - av;
  const t = denom === 0 ? 0.5 : (level - av) / denom;
  const clamped = t < 0 ? 0 : t > 1 ? 1 : t;
  return [ax + (bx - ax) * clamped, az + (bz - az) * clamped];
}

/**
 * Traces surface-following contour lines from a height field via marching squares: samples a bounded
 * grid over the region, then for every multiple of `interval` strictly inside the sampled height range
 * emits the iso-line as XZ segments (saddle cells disambiguated by the cell-center average). Because a
 * contour is exact constant elevation, drawing each segment at `y = level` makes it hug the terrain —
 * the readable, scale-bearing overlay a flat ground grid cannot give. Pure math, renderer-agnostic.
 * @capability terrain-contours iso-elevation contour lines that drape on sculpted terrain
 * @consumer editor terrain-readability overlay; any map/minimap wanting elevation contours
 */
export function extractContours(sampleHeight: HeightSampler, options: ContourOptions): ContourLine[] {
  const { interval } = options;
  if (!(interval > 0)) throw new Error("extractContours: interval must be > 0");
  const majorEvery = Math.max(1, Math.floor(options.majorEvery ?? 5));
  const grid = sampleHeightGrid(sampleHeight, options.region, options.resolution ?? 128, options.maxSamples ?? 256);
  const { cols, heights, region } = grid;
  const res = cols - 1;
  const spanX = region.maxX - region.minX;
  const spanZ = region.maxZ - region.minZ;
  const worldX = (c: number): number => region.minX + (c / res) * spanX;
  const worldZ = (r: number): number => region.minZ + (r / res) * spanZ;

  const lines: ContourLine[] = [];
  if (grid.max - grid.min < 1e-9) return lines;
  const firstStep = Math.ceil(grid.min / interval + 1e-9);
  const lastStep = Math.floor(grid.max / interval - 1e-9);
  for (let step = firstStep; step <= lastStep; step += 1) {
    const level = step * interval;
    const segments: number[] = [];
    for (let r = 0; r < res; r += 1) {
      for (let c = 0; c < res; c += 1) {
        const blv = heights[r * cols + c]!;
        const brv = heights[r * cols + c + 1]!;
        const trv = heights[(r + 1) * cols + c + 1]!;
        const tlv = heights[(r + 1) * cols + c]!;
        let code = 0;
        if (blv > level) code |= 1;
        if (brv > level) code |= 2;
        if (trv > level) code |= 4;
        if (tlv > level) code |= 8;
        if (code === 0 || code === 15) continue;
        const x0 = worldX(c);
        const x1 = worldX(c + 1);
        const z0 = worldZ(r);
        const z1 = worldZ(r + 1);
        const eBottom = (): readonly [number, number] => lerpPoint(x0, z0, blv, x1, z0, brv, level);
        const eRight = (): readonly [number, number] => lerpPoint(x1, z0, brv, x1, z1, trv, level);
        const eTop = (): readonly [number, number] => lerpPoint(x1, z1, trv, x0, z1, tlv, level);
        const eLeft = (): readonly [number, number] => lerpPoint(x0, z1, tlv, x0, z0, blv, level);
        const push = (a: readonly [number, number], b: readonly [number, number]): void => {
          segments.push(a[0], a[1], b[0], b[1]);
        };
        switch (code) {
          case 1:
          case 14:
            push(eLeft(), eBottom());
            break;
          case 2:
          case 13:
            push(eBottom(), eRight());
            break;
          case 3:
          case 12:
            push(eLeft(), eRight());
            break;
          case 4:
          case 11:
            push(eRight(), eTop());
            break;
          case 6:
          case 9:
            push(eBottom(), eTop());
            break;
          case 7:
          case 8:
            push(eLeft(), eTop());
            break;
          case 5: {
            const center = (blv + brv + trv + tlv) / 4;
            if (center > level) {
              push(eLeft(), eTop());
              push(eBottom(), eRight());
            } else {
              push(eLeft(), eBottom());
              push(eRight(), eTop());
            }
            break;
          }
          case 10: {
            const center = (blv + brv + trv + tlv) / 4;
            if (center > level) {
              push(eLeft(), eBottom());
              push(eRight(), eTop());
            } else {
              push(eLeft(), eTop());
              push(eBottom(), eRight());
            }
            break;
          }
          default:
            break;
        }
      }
    }
    if (segments.length > 0) {
      lines.push({ level, major: step % majorEvery === 0, segments });
    }
  }
  return lines;
}

const NICE_STEPS = [1, 2, 2.5, 5] as const;

/**
 * Picks a human-friendly contour interval — a `1/2/2.5/5 × 10ⁿ` step — so an elevation `range` splits
 * into roughly `targetLines` bands. Drives adaptive contour density: a tall terrain gets a coarse
 * interval, a shallow one a fine interval, without the author choosing a number. Returns `0` when the
 * range is non-positive (nothing to contour).
 * @capability contour-interval readable auto-spacing for elevation contours
 * @consumer editor terrain-readability overlay density control
 */
export function chooseContourInterval(range: number, targetLines = 12): number {
  if (!(range > 0) || !(targetLines > 0)) return 0;
  const rough = range / targetLines;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  let best = NICE_STEPS[0]! * magnitude;
  let bestErr = Infinity;
  for (const stepBase of NICE_STEPS) {
    for (const scale of [magnitude, magnitude * 10]) {
      const candidate = stepBase * scale;
      const err = Math.abs(range / candidate - targetLines);
      if (err < bestErr) {
        bestErr = err;
        best = candidate;
      }
    }
  }
  return best;
}

/** Measurable elevation readout at a single world point — the cursor/hover feedback value. */
export interface ElevationReadout {
  x: number;
  z: number;
  /** Ground elevation at the point. */
  height: number;
  /** `height - reference` — signed distance above (+) or below (−) the reference plane. */
  delta: number;
  /** The reference-plane height the delta was measured against. */
  reference: number;
}

/**
 * Reads the ground elevation under a world point and its signed delta from a reference plane — the
 * measurable cursor/hover feedback ("+3.4 above the pad") an author needs to judge sculpted height.
 * @capability elevation-readout cursor height and delta-from-reference feedback
 * @consumer editor terrain-readability HUD readout
 */
export function sampleElevation(
  sampleHeight: HeightSampler,
  x: number,
  z: number,
  reference = 0,
): ElevationReadout {
  const height = sampleHeight(x, z);
  return { x, z, height, delta: height - reference, reference };
}

/** Aggregate elevation statistics over a region — the selection min/max/mean and legend range. */
export interface ElevationSummary {
  min: number;
  max: number;
  mean: number;
  /** `max - min` — the vertical relief across the region. */
  range: number;
  /** World point where the lowest sample was found. */
  minAt: GroundPoint;
  /** World point where the highest sample was found. */
  maxAt: GroundPoint;
  /** Number of grid samples taken. */
  samples: number;
}

/**
 * Summarises elevation across a region on a bounded sample grid: min, max, mean, relief range, and the
 * world points of the extremes — the selection min/max and legend feedback the readability overlay
 * reports, and the input to {@link chooseContourInterval}. Pure math, renderer-agnostic.
 * @capability elevation-summary selection min/max/mean and relief over a region
 * @consumer editor terrain-readability legend and selection stats
 */
export function summarizeElevation(
  sampleHeight: HeightSampler,
  region: GuideRegion,
  resolution = 64,
  maxSamples = 256,
): ElevationSummary {
  const grid = sampleHeightGrid(sampleHeight, region, resolution, maxSamples);
  const { cols, rows, heights } = grid;
  const res = cols - 1;
  const spanX = region.maxX - region.minX;
  const spanZ = region.maxZ - region.minZ;
  let sum = 0;
  let minAt: GroundPoint = [region.minX, region.minZ];
  let maxAt: GroundPoint = [region.minX, region.minZ];
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      const h = heights[r * cols + c]!;
      sum += h;
      if (h === grid.min) minAt = [region.minX + (c / res) * spanX, region.minZ + (r / res) * spanZ];
      if (h === grid.max) maxAt = [region.minX + (c / res) * spanX, region.minZ + (r / res) * spanZ];
    }
  }
  const samples = cols * rows;
  return {
    min: grid.min,
    max: grid.max,
    mean: sum / samples,
    range: grid.max - grid.min,
    minAt,
    maxAt,
    samples,
  };
}

/** Shaping for surface draping: subdivision spacing and a lift to keep the line off the ground. */
export interface DrapeOptions {
  /** Max world spacing between draped vertices; longer spans are subdivided so the line hugs the surface. Default `1`. */
  spacing?: number;
  /** Lift each draped vertex this far above the sampled surface, to avoid z-fighting. Default `0`. */
  offset?: number;
}

/**
 * Drapes an XZ polyline onto the surface: subdivides each span to at most `spacing` and lifts every
 * vertex to `sampleHeight + offset`, returning flat `[x, y, z, ...]` world triples. The reusable seam
 * behind surface-following placement guides and grid lines — a straight guide bends to follow terrain.
 * @capability surface-drape lift an XZ polyline onto sculpted terrain
 * @consumer editor placement guides and surface grid overlay
 */
export function drapePolyline(
  sampleHeight: HeightSampler,
  points: readonly GroundPoint[],
  options: DrapeOptions = {},
): number[] {
  const spacing = options.spacing !== undefined && options.spacing > 0 ? options.spacing : 1;
  const offset = options.offset ?? 0;
  const out: number[] = [];
  if (points.length === 0) return out;
  const push = (x: number, z: number): void => {
    out.push(x, sampleHeight(x, z) + offset, z);
  };
  if (points.length === 1) {
    push(points[0]![0], points[0]![1]);
    return out;
  }
  push(points[0]![0], points[0]![1]);
  for (let i = 1; i < points.length; i += 1) {
    const [ax, az] = points[i - 1]!;
    const [bx, bz] = points[i]!;
    const dist = Math.hypot(bx - ax, bz - az);
    const steps = Math.max(1, Math.ceil(dist / spacing));
    for (let s = 1; s <= steps; s += 1) {
      const t = s / steps;
      push(ax + (bx - ax) * t, az + (bz - az) * t);
    }
  }
  return out;
}

/**
 * A closed circle draped on the surface — the surface-following placement guide ring under a cursor or
 * a selected object. Returns flat `[x, y, z, ...]` world triples forming a loop (last vertex repeats
 * the first). `segments` sets the smoothness of the ring.
 * @capability surface-ring surface-following placement guide ring
 * @consumer editor cursor/placement guide
 */
export function surfaceRing(
  sampleHeight: HeightSampler,
  center: GroundPoint,
  radius: number,
  segments = 48,
  options: DrapeOptions = {},
): number[] {
  const n = Math.max(3, Math.floor(segments));
  const points: GroundPoint[] = [];
  for (let i = 0; i <= n; i += 1) {
    const angle = (i / n) * Math.PI * 2;
    points.push([center[0] + Math.cos(angle) * radius, center[1] + Math.sin(angle) * radius]);
  }
  return drapePolyline(sampleHeight, points, options);
}

/** One draped grid line from {@link surfaceGridLines}: its axis, emphasis, and draped vertices. */
export interface SurfaceGridLine {
  /** Which axis the line runs constant along: an `"x"` line holds `x` fixed and spans `z`, and vice versa. */
  axis: "x" | "z";
  /** The constant coordinate value the line holds. */
  at: number;
  /** Whether this is a major (emphasised) grid line. */
  major: boolean;
  /** Flat `[x, y, z, ...]` world triples draped on the surface. */
  points: readonly number[];
}

/** Shaping for {@link surfaceGridLines}: region, spacing, emphasis cadence, and draping. */
export interface SurfaceGridOptions {
  region: GuideRegion;
  /** World distance between adjacent grid lines. Must be `> 0`. */
  spacing: number;
  /** Every Nth line (counting from origin) is a major line. Default `5`; `<= 1` makes all major. */
  majorEvery?: number;
  /** Draping options for each line. */
  drape?: DrapeOptions;
}

function gridStops(min: number, max: number, spacing: number): number[] {
  const stops: number[] = [];
  const first = Math.ceil(min / spacing - 1e-9);
  const last = Math.floor(max / spacing + 1e-9);
  for (let step = first; step <= last; step += 1) stops.push(step);
  return stops;
}

/**
 * Builds a surface-following major/minor grid over a region: constant-`x` and constant-`z` lines at
 * `spacing`, each draped onto the terrain so the reference grid climbs sculpted surfaces instead of
 * being occluded by them (the flat `y = 0` grid's core failure). Draping subdivides to
 * `drape.spacing`. Pure math, renderer-agnostic.
 * @capability surface-grid terrain-following reference grid that is not occluded by relief
 * @consumer editor terrain-readability grid overlay
 */
export function surfaceGridLines(sampleHeight: HeightSampler, options: SurfaceGridOptions): SurfaceGridLine[] {
  const { region, spacing } = options;
  assertRegion(region);
  if (!(spacing > 0)) throw new Error("surfaceGridLines: spacing must be > 0");
  const majorEvery = Math.max(1, Math.floor(options.majorEvery ?? 5));
  const drape = options.drape ?? {};
  const lines: SurfaceGridLine[] = [];
  for (const step of gridStops(region.minX, region.maxX, spacing)) {
    const x = step * spacing;
    lines.push({
      axis: "x",
      at: x,
      major: step % majorEvery === 0,
      points: drapePolyline(sampleHeight, [[x, region.minZ], [x, region.maxZ]], drape),
    });
  }
  for (const step of gridStops(region.minZ, region.maxZ, spacing)) {
    const z = step * spacing;
    lines.push({
      axis: "z",
      at: z,
      major: step % majorEvery === 0,
      points: drapePolyline(sampleHeight, [[region.minX, z], [region.maxX, z]], drape),
    });
  }
  return lines;
}

/**
 * Convenience over {@link extractContours} that auto-picks the interval from the field's own relief:
 * summarises the region, chooses a readable interval for `targetLines` bands, and traces the contours —
 * the one call the editor overlay makes to turn a `TerrainField` into ready-to-draw guides. Returns an
 * empty list for flat ground.
 * @capability terrain-guides one-call adaptive contours for a terrain field
 * @consumer editor terrain-readability overlay
 */
export function terrainContourGuides(
  field: Pick<TerrainField, "sampleHeight">,
  region: GuideRegion,
  targetLines = 12,
  resolution = 128,
): { interval: number; summary: ElevationSummary; contours: ContourLine[] } {
  const summary = summarizeElevation(field.sampleHeight, region, Math.min(resolution, 96));
  const interval = chooseContourInterval(summary.range, targetLines);
  const contours =
    interval > 0 ? extractContours(field.sampleHeight, { region, interval, resolution }) : [];
  return { interval, summary, contours };
}
