// @skill jgengine-world
import { createRigidAircraft, type RigidAircraftTuning } from "@jgengine/core/flight/aircraftDynamics";
import { f16CycleEngine, f16Thrust } from "./f16Aircraft";
import type { GasTurbineFlight } from "./gasTurbine";
import type { GasTurbineEngine, GasTurbineEngineOutput } from "./gasTurbineEngine";
import { F100_PW_220_PUBLISHED } from "./referenceEngines";
import { standardAtmosphere } from "./standardAtmosphere";

const FOOT = 0.3048;

/** A game jet to measure: its tuning and the thrust multiplier its afterburner applies, if it has one. */
export interface JetComparisonAircraft {
  name: string;
  tuning: RigidAircraftTuning;
  afterburner?: number;
}

/** One metric: the game jet, the F100 cycle engine and the published or NASA-table figure; `real` is absent where none exists. */
export interface JetComparisonRow {
  label: string;
  unit: string;
  game: number;
  reference: number;
  real: number | undefined;
}

/** A game jet's engine metrics beside the F100-PW-220 cycle engine's and the real engine's. */
export interface JetComparison {
  aircraft: string;
  reference: string;
  rows: readonly JetComparisonRow[];
}

const CONDITIONS: readonly { label: string; altitude: number; mach: number }[] = [
  { label: "dry thrust, sea level Mach 0.9 / static", altitude: 0, mach: 0.9 },
  { label: "dry thrust, 20 000 ft Mach 0.6 / static", altitude: 20000 * FOOT, mach: 0.6 },
  { label: "dry thrust, 40 000 ft Mach 0.9 / static", altitude: 40000 * FOOT, mach: 0.9 },
];

function flightAt(altitude: number, mach: number): GasTurbineFlight {
  const air = standardAtmosphere(altitude);
  return { mach, temperature: air.temperature, pressure: air.pressure };
}

/** Full-throttle thrust of the game model at a flight condition, its spool already settled. */
function gameThrust(tuning: RigidAircraftTuning, altitude: number, mach: number): number {
  const aircraft = createRigidAircraft(tuning, {
    position: [0, altitude, 0],
    velocity: [0, 0, mach * standardAtmosphere(altitude).speedOfSound],
    airDensity: (height) => standardAtmosphere(height).density,
  });
  aircraft.restore({ ...aircraft.snapshot(), spool: 1 });
  return aircraft.tick(1e-3, { throttle: 1, pitch: 0, roll: 0, yaw: 0 }).thrust;
}

/** Seconds the game model takes from idle to 90% of its full dry thrust, standing on the runway with the brakes on. */
function gameSpoolTime(tuning: RigidAircraftTuning): number {
  const aircraft = createRigidAircraft(tuning, { position: [0, tuning.gear?.height ?? 0, 0] });
  const full = tuning.engine?.maxThrust ?? 0;
  const dt = 0.005;
  for (let time = dt; time < 20; time += dt) {
    if (aircraft.tick(dt, { throttle: 1, pitch: 0, roll: 0, yaw: 0, brake: 1 }).thrust >= 0.9 * full) return time;
  }
  return Number.POSITIVE_INFINITY;
}

function referenceThrust(engine: GasTurbineEngine, flight: GasTurbineFlight, out: GasTurbineEngineOutput): number {
  const command = { dry: 1, afterburner: 0 };
  engine.evaluate(engine.steady(flight, command), command, flight, out);
  return out.thrust;
}

function referenceSpoolTime(engine: GasTurbineEngine, out: GasTurbineEngineOutput): number {
  const flight = flightAt(0, 0);
  const idleCommand = { dry: 0, afterburner: 0 };
  const command = { dry: 1, afterburner: 0 };
  const state = engine.steady(flight, idleCommand);
  engine.evaluate(state, idleCommand, flight, out);
  const idle = out.thrust;
  const full = referenceThrust(engine, flight, out);
  const dt = 0.0025;
  for (let time = 0; time < 20; time += dt) {
    engine.evaluate(state, command, flight, out);
    if ((out.thrust - idle) / (full - idle) >= 0.9) return time;
    for (let k = 0; k < 3; k += 1) state[k] = (state[k] ?? 0) + dt * (out.rates[k] ?? 0);
  }
  return Number.POSITIVE_INFINITY;
}

interface ReferenceColumn {
  rows: readonly Omit<JetComparisonRow, "game">[];
}

let column: ReferenceColumn | undefined;

function referenceColumn(): ReferenceColumn {
  if (column !== undefined) return column;
  const engine = f16CycleEngine();
  const out: GasTurbineEngineOutput = { thrust: 0, fuelFlow: 0, rates: [0, 0, 0], angularMomentum: 0, turbineInletTemperature: 0 };
  const sls = flightAt(0, 0);
  const military = referenceThrust(engine, sls, out);
  const tableMilitary = f16Thrust(50, 0, 0);
  const command = { dry: 1, afterburner: 1 };
  engine.evaluate(engine.steady(sls, command), command, sls, out);
  const afterburner = out.thrust;
  column = {
    rows: [
      { label: "dry thrust, sea level static", unit: "N", reference: military, real: tableMilitary },
      ...CONDITIONS.map(({ label, altitude, mach }) => ({
        label,
        unit: "ratio",
        reference: referenceThrust(engine, flightAt(altitude, mach), out) / military,
        real: f16Thrust(50, altitude, mach) / tableMilitary,
      })),
      { label: "afterburner / dry, sea level static", unit: "ratio", reference: afterburner / military, real: F100_PW_220_PUBLISHED.afterburnerThrust / F100_PW_220_PUBLISHED.militaryThrust },
      // Stevens & Lewis's F100 power lag (from the NASA TP-1538 model), stepped from idle to military: 3.9 s to 90%.
      { label: "idle to full dry, 90% thrust", unit: "s", reference: referenceSpoolTime(engine, out), real: 3.91 },
    ],
  };
  return column;
}

/**
 * Measures each game jet's engine against the F100-PW-220 cycle engine and real F100 figures: dry thrust, how it lapses
 * with altitude and Mach, the afterburner ratio and spool-up time. Real values are the NASA TP-1538 F-16 installed
 * thrust tables, the published F100 ratings and Stevens & Lewis's power lag. Game values come from ticking the game's
 * own `createRigidAircraft`, so a model whose thrust ignores air density and speed shows a ratio of 1 where the
 * real engine loses half its thrust.
 * @capability flight-comparison compare a game jet's thrust lapse, afterburner and spool time with a real engine cycle
 */
export function compareJetEngines(aircraft: readonly JetComparisonAircraft[]): JetComparison[] {
  const jets = aircraft.filter((entry) => entry.tuning.engine !== undefined && entry.tuning.massKg >= 5000);
  if (jets.length === 0) return [];
  const reference = referenceColumn();
  return jets.map((entry) => {
    const sls = gameThrust(entry.tuning, 0, 0);
    const game = [sls, ...CONDITIONS.map(({ altitude, mach }) => gameThrust(entry.tuning, altitude, mach) / sls), entry.afterburner ?? 1, gameSpoolTime(entry.tuning)];
    return {
      aircraft: entry.name,
      reference: "F100-PW-220 cycle (F-16)",
      rows: reference.rows.map((row, index) => ({ ...row, game: game[index] ?? Number.NaN })),
    };
  });
}
