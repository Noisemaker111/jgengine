import { describe, expect, it } from "bun:test";
import {
  assertHitZoneTable,
  hitZoneMultiplier,
  resolveHitZone,
  UnknownHitZoneError,
  type HitZoneTable,
} from "./hitZones";

const zones: HitZoneTable = {
  zones: [
    { id: "body", multiplier: 1 },
    { id: "limb", multiplier: 0.75 },
    { id: "head", multiplier: 1.5, critChance: 0.25, critMultiplier: 2.5 },
  ],
  defaultZone: "body",
  critChance: 0.05,
  critMultiplier: 2,
};

describe("resolveHitZone", () => {
  it("applies the zone's own multiplier when no crit lands", () => {
    const result = resolveHitZone(zones, "limb", () => 0.99);
    expect(result.zone).toBe("limb");
    expect(result.crit).toBe(false);
    expect(result.multiplier).toBe(0.75);
    expect(result.roll).toBeCloseTo(0.99, 10);
  });

  it("applies the crit multiplier once, replacing the zone multiplier", () => {
    const crit = resolveHitZone(zones, "head", () => 0);
    expect(crit.crit).toBe(true);
    expect(crit.multiplier).toBe(2.5);
    const normal = resolveHitZone(zones, "head", () => 0.99);
    expect(normal.multiplier).toBe(1.5);
  });

  it("adds the zone's crit bonus to the table's base chance", () => {
    expect(resolveHitZone(zones, "head", () => 0.29).crit).toBe(true);
    expect(resolveHitZone(zones, "head", () => 0.31).crit).toBe(false);
  });

  it("draws nothing when the chance is zero", () => {
    let draws = 0;
    const rng = () => {
      draws += 1;
      return 0;
    };
    const result = resolveHitZone({ zones: [{ id: "body" }], defaultZone: "body" }, "body", rng);
    expect(draws).toBe(0);
    expect(result.roll).toBeNull();
    expect(result.crit).toBe(false);
    expect(result.multiplier).toBe(1);
  });

  it("falls back to the default zone for an unlisted zone", () => {
    const result = resolveHitZone(zones, "tail", () => 0.99);
    expect(result.zone).toBe("body");
    expect(result.fallback).toBe(true);
  });

  it("throws when the table has no usable default", () => {
    expect(() => resolveHitZone({ zones: [{ id: "body" }], defaultZone: "nope" }, "tail", () => 0)).toThrow(UnknownHitZoneError);
  });
});

describe("hitZoneMultiplier", () => {
  it("quotes the same multiplier a resolved crit uses", () => {
    const quoted = hitZoneMultiplier(zones, "head", true);
    const resolved = resolveHitZone(zones, "head", () => 0);
    expect(quoted.multiplier).toBe(resolved.multiplier);
    expect(hitZoneMultiplier(zones, "body", true).multiplier).toBe(2);
    expect(hitZoneMultiplier(zones, "head", false).multiplier).toBe(1.5);
  });
});

describe("assertHitZoneTable", () => {
  it("rejects duplicate zones and a missing default", () => {
    expect(() => assertHitZoneTable({ zones: [{ id: "a" }, { id: "a" }], defaultZone: "a" })).toThrow(RangeError);
    expect(() => assertHitZoneTable({ zones: [{ id: "a" }], defaultZone: "b" })).toThrow(UnknownHitZoneError);
  });
});
