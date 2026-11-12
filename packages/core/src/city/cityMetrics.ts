/**
 * City district quality metrics: how built-up, how paved, how varied and how believable a generated
 * district is, against the figures planners use. Model code: plain data in, numbers out.
 *
 * - Coverage (building footprint share of the district) and FAR (gross floor area over district area),
 *   with footprints and pavement rasterized on one grid so overlaps count once.
 * - Pavement share (carriageway plus sidewalks), land in blocks, block-kind mix.
 * - Template variety: distinct massing templates per building class.
 * - Height falls with distance from the centre: Spearman correlation of distance and height.
 * - Landmarks, floors and height spread, buildings standing on a carriageway (a correctness check).
 * - Kept length: district street length over the length of the graph it grew from, for a generator
 *   that caps its street list.
 *
 * {@link cityMetricsInput} reads a resolved `city` volume into the plain input shape.
 */
import { quantile, spearman } from "../math/stats";
import { polylineLength, type PlanPoint } from "../roads/streetMetrics";
import type { ResolvedCity } from "./cityKind";

/** One building as the city metric reads it, in district-local XZ (district centre at the origin). */
export interface CityBuildingSample {
  readonly x: number;
  readonly z: number;
  readonly floors: number;
  /** Roof top above grade (m). */
  readonly height: number;
  /** Ground footprint polygons (convex rings, usually rectangles). */
  readonly footprint: readonly (readonly PlanPoint[])[];
  /** Gross floor area (m²). */
  readonly floorArea: number;
  readonly class: string;
  readonly landmark?: string;
  /** Massing template key: two buildings with the same key read as the same design. */
  readonly template: string;
}

export interface CityMetricsInput {
  /** District half extents (m); the district spans `[-halfX, halfX] × [-halfZ, halfZ]`. */
  readonly halfX: number;
  readonly halfZ: number;
  readonly streets: readonly { readonly points: readonly PlanPoint[]; readonly width: number; readonly sidewalk?: boolean }[];
  readonly sidewalkWidth?: number;
  readonly blocks: readonly { readonly area: number; readonly kind: string }[];
  readonly buildings: readonly CityBuildingSample[];
  /** Total length (m) of the street graph the district grew from. */
  readonly networkLength?: number;
}

export interface CityMetrics {
  areaHa: number;
  buildings: number;
  buildingsPerHa: number;
  /** Building footprint share of the district, 0..1. */
  coverage: number;
  /** Gross floor area over district area. */
  far: number;
  /** Carriageway + sidewalk share of the district, 0..1. */
  pavementShare: number;
  /** District street length per km² of district. */
  roadKmPerKm2: number;
  /** Land inside blocks over district area, 0..1. */
  landInBlocksShare: number;
  /** Block counts by kind. */
  blockKinds: Record<string, number>;
  /** Share of block land that is not buildable (parks, plazas, fields, buffers). */
  openBlockShare: number;
  floorsP50: number;
  floorsP90: number;
  floorsMax: number;
  heightMaxM: number;
  /** Spearman ρ of distance from the centre against height (negative: towers in the middle). */
  heightDistanceRho: number;
  landmarks: number;
  /** Building counts per class. */
  classMix: Record<string, number>;
  uniqueTemplates: number;
  /** Distinct templates per class. */
  templatesPerClass: Record<string, number>;
  /** Fewest templates among classes with at least `minClassSize` buildings (`NaN` if none qualify). */
  minTemplatesPerClass: number;
  /** Buildings whose footprint overlaps a carriageway by more than a square metre. */
  buildingsOnRoad: number;
  /** District street length over the source graph length; `NaN` without `networkLength`. */
  keptLengthShare: number;
}

/** A coverage raster over the district at `cell` metres. */
class Raster {
  readonly nx: number;
  readonly nz: number;
  readonly bits: Uint8Array;
  constructor(
    readonly halfX: number,
    readonly halfZ: number,
    readonly cell: number,
  ) {
    this.nx = Math.max(1, Math.ceil((2 * halfX) / cell));
    this.nz = Math.max(1, Math.ceil((2 * halfZ) / cell));
    this.bits = new Uint8Array(this.nx * this.nz);
  }
  /** Set `bit` on every cell in the box whose centre passes `inside`; returns how many cells that was. */
  fill(minX: number, maxX: number, minZ: number, maxZ: number, inside: (x: number, z: number) => boolean, bit: number): number {
    const i0 = Math.max(0, Math.floor((minX + this.halfX) / this.cell));
    const i1 = Math.min(this.nx - 1, Math.floor((maxX + this.halfX) / this.cell));
    const k0 = Math.max(0, Math.floor((minZ + this.halfZ) / this.cell));
    const k1 = Math.min(this.nz - 1, Math.floor((maxZ + this.halfZ) / this.cell));
    let touched = 0;
    for (let k = k0; k <= k1; k += 1) {
      const z = -this.halfZ + (k + 0.5) * this.cell;
      for (let i = i0; i <= i1; i += 1) {
        const x = -this.halfX + (i + 0.5) * this.cell;
        if (!inside(x, z)) continue;
        this.bits[k * this.nx + i]! |= bit;
        touched += 1;
      }
    }
    return touched;
  }
  count(bit: number): number {
    let n = 0;
    for (const value of this.bits) if (value & bit) n += 1;
    return n;
  }
  /** Cells inside the polygon that already carry `bit`. */
  overlap(ring: readonly PlanPoint[], bit: number): number {
    const xs = ring.map((p) => p[0]);
    const zs = ring.map((p) => p[1]);
    let hits = 0;
    const i0 = Math.max(0, Math.floor((Math.min(...xs) + this.halfX) / this.cell));
    const i1 = Math.min(this.nx - 1, Math.floor((Math.max(...xs) + this.halfX) / this.cell));
    const k0 = Math.max(0, Math.floor((Math.min(...zs) + this.halfZ) / this.cell));
    const k1 = Math.min(this.nz - 1, Math.floor((Math.max(...zs) + this.halfZ) / this.cell));
    for (let k = k0; k <= k1; k += 1) {
      for (let i = i0; i <= i1; i += 1) {
        if (!(this.bits[k * this.nx + i]! & bit)) continue;
        if (insideConvex(ring, -this.halfX + (i + 0.5) * this.cell, -this.halfZ + (k + 0.5) * this.cell)) hits += 1;
      }
    }
    return hits;
  }
}

/** Point in a convex ring, either winding. */
function insideConvex(ring: readonly PlanPoint[], x: number, z: number): boolean {
  let sign = 0;
  for (let i = 0; i < ring.length; i += 1) {
    const a = ring[i]!;
    const b = ring[(i + 1) % ring.length]!;
    const cross = (b[0] - a[0]) * (z - a[1]) - (b[1] - a[1]) * (x - a[0]);
    if (cross === 0) continue;
    const s = cross > 0 ? 1 : -1;
    if (sign === 0) sign = s;
    else if (s !== sign) return false;
  }
  return true;
}

function segmentDistance(x: number, z: number, a: PlanPoint, b: PlanPoint): number {
  const dx = b[0] - a[0];
  const dz = b[1] - a[1];
  const l2 = dx * dx + dz * dz || 1;
  const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / l2));
  return Math.hypot(x - a[0] - dx * t, z - a[1] - dz * t);
}

const BUILDING = 1;
const CARRIAGEWAY = 2;
const PAVEMENT = 4;

/**
 * Measure a district (see the module comment). `minClassSize` (default 10) gates the per-class template minimum.
 * @capability generator-metrics measure generated street nets, city districts and race laps against cited reference bands; `bun run gen-audit` renders and tables them
 */
export function cityMetrics(input: CityMetricsInput, options: { readonly cell?: number; readonly minClassSize?: number } = {}): CityMetrics {
  const areaM2 = 4 * input.halfX * input.halfZ;
  const cell = options.cell ?? Math.max(1, Math.max(input.halfX, input.halfZ) / 750);
  const raster = new Raster(input.halfX, input.halfZ, cell);
  const sidewalk = input.sidewalkWidth ?? 0;
  for (const street of input.streets) {
    const half = street.width / 2;
    const outer = half + (street.sidewalk ? sidewalk : 0);
    for (let i = 0; i + 1 < street.points.length; i += 1) {
      const a = street.points[i]!;
      const b = street.points[i + 1]!;
      const near = (r: number) => (x: number, z: number) => segmentDistance(x, z, a, b) <= r;
      raster.fill(Math.min(a[0], b[0]) - outer, Math.max(a[0], b[0]) + outer, Math.min(a[1], b[1]) - outer, Math.max(a[1], b[1]) + outer, near(outer), PAVEMENT);
      raster.fill(Math.min(a[0], b[0]) - half, Math.max(a[0], b[0]) + half, Math.min(a[1], b[1]) - half, Math.max(a[1], b[1]) + half, near(half), CARRIAGEWAY | PAVEMENT);
    }
  }
  let buildingsOnRoad = 0;
  for (const building of input.buildings) {
    let onRoad = 0;
    for (const ring of building.footprint) onRoad += raster.overlap(ring, CARRIAGEWAY);
    if (onRoad * cell * cell > 1) buildingsOnRoad += 1;
    for (const ring of building.footprint) {
      const xs = ring.map((p) => p[0]);
      const zs = ring.map((p) => p[1]);
      raster.fill(Math.min(...xs), Math.max(...xs), Math.min(...zs), Math.max(...zs), (x, z) => insideConvex(ring, x, z), BUILDING);
    }
  }
  const cellArea = cell * cell;
  const coverage = (raster.count(BUILDING) * cellArea) / areaM2;
  const pavementShare = (raster.count(PAVEMENT) * cellArea) / areaM2;

  const blockKinds: Record<string, number> = {};
  let blockLand = 0;
  let openLand = 0;
  for (const block of input.blocks) {
    blockKinds[block.kind] = (blockKinds[block.kind] ?? 0) + 1;
    blockLand += block.area;
    if (block.kind !== "buildable") openLand += block.area;
  }

  const classMix: Record<string, number> = {};
  const templates = new Set<string>();
  const byClass = new Map<string, Set<string>>();
  for (const building of input.buildings) {
    classMix[building.class] = (classMix[building.class] ?? 0) + 1;
    templates.add(`${building.class}|${building.template}`);
    (byClass.get(building.class) ?? byClass.set(building.class, new Set()).get(building.class)!).add(building.template);
  }
  const minClassSize = options.minClassSize ?? 10;
  const qualifying = [...byClass.entries()].filter(([name]) => classMix[name]! >= minClassSize).map(([, set]) => set.size);
  const floors = input.buildings.map((b) => b.floors);
  const heights = input.buildings.map((b) => b.height);
  const distance = input.buildings.map((b) => Math.hypot(b.x / Math.max(1e-9, input.halfX), b.z / Math.max(1e-9, input.halfZ)));
  const kept = input.streets.reduce((sum, street) => sum + polylineLength(street.points), 0);
  return {
    areaHa: areaM2 / 1e4,
    buildings: input.buildings.length,
    buildingsPerHa: input.buildings.length / (areaM2 / 1e4),
    coverage,
    far: input.buildings.reduce((sum, b) => sum + b.floorArea, 0) / areaM2,
    pavementShare,
    roadKmPerKm2: kept / 1000 / (areaM2 / 1e6),
    landInBlocksShare: blockLand / areaM2,
    blockKinds,
    openBlockShare: blockLand > 0 ? openLand / blockLand : 0,
    floorsP50: quantile(floors, 0.5),
    floorsP90: quantile(floors, 0.9),
    floorsMax: floors.length > 0 ? Math.max(...floors) : 0,
    heightMaxM: heights.length > 0 ? Math.max(...heights) : 0,
    heightDistanceRho: spearman(distance, heights),
    landmarks: input.buildings.filter((b) => b.landmark !== undefined).length,
    classMix,
    uniqueTemplates: templates.size,
    templatesPerClass: Object.fromEntries([...byClass.entries()].map(([name, set]) => [name, set.size])),
    minTemplatesPerClass: qualifying.length > 0 ? Math.min(...qualifying) : Number.NaN,
    buildingsOnRoad,
    keptLengthShare: input.networkLength === undefined || input.networkLength <= 0 ? Number.NaN : kept / input.networkLength,
  };
}

/**
 * Read a resolved `city` volume into {@link CityMetricsInput}: positions back into district-local XZ,
 * grounded wall pieces as footprints, floor area per wall piece (its height over the lot's storey
 * height, at least one floor), and a template key from the lot's wall/roof piece shapes in order.
 */
export function cityMetricsInput(city: ResolvedCity): CityMetricsInput {
  const [cx, , cz] = city.center;
  const cr = Math.cos(city.rotationY);
  const sr = Math.sin(city.rotationY);
  // World = centre + yaw(rotationY)·local, with yaw(r)·(x, z) = (x cos r + z sin r, −x sin r + z cos r).
  const local = (p: readonly [number, number]): PlanPoint => {
    const dx = p[0] - cx;
    const dz = p[1] - cz;
    return [dx * cr - dz * sr, dx * sr + dz * cr];
  };
  const buildings: CityBuildingSample[] = city.lots.map((lot) => {
    const c = Math.cos(lot.rotationY);
    const s = Math.sin(lot.rotationY);
    const toWorld = (lx: number, lz: number): PlanPoint => local([lot.center[0] + lx * c + lz * s, lot.center[1] - lx * s + lz * c]);
    const walls = lot.pieces.filter((piece) => piece.role === "wall");
    const top = Math.max(0, ...lot.pieces.map((piece) => piece.offset[1] + piece.size[1]));
    const storey = Math.min(6, Math.max(2.5, top / Math.max(1, lot.floors)));
    const footprint: PlanPoint[][] = [];
    let floorArea = 0;
    for (const piece of walls) {
      const pc = Math.cos(piece.rotationY);
      const ps = Math.sin(piece.rotationY);
      const hw = piece.size[0] / 2;
      const hd = piece.size[2] / 2;
      if (piece.offset[1] < 0.5) {
        footprint.push(
          ([
            [-hw, -hd],
            [hw, -hd],
            [hw, hd],
            [-hw, hd],
          ] as const).map(([x, z]) => toWorld(piece.offset[0] + x * pc + z * ps, piece.offset[2] - x * ps + z * pc)),
        );
      }
      floorArea += piece.size[0] * piece.size[2] * Math.max(1, Math.round(piece.size[1] / storey));
    }
    const at = local(lot.center);
    return {
      x: at[0],
      z: at[1],
      floors: lot.floors,
      height: top,
      footprint,
      floorArea,
      class: lot.class,
      ...(lot.landmark === undefined ? {} : { landmark: lot.landmark }),
      template: lot.pieces
        .filter((piece) => piece.role === "wall" || piece.role === "roof")
        .map((piece) => `${piece.shape}:${piece.role}`)
        .join(","),
    };
  });
  const networkLength = city.network?.edges.reduce((sum, edge) => sum + polylineLength(edge.points), 0);
  return {
    halfX: city.size[0] / 2,
    halfZ: city.size[1] / 2,
    streets: city.streets.map((street) => ({ points: street.points.map((p) => local(p)), width: street.width, sidewalk: street.sidewalk })),
    sidewalkWidth: city.rules.sidewalkWidth,
    blocks: city.blocks.map((block) => ({ area: block.area, kind: block.kind })),
    buildings,
    ...(networkLength === undefined ? {} : { networkLength }),
  };
}
