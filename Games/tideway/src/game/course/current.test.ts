import { describe, expect, test } from "bun:test";
import { ANNOUNCE_LEAD_SEC, currentStateForSwing, currentVectorAt, sampleCurrentField, SWING_INTERVAL_SEC } from "./current";
import { ZONE_IDS } from "./zones";

const SEED = "test-seed-1";

describe("current schedule", () => {
  test("swing index advances every SWING_INTERVAL_SEC", () => {
    expect(sampleCurrentField(SEED, 0).swingIndex).toBe(0);
    expect(sampleCurrentField(SEED, SWING_INTERVAL_SEC - 0.01).swingIndex).toBe(0);
    expect(sampleCurrentField(SEED, SWING_INTERVAL_SEC).swingIndex).toBe(1);
    expect(sampleCurrentField(SEED, SWING_INTERVAL_SEC * 3 + 4).swingIndex).toBe(3);
  });

  test("announces the swing exactly ANNOUNCE_LEAD_SEC ahead", () => {
    const justBefore = sampleCurrentField(SEED, SWING_INTERVAL_SEC - ANNOUNCE_LEAD_SEC - 0.5);
    const justAfter = sampleCurrentField(SEED, SWING_INTERVAL_SEC - ANNOUNCE_LEAD_SEC + 0.5);
    expect(justBefore.announcing).toBe(false);
    expect(justAfter.announcing).toBe(true);
  });

  test("nextZoneStates at swing N equals zoneStates at swing N+1", () => {
    const field = sampleCurrentField(SEED, 12);
    for (const zoneId of ZONE_IDS) {
      const nextAtNextSwing = sampleCurrentField(SEED, 12 + SWING_INTERVAL_SEC).zoneStates[zoneId];
      expect(field.nextZoneStates[zoneId]).toEqual(nextAtNextSwing);
    }
  });

  test("is deterministic for the same seed and time", () => {
    const a = sampleCurrentField(SEED, 87.3);
    const b = sampleCurrentField(SEED, 87.3);
    expect(a).toEqual(b);
  });

  test("differs across zones most of the time", () => {
    const field = sampleCurrentField(SEED, 5);
    const strengths = ZONE_IDS.map((zoneId) => field.zoneStates[zoneId].compass);
    expect(new Set(strengths).size).toBeGreaterThan(1);
  });

  test("currentStateForSwing is pure and repeatable", () => {
    const a = currentStateForSwing(SEED, "east", 4);
    const b = currentStateForSwing(SEED, "east", 4);
    expect(a).toEqual(b);
    expect(currentStateForSwing(SEED, "east", 5)).not.toEqual(a);
  });

  test("currentVectorAt scales the zone direction by its strength", () => {
    const field = sampleCurrentField(SEED, 0);
    const vec = currentVectorAt(field, 60, 0);
    const state = field.zoneStates.east;
    expect(vec[0]).toBeCloseTo(state.dir[0] * state.strength, 5);
    expect(vec[1]).toBeCloseTo(state.dir[1] * state.strength, 5);
  });
});
