/**
 * Reference bands for judging procedural street, city and race-circuit output: what real places
 * measure (`reference`, with a citation) and what the engine's generators are held to (`target`, from
 * the 2026-11 generator quality audit). Plain data plus one judge function; the metric names are the
 * keys of `StreetNetworkMetrics`, `CityMetrics` and `CircuitMetrics`, dotted for nested fields.
 *
 * A profile is the kind of place a preset claims to be ("grid", "dense-core", "circuit" ...). A preset
 * names its profile in {@link GENERATOR_PRESET_PROFILES}; an unknown preset falls back to the
 * generator's default profile, so a new street style is judged as soon as it maps to one.
 */

/** A source a band cites. */
export interface ReferenceCitation {
  readonly id: string;
  readonly text: string;
  readonly url?: string;
}

/** One acceptable range for one metric. Either bound may be open. */
export interface ReferenceBand {
  /** Metric key, dotted for nested fields (`blocks.medianHa`). */
  readonly metric: string;
  readonly min?: number;
  readonly max?: number;
  /** `reference`: a measured real-world range. `target`: a generator acceptance bar. */
  readonly kind: "reference" | "target";
  /** What the range describes, in a few words. */
  readonly note: string;
  /** {@link ReferenceCitation} id. */
  readonly cite: string;
}

/** The generator families the bands cover. */
export type ReferenceGenerator = "streets" | "city" | "circuit";

export interface ReferenceProfile {
  readonly id: string;
  readonly generator: ReferenceGenerator;
  readonly label: string;
  readonly bands: readonly ReferenceBand[];
}

export const GENERATOR_REFERENCE_CITATIONS: readonly ReferenceCitation[] = [
  {
    id: "boeing2017",
    text: "Boeing, G. (2017). OSMnx: New methods for acquiring, constructing, analyzing, and visualizing complex street networks. Computers, Environment and Urban Systems 65, 126–139.",
    url: "https://doi.org/10.1016/j.compenvurbsys.2017.05.004",
  },
  {
    id: "boeing2019",
    text: "Boeing, G. (2019). Urban spatial order: street network orientation, configuration, and entropy. Applied Network Science 4, 67.",
    url: "https://doi.org/10.1007/s41109-019-0189-1",
  },
  {
    id: "levinson2009",
    text: "Levinson, D. & El-Geneidy, A. (2009). The minimum circuity frontier and the journey to work. Regional Science and Urban Economics 39(6), 732–738.",
  },
  {
    id: "fhwa2013",
    text: "FHWA (2013). Highway Functional Classification Concepts, Criteria and Procedures, Table 3-5: urban arterial share of route length.",
    url: "https://www.fhwa.dot.gov/planning/processes/statewide/related/highway_functional_classifications/",
  },
  {
    id: "unhabitat2013",
    text: "UN-Habitat (2013). Streets as Public Spaces and Drivers of Urban Prosperity: share of urban land given to streets (about 30–36% in well-planned cores, Manhattan ≈36%).",
  },
  {
    id: "nyczr",
    text: "New York City Zoning Resolution, high-density commercial districts (C5/C6): maximum FAR 10–15.",
    url: "https://zr.planning.nyc.gov/",
  },
  {
    id: "plss",
    text: "US Public Land Survey System (Land Ordinance of 1785): one-mile (1.6 km) sections, section-line roads.",
  },
  {
    id: "f1circuits",
    text: "Formula 1 circuit data (length, turns): Monaco 3.337 km/19 (5.7 per km), Singapore 4.940 km/19 (3.8), Baku 6.003 km/20 (3.3), Suzuka 5.807 km/18 (3.1), Spa 7.004 km/19 (2.7).",
  },
  {
    id: "fia-app-o",
    text: "FIA International Sporting Code, Appendix O: circuit standards (track width, lap length for Grade 1 circuits 3.5–7 km).",
  },
  {
    id: "genaudit2026",
    text: "JGengine street / city / race-circuit generator quality audit (2026-11, beta aaf104064): workstream acceptance targets and audit estimates.",
  },
];

const ref = (metric: string, min: number | undefined, max: number | undefined, note: string, cite: string): ReferenceBand => ({
  metric,
  ...(min === undefined ? {} : { min }),
  ...(max === undefined ? {} : { max }),
  kind: "reference",
  note,
  cite,
});
const target = (metric: string, min: number | undefined, max: number | undefined, note: string): ReferenceBand => ({
  metric,
  ...(min === undefined ? {} : { min }),
  ...(max === undefined ? {} : { max }),
  kind: "target",
  note,
  cite: "genaudit2026",
});

/** Bands every street net shares, whatever its style. */
const STREET_COMMON: readonly ReferenceBand[] = [
  ref("detourRatio", 1.1, 1.3, "network over straight-line distance", "levinson2009"),
  ref("arterialShare", 0.1, 0.25, "urban arterial share of length", "fhwa2013"),
  ref("deadEndInteriorShare", undefined, 0.05, "interior dead ends, connected cities", "boeing2019"),
  target("levelFlipRate", undefined, 0.05, "arterials keep their level through junctions (WS-B)"),
  target("keptLengthShare", 0.99, undefined, "no street length dropped by a cap (WS-B)"),
];

const CITY_COMMON: readonly ReferenceBand[] = [
  ref("pavementShare", 0.25, 0.4, "carriageway + sidewalk share of a district", "unhabitat2013"),
  ref("landInBlocksShare", 0.6, 0.75, "land left in blocks once streets are taken", "unhabitat2013"),
  target("minTemplatesPerClass", 5, undefined, "massing templates per building class (WS-F)"),
  target("landmarks", 1, undefined, "at least one civic landmark (WS-F)"),
  target("heightDistanceRho", undefined, -0.2, "height falls with distance from the centre"),
  target("buildingsOnRoad", undefined, 0, "no building on a carriageway"),
  target("keptLengthShare", 0.99, undefined, "no street length dropped by a cap (WS-B)"),
];

const CIRCUIT_COMMON: readonly ReferenceBand[] = [
  ref("cornersPerKm", 2.7, 5.7, "Spa (2.7) to Monaco (5.7)", "f1circuits"),
  target("overtakingSpots", 1, undefined, "a long straight into heavy braking (WS-D/E)"),
  target("gridInCorner", undefined, 0, "no grid slot in a corner (WS-E)"),
  target("lengthErrorPct", -10, 10, "lap length within ±10% of the request (WS-D)"),
];

export const GENERATOR_REFERENCE_PROFILES: readonly ReferenceProfile[] = [
  {
    id: "grid",
    generator: "streets",
    label: "grid city core (Manhattan, Chicago, Portland)",
    bands: [
      ref("intersectionsPerKm2", 45, 150, "Manhattan 45–60 to Portland ~150", "boeing2017"),
      ref("roadKmPerKm2", 15, 25, "street length density, US urban cores", "boeing2017"),
      ref("fourWayShare", 0.55, 0.85, "4-way share in grid cores", "boeing2019"),
      ref("orientationOrder", 0.5, 1, "grid-planned cities (Chicago ≈ 0.9)", "boeing2019"),
      ref("landInBlocksShare", 0.64, 0.7, "land left in blocks", "unhabitat2013"),
      ...STREET_COMMON,
    ],
  },
  {
    id: "organic",
    generator: "streets",
    label: "organic / unplanned city (Rome, São Paulo, Charlotte)",
    bands: [ref("orientationOrder", 0, 0.1, "organic cities have near-uniform bearings", "boeing2019"), ref("landInBlocksShare", 0.64, 0.7, "land left in blocks", "unhabitat2013"), ...STREET_COMMON],
  },
  {
    id: "suburban",
    generator: "streets",
    label: "suburb (loops and cul-de-sacs)",
    bands: [
      ref("intersectionsPerKm2", 20, 50, "suburban intersection density", "boeing2017"),
      ref("detourRatio", 1.1, 1.3, "network over straight-line distance", "levinson2009"),
      ref("arterialShare", 0.1, 0.25, "urban arterial share of length", "fhwa2013"),
      target("levelFlipRate", undefined, 0.05, "arterials keep their level through junctions (WS-B)"),
      target("keptLengthShare", 0.99, undefined, "no street length dropped by a cap (WS-B)"),
    ],
  },
  {
    id: "rural",
    generator: "streets",
    label: "rural section-road grid",
    bands: [ref("roadKmPerKm2", 0.8, 2.5, "section roads every 1.6 km ≈ 1.25 km/km²", "plss"), target("keptLengthShare", 0.99, undefined, "no street length dropped by a cap (WS-B)")],
  },
  {
    id: "loop",
    generator: "streets",
    label: "single closed loop (the street generator's circuit end)",
    bands: [target("keptLengthShare", 0.99, undefined, "no street length dropped by a cap (WS-B)")],
  },
  {
    id: "dense-core",
    generator: "city",
    label: "dense downtown core (Midtown Manhattan)",
    bands: [
      ref("far", 10, 15, "Midtown FAR", "nyczr"),
      ref("coverage", 0.6, 0.8, "Midtown building coverage", "genaudit2026"),
      target("far", 6, undefined, "Manhattan preset FAR (WS-F)"),
      target("coverage", 0.5, undefined, "Manhattan preset coverage (WS-F)"),
      ...CITY_COMMON,
    ],
  },
  { id: "urban", generator: "city", label: "mixed urban district", bands: CITY_COMMON },
  {
    id: "sprawl",
    generator: "city",
    label: "low-rise sprawl (Los Angeles)",
    bands: [ref("coverage", 0.3, 0.4, "LA building coverage (audit estimate)", "genaudit2026"), ...CITY_COMMON],
  },
  {
    id: "suburban-city",
    generator: "city",
    label: "estate suburb (Beverly Hills)",
    bands: CITY_COMMON.filter((band) => band.metric !== "pavementShare" && band.metric !== "landInBlocksShare"),
  },
  {
    id: "rural-city",
    generator: "city",
    label: "rural farmland (section roads)",
    bands: [ref("roadKmPerKm2", 0.8, 2.5, "section roads every 1.6 km", "plss"), target("minTemplatesPerClass", 5, undefined, "massing templates per building class (WS-F)")],
  },
  {
    id: "roads-only",
    generator: "city",
    label: "a road district with no building fabric (circuit, rally stage)",
    bands: [target("buildingsOnRoad", undefined, 0, "no building on a carriageway"), target("keptLengthShare", 0.99, undefined, "no street length dropped by a cap (WS-B)")],
  },
  {
    id: "circuit",
    generator: "circuit",
    label: "purpose-built closed circuit",
    bands: [
      ...CIRCUIT_COMMON,
      target("cornersPerKm", 3, 6, "corner density (WS-D)"),
      target("radiusP10", undefined, 15, "a real hairpin or tight corner (WS-D)"),
      target("radiusP90", 120, undefined, "real fast sweepers (WS-D)"),
      target("straightsOver400", 2, undefined, "two long straights (WS-D)"),
      ref("lengthM", 3500, 7000, "FIA Grade 1 lap length", "fia-app-o"),
    ],
  },
  {
    id: "street-race",
    generator: "circuit",
    label: "street race through city blocks (Monaco, Baku, Singapore)",
    bands: [...CIRCUIT_COMMON, ref("cornersPerKm", 3.3, 5.7, "Baku (3.3) to Monaco (5.7)", "f1circuits"), target("rightAngleShare", undefined, 0.6, "not every corner a 90° block corner (WS-E)")],
  },
];

/** Generator → preset id → profile id. A preset missing here is judged by the generator's `*` entry. */
export const GENERATOR_PRESET_PROFILES: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  streets: { "*": "grid", net: "grid", grid: "grid", organic: "organic", radial: "organic", suburban: "suburban", rural: "rural", circuit: "loop" },
  city: { "*": "urban", default: "urban", manhattan: "dense-core", metropolis: "urban", losangeles: "sprawl", beverlyhills: "suburban-city", ruralohio: "rural-city", rally: "roads-only", circuit: "roads-only" },
  circuit: { "*": "circuit", circuit: "circuit", "street-race": "street-race", city: "street-race" },
};

/** The profile a generator's preset is judged against. */
export function referenceProfileFor(generator: ReferenceGenerator, preset: string): ReferenceProfile | undefined {
  const map = GENERATOR_PRESET_PROFILES[generator] ?? {};
  const id = map[preset] ?? map["*"];
  return GENERATOR_REFERENCE_PROFILES.find((profile) => profile.id === id && profile.generator === generator);
}

/** Read a dotted metric path off a metrics object; `undefined` when absent or not a number. */
export function metricValue(metrics: unknown, path: string): number | undefined {
  let cur: unknown = metrics;
  for (const key of path.split(".")) {
    if (cur === null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[key];
  }
  return typeof cur === "number" ? cur : undefined;
}

export type BandVerdict = "in" | "low" | "high" | "missing";

export interface BandJudgement {
  band: ReferenceBand;
  value: number | undefined;
  verdict: BandVerdict;
}

/**
 * Judge one metrics object against bands: in range, below, above, or missing (absent or NaN).
 * @capability generator-metrics measure generated street nets, city districts and race laps against cited reference bands; `bun run gen-audit` renders and tables them
 */
export function judgeBands(metrics: unknown, bands: readonly ReferenceBand[]): BandJudgement[] {
  return bands.map((band) => {
    const value = metricValue(metrics, band.metric);
    if (value === undefined || Number.isNaN(value)) return { band, value, verdict: "missing" };
    if (band.min !== undefined && value < band.min) return { band, value, verdict: "low" };
    if (band.max !== undefined && value > band.max) return { band, value, verdict: "high" };
    return { band, value, verdict: "in" };
  });
}

/** `"10–25"`, `"≥ 5"`, `"≤ 0.05"` for a band's range. */
export function formatBand(band: ReferenceBand): string {
  if (band.min !== undefined && band.max !== undefined) return `${band.min}–${band.max}`;
  if (band.min !== undefined) return `≥ ${band.min}`;
  if (band.max !== undefined) return `≤ ${band.max}`;
  return "any";
}
