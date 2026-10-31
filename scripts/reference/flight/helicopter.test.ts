import { describe, expect, test } from "bun:test";

import { BO105_DESIGN, BO105_FORWARD_FLIGHT_DATA, BO105_HOVER_DATA, BO105_MAIN_ROTOR, BO105_TUNNEL_AIR, createBo105Model } from "./bo105Helicopter";
import { trimHelicopter } from "./helicopter";
import { createRotorLoads, evaluateRotor, rotorStateCount, settleRotor, solveNewton, trimIsolatedRotor, type RotorDesign, type RotorFlow } from "./helicopterRotor";
import { createReferenceAircraft, type ReferencePilotInput } from "./referenceAircraft";
import { standardAtmosphere } from "./standardAtmosphere";

const DEG = Math.PI / 180;
const WEIGHT = BO105_DESIGN.mass.massKg * 9.80665;
const DISC = Math.PI * BO105_MAIN_ROTOR.radius ** 2;
const HOVER_INDUCED = Math.sqrt(WEIGHT / (2 * 1.225 * DISC));

function within(actual: number, expected: number, relative: number): void {
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(Math.abs(expected) * relative);
}

/** The Bo-105 main rotor at rated speed, sea level, controls fixed, steady flapping and inflow. */
function rotorAt(design: RotorDesign, w: number, collective: number, options: { u?: number; height?: number } = {}): { thrust: number; power: number; torque: number; inflow: number } {
  const flow: RotorFlow = { u: options.u ?? 0, v: 0, w, p: 0, q: 0, density: 1.225, speedOfSound: 340.294, height: options.height ?? Number.POSITIVE_INFINITY };
  const pitch = { collective, cosine: 0, sine: 0 };
  const state = new Array<number>(rotorStateCount(design)).fill(0);
  settleRotor(design, flow, pitch, design.speed, state);
  const loads = createRotorLoads(design);
  evaluateRotor(design, flow, pitch, design.speed, state, loads);
  const stations = design.stations ?? 10;
  let inflow = 0;
  let area = 0;
  for (let j = 0; j < stations; j += 1) {
    const r = design.rootCutout + ((j + 0.5) * (1 - design.rootCutout)) / stations;
    inflow += (state[8 + j] ?? 0) * r;
    area += r;
  }
  return { thrust: loads.thrust, power: loads.power, torque: loads.torque, inflow: (inflow / area) * design.speed * design.radius };
}

function collectiveFor(design: RotorDesign, w: number, thrust: number, options: { height?: number } = {}): number {
  return solveNewton((x) => [(rotorAt(design, w, x[0] ?? 0, options).thrust - thrust) / thrust], [7 * DEG]).x[0] ?? 0;
}

describe("blade-element rotor", () => {
  test("hover and climb power follow momentum theory with an ideal section and many blades", () => {
    const ideal: RotorDesign = { ...BO105_MAIN_ROTOR, blades: 400, chord: (BO105_MAIN_ROTOR.chord * 4) / 400, section: (alpha) => ({ cl: 2 * Math.PI * alpha, cd: 0 }) };
    const hover = rotorAt(ideal, 0, collectiveFor(ideal, 0, WEIGHT));
    const momentum = WEIGHT * HOVER_INDUCED;
    // Linear twist loads the disc unevenly, so induced power sits a little above the ideal (κ ≥ 1).
    expect(hover.power / momentum).toBeGreaterThanOrEqual(0.995);
    expect(hover.power / momentum).toBeLessThan(1.06);
    const climb = rotorAt(ideal, -HOVER_INDUCED, collectiveFor(ideal, -HOVER_INDUCED, WEIGHT));
    // Momentum theory: P = T·(Vc/2 + √((Vc/2)² + vh²)), so at Vc = vh the power is 1.618 of hover.
    within(climb.power / hover.power, 0.5 + Math.sqrt(1.25), 0.02);
  });

  test("Bo-105 full-scale hover power: NASA TM-110356 within 12% up to CT/σ = 0.1", () => {
    for (const point of BO105_HOVER_DATA) {
      const trim = trimIsolatedRotor(BO105_MAIN_ROTOR, { advanceRatio: point.advanceRatio, shaftAngle: -10 * DEG, thrustOverSolidity: point.thrust, density: BO105_TUNNEL_AIR.hoverDensity, speedOfSound: BO105_TUNNEL_AIR.speedOfSound });
      expect(trim.converged).toBe(true);
      // Model 0–11% low: annulus momentum has no wake contraction or swirl, and the tunnel hover had recirculation.
      within(trim.powerOverSolidity, point.power, 0.12);
    }
  });

  test("Bo-105 forward-flight power within 7% and longitudinal cyclic within 0.75° of the flight-matched wind-tunnel runs", () => {
    for (const point of BO105_FORWARD_FLIGHT_DATA) {
      const trim = trimIsolatedRotor(BO105_MAIN_ROTOR, { advanceRatio: point.advanceRatio, shaftAngle: point.shaftAngle, thrustOverSolidity: point.thrust, density: BO105_TUNNEL_AIR.forwardDensity, speedOfSound: BO105_TUNNEL_AIR.speedOfSound });
      expect(trim.converged).toBe(true);
      within(trim.powerOverSolidity, point.power, 0.07);
      expect(Math.abs(trim.sine - point.longitudinalCyclic)).toBeLessThan(0.75 * DEG);
    }
  });

  test("ground effect at half a radius raises constant-power thrust, less than Cheeseman–Bennett's ideal 1.33", () => {
    const collective = collectiveFor(BO105_MAIN_ROTOR, 0, WEIGHT);
    const power = rotorAt(BO105_MAIN_ROTOR, 0, collective).power;
    const height = BO105_MAIN_ROTOR.radius / 2;
    const raised = solveNewton((x) => [(rotorAt(BO105_MAIN_ROTOR, 0, x[0] ?? 0, { height }).power - power) / power], [collective]).x[0] ?? 0;
    const ratio = rotorAt(BO105_MAIN_ROTOR, 0, raised, { height }).thrust / WEIGHT;
    expect(ratio).toBeGreaterThan(1.12);
    expect(ratio).toBeLessThan(1 / (1 - 0.25));
  });

  test("vortex ring state: induced velocity at Vc = −vh follows Leishman's flight-test curve (1.71 vh)", () => {
    const state = rotorAt(BO105_MAIN_ROTOR, HOVER_INDUCED, collectiveFor(BO105_MAIN_ROTOR, HOVER_INDUCED, WEIGHT));
    const hover = rotorAt(BO105_MAIN_ROTOR, 0, collectiveFor(BO105_MAIN_ROTOR, 0, WEIGHT));
    within(state.inflow / hover.inflow, 1.71, 0.08);
  });

  test("vertical autorotation: zero shaft torque at weight in a descent of 1.7–2.1 hover induced velocities", () => {
    const solved = solveNewton(
      (x) => {
        const r = rotorAt(BO105_MAIN_ROTOR, x[0] ?? 0, x[1] ?? 0);
        return [(10 * r.torque) / (WEIGHT * BO105_MAIN_ROTOR.radius), (r.thrust - WEIGHT) / WEIGHT];
      },
      [1.8 * HOVER_INDUCED, 1 * DEG],
    );
    expect(solved.norm).toBeLessThan(1e-6);
    const descent = (solved.x[0] ?? 0) / HOVER_INDUCED;
    expect(descent).toBeGreaterThan(1.7);
    expect(descent).toBeLessThan(2.1);
  });
});

describe("Bo-105 reference helicopter", () => {
  const model = createBo105Model();
  const aircraft = createReferenceAircraft(model, { groundElevation: () => -1e5 });

  test("trims from hover to 70 m/s, with the flight-matched shaft angle within 1.5° and main rotor power within 10%", () => {
    const tip = BO105_MAIN_ROTOR.speed * BO105_MAIN_ROTOR.radius;
    // 200 m standard: the 1.201 kg/m³ of the tunnel runs.
    const altitude = 200;
    const air = standardAtmosphere(altitude);
    for (const point of BO105_FORWARD_FLIGHT_DATA.filter((entry) => entry.thrust === 0.07)) {
      const trim = trimHelicopter(aircraft, model, { speed: point.advanceRatio * tip, altitude });
      expect(trim.converged).toBe(true);
      expect(Math.abs(trim.shaftAngle - point.shaftAngle)).toBeLessThan(1.5 * DEG);
      const area = DISC * ((BO105_MAIN_ROTOR.blades * BO105_MAIN_ROTOR.chord) / (Math.PI * BO105_MAIN_ROTOR.radius));
      within(trim.telemetry.mainPower / (air.density * area * tip ** 3), point.power, 0.1);
    }
    expect(trimHelicopter(aircraft, model, { speed: 0, altitude }).converged).toBe(true);
    expect(trimHelicopter(aircraft, model, { speed: 70, altitude }).converged).toBe(true);
  });

  test("after an engine failure at 35 m/s the rotor autorotates: speed held at 90–105%, descent steady at 6–10 m/s", () => {
    const trim = trimHelicopter(aircraft, model, { speed: 35, altitude: 1000 });
    const failed = createReferenceAircraft(createBo105Model({ enginePower: 0 }), { groundElevation: () => -1e5 });
    failed.restore(trim.state);
    let sample = failed.sample();
    const rated = (BO105_MAIN_ROTOR.speed * 30) / Math.PI;
    const input: ReferencePilotInput = { throttle: 0, pitch: 0, roll: 0, yaw: 0 };
    let slowest = 1;
    for (let i = 0; i < 750; i += 1) {
      input.throttle = i < 25 ? trim.collective : 0.1;
      input.pitch = Math.max(-1, Math.min(1, 2.5 * (trim.pitch - sample.pitch) - 0.8 * sample.q));
      input.roll = Math.max(-1, Math.min(1, 2.5 * (trim.bank - sample.bank) - 0.5 * sample.p));
      input.yaw = Math.max(-1, Math.min(1, -2 * sample.r));
      sample = failed.step(0.02, input);
      slowest = Math.min(slowest, sample.rpm / rated);
    }
    expect(slowest).toBeGreaterThan(0.85);
    expect(sample.rpm / rated).toBeGreaterThan(0.9);
    expect(sample.rpm / rated).toBeLessThan(1.05);
    expect(-sample.climbRate).toBeGreaterThan(6);
    expect(-sample.climbRate).toBeLessThan(10);
  });
});
