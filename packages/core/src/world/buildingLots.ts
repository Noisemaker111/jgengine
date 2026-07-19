/**
 * Street-aware building placement: derive building LOTS along ROAD FRONTAGE. Given road segments
 * (centerline + width) and a district area, walk each road by arc length and emit lots on both
 * sides at a consistent setback — a curb + sidewalk strip — with each lot carrying the yaw that
 * makes the building FRONT face its road. Unlike `cityBlocks` (which needs a CLOSED street network
 * to extract planar block faces), this works on a sparse set of segments — the common authoring
 * case — so buildings line the streets instead of scattering on plinths around a center point.
 *
 * Pure seeded math over `cityGeometry` `Vec2` primitives: no rendering, deterministic from the
 * inputs, bounded by `maxLots`.
 *
 * @capability world-environment lots aligned to and facing road frontage, with a setback sidewalk strip
 */
import type { Vec2 } from "./cityGeometry";
import type { WorldBounds } from "./features";

/** One road the frontage placer lines with buildings: a centerline polyline and its full width. */
export interface RoadFrontage {
  /** Road centerline vertices in world XZ; at least two points. */
  path: readonly Vec2[];
  /** Road full width in world units; lots set back from `width / 2`. */
  width: number;
}

/** Rectangular clip region lots must fall within (world center + half-extents). */
export interface LotArea {
  /** World-space center of the region; default `[0, 0]`. */
  center?: Vec2;
  /** Half-extents along world x and z. */
  halfExtents: Vec2;
}

/** Options for {@link deriveBuildingLots}. */
export interface BuildingLotOptions {
  /** Roads whose frontage is lined with lots. */
  roads: readonly RoadFrontage[];
  /** Lot footprint: `w` is frontage width (along the road), `d` is depth (into the block). Default `{ w: 12, d: 10 }`. */
  footprint?: WorldBounds;
  /** Gap between neighbouring lots along a frontage, world units. Default 2. */
  spacing?: number;
  /** Sidewalk strip between the curb (`width / 2`) and the building front, world units. Default 3. */
  setback?: number;
  /**
   * Manhattan streetwall dial (0..1). Omit (default) keeps the legacy look byte-for-byte. When set,
   * frontage is compacted as it rises: the along-road gap between neighbours scales from `spacing` at
   * `~0.45` down to 0 at 1 (buildings shoulder-to-shoulder), and each lot's frontage width widens by
   * a modest factor above 0.45 so consecutive lots touch instead of leaving gaps. Below ~0.45 the gap
   * grows past `spacing`, so a low dial reads sparser than the default. Depth is unchanged. This is
   * pure frontage compaction; block-interior fill lives in the content pass (`resolveCityLotContent`).
   */
  blockFill?: number;
  /** Place lots on both sides of each road. Default true. */
  bothSides?: boolean;
  /** Clip region; lots whose center falls outside are dropped. Omit to keep every lot. */
  area?: LotArea;
  /**
   * Seed forwarded by callers for parity with other feature configs. Lot GEOMETRY is fully
   * determined by the roads and dials (so a layout is identical without it); per-building variation
   * (floors, massing) is seeded downstream where the lots become buildings.
   */
  seed?: string;
  /** Hard cap on emitted lots so a long network stays bounded. Default 400. */
  maxLots?: number;
}

/** One placed building lot: where a building stands and how it is turned to face its road. */
export interface PlacedBuildingLot {
  /** Lot (building footprint) center in world XZ. */
  center: Vec2;
  /** Building yaw (radians) so its FRONT (+z local face) points at the road. */
  rotationY: number;
  /** Footprint of the lot: `w` along the frontage, `d` into the block. */
  footprint: WorldBounds;
  /** Index into the input `roads`. */
  road: number;
  /** Which side of the road: +1 = left normal, -1 = right normal. */
  side: 1 | -1;
  /** Distance from the lot's front face to the road centerline (= `width / 2 + setback`). */
  frontDistance: number;
}

const DEFAULT_FOOTPRINT: WorldBounds = { w: 12, d: 10 };

/**
 * Frontage-fill reference point: at this dial value the compaction is a no-op (legacy spacing/width),
 * so callers can leave `blockFill` unset for the classic look and this value reproduces it exactly.
 */
export const FRONTAGE_FILL_REFERENCE = 0.45;
/** Modest extra frontage-width growth applied at full fill so consecutive lots touch (edge-to-edge). */
const FRONTAGE_WIDTH_OVERFILL = 0.1;

/**
 * Map a `blockFill` dial to frontage compaction factors. `undefined` ⇒ identity (legacy path stays
 * byte-identical). At {@link FRONTAGE_FILL_REFERENCE} the factors are exactly `{1, 1}`; toward 1 the
 * gap collapses and lots widen, toward 0 the gap grows (sparser than default). @internal
 */
export function frontageCompaction(blockFill: number | undefined): { spacingScale: number; widthScale: number } {
  if (blockFill === undefined) return { spacingScale: 1, widthScale: 1 };
  const f = Math.max(0, Math.min(1, blockFill));
  const spacingScale = (1 - f) / (1 - FRONTAGE_FILL_REFERENCE);
  const widthScale = 1 + (Math.max(0, f - FRONTAGE_FILL_REFERENCE) / (1 - FRONTAGE_FILL_REFERENCE)) * FRONTAGE_WIDTH_OVERFILL;
  return { spacingScale, widthScale };
}

interface Station {
  p: Vec2;
  /** Unit tangent along the road at this station. */
  tangent: Vec2;
}

/** Cumulative arc length of a polyline. */
function polylineLength(path: readonly Vec2[]): number {
  let sum = 0;
  for (let i = 0; i + 1 < path.length; i += 1) {
    sum += Math.hypot(path[i + 1]![0] - path[i]![0], path[i + 1]![1] - path[i]![1]);
  }
  return sum;
}

/** Point + unit tangent at arc length `s` along a polyline (clamped to its ends). */
function stationAt(path: readonly Vec2[], s: number): Station {
  let acc = 0;
  for (let i = 0; i + 1 < path.length; i += 1) {
    const a = path[i]!;
    const b = path[i + 1]!;
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (len < 1e-9) continue;
    if (acc + len >= s || i + 2 === path.length) {
      const t = Math.max(0, Math.min(1, (s - acc) / len));
      return {
        p: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t],
        tangent: [(b[0] - a[0]) / len, (b[1] - a[1]) / len],
      };
    }
    acc += len;
  }
  const a = path[0]!;
  return { p: [a[0], a[1]], tangent: [1, 0] };
}

function inArea(area: LotArea | undefined, x: number, z: number): boolean {
  if (area === undefined) return true;
  const [cx, cz] = area.center ?? [0, 0];
  return Math.abs(x - cx) <= area.halfExtents[0] && Math.abs(z - cz) <= area.halfExtents[1];
}

/**
 * Yaw that turns the building FRONT (local +z) to face the road. The lot center sits at
 * `roadPoint + outwardNormal * d`, so the road lies along `-outwardNormal` from the center. In the
 * engine's Y-rotation convention a local +z of `(0, 1)` maps to world `(sin y, cos y)`; setting
 * that equal to `-outwardNormal` gives `y = atan2(-nx, -nz)`.
 * @internal
 */
export function facingRotation(outwardNormal: Vec2): number {
  return Math.atan2(-outwardNormal[0], -outwardNormal[1]);
}

/**
 * Derive street-aligned building lots from road frontage. Lots are stepped along each road at
 * `footprint.w + spacing`, offset to each side by `width / 2 + setback + footprint.d / 2`, and
 * turned to face the road. Cross-road overlaps are rejected by a bounded nearest-neighbour test, so
 * two roads meeting at a corner don't stack buildings. Deterministic: identical inputs (including
 * seed) always yield the identical list.
 * @capability building-lots derive street-facing building lots from road frontage
 */
export function deriveBuildingLots(options: BuildingLotOptions): PlacedBuildingLot[] {
  const baseFootprint = options.footprint ?? DEFAULT_FOOTPRINT;
  const baseSpacing = Math.max(0, options.spacing ?? 2);
  const setback = Math.max(0, options.setback ?? 3);
  const bothSides = options.bothSides ?? true;
  const maxLots = Math.max(0, Math.floor(options.maxLots ?? 400));
  // `blockFill` compaction: widen each lot's frontage and shrink the along-road gap toward a
  // Manhattan streetwall as the dial rises. Undefined ⇒ identity, so the classic path is untouched.
  const { spacingScale, widthScale } = frontageCompaction(options.blockFill);
  const footprint: WorldBounds = { w: baseFootprint.w * widthScale, d: baseFootprint.d };
  const spacing = baseSpacing * spacingScale;
  const step = Math.max(1, footprint.w + spacing);

  const sides: readonly (1 | -1)[] = bothSides ? [1, -1] : [1];
  // Minimum center separation for cross-road de-dup: half the footprint diagonal, a touch under
  // the along-road step so same-road neighbours are never rejected.
  const minSep = Math.min(step * 0.95, Math.hypot(footprint.w, footprint.d) * 0.5);
  const minSep2 = minSep * minSep;

  const lots: PlacedBuildingLot[] = [];
  const accepted: Vec2[] = [];

  for (let r = 0; r < options.roads.length && lots.length < maxLots; r += 1) {
    const road = options.roads[r]!;
    if (road.path.length < 2) continue;
    const total = polylineLength(road.path);
    if (total < 1e-6) continue;
    const front = road.width / 2 + setback;
    const offset = front + footprint.d / 2;
    // Center the run so lots sit symmetrically and endpoints keep a half-step margin.
    const count = Math.max(1, Math.floor(total / step));
    const startS = (total - (count - 1) * step) / 2;
    for (let i = 0; i < count && lots.length < maxLots; i += 1) {
      const s = startS + i * step;
      const station = stationAt(road.path, s);
      const [tx, tz] = station.tangent;
      // Left normal of the tangent (CCW): (-tz, tx). Right side negates it.
      for (const side of sides) {
        if (lots.length >= maxLots) break;
        const nx = -tz * side;
        const nz = tx * side;
        const cx = station.p[0] + nx * offset;
        const cz = station.p[1] + nz * offset;
        if (!inArea(options.area, cx, cz)) continue;
        let clash = false;
        for (const [ax, az] of accepted) {
          const dx = ax - cx;
          const dz = az - cz;
          if (dx * dx + dz * dz < minSep2) {
            clash = true;
            break;
          }
        }
        if (clash) continue;
        lots.push({
          center: [cx, cz],
          rotationY: facingRotation([nx, nz]),
          footprint: { w: footprint.w, d: footprint.d },
          road: r,
          side,
          frontDistance: front,
        });
        accepted.push([cx, cz]);
      }
    }
  }
  return lots;
}
