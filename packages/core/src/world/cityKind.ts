/**
 * `city` studio: a procedural street/block/building district authored as a box volume — drop a
 * volume, and sliders tune the whole layout from a rigid Manhattan grid (`gridness` 1, `curviness`
 * 0) to winding organic hillside streets (`gridness` 0, `curviness` high). Streets are synthesized
 * as perturbed grid polylines with seeded wander, branches fork off mains, blocks between streets
 * become parks per `openSpace`, and building lots line street frontage with seeded floor counts.
 * Mixing districts is placing multiple city volumes with different params. Pure config + resolver
 * here; the merged street-ribbon / instanced-massing renderer lives in the `shell`. Everything is
 * deterministic per seed and persisted in `editor.scene.json`.
 *
 * @capability city-district editor-authorable procedural city district (streets, blocks, buildings)
 */
import { seededStreams } from "../random/rng";
import { parseParams, registerSceneKind, type ParamSchema, type SceneKindObject } from "../scene/sceneKinds";
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
  /** Density of short branch lanes forking off the main streets, 0..1. */
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
    { type: "action", key: "layoutRandomize", label: "randomize layout", group: "layout", action: "randomize" },
    { type: "range", key: "buildingDensity", label: "density", group: "buildings", min: 0, max: 1, step: 0.01, default: CITY_DEFAULTS.buildingDensity },
    { type: "range", key: "floorsMin", label: "floors min", group: "buildings", min: 1, max: 30, step: 1, default: CITY_DEFAULTS.floorsMin },
    { type: "range", key: "floorsMax", label: "floors max", group: "buildings", min: 1, max: 30, step: 1, default: CITY_DEFAULTS.floorsMax },
    { type: "range", key: "floorHeight", label: "floor height", group: "buildings", min: 2, max: 5, step: 0.1, default: CITY_DEFAULTS.floorHeight, unit: "m" },
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
  lots: readonly CityLot[];
  parks: readonly CityPark[];
}

/** Bounded-work caps so a huge volume can never generate unbounded content. */
const MAX_LINES_PER_AXIS = 40;
const MAX_STREETS = 260;
const MAX_LOTS = 1600;
const TAU = Math.PI * 2;

interface LocalStreet {
  axis: "x" | "z";
  /** Base coordinate on the cross axis before wander. */
  base: number;
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

function buildMainStreets(rules: CityRules, streams: (stream: string) => () => number, hx: number, hz: number): { streets: LocalStreet[]; xs: number[]; zs: number[] } {
  const layoutRng = streams("layout");
  const xs = lineCoords(layoutRng, hx, rules.blockSize, rules.gridness);
  const zs = lineCoords(layoutRng, hz, rules.blockSize, rules.gridness);
  const streets: LocalStreet[] = [];
  const build = (axis: "x" | "z", bases: number[], runHalf: number) => {
    for (let i = 0; i < bases.length; i += 1) {
      const rng = streams(`street:${axis}:${i}`);
      const base = bases[i]!;
      // Organic nets drop some through-streets down to partial spans.
      let start = -runHalf;
      let end = runHalf;
      if (rng() < (1 - rules.gridness) * 0.4) {
        const span = Math.max(rules.blockSize * 2, runHalf * (0.4 + rng() * 0.5));
        start = -runHalf + rng() * Math.max(0, runHalf * 2 - span);
        end = Math.min(runHalf, start + span);
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
      streets.push({ axis, base, points, width: level === "avenue" ? rules.streetWidth * 1.5 : rules.streetWidth, level });
    }
  };
  build("x", xs, hz);
  build("z", zs, hx);
  return { streets, xs, zs };
}

function buildBranches(rules: CityRules, streams: (stream: string) => () => number, mains: LocalStreet[], hx: number, hz: number): LocalStreet[] {
  if (mains.length === 0) return [];
  const count = Math.min(Math.round(rules.branching * mains.length * 1.6), MAX_STREETS - mains.length);
  const branches: LocalStreet[] = [];
  for (let i = 0; i < count; i += 1) {
    const rng = streams(`branch:${i}`);
    const host = mains[Math.floor(rng() * mains.length)]!;
    if (host.points.length < 2) continue;
    const at = host.points[Math.floor(rng() * host.points.length)]!;
    const direction = rng() < 0.5 ? 1 : -1;
    const length = rules.blockSize * (0.8 + rng() * 1.6);
    const wander = makeWander(rng, rules.curviness * rules.blockSize * 0.3, rules.blockSize * 2.4);
    const step = Math.min(Math.max(rules.blockSize / 3, 6), 18);
    const points: [number, number][] = [];
    for (let t = 0; t <= length; t += step) {
      const along = at[host.axis === "x" ? 0 : 1] + direction * t;
      const cross = at[host.axis === "x" ? 1 : 0] + wander(t);
      const point: [number, number] = host.axis === "x" ? [along, cross] : [cross, along];
      if (Math.abs(point[0]) > hx - 1 || Math.abs(point[1]) > hz - 1) break;
      points.push(point);
    }
    if (points.length >= 2) branches.push({ axis: host.axis === "x" ? "z" : "x", base: 0, points, width: rules.streetWidth * 0.65, level: "lane" });
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
  parks: CityPark[],
  hx: number,
  hz: number,
): CityLot[] {
  const lots: CityLot[] = [];
  const frontage = Math.min(Math.max(rules.blockSize / 3.2, 9), 26);
  // Coarse occupancy hash keeps lots from different streets from stacking on the same ground.
  const occupied = new Set<string>();
  const cellSize = frontage * 0.85;
  const cellKey = (x: number, z: number) => `${Math.round(x / cellSize)}:${Math.round(z / cellSize)}`;
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
        const width = frontage * (0.72 + rng() * 0.22);
        const depth = frontage * (0.7 + rng() * 0.7);
        for (const side of [1, -1] as const) {
          const roll = rng();
          const offset = street.width / 2 + 1.5 + depth / 2;
          const cx = px + Math.cos(tangent) * offset * side;
          const cz = pz - Math.sin(tangent) * offset * side;
          if (roll > rules.buildingDensity) continue;
          if (Math.abs(cx) > hx - 3 || Math.abs(cz) > hz - 3) continue;
          if (insideAnyPark(parks, cx, cz, depth * 0.25)) continue;
          const key = cellKey(cx, cz);
          if (occupied.has(key)) continue;
          occupied.add(key);
          const floors = rules.floorsMin + Math.floor(rng() * (rules.floorsMax - rules.floorsMin + 1));
          lots.push({ id: `lot:${s}:${lots.length}`, center: [cx, cz], size: [width, depth], rotationY: tangent + Math.PI / 2, floors, jitter: rng() });
          if (lots.length >= MAX_LOTS) return lots;
        }
        nextLot += frontage * (0.95 + rng() * 0.3);
      }
      travelled += segLen;
    }
  }
  return lots;
}

/**
 * Synthesize the deterministic city plan for one `city` volume: streets → parks → frontage lots,
 * all in the volume's local frame and then rotated/translated into world space. Same volume (id,
 * footprint, meta) always resolves to the identical plan. Returns null without a usable footprint.
 *
 * @capability city-district resolve a `city` volume into deterministic streets, building lots, and parks
 */
export function resolveCityObject(object: SceneKindObject): ResolvedCity | null {
  const center = object.center ?? object.position;
  if (center === undefined) return null;
  const he = object.halfExtents;
  const hx = axisValue(he?.x) ?? object.radius ?? 0;
  const hz = axisValue(he?.z) ?? object.radius ?? 0;
  const rules = readCityRules(object.meta);
  if (hx < rules.blockSize * 0.75 || hz < rules.blockSize * 0.75) {
    return { center: [center.x, center.y, center.z], size: [hx * 2, hz * 2], rotationY: object.rotationY ?? 0, rules, streets: [], lots: [], parks: [] };
  }
  const streams = seededStreams(`city:${rules.seed.length > 0 ? rules.seed : object.id}`);
  const { streets: mains, xs, zs } = buildMainStreets(rules, streams, hx, hz);
  const branches = buildBranches(rules, streams, mains, hx, hz);
  const local = [...mains, ...branches].slice(0, MAX_STREETS);
  const parks = buildParks(rules, streams, xs, zs);
  const lots = buildLots(rules, streams, local, parks, hx, hz);

  const rotationY = object.rotationY ?? 0;
  const cos = Math.cos(rotationY);
  const sin = Math.sin(rotationY);
  const toWorld = (x: number, z: number): RoadPoint => [center.x + x * cos + z * sin, center.z - x * sin + z * cos];
  return {
    center: [center.x, center.y, center.z],
    size: [hx * 2, hz * 2],
    rotationY,
    rules,
    streets: local.map((street, index) => ({
      id: `street:${index}`,
      points: street.points.map(([x, z]) => toWorld(x, z)),
      width: street.width,
      level: street.level,
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
    resolve: (object) => resolveCityObject(object),
    note: (object) => {
      const resolved = resolveCityObject(object);
      if (resolved === null) return "Give the volume a box footprint.";
      if (resolved.streets.length === 0) return `Footprint too small — needs at least ${Math.ceil(resolved.rules.blockSize * 1.5)} m across.`;
      return `${resolved.streets.length} streets · ${resolved.lots.length} buildings · ${resolved.parks.length} parks`;
    },
  });
}
