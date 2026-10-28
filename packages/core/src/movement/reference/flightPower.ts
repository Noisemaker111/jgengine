// home-ok: animal flight is a locomotion reference beside walking and running; flight/ holds aircraft
import type { HumanValidationRow } from "./humanReferenceValidation";

/** A flapping flier's size and drag for the power curve. */
export interface FlierBody {
  /** All-up mass, kg. */
  mass: number;
  /** Wing span, m. */
  span: number;
  /** Wing area, m². */
  wingArea: number;
  /** Body drag coefficient on the frontal area (default 0.10). */
  bodyDragCoefficient?: number;
  /** Induced power factor (default {@link INDUCED_POWER_FACTOR}). */
  inducedPowerFactor?: number;
  /** Passerines have a higher basal metabolism (default false). */
  passerine?: boolean;
}

/**
 * Induced power factor of a flapping bird: 0.9, revised down from the classic 1.2 to match ornithodolite airspeeds
 * of 31 species (C. J. Pennycuick, S. Åkesson and A. Hedenström, "Air speeds of migrating birds observed by
 * ornithodolite and compared with predictions from flight theory", *J. R. Soc. Interface* 10, 20130419, 2013).
 */
export const INDUCED_POWER_FACTOR = 0.9;

/** Sea-level air density, kg/m³. */
export const SEA_LEVEL_AIR_DENSITY = 1.225;

const G = 9.81;
const PROFILE_CONSTANT = 8.4;
const MUSCLE_EFFICIENCY = 0.23;
const RESPIRATION_FACTOR = 1.1;

/**
 * Body frontal area of a bird, m²: `0.00813·m^0.666` (C. J. Pennycuick, M. R. Fuller and H. H. Obrecht, *J. Exp.
 * Biol.* 135, 1988).
 */
function bodyFrontalArea(mass: number): number {
  return 0.00813 * mass ** 0.666;
}

/** The parts of a flier's power at one airspeed, W. */
export interface FlightPower {
  induced: number;
  parasite: number;
  profile: number;
  /** Induced + parasite + profile. */
  mechanical: number;
  /** Fuel burned: `1.1·(mechanical/0.23 + basal)`. */
  chemical: number;
}

const inducedTerm = (b: FlierBody, rho: number) => (2 * (b.inducedPowerFactor ?? INDUCED_POWER_FACTOR) * (b.mass * G) ** 2) / (Math.PI * b.span * b.span * rho);
const parasiteTerm = (b: FlierBody, rho: number) => (rho * bodyFrontalArea(b.mass) * (b.bodyDragCoefficient ?? 0.1)) / 2;

/**
 * Minimum-power speed, m/s: where induced power `2k(mg)²/(πb²ρV)` and parasite power `ρV³·Sb·Cdb/2` sum least,
 * `(4/3π)^¼·k^¼·(mg)^½ / ((bρ)^½·(Sb·Cdb)^¼)` (C. J. Pennycuick, *Modelling the Flying Bird*, 2008; eq. 4.1 of
 * Pennycuick et al. 2013).
 * @capability flight-minimum-power-speed the airspeed where a flapping flier spends least power (Pennycuick)
 */
export function minimumPowerSpeed(body: FlierBody, airDensity = SEA_LEVEL_AIR_DENSITY): number {
  return (inducedTerm(body, airDensity) / (3 * parasiteTerm(body, airDensity))) ** 0.25;
}

/**
 * Basal metabolic rate of a bird, W: `3.79·m^0.723`, or `6.25·m^0.724` for a passerine (as used by Pennycuick's
 * Flight program).
 */
function birdBasalMetabolism(mass: number, passerine = false): number {
  return passerine ? 6.25 * mass ** 0.724 : 3.79 * mass ** 0.723;
}

/**
 * Mechanical and chemical power of steady level flapping flight at `speed` (m/s), Pennycuick's model (2008): induced
 * and parasite power as in {@link minimumPowerSpeed}, profile power constant with speed at `8.4/AR` times the
 * absolute minimum of the other two, and chemical power at 23% muscle efficiency plus basal metabolism, times 1.1 for
 * heart and lungs.
 * @capability flight-power-curve power a flapping bird, bat or pterosaur needs to fly level at an airspeed
 */
export function flightPower(body: FlierBody, speed: number, airDensity = SEA_LEVEL_AIR_DENSITY): FlightPower {
  const a = inducedTerm(body, airDensity);
  const p = parasiteTerm(body, airDensity);
  const vmp = minimumPowerSpeed(body, airDensity);
  const absoluteMinimum = a / vmp + p * vmp ** 3;
  const induced = a / speed;
  const parasite = p * speed ** 3;
  const profile = (PROFILE_CONSTANT * body.wingArea * absoluteMinimum) / (body.span * body.span);
  const mechanical = induced + parasite + profile;
  return { induced, parasite, profile, mechanical, chemical: RESPIRATION_FACTOR * (mechanical / MUSCLE_EFFICIENCY + birdBasalMetabolism(body.mass, body.passerine === true)) };
}

/**
 * Maximum-range speed, m/s: the airspeed that covers most distance per fuel, where `speed / chemical power` peaks,
 * found by golden-section search above the minimum-power speed.
 * @capability flight-maximum-range-speed the airspeed that carries a flapping flier furthest on its fuel
 */
export function maximumRangeSpeed(body: FlierBody, airDensity = SEA_LEVEL_AIR_DENSITY): number {
  const range = (v: number) => -v / flightPower(body, v, airDensity).chemical;
  let lo = minimumPowerSpeed(body, airDensity);
  let hi = 4 * lo;
  const r = (Math.sqrt(5) - 1) / 2;
  let c = hi - r * (hi - lo);
  let d = lo + r * (hi - lo);
  for (let i = 0; i < 80; i++) {
    if (range(c) < range(d)) hi = d;
    else lo = c;
    c = hi - r * (hi - lo);
    d = lo + r * (hi - lo);
  }
  return (lo + hi) / 2;
}

/**
 * Wingbeat frequency in steady cruising flight, Hz: `m^⅜·g^½·b^(−23/24)·S^(−⅓)·ρ^(−⅜)` (C. J. Pennycuick, "Wingbeat
 * frequency of birds in steady cruising flight: new data and improved predictions", *J. Exp. Biol.* 199, 1996).
 * @capability bird-wingbeat-frequency cruising wingbeat frequency of a bird, bat or pterosaur from mass, span and wing area
 */
export function cruisingWingbeatFrequency(body: FlierBody, airDensity = SEA_LEVEL_AIR_DENSITY): number {
  return body.mass ** 0.375 * Math.sqrt(G) * body.span ** (-23 / 24) * body.wingArea ** (-1 / 3) * airDensity ** -0.375;
}

/**
 * Wingbeat frequency across insects, birds and bats, Hz: `0.88·√m / A` with all wings' area `A` (J. H. Jensen,
 * J. C. Dyre and T. Hecksher, "Universal wing- and fin-beat frequency scaling", *PLoS ONE* 19, e0303834, 2024).
 * Coarser than {@link cruisingWingbeatFrequency} for birds; the one law here that covers insects.
 * @capability insect-wingbeat-frequency wingbeat frequency of an insect or any flier from its mass and wing area
 */
export function universalWingbeatFrequency(mass: number, wingArea: number): number {
  return (0.88 * Math.sqrt(mass)) / wingArea;
}

/**
 * Heaviest bird that can sustain flapping, kg: 41 (26–75), where the highest wingbeat frequency its flight muscles
 * reach (`6.1·m^−0.30` Hz) meets the frequency cruising needs (`3.9·m^−0.18` Hz), measured on seabirds of 0.6–9.4 kg
 * (K. Sato et al., "Scaling of soaring seabirds and implications for flight abilities of giant pterosaurs", *PLoS ONE*
 * 4, e5400, 2009). Heavier fliers must soar.
 */
export const FLAPPING_MASS_LIMIT = 41;

/** Published sizes of extinct and living fliers, for scoring game creatures. */
export const PUBLISHED_FLIERS: Record<"argentavis" | "pteranodon" | "quetzalcoatlus" | "wanderingAlbatross", { animal: string; body: FlierBody; source: string }> = {
  argentavis: { animal: "Argentavis magnificens", body: { mass: 70, span: 7, wingArea: 8.11 }, source: "S. Chatterjee, R. J. Templin and K. E. Campbell, PNAS 104, 2007" },
  pteranodon: { animal: "Pteranodon", body: { mass: 16.6, span: 6.95, wingArea: 2.65 }, source: "Chatterjee & Templin 2004, as tabulated by M. P. Witton and M. B. Habib, PLoS ONE 5, e13982, 2010" },
  quetzalcoatlus: { animal: "Quetzalcoatlus", body: { mass: 259, span: 9.64, wingArea: 11.36 }, source: "Witton 2008, as tabulated by Witton & Habib 2010" },
  wanderingAlbatross: { animal: "Wandering albatross", body: { mass: 8.73, span: 3.03, wingArea: 0.61 }, source: "Witton & Habib 2010, table 1" },
};

/** One game flier against a real flier of published size. */
export interface FlierComparison {
  minimumPowerSpeed: number;
  maximumRangeSpeed: number;
  wingbeatFrequency: number;
  /** Power to fly at the minimum-power speed, W per kg. */
  minimumPower: number;
  /** False above {@link FLAPPING_MASS_LIMIT}: it would have to soar. */
  canSustainFlapping: boolean;
  /** Game speed over the minimum-power speed. */
  speedRatio: number;
}

/**
 * Compare a game flier's speed with a real flier of `body`'s size: its minimum-power and maximum-range speeds, cruise
 * wingbeat frequency, power and whether it could keep flapping.
 * @capability flier-compare score a game flier's speed against real flight mechanics for its mass and wings
 */
export function compareFlier(body: FlierBody, gameSpeed: number): FlierComparison {
  const vmp = minimumPowerSpeed(body);
  return {
    minimumPowerSpeed: vmp,
    maximumRangeSpeed: maximumRangeSpeed(body),
    wingbeatFrequency: cruisingWingbeatFrequency(body),
    minimumPower: flightPower(body, vmp).mechanical / body.mass,
    canSustainFlapping: body.mass <= FLAPPING_MASS_LIMIT,
    speedRatio: gameSpeed / vmp,
  };
}

/**
 * Ornithodolite airspeeds of migrating birds (Pennycuick et al. 2013, table 1): mass kg, span m, wing area m², mean
 * equivalent airspeed m/s, and the body drag coefficient the paper found for waders, whose bodies are cleaner than the
 * default 0.10.
 */
export const ORNITHODOLITE_AIRSPEEDS: readonly { bird: string; mass: number; span: number; wingArea: number; airspeed: number; bodyDragCoefficient?: number; passerine?: boolean }[] = [
  { bird: "Starling", mass: 0.085, span: 0.384, wingArea: 0.0251, airspeed: 15.4, passerine: true },
  { bird: "Pied wagtail", mass: 0.0195, span: 0.261, wingArea: 0.0127, airspeed: 13.3, passerine: true },
  { bird: "Kestrel", mass: 0.229, span: 0.771, wingArea: 0.0791, airspeed: 12.6 },
  { bird: "Goshawk", mass: 0.754, span: 1.05, wingArea: 0.177, airspeed: 16.1 },
  { bird: "White-tailed eagle", mass: 4, span: 2.19, wingArea: 0.713, airspeed: 14.4 },
  { bird: "Grey heron", mass: 1.21, span: 1.6, wingArea: 0.358, airspeed: 12.7 },
  { bird: "Mute swan", mass: 8.94, span: 2.3, wingArea: 0.683, airspeed: 17.5 },
  { bird: "Greylag goose", mass: 3.65, span: 1.6, wingArea: 0.333, airspeed: 19 },
  { bird: "White-fronted goose", mass: 2.45, span: 1.38, wingArea: 0.239, airspeed: 17.8 },
  { bird: "Barnacle goose", mass: 1.7, span: 1.34, wingArea: 0.213, airspeed: 17.4 },
  { bird: "Brent goose", mass: 1.38, span: 1.1, wingArea: 0.143, airspeed: 16.4 },
  { bird: "Mallard", mass: 1.14, span: 0.89, wingArea: 0.107, airspeed: 19.7 },
  { bird: "Teal", mass: 0.231, span: 0.597, wingArea: 0.0448, airspeed: 17.4 },
  { bird: "Wigeon", mass: 0.77, span: 0.822, wingArea: 0.0829, airspeed: 18.5 },
  { bird: "Long-tailed duck", mass: 0.636, span: 0.69, wingArea: 0.058, airspeed: 19.7 },
  { bird: "Eider", mass: 1.91, span: 0.978, wingArea: 0.131, airspeed: 19 },
  { bird: "Red-breasted merganser", mass: 0.908, span: 0.86, wingArea: 0.0767, airspeed: 20 },
  { bird: "Cormorant", mass: 2.56, span: 1.35, wingArea: 0.224, airspeed: 17.4 },
  { bird: "Red-throated diver", mass: 2.31, span: 1.15, wingArea: 0.128, airspeed: 20.6 },
  { bird: "Bar-tailed godwit", mass: 0.2, span: 0.748, wingArea: 0.0568, airspeed: 14.4 },
  { bird: "Red knot", mass: 0.118, span: 0.516, wingArea: 0.0293, airspeed: 16.1, bodyDragCoefficient: 0.078 },
  { bird: "Dunlin", mass: 0.0477, span: 0.346, wingArea: 0.0147, airspeed: 16.1, bodyDragCoefficient: 0.06 },
  { bird: "Ruff", mass: 0.0895, span: 0.472, wingArea: 0.0281, airspeed: 16.9, bodyDragCoefficient: 0.06 },
  { bird: "Ringed plover", mass: 0.0618, span: 0.384, wingArea: 0.0169, airspeed: 16, bodyDragCoefficient: 0.066 },
  { bird: "Grey plover", mass: 0.258, span: 0.63, wingArea: 0.0437, airspeed: 16.5 },
  { bird: "Oystercatcher", mass: 0.403, span: 0.852, wingArea: 0.0873, airspeed: 15.9 },
  { bird: "Common tern", mass: 0.131, span: 0.781, wingArea: 0.0507, airspeed: 11 },
  { bird: "Black-headed gull", mass: 0.282, span: 0.962, wingArea: 0.0982, airspeed: 11.4 },
  { bird: "Common gull", mass: 0.404, span: 1.1, wingArea: 0.138, airspeed: 12.9 },
  { bird: "Herring gull", mass: 0.705, span: 1.35, wingArea: 0.2, airspeed: 13.4 },
  { bird: "Lesser black-backed gull", mass: 0.818, span: 1.34, wingArea: 0.19, airspeed: 14.4 },
];

/**
 * Homopteran and other insects' mass kg, total wing area m² and wingbeat frequency Hz (D. N. Byrne, S. L. Buchmann
 * and H. G. Spangler, *J. Exp. Biol.* 135, 1988, as tabulated in Jensen et al. 2024, S1).
 */
export const INSECT_WINGBEATS: readonly [mass: number, wingArea: number, frequency: number][] = [
  [3.3e-8, 1.34e-6, 168.6], [3.5e-8, 1.65e-6, 180], [5e-8, 9.6e-7, 224.2], [1.14e-7, 1.03e-6, 123.4], [3.34e-7, 2.37e-6, 90.9],
  [4.11e-7, 5.26e-6, 104.7], [4.67e-7, 6.63e-6, 118.1], [7.02e-7, 1.106e-5, 81.1], [1.2e-6, 2e-5, 74], [1.5e-6, 3.7e-6, 480],
  [2e-6, 5.8e-6, 240], [2e-6, 5.8e-6, 195], [5.8e-6, 1.5e-5, 277], [9.9e-6, 1.69e-5, 262], [1e-5, 1.96e-5, 210],
  [1.2e-5, 2e-5, 190], [1.28e-5, 2.3e-5, 147], [1.93e-5, 2e-5, 308], [2e-5, 4.8e-5, 114],
];

const row = (metric: string, label: string, unit: string, reference: number, low: number, high: number, source: string): HumanValidationRow => ({
  metric,
  label,
  unit,
  reference,
  low,
  high,
  source,
  pass: reference >= low && reference <= high,
});

/**
 * Validate the flight reference: the mute swan's minimum-power speed against Pennycuick et al. 2013; every
 * ornithodolite airspeed between the model's minimum-power and maximum-range speeds, as flight theory has migrating
 * birds fly; cruising wingbeat frequency against Sato et al. 2009's seabird scaling and the wandering albatross; and
 * the universal wingbeat law against insects.
 * @capability flight-reference-validation check the flight reference against measured bird airspeeds and wingbeat frequencies
 */
export function validateFlightReference(): HumanValidationRow[] {
  const rows: HumanValidationRow[] = [];
  const swan = { mass: 8.94, span: 2.3, wingArea: 0.683 };
  rows.push(row("flight:swanVmp", "Mute swan minimum-power speed", "m/s", minimumPowerSpeed(swan), 17.7, 18.4, "Pennycuick et al. 2013 (17.5 m/s at 0.969 Vmp), ±2%"));
  let slowest = Number.POSITIVE_INFINITY;
  let fastest = 0;
  for (const b of ORNITHODOLITE_AIRSPEEDS) {
    const body = { mass: b.mass, span: b.span, wingArea: b.wingArea, ...(b.bodyDragCoefficient === undefined ? {} : { bodyDragCoefficient: b.bodyDragCoefficient }), ...(b.passerine === undefined ? {} : { passerine: b.passerine }) };
    slowest = Math.min(slowest, b.airspeed / minimumPowerSpeed(body));
    fastest = Math.max(fastest, b.airspeed / maximumRangeSpeed(body));
  }
  rows.push(row("flight:aboveVmp", "Slowest of 31 migrants' airspeeds over its minimum-power speed", "×", slowest, 0.95, 10, "Pennycuick et al. 2013, table 1 (no bird cruises below Vmp)"));
  rows.push(row("flight:belowVmr", "Fastest of 31 migrants' airspeeds over its maximum-range speed", "×", fastest, 0, 1.05, "Pennycuick et al. 2013, table 1 (none cruises above Vmr)"));
  for (const mass of [0.6, 2, 9.4]) {
    const body = { mass, span: 1.3 * mass ** 0.37, wingArea: 0.15 * mass ** 0.58 };
    const measured = 3.9 * mass ** -0.18;
    rows.push(row(`flight:wingbeat${mass}`, `Cruising wingbeat of a ${mass} kg seabird`, "Hz", cruisingWingbeatFrequency(body), Math.round(85 * measured) / 100, Math.round(115 * measured) / 100, "Sato et al. 2009 (3.9·m^−0.18), ±15%"));
  }
  rows.push(row("flight:albatross", "Wandering albatross cruising wingbeat", "Hz", cruisingWingbeatFrequency(PUBLISHED_FLIERS.wanderingAlbatross.body), 2.5, 2.7, "Sato et al. 2009 (2.5–2.7 Hz measured)"));
  const logRatio = INSECT_WINGBEATS.reduce((sum, [m, a, f]) => sum + Math.log(universalWingbeatFrequency(m, a) / f), 0) / INSECT_WINGBEATS.length;
  rows.push(row("flight:insects", "Insect wingbeats, model over measured (geometric mean of 19)", "×", Math.exp(logRatio), 0.8, 1.25, "Byrne et al. 1988 via Jensen et al. 2024, ±25%"));
  return rows;
}
