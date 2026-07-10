import { describe, expect, test } from "bun:test";

import { CELL, initialBuildings, makeBuilding, type Plaza } from "../catalog";
import { citySignals, formatStat, metricsFor, performanceFor, resolveCityMetrics } from "./metrics";

const district = initialBuildings();
const plaza = (id: string, gx: number, gz: number, kind: Plaza["kind"], trees = 6): Plaza => ({
  id,
  x: gx * CELL,
  z: gz * CELL,
  trees,
  kind,
});

describe("building performance", () => {
  test("stays within documented bounds across the starter district", () => {
    for (const b of district) {
      const perf = performanceFor(b, district, []);
      expect(perf.floors).toBeGreaterThanOrEqual(1);
      expect(perf.gfa).toBeGreaterThan(0);
      expect(perf.daylight).toBeGreaterThanOrEqual(19);
      expect(perf.daylight).toBeLessThanOrEqual(96);
      expect(perf.energy).toBeGreaterThanOrEqual(42);
      expect(perf.egress).toBeLessThanOrEqual(100);
      expect(perf.publicLife).toBeLessThanOrEqual(100);
      expect(perf.shadeHours).toBeGreaterThanOrEqual(1.2);
    }
  });

  test("a nearby plaza raises public life", () => {
    const b = district[3];
    const without = performanceFor(b, district, []);
    const withPlaza = performanceFor(b, district, [plaza("p-1", Math.round(b.x / CELL) + 1, Math.round(b.z / CELL), "forum")]);
    expect(withPlaza.publicLife).toBeGreaterThan(without.publicLife);
  });

  test("brise-soleil cuts energy demand", () => {
    const shaded = makeBuilding("perf-a", 0, 0, "work", "citadel", 0);
    const bare = { ...shaded, facade: "ribbon" as const };
    expect(performanceFor(shaded, [shaded], []).energy).toBeLessThan(performanceFor(bare, [bare], []).energy);
  });
});

describe("city metrics", () => {
  test("starter district produces a living baseline", () => {
    const m = metricsFor(district, []);
    expect(m.capacity).toBeGreaterThan(0);
    expect(m.population).toBeLessThanOrEqual(m.capacity);
    expect(m.jobs).toBeGreaterThan(0);
    expect(m.activity).toBeGreaterThan(24);
    expect(m.approval).toBeGreaterThan(40);
    expect(m.carbon).toBeGreaterThan(0);
  });

  test("gardens and trees offset carbon", () => {
    const bare = metricsFor(district, []);
    const planted = metricsFor(district, [plaza("p-1", 4, 4, "garden", 14), plaza("p-2", -4, 4, "garden", 14)]);
    expect(planted.carbon).toBeLessThan(bare.carbon);
  });

  test("charter choices bend the numbers the documented way", () => {
    const base = resolveCityMetrics(district, [], {});
    const open = resolveCityMetrics(district, [], { undercroft: "open" });
    expect(open.activity).toBe(Math.min(100, base.activity + 11));
    const specialist = resolveCityMetrics(district, [], { commons: "specialist" });
    expect(specialist.jobs).toBe(Math.round(metricsFor(district, []).jobs * 1.08));
    const reuse = resolveCityMetrics(district, [], { aggregate: "reuse" });
    const formal = resolveCityMetrics(district, [], { aggregate: "formal" });
    expect(reuse.carbon).toBeLessThan(formal.carbon);
  });

  test("population wrap never exceeds capacity", () => {
    const m = resolveCityMetrics(district, [plaza("p-1", 4, 4, "forum"), plaza("p-2", -4, -4, "garden")], {});
    expect(m.population).toBeLessThanOrEqual(m.capacity);
  });
});

describe("city signals", () => {
  test("derive from metrics and charter", () => {
    const m = resolveCityMetrics(district, [], { undercroft: "quiet", commons: "shared", aggregate: "formal" });
    const signals = citySignals(m, { undercroft: "quiet", commons: "shared", aggregate: "formal" });
    expect(signals.activity).toBe(m.activity);
    expect(signals.nightAccess).toBe("quiet");
    expect(signals.sharedRooms).toBe(true);
    expect(signals.specialistGrowth).toBe(false);
    expect(signals.formal).toBe(true);
  });
});

describe("stat formatting", () => {
  test("matches the source display rules", () => {
    expect(formatStat(950)).toBe("950");
    expect(formatStat(2500)).toBe("2.5k");
    expect(formatStat(12500)).toBe("13k");
  });
});
