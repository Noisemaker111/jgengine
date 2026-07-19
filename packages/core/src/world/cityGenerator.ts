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
  landmarkFloors,
  landmarkMinDepthFactor,
  pickClass,
  rollClassPlacement,
  zoneBand,
  zoneMetric,
  CITY_LANDMARK_CLASSES,
  type CityFillerClass,
  type CityLandmarkClass,
  type CityLotClass,
  type CityLotPiece,
  type CityZoneBand,
  type CityZoneProfile,
} from "./cityContent";
import type { Vec2 } from "./cityGeometry";
import { isOnRoad } from "./roads";
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
  const contentEnabled = options.content !== undefined && options.content !== false;
  const overrides = options.content === true || options.content === undefined || options.content === false ? {} : options.content;
  // Frontage compaction dial: when the content pass is on its `blockFill` wins (it owns the full
  // Manhattan look — compact frontage AND interior fill), else the bare-lot `lots.blockFill` applies.
  // Left `undefined` (no dial anywhere) the frontage engine stays byte-identical to the classic path.
  const blockFill = contentEnabled ? overrides.blockFill ?? lotRest.blockFill : lotRest.blockFill;
  const frontage = network.streets
    .filter((street) => laneFrontage || street.level !== "lane")
    .map((street) => ({ path: street.points, width: street.width }));
  const candidates = deriveBuildingLots({
    ...lotRest,
    blockFill,
    roads: frontage,
    seed,
    area: lotRest.area ?? { center: [0, 0], halfExtents: [hx, hz] },
  });
  // The frontage engine only avoids the roads it lines; streets excluded from frontage (lanes by
  // default) are still pavement, so drop any lot whose footprint would straddle one.
  const clearance = Math.min(lotRest.footprint?.w ?? 12, lotRest.footprint?.d ?? 10);
  const lots = candidates.filter((lot) =>
    network.streets.every(
      (street) => !isOnRoad(street.points, street.width + clearance, lot.center[0], lot.center[1]),
    ),
  );
  if (!contentEnabled) return { network, lots };
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
  /**
   * Manhattan block-fill dial (0..1). Default {@link DEFAULT_BLOCK_FILL} (~0.45), which is a no-op:
   * frontage stays as-authored and no interiors/parks are added (byte-identical to the classic
   * content path). As it rises the pass fills the empty block interiors behind the frontage rows with
   * back-row and interior lots — ordinary zone classes mixed with parking-garage and depot fillers
   * ({@link CITY_FILLER_CLASSES}) — never overlapping roads, frontage, or each other, and reserves a
   * small seeded fraction of blocks as breathing-room parks (empty interiors + thinned frontage).
   * Interior lots per block are capped at {@link INTERIOR_LOTS_PER_BLOCK_CAP}. Frontage COMPACTION
   * (spacing→0, lots widen to touch) is a sibling lever applied by {@link generateCity} when this dial
   * is set — see {@link CityGeneratorOptions.lots.blockFill}. Determinism preserved via seeded streams.
   */
  blockFill?: number;
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
   * landmark it is the {@link CityLandmarkClass}. Interior-fill lots may additionally carry a
   * {@link CityFillerClass} (garage/depot). Read {@link ResolvedCityLot.landmark} /
   * {@link ResolvedCityLot.interior} to discriminate.
   */
  class: CityLotClass | CityLandmarkClass | CityFillerClass;
  /**
   * Set only on landmark entries (block-scale cluster merges); equals {@link ResolvedCityLot.class}
   * there and is `undefined` for every ordinary per-lot building. Renderers branch on this.
   */
  landmark?: CityLandmarkClass;
  /**
   * Set only on lots synthesized by the block-interior fill pass (behind the street frontage at a
   * high `blockFill`). `undefined` for street-frontage lots and landmarks. Filler classes
   * ({@link CITY_FILLER_CLASSES}) only ever appear on entries where this is `true`.
   */
  interior?: boolean;
  /**
   * Set on the surviving street-frontage lots of a block reserved as a park at a high `blockFill`.
   * Park blocks are thinned (most frontage dropped) and never interior-filled, so a full-fill city
   * still breathes. `undefined` on ordinary and interior lots.
   */
  park?: boolean;
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
/**
 * Default `blockFill` — a deliberate no-op point. At this value frontage is untouched and the
 * interior-fill/park passes are gated off, so the content path stays byte-identical to the classic
 * one; callers opt into the Manhattan look by raising the dial toward 1.
 */
export const DEFAULT_BLOCK_FILL = 0.45;
/** Interior fill and parks engage only above this dial value (keeps the default a strict no-op). */
const BLOCK_FILL_GATE = 0.5;
/** Max back-row/interior ranks placed behind a frontage lot at full fill. */
const INTERIOR_MAX_ROWS = 7;
/** Hard cap on interior lots synthesized per frontage block (road+side group). Bounds the pass. */
export const INTERIOR_LOTS_PER_BLOCK_CAP = 24;
/** Extra massing-width growth (per class) applied to frontage at full fill, for a tighter streetwall. */
const FRONTAGE_MASSING_STRETCH = 0.25;
/** Fraction of a park block's frontage kept (the rest is dropped so the block reads as open space). */
const PARK_FRONTAGE_KEEP = 0.25;
/** Floor on the park-block fraction at full fill, so even a wall-to-wall city keeps some green. */
const PARK_MIN_FRACTION = 0.06;
/** Share of the compaction gap converted to park reservation as fill drops from 1 toward the gate. */
const PARK_FRACTION_SLOPE = 0.4;
/** Probability an interior lot is a filler (garage/depot) rather than an ordinary zone class. */
const INTERIOR_FILLER_PROB = 0.45;
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

  // Block-fill dial. At/below the reference (default) it's a strict no-op: no width stretch, no
  // interior fill, no parks — so the classic content path stays byte-identical. Above the gate the
  // pass packs block interiors and reserves parks.
  const fill = options.blockFill ?? DEFAULT_BLOCK_FILL;
  const fillActive = fill > BLOCK_FILL_GATE;
  const widthStretch = 1 + (Math.max(0, fill - DEFAULT_BLOCK_FILL) / (1 - DEFAULT_BLOCK_FILL)) * FRONTAGE_MASSING_STRETCH;

  // Ordinary per-lot resolution — the 9-class massing system. Kept byte-identical to the
  // pre-landmark path (same `lot:${i}` stream, same field shape) at the default dial, so the
  // landmarks-off + default-fill case is a strict backward-compat guard.
  const resolveNormal = (lot: PlacedBuildingLot, i: number): ResolvedCityLot => {
    const streetLevel = frontage[lot.road]?.level ?? "street";
    const rng = streams(`lot:${i}`);
    const bandRoll = rng();
    const classRoll = rng();
    const zone = zoneBand(zoneMetric(lot.center[0], lot.center[1], hx, hz), profile, coreExtent, midExtent, bandRoll);
    const mix = biasTable === null ? mixes[zone] : biasMix(mixes[zone], biasTable[streetLevel]);
    const cls = pickClass(mix, classRoll);
    const placement = rollClassPlacement(cls, rng, lotScale, floorsMin, floorsMax, setback, spacing, widthStretch);
    const pieces = buildLotPieces(cls, placement.width, placement.depth, placement.floors, floorHeight, rng);
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

  // Landmark pass (may be a no-op at dial 0).
  const dial = options.landmarks ?? DEFAULT_LANDMARK_SHARE;
  let landmarks: ResolvedCityLot[] = [];
  let consumed = new Set<number>();
  if (dial > 0) {
    const allowed = new Set<CityLandmarkClass>(options.landmarkClasses ?? CITY_LANDMARK_CLASSES);
    const pass = placeLandmarks(city, {
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
    landmarks = pass.landmarks;
    consumed = pass.consumed;
  }

  // Fast path: default fill and no landmarks ⇒ classic 1:1 resolution in lot order.
  if (!fillActive && landmarks.length === 0) return city.lots.map(resolveNormal);

  // Park blocks (only when fill is active): reserve a seeded fraction of frontage blocks as open
  // space — thinned frontage, never interior-filled — so a full-fill city still breathes.
  const parkPlan = fillActive ? planParkBlocks(city.lots, consumed, streams, fill) : null;

  // Resolve surviving frontage lots in lot order; drop most of a park block's frontage.
  const result: ResolvedCityLot[] = [];
  const fillFrontage: { key: string; index: number; entry: ResolvedCityLot }[] = [];
  city.lots.forEach((lot, i) => {
    if (consumed.has(i)) return;
    const key = `${lot.road}:${lot.side}`;
    if (parkPlan?.parkKeep.has(key)) {
      if (!parkPlan.parkKeep.get(key)!.has(i)) return; // thinned-out park frontage
      const entry = resolveNormal(lot, i);
      entry.park = true;
      result.push(entry);
      return;
    }
    const entry = resolveNormal(lot, i);
    result.push(entry);
    if (fillActive) fillFrontage.push({ key, index: i, entry });
  });
  result.push(...landmarks);

  // Interior fill: pack the empty block interiors behind the (non-park) frontage rows.
  if (fillActive && fillFrontage.length > 0) {
    const interior = fillBlockInteriors({
      city,
      fillFrontage,
      existing: result,
      streams,
      fill,
      widthStretch,
      hx,
      hz,
      profile,
      coreExtent,
      midExtent,
      mixes,
      lotScale,
      floorsMin,
      floorsMax,
      floorHeight,
      setback,
      spacing,
    });
    result.push(...interior);
  }
  return result;
}

/** Outward frontage normal (points away from the road, into the block) from a lot's facing yaw. */
function outwardNormalOf(rotationY: number): Vec2 {
  return [-Math.sin(rotationY), -Math.cos(rotationY)];
}

/** Interior back-row ranks placed behind a frontage lot at a given fill (0 at/below the gate). */
function interiorRows(fill: number): number {
  return Math.max(0, Math.round(((fill - BLOCK_FILL_GATE) / (1 - BLOCK_FILL_GATE)) * INTERIOR_MAX_ROWS));
}

/**
 * Seeded park-block reservation. Groups non-consumed lots by frontage (road+side), reserves a
 * fraction of those blocks (~`(1-fill)` scaled, floored at {@link PARK_MIN_FRACTION} so full fill
 * still keeps some, and forced to ≥1 at very high fill), and within each keeps only a small seeded
 * subset of frontage lots. Deterministic; bounded (one pass + one sort over the block keys).
 */
function planParkBlocks(
  lots: readonly PlacedBuildingLot[],
  consumed: ReadonlySet<number>,
  streams: (key: string) => () => number,
  fill: number,
): { parkKeep: Map<string, Set<number>> } {
  const groups = new Map<string, number[]>();
  lots.forEach((lot, i) => {
    if (consumed.has(i)) return;
    const key = `${lot.road}:${lot.side}`;
    const arr = groups.get(key);
    if (arr) arr.push(i);
    else groups.set(key, [i]);
  });
  const keys = [...groups.keys()];
  const fraction = Math.max(PARK_MIN_FRACTION, (1 - fill) * PARK_FRACTION_SLOPE);
  const minParks = fill >= 0.9 && keys.length > 0 ? 1 : 0;
  const count = Math.min(keys.length, Math.max(minParks, Math.round(keys.length * fraction)));
  const scored = keys
    .map((k) => ({ k, s: streams(`park:${k}`)() }))
    .sort((a, b) => b.s - a.s || (a.k < b.k ? -1 : 1));
  const parkKeep = new Map<string, Set<number>>();
  for (const { k } of scored.slice(0, count)) {
    const idxs = groups.get(k)!;
    const keepCount = Math.max(1, Math.ceil(idxs.length * PARK_FRONTAGE_KEEP));
    const keep = new Set<number>(
      idxs
        .map((i) => ({ i, s: streams(`park-keep:${k}:${i}`)() }))
        .sort((a, b) => b.s - a.s || a.i - b.i)
        .slice(0, keepCount)
        .map((x) => x.i),
    );
    parkKeep.set(k, keep);
  }
  return { parkKeep };
}

/** Inputs for the interior-fill pass. */
interface InteriorFillContext {
  city: GeneratedCity;
  fillFrontage: { key: string; index: number; entry: ResolvedCityLot }[];
  existing: readonly ResolvedCityLot[];
  streams: (key: string) => () => number;
  fill: number;
  widthStretch: number;
  hx: number;
  hz: number;
  profile: CityZoneProfile;
  coreExtent: number;
  midExtent: number;
  mixes: CityZoneMixes;
  lotScale: number;
  floorsMin: number;
  floorsMax: number;
  floorHeight: number;
  setback: number;
  spacing: number;
}

/** A placed footprint tracked for overlap rejection (center, orientation, half-extents, radius). */
interface Occupant {
  center: Vec2;
  yaw: number;
  hw: number;
  hd: number;
  radius: number;
}

/** Safety separation (world units) added to the near-parallel AABB test so yaw error never slivers. */
const OVERLAP_MARGIN = 0.9;

/** Bounded uniform spatial hash for overlap queries during interior fill. */
class OccupancyGrid {
  private readonly cells = new Map<string, Occupant[]>();
  constructor(private readonly cell: number) {}
  private key(x: number, z: number): string {
    return `${Math.floor(x / this.cell)}:${Math.floor(z / this.cell)}`;
  }
  insert(occ: Occupant): void {
    const k = this.key(occ.center[0], occ.center[1]);
    const arr = this.cells.get(k);
    if (arr) arr.push(occ);
    else this.cells.set(k, [occ]);
  }
  /** True if `cand` overlaps any occupant: exact AABB when near-parallel, else conservative circle. */
  overlaps(cand: Occupant): boolean {
    const cx = Math.floor(cand.center[0] / this.cell);
    const cz = Math.floor(cand.center[1] / this.cell);
    for (let gx = cx - 1; gx <= cx + 1; gx += 1) {
      for (let gz = cz - 1; gz <= cz + 1; gz += 1) {
        const arr = this.cells.get(`${gx}:${gz}`);
        if (!arr) continue;
        for (const occ of arr) {
          const dx = cand.center[0] - occ.center[0];
          const dz = cand.center[1] - occ.center[1];
          const dyaw = Math.abs(((cand.yaw - occ.yaw + Math.PI) % (2 * Math.PI)) - Math.PI);
          if (dyaw < 0.05 || Math.abs(dyaw - Math.PI) < 0.05) {
            // Near-parallel: AABB in the shared (block-local) frame, inflated by OVERLAP_MARGIN so a
            // couple of degrees of yaw error (gently curved frontage) never leaves a sliver overlap.
            const c = Math.cos(cand.yaw);
            const s = Math.sin(cand.yaw);
            const lx = Math.abs(dx * c - dz * s);
            const lz = Math.abs(dx * s + dz * c);
            if (lx < cand.hw + occ.hw + OVERLAP_MARGIN && lz < cand.hd + occ.hd + OVERLAP_MARGIN) return true;
          } else if (dx * dx + dz * dz < (cand.radius + occ.radius) * (cand.radius + occ.radius) - 1e-6) {
            // Cross-yaw: circumscribed-circle separation guarantees the rectangles cannot overlap.
            return true;
          }
        }
      }
    }
    return false;
  }
}

/**
 * Pack the empty interiors of dense blocks with back-row and interior lots. For each non-park
 * frontage block (road+side group) it lays a grid of lots behind the frontage wall, oriented to the
 * block's frontage yaw, mixing ordinary zone classes with parking-garage/depot fillers. Every
 * candidate is rejected if it sits on a road, leaves the district, or overlaps an existing lot
 * (frontage, landmark, or another interior lot). Deterministic per seed; bounded — rows are capped
 * and each block yields at most {@link INTERIOR_LOTS_PER_BLOCK_CAP} interior lots.
 */
function fillBlockInteriors(ctx: InteriorFillContext): ResolvedCityLot[] {
  const {
    city, fillFrontage, existing, streams, fill, widthStretch, hx, hz,
    profile, coreExtent, midExtent, mixes, lotScale, floorsMin, floorsMax, floorHeight, setback, spacing,
  } = ctx;
  const rows = interiorRows(fill);
  if (rows <= 0) return [];

  // Interior packing cell — sized so any clamped interior footprint fits, keeping same-block cells
  // non-overlapping by construction.
  const CELL_W = 16;
  const CELL_D = 15;
  const ROW_GAP = 1.5;
  const grid = new OccupancyGrid(64);

  const radiusOf = (w: number, d: number): number => 0.5 * Math.hypot(w, d);
  // Seed the grid with every already-placed lot so interiors never collide with frontage/landmarks.
  for (const r of existing) {
    const w = r.landmark ? r.footprint.w : r.lot.footprint.w;
    const d = r.landmark ? r.footprint.d : r.lot.footprint.d;
    grid.insert({ center: r.center, yaw: r.rotationY, hw: w / 2, hd: d / 2, radius: radiusOf(w, d) });
  }

  // Group the fill-eligible frontage lots by block.
  const blocks = new Map<string, { index: number; entry: ResolvedCityLot }[]>();
  for (const f of fillFrontage) {
    const arr = blocks.get(f.key);
    if (arr) arr.push({ index: f.index, entry: f.entry });
    else blocks.set(f.key, [{ index: f.index, entry: f.entry }]);
  }

  const clearance = Math.min(CELL_W, CELL_D);
  const interior: ResolvedCityLot[] = [];

  for (const [key, members] of blocks) {
    if (members.length < 2) continue; // need a real frontage run to define a block interior
    // Anchor on the middle frontage lot; build the block-local frame from its yaw.
    const anchorMember = members[Math.floor(members.length / 2)]!;
    const anchor = anchorMember.entry.lot;
    const anchorLevel = anchorMember.entry.streetLevel;
    const yaw = anchor.rotationY;
    const n = outwardNormalOf(yaw); // into the block
    const t: Vec2 = [-n[1], n[0]]; // along the street

    // Along-street span from the block's frontage centers (relative to the anchor).
    let tMin = Infinity;
    let tMax = -Infinity;
    for (const m of members) {
      const rel: Vec2 = [m.entry.lot.center[0] - anchor.center[0], m.entry.lot.center[1] - anchor.center[1]];
      const along = rel[0] * t[0] + rel[1] * t[1];
      tMin = Math.min(tMin, along);
      tMax = Math.max(tMax, along);
    }
    const depthStart = anchor.footprint.d / 2 + ROW_GAP;
    let placed = 0;
    for (let row = 1; row <= rows && placed < INTERIOR_LOTS_PER_BLOCK_CAP; row += 1) {
      const depth = depthStart + (row - 0.5) * (CELL_D + ROW_GAP);
      let col = 0;
      for (let along = tMin; along <= tMax + 1e-6 && placed < INTERIOR_LOTS_PER_BLOCK_CAP; along += CELL_W) {
        col += 1;
        const cx = anchor.center[0] + n[0] * depth + t[0] * along;
        const cz = anchor.center[1] + n[1] * depth + t[1] * along;
        if (Math.abs(cx) > hx || Math.abs(cz) > hz) continue;
        if (city.network.streets.some((street) => isOnRoad(street.points, street.width + clearance, cx, cz))) continue;

        const rng = streams(`interior:${key}:${row}:${col}`);
        const zone = zoneBand(zoneMetric(cx, cz, hx, hz), profile, coreExtent, midExtent, rng());
        let cls: CityLotClass | CityFillerClass;
        if (rng() < INTERIOR_FILLER_PROB) cls = rng() < 0.6 ? "garage" : "depot";
        else cls = pickClass(mixes[zone], rng());
        const placement = rollClassPlacement(cls, rng, lotScale, floorsMin, floorsMax, setback, spacing, widthStretch);
        // Clamp to the packing cell so same-block cells never overlap.
        const w = Math.min(placement.width, CELL_W * 0.94);
        const d = Math.min(placement.depth, CELL_D * 0.94);
        const cand: Occupant = { center: [cx, cz], yaw, hw: w / 2, hd: d / 2, radius: radiusOf(w, d) };
        if (grid.overlaps(cand)) continue;

        const pieces = buildLotPieces(cls, w, d, placement.floors, floorHeight, rng);
        const lot: PlacedBuildingLot = {
          center: [cx, cz],
          rotationY: yaw,
          footprint: { w, d },
          road: anchor.road,
          side: anchor.side,
          frontDistance: anchor.frontDistance,
        };
        interior.push({
          lot,
          zone,
          class: cls,
          interior: true,
          streetLevel: anchorLevel,
          floors: placement.floors,
          pieces,
          center: [cx, cz],
          rotationY: yaw,
          footprint: massingFootprint(pieces),
        });
        grid.insert(cand);
        placed += 1;
      }
    }
  }
  return interior;
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

  for (const cand of selected) {
    const { cluster, zone, cls } = cand;
    const domIdx = cluster[Math.floor(cluster.length / 2)]!;
    const dom = lots[domIdx]!;

    // Cluster AABB in the dominant lot's local frame (clustered lots share a frontage ⇒ near-parallel).
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (const i of cluster) {
      const lot = lots[i]!;
      const rel: Vec2 = [lot.center[0] - dom.center[0], lot.center[1] - dom.center[1]];
      const loc = worldToLocal(rel, dom.rotationY);
      const hw = lot.footprint.w / 2;
      const hd = lot.footprint.d / 2;
      minX = Math.min(minX, loc[0] - hw);
      maxX = Math.max(maxX, loc[0] + hw);
      minZ = Math.min(minZ, loc[1] - hd);
      maxZ = Math.max(maxZ, loc[1] + hd);
    }
    const clusterWidth = maxX - minX;
    const clusterDepth = maxZ - minZ;
    // Grow depth into the block (away from the road at +z) so the parcel reads as block-scale.
    const targetDepth = Math.max(clusterDepth, clusterWidth * landmarkMinDepthFactor(cls));
    minZ -= targetDepth - clusterDepth;
    const width = maxX - minX;
    const depth = maxZ - minZ;
    const localCenter: Vec2 = [(minX + maxX) / 2, (minZ + maxZ) / 2];
    const worldOffset = localToWorld(localCenter, dom.rotationY);
    const center: Vec2 = [dom.center[0] + worldOffset[0], dom.center[1] + worldOffset[1]];

    const rng = streams(`landmark-build:${domIdx}`);
    const floors = landmarkFloors(cls, rng);
    const pieces = buildLandmarkPieces(cls, width, depth, floors, floorHeight, rng);
    const footprint = massingFootprint(pieces);
    for (const i of cluster) consumed.add(i);
    landmarks.push({
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
    });
  }

  // Swallow any surviving ordinary lot whose center falls inside a landmark footprint, so a landmark
  // never overlaps a normal building.
  if (landmarks.length > 0) {
    lots.forEach((lot, i) => {
      if (consumed.has(i)) return;
      for (const lm of landmarks) {
        const rel: Vec2 = [lot.center[0] - lm.center[0], lot.center[1] - lm.center[1]];
        const loc = worldToLocal(rel, lm.rotationY);
        const b = lm.footprint.bounds;
        if (loc[0] >= b.minX && loc[0] <= b.maxX && loc[1] >= b.minZ && loc[1] <= b.maxZ) {
          consumed.add(i);
          return;
        }
      }
    });
  }

  return { landmarks, consumed };
}
