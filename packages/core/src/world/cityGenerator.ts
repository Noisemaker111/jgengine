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
import { isOnRoad } from "./roads";
import {
  generateStreets,
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
}

/** A generated city: the street network and the building lots lining its frontage. */
export interface GeneratedCity {
  network: StreetNetwork;
  lots: PlacedBuildingLot[];
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
  return { network, lots };
}
