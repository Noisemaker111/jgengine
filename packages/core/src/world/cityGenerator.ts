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
  buildLotPieces,
  pickClass,
  rollClassPlacement,
  zoneBand,
  zoneMetric,
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
  const frontage = network.streets
    .filter((street) => laneFrontage || street.level !== "lane")
    .map((street) => ({ path: street.points, width: street.width }));
  const candidates = deriveBuildingLots({
    ...lotRest,
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
  /** The source frontage lot (center, rotationY, footprint, road, side, frontDistance). */
  lot: PlacedBuildingLot;
  /** Zone band the lot's center fell in under the profile. */
  zone: CityZoneBand;
  /** Building class the bias-adjusted band mix rolled. */
  class: CityLotClass;
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
  return city.lots.map((lot, i) => {
    const streetLevel = frontage[lot.road]?.level ?? "street";
    const rng = streams(`lot:${i}`);
    const bandRoll = rng();
    const classRoll = rng();
    const zone = zoneBand(zoneMetric(lot.center[0], lot.center[1], hx, hz), profile, coreExtent, midExtent, bandRoll);
    const mix = biasTable === null ? mixes[zone] : biasMix(mixes[zone], biasTable[streetLevel]);
    const cls = pickClass(mix, classRoll);
    const placement = rollClassPlacement(cls, rng, lotScale, floorsMin, floorsMax, setback, spacing);
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
  });
}
