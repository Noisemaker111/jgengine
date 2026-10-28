import { describe, expect, test } from "bun:test";

import { wigleyHull } from "./hullForm";
import { heavePitchResponse, stripSections } from "./stripTheory";

const G = 9.80665;
const [L, B, T] = [3, 0.3, 0.1875];
const offsets = wigleyHull({ length: L, beam: B, draft: T, freeboard: 0.1, stations: 21, waterlines: 14 });
const hull = { offsets, draft: T, centreOfGravity: [L / 2, 0.1] as const, pitchRadius: 0.25 * L };
const prepared = stripSections(offsets, T);
const at = (ratio: number) => heavePitchResponse(hull, Math.sqrt((2 * Math.PI * G) / (ratio * L)), prepared);

describe("strip theory on the Wigley hull, zero speed, head seas", () => {
  test("sections reproduce the Wigley displacement and KB within 1%", () => {
    expect(Math.abs(prepared.volume / ((4 / 9) * L * B * T) - 1)).toBeLessThan(0.01);
    expect(Math.abs(prepared.centreOfBuoyancyHeight / ((5 / 8) * T) - 1)).toBeLessThan(0.01);
  });

  test("long waves lift the hull bodily and tilt it with the wave slope: both RAOs within 2% of 1 at λ = 10L", () => {
    const long = at(10);
    expect(Math.abs(long.heave - 1)).toBeLessThan(0.02);
    expect(Math.abs(long.pitch - 1)).toBeLessThan(0.03);
    expect(Math.abs(long.heavePhase)).toBeLessThan(0.02);
    expect(Math.abs(long.pitchPhase - Math.PI / 2)).toBeLessThan(0.02);
  });

  test("short waves average out along the hull: heave and pitch fall away below λ = L", () => {
    const [short, unit, double] = [at(0.6), at(1), at(2)];
    expect(short.heave).toBeLessThan(unit.heave);
    expect(unit.heave).toBeLessThan(double.heave);
    expect(short.pitch).toBeLessThan(unit.pitch);
    expect(unit.pitch).toBeLessThan(double.pitch);
  });

  test("restoring matches the waterplane and the coefficients are symmetric about G", () => {
    const { restoring, addedMass, damping, mass } = at(1.5).coefficients;
    expect(restoring[0] / (1025 * G * (2 / 3) * L * B)).toBeCloseTo(1, 2);
    expect(addedMass[1]).toBeCloseTo(addedMass[2], 12);
    expect(damping[1]).toBeCloseTo(damping[2], 12);
    expect(Math.abs(addedMass[1])).toBeLessThan(0.01 * addedMass[0] * L);
    expect(addedMass[0]).toBeGreaterThan(0.5 * mass);
  });
});
