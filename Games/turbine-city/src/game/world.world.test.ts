import { describe, expect, test } from "bun:test";
import { summarizeEnvironment } from "@jgengine/core/world/environmentSummary";

import { world } from "../world";
import { ANTENNA_OBJECT, BANNER_OBJECT, BRIDGE_OBJECT, FAN_HOUSING_OBJECT, FAN_ROTOR_OBJECT, RING_GATE_OBJECT, WINDSOCK_OBJECT } from "./objects/catalog";
import { buildCityProps } from "./world/cityProps";
import { BUILDING_ZONES } from "./world/zones";

describe("turbine city world", () => {
  const summary = summarizeEnvironment(world);

  test("renders a populated scene", () => {
    expect(summary.isEmpty).toBe(false);
  });

  test("six canyon-wall clusters exceed the content floor", () => {
    const expectedBuildings = BUILDING_ZONES.reduce((sum, zone) => sum + zone.count, 0);
    expect(summary.counts.buildings).toBe(expectedBuildings);
    expect(summary.counts.structureGroups).toBe(6);
    expect(summary.counts.buildings).toBeGreaterThan(60);
  });

  test("terrain resolves finite height everywhere", () => {
    expect(summary.terrain?.height.finite).toBe(true);
    expect(summary.terrain?.height.max).toBeGreaterThan(summary.terrain?.height.min ?? 0);
  });
});

describe("turbine city props", () => {
  const props = buildCityProps();
  const countOf = (catalogId: string) => props.filter((p) => p.catalogId === catalogId).length;

  test("eight fans get a housing and a spinning rotor", () => {
    expect(countOf(FAN_HOUSING_OBJECT)).toBe(8);
    expect(countOf(FAN_ROTOR_OBJECT)).toBe(8);
  });

  test("ten ring gates mark the checkpoint course", () => {
    expect(countOf(RING_GATE_OBJECT)).toBe(10);
  });

  test("windsocks, banners, bridges and antennae dress the canyons", () => {
    expect(countOf(WINDSOCK_OBJECT)).toBeGreaterThanOrEqual(12);
    expect(countOf(BANNER_OBJECT)).toBeGreaterThanOrEqual(10);
    expect(countOf(BRIDGE_OBJECT)).toBeGreaterThanOrEqual(5);
    expect(countOf(ANTENNA_OBJECT)).toBeGreaterThanOrEqual(20);
  });

  test("prop budget clears 60 placed instances", () => {
    expect(props.length).toBeGreaterThan(60);
  });

  test("every placement has a unique instance id", () => {
    const ids = new Set(props.map((p) => p.instanceId));
    expect(ids.size).toBe(props.length);
  });
});
