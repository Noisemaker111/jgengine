// @skill jgengine-world
import { createRigidAircraft, type RigidAircraftTuning } from "../aircraftDynamics";
import { BO105_DESIGN, BO105_FORWARD_FLIGHT_DATA, BO105_HOVER_DATA, BO105_MAIN_ROTOR, BO105_TUNNEL_AIR, createBo105Model } from "./bo105Helicopter";
import { trimHelicopter } from "./helicopter";
import { createRotorLoads, evaluateRotor, rotorStateCount, settleRotor, solveNewton, trimIsolatedRotor } from "./helicopterRotor";
import { createReferenceAircraft, type ReferencePilotInput } from "./referenceAircraft";

const GRAVITY = 9.80665;
const DENSITY = 1.225;
const DEG = Math.PI / 180;

/** A game rotorcraft to measure: its tuning, with a `rotor` block. */
export interface RotorcraftComparisonAircraft {
  name: string;
  tuning: RigidAircraftTuning;
}

/** One metric: the game rotor, the Bo-105 reference and the NASA wind-tunnel figure; `real` is absent where none exists. */
export interface RotorcraftComparisonRow {
  label: string;
  unit: string;
  game: number;
  reference: number;
  real: number | undefined;
}

/** A game rotor's metrics beside the Bo-105 reference helicopter's and the measured Bo-105 rotor's. */
export interface RotorcraftComparison {
  aircraft: string;
  reference: string;
  rows: readonly RotorcraftComparisonRow[];
}

const ENGINE_CUT_SECONDS = 5;

interface GameRotor {
  thrust: number;
  torque: number;
}

/** The game rotor's thrust and torque at its hover collective, rotor speed 1, flying at `velocity` (world, y up). */
function gameRotor(tuning: RigidAircraftTuning, velocity: readonly [number, number, number], hubHeight = 1000): GameRotor {
  const rotor = tuning.rotor;
  if (rotor === undefined) return { thrust: Number.NaN, torque: Number.NaN };
  const hubAbove = rotor.at?.[1] ?? 1.5;
  const aircraft = createRigidAircraft(tuning, { position: [0, hubHeight - hubAbove, 0], velocity: [velocity[0], velocity[1], velocity[2]], airDensity: () => DENSITY });
  aircraft.restore({ ...aircraft.snapshot(), rotorSpeed: 1 });
  const collective = (tuning.massKg * GRAVITY) / rotor.maxThrust;
  const step = aircraft.tick(1e-3, { throttle: 1, pitch: 0, roll: 0, yaw: 0, collective });
  return { thrust: step.rotor?.thrust ?? Number.NaN, torque: step.rotor?.torque ?? Number.NaN };
}

function gameEngineCut(tuning: RigidAircraftTuning): number {
  const aircraft = createRigidAircraft(tuning, { position: [0, 1000, 0], velocity: [0, 0, 35], airDensity: () => DENSITY });
  aircraft.restore({ ...aircraft.snapshot(), rotorSpeed: 1 });
  const collective = tuning.rotor === undefined ? 0 : (tuning.massKg * GRAVITY) / tuning.rotor.maxThrust;
  let speed = Number.NaN;
  for (let time = 0; time < ENGINE_CUT_SECONDS; time += 0.02) speed = aircraft.tick(0.02, { throttle: 0, pitch: 0, roll: 0, yaw: 0, collective }).rotor?.speed ?? Number.NaN;
  return speed;
}

function gameColumn(tuning: RigidAircraftTuning): number[] {
  const rotor = tuning.rotor;
  if (rotor === undefined) return [];
  const weight = tuning.massKg * GRAVITY;
  const induced = Math.sqrt(weight / (2 * DENSITY * Math.PI * rotor.radius ** 2));
  const hover = gameRotor(tuning, [0, 0, 0]);
  return [
    gameRotor(tuning, [0, induced, 0]).thrust / hover.thrust,
    gameRotor(tuning, [0, -induced, 0]).thrust / hover.thrust,
    gameRotor(tuning, [0, 0, 2 * induced]).thrust / hover.thrust,
    gameRotor(tuning, [0, 0, 0], rotor.radius / 2).thrust / hover.thrust,
    (100 * Math.abs(hover.torque)) / (hover.thrust * rotor.radius),
    Number.NaN,
    gameEngineCut(tuning),
  ];
}

/** The Bo-105 main rotor at sea level and rated speed, controls fixed, flapping and inflow settled. */
function bo105Rotor(w: number, u: number, collective: number, height = Number.POSITIVE_INFINITY): GameRotor & { power: number } {
  const flow = { u, v: 0, w, p: 0, q: 0, density: DENSITY, speedOfSound: 340.294, height };
  const pitch = { collective, cosine: 0, sine: 0 };
  const state = new Array<number>(rotorStateCount(BO105_MAIN_ROTOR)).fill(0);
  settleRotor(BO105_MAIN_ROTOR, flow, pitch, BO105_MAIN_ROTOR.speed, state);
  const loads = createRotorLoads(BO105_MAIN_ROTOR);
  evaluateRotor(BO105_MAIN_ROTOR, flow, pitch, BO105_MAIN_ROTOR.speed, state, loads);
  return { thrust: loads.thrust, torque: loads.torque, power: loads.power };
}

function referenceEngineCut(): number {
  const model = createBo105Model();
  const trim = trimHelicopter(createReferenceAircraft(model, { groundElevation: () => -1e5 }), model, { speed: 35, altitude: 1000 });
  const failed = createReferenceAircraft(createBo105Model({ enginePower: 0 }), { groundElevation: () => -1e5 });
  failed.restore(trim.state);
  let sample = failed.sample();
  const input: ReferencePilotInput = { throttle: 0.1, pitch: 0, roll: 0, yaw: 0 };
  // A pilot lowers the collective after a one-second reaction and holds the trim attitude.
  for (let time = 0; time < ENGINE_CUT_SECONDS; time += 0.02) {
    input.throttle = time < 1 ? trim.collective : 0.1;
    input.pitch = Math.max(-1, Math.min(1, 2.5 * (trim.pitch - sample.pitch) - 0.8 * sample.q));
    input.roll = Math.max(-1, Math.min(1, 2.5 * (trim.bank - sample.bank) - 0.5 * sample.p));
    input.yaw = Math.max(-1, Math.min(1, -2 * sample.r));
    sample = failed.step(0.02, input);
  }
  return sample.rpm / ((BO105_MAIN_ROTOR.speed * 30) / Math.PI);
}

let column: readonly Omit<RotorcraftComparisonRow, "game">[] | undefined;

function referenceColumn(): readonly Omit<RotorcraftComparisonRow, "game">[] {
  if (column !== undefined) return column;
  const weight = BO105_DESIGN.mass.massKg * GRAVITY;
  const induced = Math.sqrt(weight / (2 * DENSITY * Math.PI * BO105_MAIN_ROTOR.radius ** 2));
  const collectiveFor = (w: number, u: number) => solveNewton((x) => [(bo105Rotor(w, u, x[0] ?? 0).thrust - weight) / weight], [7 * DEG]).x[0] ?? 0;
  const hoverCollective = collectiveFor(0, 0);
  const hover = bo105Rotor(0, 0, hoverCollective);
  const hoverData = BO105_HOVER_DATA[6];
  const cruiseData = BO105_FORWARD_FLIGHT_DATA[1];
  const tunnel = { thrustOverSolidity: 0.07, speedOfSound: BO105_TUNNEL_AIR.speedOfSound };
  const tunnelHover = trimIsolatedRotor(BO105_MAIN_ROTOR, { ...tunnel, advanceRatio: 0, shaftAngle: 0, density: BO105_TUNNEL_AIR.hoverDensity });
  const tunnelCruise = trimIsolatedRotor(BO105_MAIN_ROTOR, { ...tunnel, advanceRatio: cruiseData?.advanceRatio ?? 0.15, shaftAngle: cruiseData?.shaftAngle ?? 0, density: BO105_TUNNEL_AIR.forwardDensity });
  column = [
    { label: "thrust climbing at v_h, fixed collective / hover", unit: "ratio", reference: bo105Rotor(-induced, 0, hoverCollective).thrust / weight, real: undefined },
    { label: "thrust descending at v_h, fixed collective / hover", unit: "ratio", reference: bo105Rotor(induced, 0, hoverCollective).thrust / weight, real: undefined },
    { label: "thrust edgewise at 2 v_h, fixed collective / hover", unit: "ratio", reference: bo105Rotor(0, 2 * induced, hoverCollective).thrust / weight, real: undefined },
    { label: "thrust in ground effect at R/2, fixed collective / hover", unit: "ratio", reference: bo105Rotor(0, 0, hoverCollective, BO105_MAIN_ROTOR.radius / 2).thrust / weight, real: undefined },
    { label: "hover torque / (thrust × radius)", unit: "%", reference: (100 * hover.torque) / (weight * BO105_MAIN_ROTOR.radius), real: hoverData === undefined ? undefined : (100 * hoverData.power) / hoverData.thrust },
    // TM-110356: CP/σ at μ 0.15 (CT/σ 0.07, flight-matched shaft angle carrying the airframe drag) over hover CP/σ.
    { label: "rotor power at μ 0.15 / hover", unit: "ratio", reference: tunnelCruise.powerOverSolidity / tunnelHover.powerOverSolidity, real: hoverData === undefined || cruiseData === undefined ? undefined : cruiseData.power / hoverData.power },
    { label: `rotor speed ${ENGINE_CUT_SECONDS} s after an engine cut at 35 m/s`, unit: "share", reference: referenceEngineCut(), real: undefined },
  ];
  return column;
}

/**
 * Measures each game rotor (an {@link RigidAircraftTuning} `rotor` block) against the Bo-105 reference helicopter at
 * the same normalised conditions: thrust at fixed collective climbing, descending, edgewise and in ground effect (all
 * over hover thrust, speeds in hover induced velocities `v_h`), hover torque over thrust × radius, forward-flight power
 * and rotor speed after an engine failure. Real values are the NASA TM-110356 Bo-105 full-scale rotor data. The game
 * rotor has no power, so its power row is blank, and its rotor speed follows the throttle, so it cannot autorotate.
 * @capability flight-comparison compare a game helicopter rotor's thrust, torque and autorotation with a blade-element reference
 */
export function compareRotorcraft(aircraft: readonly RotorcraftComparisonAircraft[]): RotorcraftComparison[] {
  const rotorcraft = aircraft.filter((entry) => entry.tuning.rotor !== undefined);
  if (rotorcraft.length === 0) return [];
  const reference = referenceColumn();
  return rotorcraft.map((entry) => {
    const game = gameColumn(entry.tuning);
    return { aircraft: entry.name, reference: "Bo-105 blade-element rotor", rows: reference.map((row, index) => ({ ...row, game: game[index] ?? Number.NaN })) };
  });
}
