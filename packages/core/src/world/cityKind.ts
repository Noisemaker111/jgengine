/**
 * `city` studio: a procedural street/block/building district authored as a box volume — drop a
 * volume, and sliders tune the whole layout from a rigid Manhattan grid (`gridness` 1, `curviness`
 * 0) to winding organic hillside streets (`gridness` 0, `curviness` high). Streets are synthesized
 * as perturbed grid polylines with seeded wander; partial streets terminate at cross-street
 * intersections and branch lanes grow until they connect to another street, so the network reads as
 * connected. Blocks between streets become parks per `openSpace`, and building lots line street
 * frontage with exact rotated-rectangle collision (no lot overlaps), street-clearance checks (no
 * house on a road), and slope limits (no house on a cliff face) when terrain is available — steep
 * ground stays open, which is what carves hillside/canyon cities. Mixing districts is placing
 * multiple city volumes. Pure config + resolver here; the merged street-ribbon / instanced-massing
 * renderer lives in the `shell`. Everything is deterministic per seed and persisted in
 * `editor.scene.json`.
 *
 * @capability city-district editor-authorable procedural city district (streets, blocks, buildings)
 */
import { seededStreams } from "../random/rng";
import {
  parseParams,
  registerSceneKind,
  type ParamSchema,
  type SceneKindObject,
  type SceneKindResolveContext,
} from "../scene/sceneKinds";
import { BUILDING_STYLE_PALETTES, DEFAULT_BUILDING_STYLE, type BuildingStyle } from "./buildings";
import type { RoadPoint } from "./roads";

/** The editor volume kind marking a box as a procedural city district. */
export const CITY_KIND = "city";

/** Fully-defaulted city params parsed from a volume's `meta`. */
export interface CityRules {
  /** 1 = strict orthogonal grid (regular spacing, full through-streets); 0 = organic irregular net. */
  gridness: number;
  /** How much individual streets wander sideways. 0 = ruler-straight. */
  curviness: number;
  /** Density of branch lanes forking off the main streets, 0..1. */
  branching: number;
  /** Target block size (street spacing) in meters. */
  blockSize: number;
  /** Fraction of blocks left unbuilt as parks/plazas, 0..1. */
  openSpace: number;
  /** How full built frontage is with buildings, 0..1. */
  buildingDensity: number;
  /** Main street width in meters (avenues render wider, lanes narrower). */
  streetWidth: number;
  /** Minimum building floors. */
  floorsMin: number;
  /** Maximum building floors. */
  floorsMax: number;
  /** Height of one floor in meters. */
  floorHeight: number;
  /** Steepest ground (rise over run) a lot will build on; steeper slopes stay open cliff/canyon. */
  maxSlope: number;
  /** Lots below this ground height are skipped — keeps buildings out of rivers/lakes/canyons floors. */
  minElevation: number;
  /** Streets crossing ground below `minElevation` span it on a bridge deck instead of clipping. */
  bridges: boolean;
  /** Render sidewalks flanking every street. */
  sidewalks: boolean;
  /** Building style palette id (see {@link BUILDING_STYLE_PALETTES}). */
  style: BuildingStyle;
  /** Seed string; same seed reproduces the same city. Empty falls back to the volume id. */
  seed: string;
}

/** City defaults: a mid-size mixed downtown. */
export const CITY_DEFAULTS: CityRules = {
  gridness: 0.85,
  curviness: 0.15,
  branching: 0.4,
  blockSize: 48,
  openSpace: 0.12,
  buildingDensity: 0.75,
  streetWidth: 7,
  floorsMin: 2,
  floorsMax: 9,
  floorHeight: 3,
  maxSlope: 0.5,
  minElevation: -2,
  bridges: true,
  sidewalks: true,
  style: DEFAULT_BUILDING_STYLE,
  seed: "",
};

/** The city parameter schema — drives the inspector sliders and `meta` parse via the studio seam. */
export const CITY_SCHEMA: ParamSchema = {
  groups: [
    { id: "layout", label: "Layout" },
    { id: "buildings", label: "Buildings" },
  ],
  fields: [
    { type: "range", key: "gridness", label: "grid-ness", group: "layout", min: 0, max: 1, step: 0.01, default: CITY_DEFAULTS.gridness },
    { type: "range", key: "curviness", label: "curviness", group: "layout", min: 0, max: 1, step: 0.01, default: CITY_DEFAULTS.curviness },
    { type: "range", key: "branching", label: "branching", group: "layout", min: 0, max: 1, step: 0.01, default: CITY_DEFAULTS.branching },
    { type: "range", key: "blockSize", label: "block size", group: "layout", min: 20, max: 140, step: 1, default: CITY_DEFAULTS.blockSize, unit: "m" },
    { type: "range", key: "openSpace", label: "open space", group: "layout", min: 0, max: 0.9, step: 0.01, default: CITY_DEFAULTS.openSpace },
    { type: "range", key: "streetWidth", label: "street width", group: "layout", min: 3, max: 16, step: 0.5, default: CITY_DEFAULTS.streetWidth, unit: "m" },
    { type: "bool", key: "bridges", label: "bridges over water", group: "layout", default: CITY_DEFAULTS.bridges },
    { type: "bool", key: "sidewalks", label: "sidewalks", group: "layout", default: CITY_DEFAULTS.sidewalks },
    { type: "action", key: "layoutRandomize", label: "randomize layout", group: "layout", action: "randomize" },
    { type: "range", key: "buildingDensity", label: "density", group: "buildings", min: 0, max: 1, step: 0.01, default: CITY_DEFAULTS.buildingDensity },
    { type: "range", key: "floorsMin", label: "floors min", group: "buildings", min: 1, max: 30, step: 1, default: CITY_DEFAULTS.floorsMin },
    { type: "range", key: "floorsMax", label: "floors max", group: "buildings", min: 1, max: 30, step: 1, default: CITY_DEFAULTS.floorsMax },
    { type: "range", key: "floorHeight", label: "floor height", group: "buildings", min: 2, max: 5, step: 0.1, default: CITY_DEFAULTS.floorHeight, unit: "m" },
    { type: "range", key: "maxSlope", label: "max slope", group: "buildings", min: 0.05, max: 2, step: 0.05, default: CITY_DEFAULTS.maxSlope },
    { type: "number", key: "minElevation", label: "build above y", group: "buildings", step: 0.5, default: CITY_DEFAULTS.minElevation },
    {
      type: "select",
      key: "style",
      label: "style",
      group: "buildings",
      default: CITY_DEFAULTS.style,
      options: Object.keys(BUILDING_STYLE_PALETTES).map((style) => ({ value: style })),
    },
    { type: "seed", key: "seed", label: "seed", default: CITY_DEFAULTS.seed },
  ],
};

/** Parse a volume's `meta` into fully-defaulted city rules. @internal */
export function readCityRules(meta: Record<string, unknown> | undefined): CityRules {
  const params = parseParams(CITY_SCHEMA, meta);
  const floorsMin = params["floorsMin"] as number;
  const floorsMax = params["floorsMax"] as number;
  return {
    gridness: params["gridness"] as number,
    curviness: params["curviness"] as number,
    branching: params["branching"] as number,
    blockSize: params["blockSize"] as number,
    openSpace: params["openSpace"] as number,
    buildingDensity: params["buildingDensity"] as number,
    streetWidth: params["streetWidth"] as number,
    floorsMin: Math.min(floorsMin, floorsMax),
    floorsMax: Math.max(floorsMin, floorsMax),
    floorHeight: params["floorHeight"] as number,
    maxSlope: params["maxSlope"] as number,
    minElevation: params["minElevation"] as number,
    bridges: params["bridges"] as boolean,
    sidewalks: params["sidewalks"] as boolean,
    style: params["style"] as BuildingStyle,
    seed: params["seed"] as string,
  };
}

/** One synthesized street: a world-space XZ polyline with a render width and hierarchy level. */
export interface CityStreet {
  id: string;
  points: readonly RoadPoint[];
  width: number;
  level: "avenue" | "street" | "lane";
}

/** One building lot: footprint center/size (XZ), yaw, seeded floors, and a 0..1 color-jitter token. */
export interface CityLot {
  id: string;
  center: RoadPoint;
  size: readonly [number, number];
  rotationY: number;
  floors: number;
  jitter: number;
}

/** One bridge deck spanning water: a world-space XZ polyline from bank to bank. */
export interface CityBridge {
  id: string;
  points: readonly RoadPoint[];
  width: number;
}

/** One park/plaza block left unbuilt. */
export interface CityPark {
  id: string;
  center: RoadPoint;
  size: readonly [number, number];
  rotationY: number;
}

/** A resolved city district: world-space streets, building lots, and parks plus the parsed rules. */
export interface ResolvedCity {
  center: readonly [number, number, number];
  size: readonly [number, number];
  rotationY: number;
  rules: CityRules;
  streets: readonly CityStreet[];
  bridges: readonly CityBridge[];
  lots: readonly CityLot[];
  parks: readonly CityPark[];
}

/** Bounded-work caps so a huge volume can never generate unbounded content. */
const MAX_LINES_PER_AXIS = 40;
const MAX_STREETS = 320;
const MAX_LOTS = 2200;
const TAU = Math.PI * 2;

interface LocalStreet {
  axis: "x" | "z";
  points: [number, number][];
  width: number;
  level: CityStreet["level"];
}

function axisValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

/** Smooth two-octave sideways wander along a street, deterministic per street. */
function makeWander(rng: () => number, amplitude: number, wavelength: number): (t: number) => number {
  const f1 = TAU / (wavelength * (0.75 + rng() * 0.5));
  const f2 = f1 * (2.3 + rng() * 0.8);
  const p1 = rng() * TAU;
  const p2 = rng() * TAU;
  return (t) => amplitude * (Math.sin(t * f1 + p1) * 0.65 + Math.sin(t * f2 + p2) * 0.35);
}

/** Irregularly-spaced line coordinates across `[-half, half]` — regular when gridness is 1. */
function lineCoords(rng: () => number, half: number, spacing: number, gridness: number): number[] {
  const coords: number[] = [];
  const jitter = (1 - gridness) * 0.7;
  let pos = -half + spacing * (0.5 + (rng() - 0.5) * jitter);
  while (pos < half - spacing * 0.35 && coords.length < MAX_LINES_PER_AXIS) {
    coords.push(pos);
    pos += spacing * (1 + (rng() - 0.5) * jitter);
  }
  return coords;
}

/** Nearest value in `coords` to `target`, or `fallback` when the list is empty. */
function snapToCoord(coords: readonly number[], target: number, fallback: number): number {
  let best = fallback;
  let bestDist = Infinity;
  for (const c of coords) {
    const d = Math.abs(c - target);
    if (d < bestDist) {
      bestDist = d;
      best = c;
    }
  }
  return best;
}

/**
 * Spatial hash of dense street centerline samples (with per-sample clearance radius). Serves both
 * "is this point on/near a road" lot rejection and branch-to-street connection tests without
 * quadratic polyline scans.
 */
class StreetIndex {
  private cells = new Map<string, { x: number; z: number; r: number; street: number }[]>();
  private readonly cell = 10;

  private key(x: number, z: number): string {
    return `${Math.floor(x / this.cell)}:${Math.floor(z / this.cell)}`;
  }

  addStreet(index: number, points: readonly [number, number][], width: number): void {
    const r = width / 2;
    for (let i = 0; i + 1 < points.length; i += 1) {
      const [ax, az] = points[i]!;
      const [bx, bz] = points[i + 1]!;
      const len = Math.hypot(bx - ax, bz - az);
      const steps = Math.max(1, Math.ceil(len / 3));
      for (let s = 0; s <= steps; s += 1) {
        const t = s / steps;
        const x = ax + (bx - ax) * t;
        const z = az + (bz - az) * t;
        const key = this.key(x, z);
        const bucket = this.cells.get(key);
        const sample = { x, z, r, street: index };
        if (bucket === undefined) this.cells.set(key, [sample]);
        else bucket.push(sample);
      }
    }
  }

  /** Smallest (distance − clearance) to any street sample near the point; Infinity when clear. */
  clearance(x: number, z: number, margin: number, excludeStreet = -1): number {
    const cx = Math.floor(x / this.cell);
    const cz = Math.floor(z / this.cell);
    let worst = Infinity;
    for (let i = cx - 1; i <= cx + 1; i += 1) {
      for (let j = cz - 1; j <= cz + 1; j += 1) {
        const bucket = this.cells.get(`${i}:${j}`);
        if (bucket === undefined) continue;
        for (const sample of bucket) {
          if (sample.street === excludeStreet) continue;
          const d = Math.hypot(sample.x - x, sample.z - z) - sample.r - margin;
          if (d < worst) worst = d;
        }
      }
    }
    return worst;
  }
}

/** Separating-axis test for two rotated rectangles (center, half-extents, yaw): true when a gap exists. */
function rectsSeparated(
  a: { x: number; z: number; hw: number; hd: number; angle: number },
  b: { x: number; z: number; hw: number; hd: number; angle: number },
): boolean {
  const axes: [number, number][] = [];
  for (const angle of [a.angle, b.angle]) {
    axes.push([Math.cos(angle), -Math.sin(angle)], [Math.sin(angle), Math.cos(angle)]);
  }
  const corners = (r: typeof a): [number, number][] => {
    const c = Math.cos(r.angle);
    const s = Math.sin(r.angle);
    const out: [number, number][] = [];
    for (const [dx, dz] of [
      [r.hw, r.hd],
      [r.hw, -r.hd],
      [-r.hw, r.hd],
      [-r.hw, -r.hd],
    ] as const) {
      out.push([r.x + dx * c + dz * s, r.z - dx * s + dz * c]);
    }
    return out;
  };
  const ca = corners(a);
  const cb = corners(b);
  for (const [ax, az] of axes) {
    let minA = Infinity,
      maxA = -Infinity,
      minB = Infinity,
      maxB = -Infinity;
    for (const [x, z] of ca) {
      const p = x * ax + z * az;
      if (p < minA) minA = p;
      if (p > maxA) maxA = p;
    }
    for (const [x, z] of cb) {
      const p = x * ax + z * az;
      if (p < minB) minB = p;
      if (p > maxB) maxB = p;
    }
    if (maxA < minB || maxB < minA) return true; // gap on this axis → no overlap
  }
  return false;
}

interface PlacedLot {
  x: number;
  z: number;
  hw: number;
  hd: number;
  angle: number;
}

/** Broadphase grid over placed lots so overlap tests only touch neighbors. */
class LotIndex {
  private cells = new Map<string, PlacedLot[]>();
  private readonly cell = 24;

  private key(x: number, z: number): string {
    return `${Math.floor(x / this.cell)}:${Math.floor(z / this.cell)}`;
  }

  overlapsAny(lot: PlacedLot, gap: number): boolean {
    const grown = { ...lot, hw: lot.hw + gap / 2, hd: lot.hd + gap / 2 };
    const cx = Math.floor(lot.x / this.cell);
    const cz = Math.floor(lot.z / this.cell);
    for (let i = cx - 1; i <= cx + 1; i += 1) {
      for (let j = cz - 1; j <= cz + 1; j += 1) {
        const bucket = this.cells.get(`${i}:${j}`);
        if (bucket === undefined) continue;
        for (const other of bucket) {
          if (!rectsSeparated(grown, other)) return true;
        }
      }
    }
    return false;
  }

  add(lot: PlacedLot): void {
    const key = this.key(lot.x, lot.z);
    const bucket = this.cells.get(key);
    if (bucket === undefined) this.cells.set(key, [lot]);
    else bucket.push(lot);
  }
}

function buildMainStreets(
  rules: CityRules,
  streams: (stream: string) => () => number,
  hx: number,
  hz: number,
): { streets: LocalStreet[]; xs: number[]; zs: number[] } {
  const layoutRng = streams("layout");
  const xs = lineCoords(layoutRng, hx, rules.blockSize, rules.gridness);
  const zs = lineCoords(layoutRng, hz, rules.blockSize, rules.gridness);
  const streets: LocalStreet[] = [];
  const build = (axis: "x" | "z", bases: number[], crossCoords: number[], runHalf: number) => {
    for (let i = 0; i < bases.length; i += 1) {
      const rng = streams(`street:${axis}:${i}`);
      const base = bases[i]!;
      // Organic nets drop some through-streets down to partial spans — snapped to cross-street
      // coordinates so the street terminates AT an intersection instead of dangling mid-block.
      let start = -runHalf;
      let end = runHalf;
      if (rng() < (1 - rules.gridness) * 0.4 && crossCoords.length >= 2) {
        const span = Math.max(rules.blockSize * 2, runHalf * (0.4 + rng() * 0.5));
        const rawStart = -runHalf + rng() * Math.max(0, runHalf * 2 - span);
        start = snapToCoord(crossCoords, rawStart, -runHalf);
        end = snapToCoord(crossCoords, rawStart + span, runHalf);
        if (end - start < rules.blockSize * 1.5) {
          start = -runHalf;
          end = runHalf;
        }
      }
      // Straightness: wander amplitude from curviness, whole-street tilt from lost gridness.
      const amplitude = rules.curviness * rules.blockSize * 0.42;
      const wander = makeWander(rng, amplitude, rules.blockSize * 3.2);
      const drift = Math.tan((1 - rules.gridness) * (rng() - 0.5) * 0.5);
      const clampHalf = axis === "x" ? hx : hz;
      const step = Math.min(Math.max(rules.blockSize / 3, 6), 18);
      const points: [number, number][] = [];
      const sample = (t: number) => {
        const offset = wander(t) + drift * t;
        const cross = Math.max(-clampHalf + 1, Math.min(clampHalf - 1, base + offset));
        points.push(axis === "x" ? [cross, t] : [t, cross]);
      };
      for (let t = start; t < end; t += step) sample(t);
      sample(end);
      const level: CityStreet["level"] = i % 4 === 0 ? "avenue" : "street";
      streets.push({ axis, points, width: level === "avenue" ? rules.streetWidth * 1.5 : rules.streetWidth, level });
    }
  };
  build("x", xs, zs, hz);
  build("z", zs, xs, hx);
  return { streets, xs, zs };
}

/** Branch lanes grow from a main street until they CONNECT to another street (or run out of room). */
function buildBranches(
  rules: CityRules,
  streams: (stream: string) => () => number,
  mains: LocalStreet[],
  index: StreetIndex,
  hx: number,
  hz: number,
): LocalStreet[] {
  if (mains.length === 0) return [];
  const count = Math.min(Math.round(rules.branching * mains.length * 1.6), MAX_STREETS - mains.length);
  const branches: LocalStreet[] = [];
  for (let i = 0; i < count; i += 1) {
    const rng = streams(`branch:${i}`);
    const hostIndex = Math.floor(rng() * mains.length);
    const host = mains[hostIndex]!;
    if (host.points.length < 2) continue;
    const at = host.points[Math.floor(rng() * host.points.length)]!;
    const direction = rng() < 0.5 ? 1 : -1;
    const maxLength = rules.blockSize * (1.2 + rng() * 2);
    const wander = makeWander(rng, rules.curviness * rules.blockSize * 0.3, rules.blockSize * 2.4);
    const step = Math.min(Math.max(rules.blockSize / 4, 4), 12);
    const points: [number, number][] = [];
    let connected = false;
    for (let t = 0; t <= maxLength; t += step) {
      const along = at[host.axis === "x" ? 0 : 1] + direction * t;
      const cross = at[host.axis === "x" ? 1 : 0] + wander(t);
      const point: [number, number] = host.axis === "x" ? [along, cross] : [cross, along];
      if (Math.abs(point[0]) > hx - 1 || Math.abs(point[1]) > hz - 1) break;
      points.push(point);
      // Past the leaving-home stretch, stop the moment we touch another street — a T junction.
      if (t > rules.blockSize * 0.5 && index.clearance(point[0], point[1], 0, hostIndex) < rules.streetWidth * 0.5) {
        connected = true;
        break;
      }
    }
    // A lane that never reached anything and is shorter than half a block is a driveway — drop it.
    if (points.length < 2 || (!connected && points.length * step < rules.blockSize * 0.6)) continue;
    branches.push({ axis: host.axis === "x" ? "z" : "x", points, width: rules.streetWidth * 0.65, level: "lane" });
  }
  return branches;
}

function buildParks(rules: CityRules, streams: (stream: string) => () => number, xs: number[], zs: number[]): CityPark[] {
  const rng = streams("parks");
  const parks: CityPark[] = [];
  for (let i = 0; i + 1 < xs.length; i += 1) {
    for (let j = 0; j + 1 < zs.length; j += 1) {
      const keep = rng() < rules.openSpace;
      if (!keep) continue;
      const width = xs[i + 1]! - xs[i]! - rules.streetWidth - 4;
      const depth = zs[j + 1]! - zs[j]! - rules.streetWidth - 4;
      if (width < 6 || depth < 6) continue;
      parks.push({
        id: `park:${i}:${j}`,
        center: [(xs[i]! + xs[i + 1]!) / 2, (zs[j]! + zs[j + 1]!) / 2],
        size: [width, depth],
        rotationY: 0,
      });
    }
  }
  return parks;
}

function insideAnyPark(parks: readonly CityPark[], x: number, z: number, margin: number): boolean {
  for (const park of parks) {
    if (Math.abs(x - park.center[0]) < park.size[0] / 2 + margin && Math.abs(z - park.center[1]) < park.size[1] / 2 + margin) return true;
  }
  return false;
}

function buildLots(
  rules: CityRules,
  streams: (stream: string) => () => number,
  streets: LocalStreet[],
  index: StreetIndex,
  parks: CityPark[],
  hx: number,
  hz: number,
  slopeAt: ((x: number, z: number) => number) | null,
  heightAt: ((x: number, z: number) => number) | null,
): CityLot[] {
  const lots: CityLot[] = [];
  const placed = new LotIndex();
  const frontage = Math.min(Math.max(rules.blockSize / 3.2, 9), 26);
  for (let s = 0; s < streets.length; s += 1) {
    const street = streets[s]!;
    const rng = streams(`lots:${s}`);
    let travelled = 0;
    let nextLot = frontage * (0.4 + rng() * 0.4);
    for (let i = 0; i + 1 < street.points.length; i += 1) {
      const [ax, az] = street.points[i]!;
      const [bx, bz] = street.points[i + 1]!;
      const segLen = Math.hypot(bx - ax, bz - az);
      while (travelled + segLen >= nextLot) {
        const t = (nextLot - travelled) / segLen;
        const px = ax + (bx - ax) * t;
        const pz = az + (bz - az) * t;
        const tangent = Math.atan2(bx - ax, bz - az);
        const width = frontage * (0.55 + rng() * 0.25);
        const depth = frontage * (0.7 + rng() * 0.5);
        for (const side of [1, -1] as const) {
          // Deep blocks earn a second back row of lots behind the frontage row, so downtowns fill
          // their blocks instead of leaving hollow interiors.
          const rows = rules.blockSize > depth * 2.2 + rules.streetWidth ? 2 : 1;
          for (let row = 0; row < rows; row += 1) {
          const roll = rng();
          const slopeRoll = rng();
          const offset = street.width / 2 + 1.5 + depth / 2 + row * (depth + 2.5);
          const cx = px + Math.cos(tangent) * offset * side;
          const cz = pz - Math.sin(tangent) * offset * side;
          if (roll > rules.buildingDensity * (row === 0 ? 1 : 0.7)) continue;
          if (Math.abs(cx) > hx - 3 || Math.abs(cz) > hz - 3) continue;
          if (insideAnyPark(parks, cx, cz, depth * 0.25)) continue;
          // Never build on a road: the lot's center and corners all keep clearance to ALL street
          // centerlines — this stops houses landing on a curvy cross-street without the huge
          // half-diagonal dead zone a center-only test needs.
          const angle = tangent + Math.PI / 2;
          const ca = Math.cos(angle);
          const sa = Math.sin(angle);
          let onRoad = index.clearance(cx, cz, 1) < 0;
          if (!onRoad) {
            for (const [dx, dz] of [
              [width / 2, depth / 2],
              [width / 2, -depth / 2],
              [-width / 2, depth / 2],
              [-width / 2, -depth / 2],
            ] as const) {
              if (index.clearance(cx + dx * ca + dz * sa, cz - dx * sa + dz * ca, 0.5) < 0) {
                onRoad = true;
                break;
              }
            }
          }
          if (onRoad) continue;
          // Cliff rule: reject lots on ground steeper than maxSlope (with a little seeded fuzz so
          // the cutoff line isn't a hard contour), leaving steep faces open.
          if (slopeAt !== null && slopeAt(cx, cz) > rules.maxSlope * (0.85 + slopeRoll * 0.3)) continue;
          // Water/canyon-floor rule: never build below the district's minimum elevation.
          if (heightAt !== null && heightAt(cx, cz) < rules.minElevation) continue;
          const candidate: PlacedLot = { x: cx, z: cz, hw: width / 2, hd: depth / 2, angle };
          // Exact rotated-rect collision against neighbors — buildings know about each other.
          if (placed.overlapsAny(candidate, 1)) continue;
          placed.add(candidate);
          const floors = rules.floorsMin + Math.floor(rng() * (rules.floorsMax - rules.floorsMin + 1));
          lots.push({ id: `lot:${s}:${lots.length}`, center: [cx, cz], size: [width, depth], rotationY: tangent + Math.PI / 2, floors, jitter: rng() });
          if (lots.length >= MAX_LOTS) return lots;
          }
        }
        nextLot += frontage * (0.9 + rng() * 0.25);
      }
      travelled += segLen;
    }
  }
  return lots;
}

/**
 * Synthesize the deterministic city plan for one `city` volume: streets → parks → frontage lots,
 * all in the volume's local frame and then rotated/translated into world space. Same volume (id,
 * footprint, meta) over the same terrain always resolves to the identical plan. When `context`
 * provides a ground sampler, lots respect the `maxSlope` cliff rule — hillside and canyon districts
 * keep their steep faces open. Returns null without a usable footprint.
 *
 * @capability city-district resolve a `city` volume into deterministic streets, building lots, and parks
 */
export function resolveCityObject(object: SceneKindObject, context?: SceneKindResolveContext): ResolvedCity | null {
  const center = object.center ?? object.position;
  if (center === undefined) return null;
  const he = object.halfExtents;
  const hx = axisValue(he?.x) ?? object.radius ?? 0;
  const hz = axisValue(he?.z) ?? object.radius ?? 0;
  const rules = readCityRules(object.meta);
  const rotationY = object.rotationY ?? 0;
  if (hx < rules.blockSize * 0.75 || hz < rules.blockSize * 0.75) {
    return { center: [center.x, center.y, center.z], size: [hx * 2, hz * 2], rotationY, rules, streets: [], bridges: [], lots: [], parks: [] };
  }
  const cos = Math.cos(rotationY);
  const sin = Math.sin(rotationY);
  const toWorld = (x: number, z: number): RoadPoint => [center.x + x * cos + z * sin, center.z - x * sin + z * cos];

  const sampleHeight = context?.sampleHeight;
  const heightAt =
    sampleHeight === undefined
      ? null
      : (x: number, z: number): number => {
          const [wx, wz] = toWorld(x, z);
          return sampleHeight(wx, wz);
        };
  const slopeAt =
    sampleHeight === undefined
      ? null
      : (x: number, z: number): number => {
          const [wx, wz] = toWorld(x, z);
          const d = 4;
          const dx = sampleHeight(wx + d, wz) - sampleHeight(wx - d, wz);
          const dz = sampleHeight(wx, wz + d) - sampleHeight(wx, wz - d);
          return Math.hypot(dx, dz) / (2 * d);
        };

  const streams = seededStreams(`city:${rules.seed.length > 0 ? rules.seed : object.id}`);
  const built = buildMainStreets(rules, streams, hx, hz);
  const xs = built.xs;
  const zs = built.zs;
  // Streets stop at the water's edge instead of running on under a lake/canyon river: split each
  // polyline into the runs whose ground stays above the district's minimum elevation. A short
  // underwater run bounded by land on both sides becomes a BRIDGE deck (bank point to bank point)
  // when the district allows them — lanes never bridge, and spans longer than a few blocks clip.
  const localBridges: { points: [number, number][]; width: number }[] = [];
  const maxBridgeSpan = rules.blockSize * 2.5;
  const clipToLand = (streets: LocalStreet[]): LocalStreet[] => {
    if (heightAt === null) return streets;
    const out: LocalStreet[] = [];
    for (const street of streets) {
      let run: [number, number][] = [];
      let wet: [number, number][] = [];
      const flushLand = () => {
        if (run.length >= 2) out.push({ ...street, points: run });
      };
      for (const point of street.points) {
        if (heightAt(point[0], point[1]) >= rules.minElevation) {
          if (wet.length > 0) {
            // Land after water: bridge it when short enough and there was land before.
            const bank = run.length > 0 ? run[run.length - 1]! : null;
            let span = 0;
            const deck: [number, number][] = bank === null ? [...wet] : [bank, ...wet];
            deck.push(point);
            for (let i = 1; i < deck.length; i += 1) span += Math.hypot(deck[i]![0] - deck[i - 1]![0], deck[i]![1] - deck[i - 1]![1]);
            if (rules.bridges && bank !== null && street.level !== "lane" && span <= maxBridgeSpan) {
              // Record the deck, then split the land street at the banks so the draped road ends
              // at the shore instead of sagging underwater beneath the deck.
              localBridges.push({ points: deck, width: street.width });
            }
            wet = [];
            flushLand();
            run = [point];
            continue;
          }
          run.push(point);
        } else {
          wet.push(point);
        }
      }
      flushLand();
    }
    return out;
  };
  const mains = clipToLand(built.streets);
  const index = new StreetIndex();
  mains.forEach((street, i) => index.addStreet(i, street.points, street.width));
  const branches = clipToLand(buildBranches(rules, streams, mains, index, hx, hz));
  branches.forEach((street, i) => index.addStreet(mains.length + i, street.points, street.width));
  localBridges.forEach((bridge, i) => index.addStreet(mains.length + branches.length + i, bridge.points, bridge.width));
  const local = [...mains, ...branches].slice(0, MAX_STREETS);
  const parks = buildParks(rules, streams, xs, zs);
  const lots = buildLots(rules, streams, local, index, parks, hx, hz, slopeAt, heightAt);

  return {
    center: [center.x, center.y, center.z],
    size: [hx * 2, hz * 2],
    rotationY,
    rules,
    streets: local.map((street, i) => ({
      id: `street:${i}`,
      points: street.points.map(([x, z]) => toWorld(x, z)),
      width: street.width,
      level: street.level,
    })),
    bridges: localBridges.map((bridge, i) => ({
      id: `bridge:${i}`,
      points: bridge.points.map(([x, z]) => toWorld(x, z)),
      width: bridge.width,
    })),
    lots: lots.map((lot) => ({ ...lot, center: toWorld(lot.center[0], lot.center[1]), rotationY: lot.rotationY - rotationY })),
    parks: parks.map((park) => ({ ...park, center: toWorld(park.center[0], park.center[1]), rotationY: -rotationY })),
  };
}

/** Registers the `city` scene kind (schema + resolver). Called by {@link registerBuiltinSceneKinds}. @internal */
export function registerCityKind(): void {
  registerSceneKind<ResolvedCity | null>({
    kind: CITY_KIND,
    target: "volume",
    label: "City district",
    addCategory: "Studios",
    accent: "#8fa8c9",
    schema: CITY_SCHEMA,
    resolve: (object, _params, context) => resolveCityObject(object, context),
    note: (object) => {
      const resolved = resolveCityObject(object);
      if (resolved === null) return "Give the volume a box footprint.";
      if (resolved.streets.length === 0) return `Footprint too small — needs at least ${Math.ceil(resolved.rules.blockSize * 1.5)} m across.`;
      return `${resolved.streets.length} streets · ${resolved.lots.length} buildings · ${resolved.parks.length} parks`;
    },
  });
}
