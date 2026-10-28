// @skill jgengine-world
import type { RigidAircraftTuning } from "../aircraftDynamics";
import { createCessna172Model } from "./cessna172Aircraft";
import { createF16Model } from "./f16Aircraft";
import { referenceFlightSubject, rigidAircraftFlightSubject, runFlightTests, type FlightTestReport } from "./flightTests";

const KNOT = 0.514444;
const FOOT = 0.3048;

/** A game aircraft to fly against the reference: its tuning and a comfortable cruise speed, m/s. */
export interface FlightComparisonAircraft {
  name: string;
  tuning: RigidAircraftTuning;
  cruiseSpeed: number;
}

/** Published figures for a real aircraft, SI units, for the metrics a source gives. */
export type PublishedFlightFigures = Partial<Record<keyof FlightTestReport, number>>;

/** One metric of one comparison, SI units; `real` is absent where nothing is published. */
export interface FlightComparisonRow {
  metric: keyof FlightTestReport;
  label: string;
  unit: string;
  game: number;
  reference: number;
  real: number | undefined;
}

/** A game aircraft's flight-test results beside its reference aircraft's and the real aircraft's. */
export interface FlightComparison {
  aircraft: string;
  reference: string;
  rows: readonly FlightComparisonRow[];
}

/**
 * Cessna 172N figures from its Pilot's Operating Handbook (1978) at 2300 lb, sea level, standard day: stall 50 KCAS
 * flaps up, top speed 125 KTAS, climb 770 ft/min at 73 KIAS, take-off ground roll 805 ft (the chart is flaps 10°).
 */
export const CESSNA_172N_PUBLISHED: PublishedFlightFigures = {
  stallSpeed: 50 * KNOT,
  maxLevelSpeed: 125 * KNOT,
  maxClimbRate: (770 * FOOT) / 60,
  bestClimbSpeed: 73 * KNOT,
  takeoffGroundRoll: 805 * FOOT,
};

const METRICS: readonly { metric: keyof FlightTestReport; label: string; unit: string }[] = [
  { metric: "stallSpeed", label: "stall speed", unit: "m/s EAS" },
  { metric: "maxLevelSpeed", label: "top speed", unit: "m/s TAS" },
  { metric: "maxClimbRate", label: "best climb rate", unit: "m/s" },
  { metric: "bestClimbSpeed", label: "best climb speed", unit: "m/s EAS" },
  { metric: "rollRate", label: "roll rate", unit: "deg/s" },
  { metric: "sustainedTurnRate", label: "sustained turn", unit: "deg/s" },
  { metric: "sustainedTurnSpeed", label: "sustained turn speed", unit: "m/s EAS" },
  { metric: "takeoffGroundRoll", label: "take-off roll", unit: "m" },
];

interface ReferenceEntry {
  name: string;
  report: FlightTestReport;
  real: PublishedFlightFigures;
}

/**
 * Flies each game aircraft and its nearest reference (the Cessna 172 below 5 t, the F-16 at 30% chord above) through
 * the same {@link runFlightTests} scenarios and lines the results up beside the published figures, so a game model's
 * drift from real flight is a number. The game aircraft fly with their own assists, as players fly them.
 * @capability flight-comparison compare a game aircraft's flight tests with a reference aircraft and published figures
 */
export function compareFlight(aircraft: readonly FlightComparisonAircraft[]): FlightComparison[] {
  let light: ReferenceEntry | undefined;
  let jet: ReferenceEntry | undefined;
  const referenceFor = (massKg: number): ReferenceEntry => {
    if (massKg < 5000) {
      light ??= { name: "Cessna 172N", report: runFlightTests(referenceFlightSubject(createCessna172Model(), 55)), real: CESSNA_172N_PUBLISHED };
      return light;
    }
    jet ??= { name: "F-16 (xcg 0.30)", report: runFlightTests(referenceFlightSubject(createF16Model({ xcg: 0.3 }), 150)), real: {} };
    return jet;
  };
  return aircraft.map((entry) => {
    const reference = referenceFor(entry.tuning.massKg);
    const game = runFlightTests(rigidAircraftFlightSubject(entry.name, entry.tuning, entry.cruiseSpeed));
    return {
      aircraft: entry.name,
      reference: reference.name,
      rows: METRICS.map(({ metric, label, unit }) => ({ metric, label, unit, game: game[metric], reference: reference.report[metric], real: reference.real[metric] })),
    };
  });
}

function figure(value: number | undefined): string {
  if (value === undefined || !Number.isFinite(value)) return "—";
  return Math.abs(value) >= 100 ? value.toFixed(0) : value.toFixed(1);
}

function delta(value: number | undefined, base: number | undefined): string {
  if (value === undefined || base === undefined || !Number.isFinite(value) || !Number.isFinite(base) || base === 0) return "—";
  const percent = ((value - base) / Math.abs(base)) * 100;
  return `${percent >= 0 ? "+" : ""}${percent.toFixed(0)}%`;
}

/**
 * Renders comparisons as a plain-text table per aircraft: game, reference and real values with the deltas between them.
 * @capability flight-comparison plain-text game / reference / real table
 */
export function formatFlightComparison(comparisons: readonly FlightComparison[]): string {
  const blocks = comparisons.map((comparison) => {
    const header = ["metric", "unit", "game", "reference", "real", "game vs ref", "ref vs real"];
    const lines = comparison.rows.map((row) => [row.label, row.unit, figure(row.game), figure(row.reference), figure(row.real), delta(row.game, row.reference), delta(row.reference, row.real)]);
    const widths = header.map((title, column) => Math.max(title.length, ...lines.map((line) => (line[column] ?? "").length)));
    const render = (cells: readonly string[]) => cells.map((cell, column) => (column < 2 ? cell.padEnd(widths[column] ?? 0) : cell.padStart(widths[column] ?? 0))).join("  ");
    return [`${comparison.aircraft} vs ${comparison.reference}`, render(header), ...lines.map(render)].join("\n");
  });
  return blocks.join("\n\n");
}
