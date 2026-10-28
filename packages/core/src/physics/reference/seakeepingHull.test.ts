import { describe, expect, test } from "bun:test";

import { seededRng } from "../../random/rng";
import { wigleyHull } from "./hullForm";
import { hydrostaticParticulars, SEA_WATER_DENSITY } from "./hullHydrostatics";
import { irregularSea, regularSea, type OceanSea } from "./oceanWaves";
import { restingSeakeepingState, seakeepingHullFromStrip, stepSeakeeping, type SeakeepingHull, type SeakeepingState } from "./seakeepingHull";
import { heavePitchResponse, stripSections } from "./stripTheory";

const G = 9.80665;
const [L, B, T] = [3, 0.3, 0.1875];
const offsets = wigleyHull({ length: L, beam: B, draft: T, freeboard: 0.1, stations: 21, waterlines: 14 });
const strip = { offsets, draft: T, centreOfGravity: [L / 2, 0.1] as const, pitchRadius: 0.25 * L };
const still = regularSea(0, 1);

/** A soft surge mooring, as a tank restrains a model in waves, so the wave drift force does not carry it away. */
const mooring = (hull: SeakeepingHull) => (state: SeakeepingState) => -hull.massKg * (0.1 * state.position[0] + 0.6 * state.velocity[0]);

function zeroCrossingPeriod(series: readonly number[], dt: number): number {
  const crossings: number[] = [];
  for (let i = 1; i < series.length; i += 1) {
    const a = series[i - 1] ?? 0;
    const b = series[i] ?? 0;
    if (a < 0 && b >= 0) crossings.push((i - 1 + a / (a - b)) * dt);
  }
  return ((crossings[crossings.length - 1] ?? 0) - (crossings[0] ?? 0)) / (crossings.length - 1);
}

/** Heave over A and pitch over kA from a regular head-wave run, by projection onto the wave frequency once settled. */
function measuredRao(hull: SeakeepingHull, sea: OceanSea, settle: number, record: number, stepsPerPeriod: number): { heave: number; pitch: number } {
  const wave = sea.components[0];
  const omega = wave?.frequency ?? 1;
  const amplitude = wave?.amplitude ?? 1;
  const dt = (2 * Math.PI) / omega / stepsPerPeriod;
  const state = restingSeakeepingState(hull);
  const [z0, pitch0] = [state.position[2], state.attitude[1]];
  let heaveCos = 0, heaveSin = 0, pitchCos = 0, pitchSin = 0;
  const hold = mooring(hull);
  for (let i = 0; i < (settle + record) * stepsPerPeriod; i += 1) {
    stepSeakeeping(hull, sea, state, dt, hold);
    if (i < settle * stepsPerPeriod) continue;
    const phase = omega * state.time;
    heaveCos += (state.position[2] - z0) * Math.cos(phase);
    heaveSin += (state.position[2] - z0) * Math.sin(phase);
    pitchCos += (state.attitude[1] - pitch0) * Math.cos(phase);
    pitchSin += (state.attitude[1] - pitch0) * Math.sin(phase);
  }
  const samples = record * stepsPerPeriod;
  return { heave: (2 * Math.hypot(heaveCos, heaveSin)) / samples / amplitude, pitch: (2 * Math.hypot(pitchCos, pitchSin)) / samples / ((wave?.wavenumber ?? 1) * amplitude) };
}

describe("six-degree-of-freedom hull in waves (Wigley, zero speed)", () => {
  const hull = seakeepingHullFromStrip(strip);

  test("floats at rest in still water: no drift in a second", () => {
    const state = restingSeakeepingState(hull);
    const start = [...state.position, ...state.attitude];
    for (let i = 0; i < 100; i += 1) stepSeakeeping(hull, still, state, 0.01);
    [...state.position, ...state.attitude].forEach((value, i) => expect(Math.abs(value - (start[i] ?? 0))).toBeLessThan(1e-6));
  }, 60_000);

  test("free heave and roll decay at the periods their mass, added mass and stiffness give, within 1.5%", () => {
    const heaveStiffness = SEA_WATER_DENSITY * G * (2 / 3) * L * B;
    const heaveNatural = Math.sqrt(heaveStiffness / (hull.massKg + (hull.addedMass[14] ?? 0)));
    const tuned = seakeepingHullFromStrip(strip, { referenceFrequency: heaveNatural });
    const omega = Math.sqrt(heaveStiffness / (tuned.massKg + (tuned.addedMass[14] ?? 0)));
    const heave = restingSeakeepingState(tuned);
    const rest = heave.position[2];
    heave.position[2] += 0.01;
    const heaves: number[] = [];
    for (let i = 0; i < 400; i += 1) heaves.push(stepSeakeeping(tuned, still, heave, 0.01).position[2] - rest);
    expect(Math.abs(zeroCrossingPeriod(heaves, 0.01) / ((2 * Math.PI) / omega) - 1)).toBeLessThan(0.015);

    const particulars = hydrostaticParticulars(tuned.mesh, { massKg: tuned.massKg, centreOfGravity: tuned.centreOfGravity });
    const rollStiffness = SEA_WATER_DENSITY * G * particulars.volume * particulars.transverseMetacentricHeight;
    const rollInertia = tuned.massKg * tuned.gyration[0] ** 2 + (tuned.addedMass[21] ?? 0);
    const roll = restingSeakeepingState(tuned);
    roll.attitude[0] = 0.05;
    const rolls: number[] = [];
    for (let i = 0; i < 800; i += 1) rolls.push(stepSeakeeping(tuned, still, roll, 0.01).attitude[0]);
    const damped = (2 * Math.PI * Math.sqrt(rollInertia / rollStiffness)) / Math.sqrt(1 - 0.05 ** 2);
    expect(Math.abs(zeroCrossingPeriod(rolls, 0.01) / damped - 1)).toBeLessThan(0.015);
  }, 60_000);

  test("heave and pitch RAOs in regular head waves track strip theory: within 6% for λ ≥ 1.5L, within 0.12 at λ = L", () => {
    const prepared = stripSections(offsets, T);
    for (const [ratio, tolerance] of [[1, 0.12], [2, 0.06], [3, 0.06]] as const) {
      const omega = Math.sqrt((2 * Math.PI * G) / (ratio * L));
      const tuned = seakeepingHullFromStrip(strip, { referenceFrequency: omega });
      const measured = measuredRao(tuned, regularSea(0.01, (2 * Math.PI) / omega, Math.PI), 20, 10, 30);
      const expected = heavePitchResponse(strip, omega, prepared);
      const scale = ratio === 1 ? 1 : expected.heave;
      expect(Math.abs(measured.heave - expected.heave)).toBeLessThan(tolerance * scale);
      expect(Math.abs(measured.pitch - expected.pitch)).toBeLessThan(tolerance * (ratio === 1 ? 1 : expected.pitch));
    }
  }, 60_000);

  test("an irregular JONSWAP sea moves the hull deterministically for a seed, and slamming acts only while a station enters the water", () => {
    const sea = irregularSea({ significantHeight: 0.12, peakPeriod: 1.4, peakEnhancement: 3.3 }, { random: seededRng(11), components: 12, direction: Math.PI });
    const run = () => {
      const state = restingSeakeepingState(hull);
      let peak = 0;
      let at = 0;
      for (let i = 0; i < 300; i += 1) {
        stepSeakeeping(hull, sea, state, 0.01, mooring(hull));
        if (state.slamForce > peak) {
          peak = state.slamForce;
          at = state.slamStation;
        }
      }
      return { state, peak, at };
    };
    const first = run();
    const second = run();
    expect(second.state.position).toEqual(first.state.position);
    expect(second.state.attitude).toEqual(first.state.attitude);
    expect(first.peak).toBeGreaterThan(0);
    expect(first.at).toBeGreaterThan(0);
    expect(first.at).toBeLessThan(L);
    const calm = restingSeakeepingState(hull);
    for (let i = 0; i < 50; i += 1) expect(stepSeakeeping(hull, still, calm, 0.01).slamForce).toBeLessThan(1e-9 * first.peak);
  }, 60_000);
});
