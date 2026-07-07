import { describe, expect, test } from "bun:test";
import { evaluateSkillCheck, skillCheckMarkerPosition, skillCheckZoneAt } from "./skillCheck";

const base = { trackWidth: 100, zone: { start: 40, end: 60 }, markerPeriod: 2, window: 5 };

describe("skillCheckMarkerPosition", () => {
  test("starts at zero and reaches the far end at half the period", () => {
    expect(skillCheckMarkerPosition(base, 0)).toBe(0);
    expect(skillCheckMarkerPosition(base, 1)).toBe(100);
  });

  test("bounces back toward zero after the peak", () => {
    expect(skillCheckMarkerPosition(base, 1.5)).toBe(50);
    expect(skillCheckMarkerPosition(base, 2)).toBe(0);
  });
});

describe("skillCheckZoneAt", () => {
  test("stays put with no drift", () => {
    expect(skillCheckZoneAt(base, 3)).toEqual({ start: 40, end: 60 });
  });

  test("drifts within the track when configured", () => {
    const drifting = { ...base, zoneDriftPerSecond: 1 };
    const zone = skillCheckZoneAt(drifting, 0.5);
    expect(zone.end - zone.start).toBe(20);
    expect(zone.start).toBeGreaterThanOrEqual(0);
    expect(zone.end).toBeLessThanOrEqual(base.trackWidth);
  });
});

describe("evaluateSkillCheck", () => {
  test("succeeds when the marker lands inside the zone within the window", () => {
    const result = evaluateSkillCheck(base, 0.6);
    expect(result.markerPosition).toBe(60);
    expect(result.success).toBe(true);
    expect(result.timedOut).toBe(false);
  });

  test("fails when the marker is outside the zone", () => {
    const result = evaluateSkillCheck(base, 1);
    expect(result.markerPosition).toBe(100);
    expect(result.success).toBe(false);
  });

  test("fails once the time window has elapsed even if the marker is in-zone", () => {
    const result = evaluateSkillCheck(base, 6);
    expect(result.timedOut).toBe(true);
    expect(result.success).toBe(false);
  });
});
