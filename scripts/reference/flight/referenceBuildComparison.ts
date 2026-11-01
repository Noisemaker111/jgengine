// @skill jgengine-world
import { aircraftFromReference } from "@jgengine/core/flight/aircraftReferences";
import { compareFlight, referenceBuilds, type ComparisonTable } from "./flightComparison";
import { compareJetEngines } from "./jetEngineComparison";
import { compareRocketAscent } from "./rocketComparison";
import { compareRotorcraft } from "./rotorcraftComparison";

/** Rotor ratios may drift 15% from the blade-element reference; every other metric 10%. */
export const ROTOR_BUILD_TOLERANCE = 0.15;
/** Jet thrust, lapse, afterburner and spool may drift 10% from the F100 cycle. */
export const JET_BUILD_TOLERANCE = 0.1;
/** Rocket altitude, velocity and max q at the reference event times may drift 10%. */
export const ROCKET_BUILD_TOLERANCE = 0.1;

/**
 * Flies the runtime's own reference airframes (`aircraftFromReference` with every effect at 1) against the reference
 * sims they reproduce: the Cessna 172N and F-16 through the flight tests, the F-16's engine against the F100 cycle,
 * the Bo-105's rotor against the blade-element rotor and the Saturn V's ascent against the reference rocket. Every row
 * carries its tolerance and whether it is inside it.
 * @capability flight-comparison check the runtime's reference aircraft against the reference sims, with tolerances
 */
export function compareReferenceBuilds(): ComparisonTable[] {
  return [
    ...compareFlight(referenceBuilds()),
    ...compareJetEngines([{ name: "F-16 (aircraftFromReference)", tuning: aircraftFromReference("f-16"), tolerance: JET_BUILD_TOLERANCE }]),
    ...compareRotorcraft([{ name: "Bo-105 (aircraftFromReference)", tuning: aircraftFromReference("bo-105"), tolerance: ROTOR_BUILD_TOLERANCE }]),
    compareRocketAscent(aircraftFromReference("saturn-v"), "Saturn V S-IC (aircraftFromReference)", ROCKET_BUILD_TOLERANCE),
  ];
}

/**
 * The rows of a set of tables that are outside their tolerance, as `aircraft: metric` lines.
 * @capability flight-comparison list the comparison rows outside their tolerance
 */
export function failingRows(tables: readonly ComparisonTable[]): string[] {
  return tables.flatMap((table) => table.rows.filter((row) => row.pass === false).map((row) => `${table.aircraft}: ${row.label}`));
}
