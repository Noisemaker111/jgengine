/**
 * The seed-driven procedural CITY GENERATOR — the composition seam over the two fabric engines:
 * {@link generateStreets} grows the street network, and {@link deriveBuildingLots} lines its
 * frontage with street-facing building lots. One call, one seed, one deterministic city: same rules
 * ⇒ identical streets and identical lots, with both engines' bounded-work caps intact. Local
 * (volume-centered) coords, same as the street generator; the caller translates into world space.
 *
 * Street dials default to a dense, gently-varied city net (high gridness/connectivity, light
 * winding); pass any subset of {@link StreetNetworkRules} to override, and lot options pass through
 * to the frontage engine untouched. Lanes are skipped as lot frontage by default — buildings line
 * boulevards, avenues, and streets — so alleys stay service alleys; opt lanes in via
 * `lots.laneFrontage`.
 *
 * @capability city-generator compose a deterministic city — street network plus street-facing building lots — from one seed
 */
import { deriveBuildingLots, type BuildingLotOptions, type PlacedBuildingLot } from "./buildingLots";
import {
  buildLandmarkPieces,
  buildLotPieces,
  classPlotFit,
  landmarkFloors,
  landmarkMinDepthFactor,
  pickClass,
  rollClassPlacement,
  zoneBand,
  zoneMetric,
  CITY_LANDMARK_CLASSES,
  type CityLandmarkClass,
  type CityLotClass,
  type CityLotPiece,
  type CityZoneBand,
  type CityZoneProfile,
} from "./cityContent";
import { rectClearsPolyline, rectsSeparated, type OrientedRect, type Vec2 } from "./cityGeometry";
import { seededStreams } from "../random/rng";
import type { WeightedParamEntry } from "../scene/sceneKinds";
import {
  generateStreets,
  type StreetLevel,
  type StreetNetwork,
  type StreetNetworkContext,
  type StreetNetworkRules,
} from "./streetGenerator";

/** City-shaped defaults for every street dial except the seed. */
const CITY_STREET_DEFAULTS: Omit<StreetNetworkRules, "seed"> = {
  gridness: 0.85,
  loopiness: 0.35,
  connectivity: 0.6,
  branching: 0.25,
  deadEnds: 0.15,
  segmentLength: 90,
  aspect: 1.4,
  winding: 0.15,
  minCurveRadius: 18,
  minTurnAngle: 12,
  maxTurnAngle: 110,
  width: 9,
  boulevards: 0.2,
};

/** Options for {@link generateCity}: a seed, street-dial overrides, and lot pass-through options. */
export interface CityGeneratorOptions {
  /** Drives both the street network and downstream lot/floor variation. */
  seed: string;
  /** Street-dial overrides; anything omitted takes the city defaults above. */
  streets?: Partial<Omit<StreetNetworkRules, "seed">>;
  /** Frontage-lot options, minus `roads` (the generated streets are the roads). */
  lots?: Omit<BuildingLotOptions, "roads" | "seed"> & {
    /** Also line `lane`-level streets (alleys) with lots. Default false. */
    laneFrontage?: boolean;
  };
  /** Ground sampler + bridge/tunnel toggles forwarded to the street generator. */
  context?: StreetNetworkContext;
  /**
   * Also resolve each bare lot into zone/class/floors/massing (the 9-class massing system). Pass
   * `true` for city defaults, or an overrides object to tune bands/mixes/floors. Omit (default) to
   * keep the cheap bare-lot path — `lotContent` stays absent and the returned shape is `{network,
   * lots}` exactly. See {@link resolveCityLotContent}.
   */
  content?: boolean | CityContentOverrides;
}

/** A generated city: the street network and the building lots lining its frontage. */
export interface GeneratedCity {
  network: StreetNetwork;
  lots: PlacedBuildingLot[];
  /**
   * Present only when {@link CityGeneratorOptions.content} was requested: every lot enriched with
   * its zone band, rolled building class, floors, and lot-local massing pieces. Same order as
   * `lots`.
   */
  lotContent?: readonly ResolvedCityLot[];
}

/**
 * Grow a street network inside the `hx`/`hz` half-extents and line its frontage with building lots.
 * Deterministic: identical options ⇒ identical city.
 */
export function generateCity(options: CityGeneratorOptions, hx: number, hz: number): GeneratedCity {
  const { seed, streets: streetOverrides, lots: lotOptions, context } = options;
  const rules: StreetNetworkRules = { seed, ...CITY_STREET_DEFAULTS, ...streetOverrides };
  const network = generateStreets(rules, hx, hz, context ?? {});
  const { laneFrontage = false, ...lotRest } = lotOptions ?? {};
  const frontage = network.streets
    .filter((street) => laneFrontage || street.level !== "lane")
    .map((street) => ({ path: street.points, width: street.width }));
  // Streets excluded from frontage (lanes by default) are still pavement: the frontage engine
  // keeps every plot's full footprint off them via `avoid`, alongside every frontage corridor.
  const avoid = network.streets
    .filter((street) => !(laneFrontage || street.level !== "lane"))
    .map((street) => ({ path: street.points, width: street.width }));
  const lots = deriveBuildingLots({
    ...lotRest,
    roads: frontage,
    avoid,
    seed,
    area: lotRest.area ?? { center: [0, 0], halfExtents: [hx, hz] },
  });
  if (options.content === undefined || options.content === false) return { network, lots };
  const overrides = options.content === true ? {} : options.content;
  const lotContent = resolveCityLotContent(
    { network, lots },
    { seed, halfExtents: [hx, hz], laneFrontage, ...overrides },
  );
  return { network, lots, lotContent };
}

// ---------------------------------------------------------------------------
// Lot content resolution — the composition seam over `cityContent`'s 9-class massing system.
// ---------------------------------------------------------------------------

/** Weighted building-class mix per zone band; the radial profile decides which band a lot falls in. */
export interface CityZoneMixes {
  core: readonly WeightedParamEntry[];
  mid: readonly WeightedParamEntry[];
  edge: readonly WeightedParamEntry[];
}

/** Default zoned-metropolis mixes: towers/slabs downtown, slabs+rowhouses mid, houses at the edge. */
export const DEFAULT_CITY_ZONE_MIXES: CityZoneMixes = {
  core: [
    { item: "tower", weight: 3 },
    { item: "slab", weight: 1 },
    { item: "shop", weight: 1 },
  ],
  mid: [
    { item: "slab", weight: 2 },
    { item: "rowhouse", weight: 2 },
    { item: "shop", weight: 1 },
  ],
  edge: [
    { item: "house", weight: 3 },
    { item: "rowhouse", weight: 1 },
  ],
};

/**
 * Per-street-level class weight multipliers applied to the band mix before the class pick, so towers
 * and slabs bias toward wide boulevard/avenue frontage while houses and farm classes bias toward
 * lanes and quiet streets. A missing class ⇒ multiplier 1 (the band mix is unchanged for it). Pure
 * data: modulating the existing weighted mixes, never a separate placement code path.
 */
export type CityLevelClassBias = Record<StreetLevel, Partial<Record<CityLotClass, number>>>;

/** Default street-level bias — boulevards favor big massing, lanes favor small/rural massing. */
export const DEFAULT_CITY_LEVEL_BIAS: CityLevelClassBias = {
  boulevard: { tower: 2, slab: 1.6, shop: 1.3, mansion: 1.2 },
  avenue: { tower: 1.5, slab: 1.4, shop: 1.2 },
  street: { shop: 1.1, rowhouse: 1.2, house: 1.2 },
  lane: { house: 1.6, rowhouse: 1.4, mansion: 1.3, farmhouse: 1.5, barn: 1.4, silo: 1.3 },
};

/** Tunable overrides for {@link resolveCityLotContent} (seed/halfExtents/laneFrontage are supplied). */
export interface CityContentOverrides {
  /** Radial band profile: `core-out` (default), `inverted`, or spatially `uniform`. */
  profile?: CityZoneProfile;
  /** Fraction of the half-extent the core band covers. Default 0.35. */
  coreExtent?: number;
  /** Fraction of the half-extent where the mid band ends and the edge begins. Default 0.7. */
  midExtent?: number;
  /** Weighted class mix per band; any omitted band takes {@link DEFAULT_CITY_ZONE_MIXES}. */
  mixes?: Partial<CityZoneMixes>;
  /** Global lot footprint multiplier forwarded to the class placement roll. Default 1. */
  lotScale?: number;
  /** Minimum building floors (district clamp over class ranges). Default 1. */
  floorsMin?: number;
  /** Maximum building floors. Default 30. */
  floorsMax?: number;
  /** Height of one floor in meters. Default 3. */
  floorHeight?: number;
  /** Base road setback in meters (class factors scale it). Default 2.5. */
  setback?: number;
  /** Base side spacing in meters between neighbours. Default 1.4. */
  spacing?: number;
  /**
   * Bias the band mix by the lot's frontage street level before the class pick. `true` (default)
   * uses {@link DEFAULT_CITY_LEVEL_BIAS}; pass a table to customise; `false` disables the bias.
   */
  streetLevelBias?: boolean | CityLevelClassBias;
  /**
   * Share dial (0..1) for the landmark pass: roughly `lots × landmarks ÷ clusterSize` clusters of
   * adjacent frontage lots are merged into block-scale landmarks (civic hall, arena, market, campus)
   * whose footprint is several times larger than a normal lot. Default {@link DEFAULT_LANDMARK_SHARE}
   * (~0.04 ⇒ a couple per default city); `0` disables the pass and yields byte-identical per-lot
   * resolution. Count is hard-capped at {@link LANDMARK_HARD_CAP}. See {@link resolveCityLotContent}.
   */
  landmarks?: number;
  /**
   * Restrict the landmark pass to these classes (a subset of {@link CITY_LANDMARK_CLASSES}). Omit to
   * allow every class the zone table would pick.
   */
  landmarkClasses?: readonly CityLandmarkClass[];
}

/** Full options for {@link resolveCityLotContent}: the city geometry frame plus content overrides. */
export interface CityContentOptions extends CityContentOverrides {
  /** Seed for the deterministic class/floor/massing rolls. Reuse the city seed for a coherent city. */
  seed: string;
  /** Half-extents the city was grown in — the radial zone metric normalizes to these. */
  halfExtents: readonly [number, number];
  /** Whether lanes were lined with lots (mirror {@link CityGeneratorOptions.lots.laneFrontage}). Default false. */
  laneFrontage?: boolean;
}

/** Axis-aligned massing extents (lot-local): full width along x and depth along z. */
export interface MassingFootprint {
  /** Full width of the massing bounding box along local x (frontage). */
  w: number;
  /** Full depth of the massing bounding box along local z (into the block). */
  d: number;
  /** Bounding-box corners in lot-local space, so a renderer can ground/cull the parcel. */
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
}

/** One lot enriched with its zone/class/floors/massing — the renderer instances `pieces` at `center`. */
export interface ResolvedCityLot {
  /** The source frontage lot. For a landmark this is the cluster's dominant lot (carries road/side). */
  lot: PlacedBuildingLot;
  /** Zone band the lot's (or cluster's) center fell in under the profile. */
  zone: CityZoneBand;
  /**
   * Building class. For ordinary lots this is the {@link CityLotClass} the band mix rolled. For a
   * landmark it is the {@link CityLandmarkClass} (the union is widened only to carry that value;
   * ordinary lots never take a landmark class). Read {@link ResolvedCityLot.landmark} to discriminate.
   */
  class: CityLotClass | CityLandmarkClass;
  /**
   * Set only on landmark entries (block-scale cluster merges); equals {@link ResolvedCityLot.class}
   * there and is `undefined` for every ordinary per-lot building. Renderers branch on this.
   */
  landmark?: CityLandmarkClass;
  /** Hierarchy level of the frontage road the lot faces (`street` when it can't be recovered). */
  streetLevel: StreetLevel;
  /** Building floor count after the district clamp. */
  floors: number;
  /** Deterministic massing pieces in lot-local space (x along frontage, z into block, y up from grade). */
  pieces: readonly CityLotPiece[];
  /** Lot center in world XZ (mirrors `lot.center`) — the anchor the renderer offsets pieces from. */
  center: Vec2;
  /** Building yaw so its front faces the road (mirrors `lot.rotationY`). */
  rotationY: number;
  /** Actual massing extents in lot-local space (from `pieces`), for grounding and culling. */
  footprint: MassingFootprint;
}

/** Multiply each band-mix weight by its per-level bias factor (missing class ⇒ ×1). */
function biasMix(mix: readonly WeightedParamEntry[], levelBias: Partial<Record<CityLotClass, number>>): WeightedParamEntry[] {
  return mix.map((entry) => {
    const factor = levelBias[entry.item as CityLotClass];
    return factor === undefined ? entry : { item: entry.item, weight: entry.weight * factor };
  });
}

/**
 * Enforce the plot contract on a lot's massing: if the composed pieces (porches, awnings, side
 * silos) overhang the plot's half-extents, scale every piece's lot-local XZ offset and size by one
 * uniform factor so the whole silhouette fits the plot. Uniform scale is rotation-safe (crossed
 * gables keep their shape) and keeps the massing centered on the lot.
 */
function fitPiecesToPlot(pieces: CityLotPiece[], plotW: number, plotD: number): CityLotPiece[] {
  let reach = 1;
  for (const piece of pieces) {
    const c = Math.abs(Math.cos(piece.rotationY));
    const s = Math.abs(Math.sin(piece.rotationY));
    const hx = (piece.size[0] / 2) * c + (piece.size[2] / 2) * s;
    const hz = (piece.size[0] / 2) * s + (piece.size[2] / 2) * c;
    reach = Math.max(
      reach,
      (Math.abs(piece.offset[0]) + hx) / Math.max(1e-6, plotW / 2),
      (Math.abs(piece.offset[2]) + hz) / Math.max(1e-6, plotD / 2),
    );
  }
  if (reach <= 1 + 1e-9) return pieces;
  const f = 1 / reach;
  return pieces.map((piece) => ({
    ...piece,
    offset: [piece.offset[0] * f, piece.offset[1], piece.offset[2] * f] as const,
    size: [piece.size[0] * f, piece.size[1], piece.size[2] * f] as const,
  }));
}

/** Local axis-aligned bounding box of a lot's massing pieces, accounting for each piece's local yaw. */
function massingFootprint(pieces: readonly CityLotPiece[]): MassingFootprint {
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const piece of pieces) {
    const c = Math.abs(Math.cos(piece.rotationY));
    const s = Math.abs(Math.sin(piece.rotationY));
    const hx = (piece.size[0] / 2) * c + (piece.size[2] / 2) * s;
    const hz = (piece.size[0] / 2) * s + (piece.size[2] / 2) * c;
    minX = Math.min(minX, piece.offset[0] - hx);
    maxX = Math.max(maxX, piece.offset[0] + hx);
    minZ = Math.min(minZ, piece.offset[2] - hz);
    maxZ = Math.max(maxZ, piece.offset[2] + hz);
  }
  if (!Number.isFinite(minX)) return { w: 0, d: 0, bounds: { minX: 0, maxX: 0, minZ: 0, maxZ: 0 } };
  return { w: maxX - minX, d: maxZ - minZ, bounds: { minX, maxX, minZ, maxZ } };
}

/** Default landmark share dial — a couple of block-scale landmarks per default city. */
export const DEFAULT_LANDMARK_SHARE = 0.04;
/** Hard cap on landmarks emitted regardless of dial/city size. */
export const LANDMARK_HARD_CAP = 12;
/** Divisor turning the share dial into a cluster budget (≈ lots × dial ÷ this). */
const LANDMARK_CLUSTER_DIVISOR = 3;
const LANDMARK_MIN_CLUSTER = 2;
const LANDMARK_MAX_CLUSTER = 4;

/** Which landmark classes each zone band favours (weighted). Data-only, mirrors the zone-mix pattern. */
const LANDMARK_ZONE_MIX: Record<CityZoneBand, readonly { cls: CityLandmarkClass; weight: number }[]> = {
  core: [
    { cls: "hall", weight: 3 },
    { cls: "arena", weight: 1 },
    { cls: "market", weight: 1 },
  ],
  mid: [
    { cls: "arena", weight: 2 },
    { cls: "campus", weight: 2 },
    { cls: "market", weight: 2 },
  ],
  edge: [
    { cls: "campus", weight: 2 },
    { cls: "arena", weight: 1 },
  ],
};

/** Rotate a lot-local XZ offset into world space by a lot yaw (inverse of {@link worldToLocal}). */
function localToWorld(p: Vec2, angle: number): Vec2 {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return [p[0] * c + p[1] * s, -p[0] * s + p[1] * c];
}

/** Rotate a world-space XZ offset into a lot's local frame. */
function worldToLocal(p: Vec2, angle: number): Vec2 {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return [p[0] * c - p[1] * s, p[0] * s + p[1] * c];
}

/** Weighted pick of a landmark class from a zone entry list, restricted to `allowed`. */
function pickLandmarkClass(
  entries: readonly { cls: CityLandmarkClass; weight: number }[],
  allowed: ReadonlySet<CityLandmarkClass>,
  roll: number,
): CityLandmarkClass {
  let total = 0;
  for (const e of entries) if (allowed.has(e.cls) && e.weight > 0) total += e.weight;
  if (total <= 0) {
    // Zone table has nothing allowed here — fall back to any allowed class deterministically.
    const pool = CITY_LANDMARK_CLASSES.filter((c) => allowed.has(c));
    return pool[Math.min(pool.length - 1, Math.floor(roll * pool.length))] ?? "campus";
  }
  let cursor = roll * total;
  for (const e of entries) {
    if (!allowed.has(e.cls) || e.weight <= 0) continue;
    cursor -= e.weight;
    if (cursor <= 0) return e.cls;
  }
  return entries[0]!.cls;
}

/**
 * Enrich a generated city's bare frontage lots into the 9-class massing system: each lot gets its
 * zone band (radial position under a {@link CityZoneProfile}), a building class rolled from the
 * band's weighted mix (biased by the frontage street level), floors, and the deterministic massing
 * pieces the class composes — all reusing `cityContent`'s existing zone/mix/placement/massing
 * machinery, never a second copy of it. Deterministic per `seed` via {@link seededStreams}, bounded
 * (one pass over `city.lots`), and pure. Same seed + city ⇒ identical resolved lots.
 *
 * @capability city-generator resolve bare city lots into zoned, classed, massed buildings
 */
export function resolveCityLotContent(city: GeneratedCity, options: CityContentOptions): ResolvedCityLot[] {
  const [hx, hz] = options.halfExtents;
  const profile = options.profile ?? "core-out";
  const coreExtent = options.coreExtent ?? 0.35;
  const midExtent = options.midExtent ?? 0.7;
  const lotScale = options.lotScale ?? 1;
  const floorsMin = options.floorsMin ?? 1;
  const floorsMax = options.floorsMax ?? 30;
  const floorHeight = options.floorHeight ?? 3;
  const setback = options.setback ?? 2.5;
  const spacing = options.spacing ?? 1.4;
  const mixes: CityZoneMixes = {
    core: options.mixes?.core ?? DEFAULT_CITY_ZONE_MIXES.core,
    mid: options.mixes?.mid ?? DEFAULT_CITY_ZONE_MIXES.mid,
    edge: options.mixes?.edge ?? DEFAULT_CITY_ZONE_MIXES.edge,
  };
  const biasSetting = options.streetLevelBias ?? true;
  const biasTable: CityLevelClassBias | null =
    biasSetting === false ? null : biasSetting === true ? DEFAULT_CITY_LEVEL_BIAS : biasSetting;

  // Recover each lot's frontage street level: `lot.road` indexes the frontage list generateCity
  // handed the placer — the streets that carry lots (lanes excluded unless `laneFrontage`).
  const laneFrontage = options.laneFrontage ?? false;
  const frontage = city.network.streets.filter((street) => laneFrontage || street.level !== "lane");

  const streams = seededStreams(options.seed);

  // Ordinary per-lot resolution — the 9-class massing system. Kept byte-identical to the
  // pre-landmark path (same `lot:${i}` stream, same field shape) so the landmarks-off case is a
  // strict backward-compat guard.
  const resolveNormal = (lot: PlacedBuildingLot, i: number): ResolvedCityLot => {
    const streetLevel = frontage[lot.road]?.level ?? "street";
    const rng = streams(`lot:${i}`);
    const bandRoll = rng();
    const classRoll = rng();
    const zone = zoneBand(zoneMetric(lot.center[0], lot.center[1], hx, hz), profile, coreExtent, midExtent, bandRoll);
    const leveled = biasTable === null ? mixes[zone] : biasMix(mixes[zone], biasTable[streetLevel]);
    // Fit the class to the PLOT: narrow slices roll terraces/rowhouses, wide parcels roll the
    // detached classes — mixed plot sizes read as different building stock, not one clone.
    const mix = leveled.map((entry) => ({
      item: entry.item,
      weight: entry.weight * classPlotFit(entry.item as CityLotClass, lot.footprint.w),
    }));
    const cls = pickClass(mix, classRoll);
    const placement = rollClassPlacement(cls, rng, lotScale, floorsMin, floorsMax, setback, spacing);
    // The plot is the contract: the frontage engine spaced plots of exactly `lot.footprint`, so a
    // class roll may come in SMALLER than the plot but never larger — a 20 m tower profile on a
    // 12 m plot previously overlapped both neighbours and spilled onto the road.
    const fitW = Math.min(placement.width, lot.footprint.w);
    const fitD = Math.min(placement.depth, lot.footprint.d);
    const pieces = fitPiecesToPlot(
      buildLotPieces(cls, fitW, fitD, placement.floors, floorHeight, rng),
      lot.footprint.w,
      lot.footprint.d,
    );
    return {
      lot,
      zone,
      class: cls,
      streetLevel,
      floors: placement.floors,
      pieces,
      center: lot.center,
      rotationY: lot.rotationY,
      footprint: massingFootprint(pieces),
    };
  };

  const dial = options.landmarks ?? DEFAULT_LANDMARK_SHARE;
  if (dial <= 0) return city.lots.map(resolveNormal);

  const allowed = new Set<CityLandmarkClass>(options.landmarkClasses ?? CITY_LANDMARK_CLASSES);
  const { landmarks, consumed } = placeLandmarks(city, {
    dial,
    allowed,
    frontage,
    streams,
    profile,
    coreExtent,
    midExtent,
    hx,
    hz,
    floorHeight,
  });
  if (landmarks.length === 0) return city.lots.map(resolveNormal);

  const result: ResolvedCityLot[] = [];
  city.lots.forEach((lot, i) => {
    if (!consumed.has(i)) result.push(resolveNormal(lot, i));
  });
  result.push(...landmarks);
  return result;
}

/** Internal inputs for the landmark pass (already-resolved dials from {@link resolveCityLotContent}). */
interface LandmarkPassContext {
  dial: number;
  allowed: ReadonlySet<CityLandmarkClass>;
  frontage: StreetNetwork["streets"];
  streams: (key: string) => () => number;
  profile: CityZoneProfile;
  coreExtent: number;
  midExtent: number;
  hx: number;
  hz: number;
  floorHeight: number;
}

/**
 * Deterministic landmark pass. Groups lots by shared frontage (road + side, already in arc order),
 * partitions each group into non-overlapping candidate clusters of 2–4 adjacent lots, scores them
 * (bigger clusters + seeded jitter), and merges the top `cap` into oversized landmark parcels whose
 * footprint is the cluster AABB (in the dominant lot's local frame) grown into the block. Any
 * surviving ordinary lot whose center falls inside a landmark footprint is swallowed too, so no
 * landmark ever overlaps a normal building. Bounded: one grouping pass + one sort over ≤ n candidates.
 */
function placeLandmarks(
  city: GeneratedCity,
  ctx: LandmarkPassContext,
): { landmarks: ResolvedCityLot[]; consumed: Set<number> } {
  const { dial, allowed, frontage, streams, profile, coreExtent, midExtent, hx, hz, floorHeight } = ctx;
  const lots = city.lots;
  const consumed = new Set<number>();
  const landmarks: ResolvedCityLot[] = [];

  const cap = Math.min(LANDMARK_HARD_CAP, Math.max(1, Math.floor((lots.length * dial) / LANDMARK_CLUSTER_DIVISOR)));

  // Group by shared frontage; the placer emits a road's lots in arc order, so a group's indices are
  // already spatially consecutive along that frontage.
  const groups = new Map<string, number[]>();
  lots.forEach((lot, i) => {
    const key = `${lot.road}:${lot.side}`;
    const arr = groups.get(key);
    if (arr) arr.push(i);
    else groups.set(key, [i]);
  });

  interface Candidate {
    cluster: number[];
    score: number;
    zone: CityZoneBand;
    cls: CityLandmarkClass;
  }
  const candidates: Candidate[] = [];
  for (const [key, idxs] of groups) {
    let start = 0;
    while (start < idxs.length) {
      const r = streams(`landmark:${key}:${start}`);
      const size = LANDMARK_MIN_CLUSTER + Math.floor(r() * (LANDMARK_MAX_CLUSTER - LANDMARK_MIN_CLUSTER + 1));
      const end = Math.min(idxs.length, start + size);
      const cluster = idxs.slice(start, end);
      start = end;
      if (cluster.length < LANDMARK_MIN_CLUSTER) continue;
      // Reject clusters spread too far to read as one building (a gap in the frontage).
      let far = false;
      for (let k = 1; k < cluster.length; k += 1) {
        const a = lots[cluster[k - 1]!]!.center;
        const b = lots[cluster[k]!]!.center;
        const span = Math.hypot(a[0] - b[0], a[1] - b[1]);
        const reach = (lots[cluster[k - 1]!]!.footprint.w + lots[cluster[k]!]!.footprint.w) * 0.5 + 8;
        if (span > reach) {
          far = true;
          break;
        }
      }
      if (far) continue;
      let sx = 0;
      let sz = 0;
      for (const i of cluster) {
        sx += lots[i]!.center[0];
        sz += lots[i]!.center[1];
      }
      const cx = sx / cluster.length;
      const cz = sz / cluster.length;
      const zone = zoneBand(zoneMetric(cx, cz, hx, hz), profile, coreExtent, midExtent, r());
      const cls = pickLandmarkClass(LANDMARK_ZONE_MIX[zone], allowed, r());
      const score = cluster.length + r();
      candidates.push({ cluster, score, zone, cls });
    }
  }

  candidates.sort((a, b) => b.score - a.score);
  const selected = candidates.slice(0, cap);

  // Street corridors the landmark footprint must stay off — ALL streets, lanes included.
  const corridors = city.network.streets.map((street) => ({ path: street.points, half: street.width / 2 - 0.02 }));
  const placedRects: OrientedRect[] = [];

  for (const cand of selected) {
    const { cluster, zone, cls } = cand;
    const domIdx = cluster[Math.floor(cluster.length / 2)]!;
    const dom = lots[domIdx]!;

    // Cluster AABB in the dominant lot's local frame (clustered lots share a frontage ⇒ near-parallel).
    let minX = Infinity;
    let maxX = -Infinity;
    let baseMinZ = Infinity;
    let maxZ = -Infinity;
    for (const i of cluster) {
      const lot = lots[i]!;
      const rel: Vec2 = [lot.center[0] - dom.center[0], lot.center[1] - dom.center[1]];
      const loc = worldToLocal(rel, dom.rotationY);
      const hw = lot.footprint.w / 2;
      const hd = lot.footprint.d / 2;
      minX = Math.min(minX, loc[0] - hw);
      maxX = Math.max(maxX, loc[0] + hw);
      baseMinZ = Math.min(baseMinZ, loc[1] - hd);
      maxZ = Math.max(maxZ, loc[1] + hd);
    }
    const clusterWidth = maxX - minX;
    const clusterDepth = maxZ - baseMinZ;

    // Build one candidate landmark at a given depth-growth, then verify its ACTUAL massing rect
    // stays off every street corridor. A merged parcel spanning a cross street — or grown back
    // into the street behind the block — is rejected, never emitted.
    const attempt = (grown: boolean): ResolvedCityLot | null => {
      // Grow depth into the block (away from the road at +z) so the parcel reads as block-scale.
      const targetDepth = grown ? Math.max(clusterDepth, clusterWidth * landmarkMinDepthFactor(cls)) : clusterDepth;
      const minZ = baseMinZ - (targetDepth - clusterDepth);
      const width = maxX - minX;
      const depth = maxZ - minZ;
      const localCenter: Vec2 = [(minX + maxX) / 2, (minZ + maxZ) / 2];
      const worldOffset = localToWorld(localCenter, dom.rotationY);
      const center: Vec2 = [dom.center[0] + worldOffset[0], dom.center[1] + worldOffset[1]];

      const rng = streams(`landmark-build:${domIdx}`);
      const floors = landmarkFloors(cls, rng);
      const pieces = buildLandmarkPieces(cls, width, depth, floors, floorHeight, rng);
      const footprint = massingFootprint(pieces);
      const b = footprint.bounds;
      const mid = localToWorld([(b.minX + b.maxX) / 2, (b.minZ + b.maxZ) / 2], dom.rotationY);
      const rect: OrientedRect = {
        x: center[0] + mid[0],
        z: center[1] + mid[1],
        hw: (b.maxX - b.minX) / 2,
        hd: (b.maxZ - b.minZ) / 2,
        angle: dom.rotationY,
      };
      for (const corridor of corridors) {
        if (!rectClearsPolyline(rect, corridor.path, corridor.half)) return null;
      }
      // Landmarks grown from opposite block faces must not meet in the block interior.
      for (const placed of placedRects) {
        if (!rectsSeparated(rect, placed)) return null;
      }
      placedRects.push(rect);
      return {
        lot: dom,
        zone,
        class: cls,
        landmark: cls,
        streetLevel: frontage[dom.road]?.level ?? "street",
        floors,
        pieces,
        center,
        rotationY: dom.rotationY,
        footprint,
      };
    };
    const landmark = attempt(true) ?? attempt(false);
    if (landmark === null) continue; // cluster straddles a street — its lots resolve normally
    for (const i of cluster) consumed.add(i);
    landmarks.push(landmark);
  }

  // Swallow any surviving ordinary lot whose PLOT RECT intersects a landmark footprint, so a
  // landmark never overlaps a normal building — partial overlaps count, not just centers.
  if (landmarks.length > 0) {
    const lmRects: OrientedRect[] = landmarks.map((lm) => {
      const b = lm.footprint.bounds;
      const mid = localToWorld([(b.minX + b.maxX) / 2, (b.minZ + b.maxZ) / 2], lm.rotationY);
      return {
        x: lm.center[0] + mid[0],
        z: lm.center[1] + mid[1],
        hw: (b.maxX - b.minX) / 2,
        hd: (b.maxZ - b.minZ) / 2,
        angle: lm.rotationY,
      };
    });
    lots.forEach((lot, i) => {
      if (consumed.has(i)) return;
      const rect: OrientedRect = {
        x: lot.center[0],
        z: lot.center[1],
        hw: lot.footprint.w / 2,
        hd: lot.footprint.d / 2,
        angle: lot.rotationY,
      };
      for (const lm of lmRects) {
        if (!rectsSeparated(rect, lm)) {
          consumed.add(i);
          return;
        }
      }
    });
  }

  return { landmarks, consumed };
}
