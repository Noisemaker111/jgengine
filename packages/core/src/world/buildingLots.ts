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
import { rectClearsPolyline, rectsSeparated, type OrientedRect, type Vec2 } from "./cityGeometry";
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
  /** Place lots on both sides of each road. Default true. */
  bothSides?: boolean;
  /** Clip region; lots whose center falls outside are dropped. Omit to keep every lot. */
  area?: LotArea;
  /**
   * Extra road corridors lots must keep clear of WITHOUT lining them with frontage — service
   * alleys, lanes, trails. Every lot's full footprint is kept off these (and off `roads`).
   */
  avoid?: readonly RoadFrontage[];
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
 * Derive street-aligned building lots (PLOTS) from road frontage. Lots are stepped along each road
 * at `footprint.w + spacing`, offset to each side by `width / 2 + setback + footprint.d / 2`, and
 * turned to face the road. The PLOT CONTRACT is enforced here, exactly: no two plots ever overlap
 * (true oriented-rect separation with the spacing gap, so corners and curved frontage can't stack
 * buildings), and no plot footprint ever touches any road corridor in `roads` or `avoid` — not
 * just its own frontage road. Deterministic: identical inputs (including seed) always yield the
 * identical list.
 * @capability building-lots derive street-facing building lots from road frontage
 */
export function deriveBuildingLots(options: BuildingLotOptions): PlacedBuildingLot[] {
  const footprint = options.footprint ?? DEFAULT_FOOTPRINT;
  const spacing = Math.max(0, options.spacing ?? 2);
  const setback = Math.max(0, options.setback ?? 3);
  const bothSides = options.bothSides ?? true;
  const maxLots = Math.max(0, Math.floor(options.maxLots ?? 400));
  const step = Math.max(1, footprint.w + spacing);

  const sides: readonly (1 | -1)[] = bothSides ? [1, -1] : [1];
  const corridors: { path: readonly Vec2[]; half: number }[] = [];
  for (const road of options.roads) corridors.push({ path: road.path, half: road.width / 2 });
  for (const road of options.avoid ?? []) corridors.push({ path: road.path, half: road.width / 2 });

  const lots: PlacedBuildingLot[] = [];
  const accepted: OrientedRect[] = [];
  const hw = footprint.w / 2;
  const hd = footprint.d / 2;
  // Gap grown onto the candidate for the plot-vs-plot separation test. Half the spacing on each
  // rect keeps same-road neighbours (spaced exactly `spacing` apart) accepted while anything
  // closer — corner stacking, inside-of-curve pinches — is rejected.
  const gap = Math.max(0.1, spacing * 0.45);
  // Plots may touch the asphalt edge but never intrude into it; the tiny epsilon keeps an exact
  // setback-0 front face (touching the corridor boundary) legal.
  const roadClearanceSlack = 0.02;

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
        const rotationY = facingRotation([nx, nz]);
        const rect: OrientedRect = { x: cx, z: cz, hw, hd, angle: rotationY };
        // Plot-vs-plot: reject any candidate whose rect (grown by the spacing gap) overlaps an
        // accepted plot — regardless of which road placed it.
        const grown: OrientedRect = { ...rect, hw: hw + gap, hd: hd + gap };
        let clash = false;
        for (const other of accepted) {
          if (!rectsSeparated(grown, other)) {
            clash = true;
            break;
          }
        }
        if (clash) continue;
        // Plot-vs-road: the full footprint stays off every corridor (frontage roads AND avoid
        // corridors), so a plot can never straddle a crossing street.
        let onRoad = false;
        for (const corridor of corridors) {
          if (!rectClearsPolyline(rect, corridor.path, corridor.half - roadClearanceSlack)) {
            onRoad = true;
            break;
          }
        }
        if (onRoad) continue;
        lots.push({
          center: [cx, cz],
          rotationY,
          footprint: { w: footprint.w, d: footprint.d },
          road: r,
          side,
          frontDistance: front,
        });
        accepted.push(rect);
      }
    }
  }
  return lots;
}
