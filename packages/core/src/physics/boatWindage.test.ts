import { describe, expect, test } from "bun:test";

import { windField } from "../world/wind";
import { createBoatDynamics, type BoatTuning } from "./boatDynamics";
import { boatWindageForce } from "./boatWindage";

const DINGHY: BoatTuning = { massKg: 400, length: 4, beam: 1.6, maxThrust: 1500, propSpeed: 8, steering: { kind: "outboard" } };
const IDLE = { throttle: 0, brake: 0, steer: 0 };

function drift(strength: number | undefined): number {
  const field = windField({ direction: [1, 0], speed: 12, effects: { surface: "openWater", profile: {} } });
  const boat = createBoatDynamics(DINGHY, { wind: { field, ...(strength === undefined ? {} : { strength }) } });
  for (let i = 0; i < 60 * 20; i += 1) boat.tick(1 / 60, IDLE);
  return boat.pose().position[0];
}

describe("boat windage", () => {
  test("strength dial: downwind drift is finite, bounded by the wind and monotone over 0..4", () => {
    const drifts = [0, 0.2, 1, 2, 4].map(drift);
    expect(drifts[0]).toBe(0);
    for (let k = 1; k < drifts.length; k += 1) {
      expect(Number.isFinite(drifts[k] ?? Number.NaN)).toBe(true);
      expect(drifts[k] ?? 0).toBeGreaterThan(drifts[k - 1] ?? 0);
      // Windage only drags the hull toward the wind's speed, never past it.
      expect(drifts[k] ?? 0).toBeLessThan(13 * 20);
    }
  });

  test("a beam wind pushes harder than a head wind on the same hull", () => {
    const field = windField({ direction: [1, 0], speed: 10 });
    const head = boatWindageForce({ field }, DINGHY, 0, 0, Math.PI / 2, 0, 0, 0);
    const beam = boatWindageForce({ field }, DINGHY, 0, 0, 0, 0, 0, 0);
    expect(head[0]).toBeGreaterThan(0);
    expect(beam[0]).toBeGreaterThan(head[0]);
    expect(Math.abs(beam[1])).toBeLessThan(1e-9);
  });

  test("no wind option leaves the hull where it was", () => {
    const boat = createBoatDynamics(DINGHY);
    for (let i = 0; i < 120; i += 1) boat.tick(1 / 60, IDLE);
    expect(boat.pose().position).toEqual([0, 0, 0]);
  });
});
