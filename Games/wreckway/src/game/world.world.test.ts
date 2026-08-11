import { describe, expect, test } from "bun:test";
import { summarizeEnvironment } from "@jgengine/core/world/environmentSummary";

import { CORRIDOR_HALF_WIDTH, EXIT_Z } from "./run/constants";
import { world } from "../world";
import { ZONES } from "./zones/catalog";

describe("wreckway world", () => {
  const summary = summarizeEnvironment(world);

  test("renders a populated scene", () => {
    expect(summary.isEmpty).toBe(false);
  });

  test("three zones of canyon walls exceed the content floor", () => {
    expect(summary.counts.structureGroups).toBe(6);
    expect(summary.counts.buildings).toBeGreaterThan(30);
  });

  test("terrain resolves finite height everywhere", () => {
    expect(summary.terrain?.height.finite).toBe(true);
    expect(summary.terrain?.height.max).toBeGreaterThan(summary.terrain?.height.min ?? 0);
  });

  test("each zone gets a near and a far wall row so the corridor reads as layered depth", () => {
    for (const zone of ZONES) {
      const rows = summary.structures
        .filter((entry) => entry.palette.wall === zone.palette.wall)
        .sort((a, b) => a.bounds.maxX - b.bounds.maxX);
      expect(rows).toHaveLength(2);
      for (const row of rows) expect(row.buildings).toBeGreaterThan(0);
      expect(rows[1]!.bounds.maxX).toBeGreaterThan(rows[0]!.bounds.maxX);
      expect(rows[0]!.bounds.minX).toBeLessThan(-CORRIDOR_HALF_WIDTH);
    }
  });

  test("wall rows run their zone's length instead of clustering in a grid block", () => {
    for (const zone of ZONES) {
      const rows = summary.structures.filter((entry) => entry.palette.wall === zone.palette.wall);
      for (const row of rows) {
        expect(row.bounds.maxZ - row.bounds.minZ).toBeGreaterThan((zone.end - zone.start) * 0.8);
      }
    }
  });

  test("zone palettes are actually distinct, not three copies of one style", () => {
    const walls = new Set(ZONES.map((zone) => zone.palette.wall));
    const signs = new Set(ZONES.map((zone) => zone.palette.storeSign));
    expect(walls.size).toBe(ZONES.length);
    expect(signs.size).toBe(ZONES.length);
  });

  test("terrain is wide enough that the far wall row stands on ground", () => {
    const halfWidth = (summary.terrain?.bounds.w ?? 0) / 2;
    expect(halfWidth).toBeGreaterThanOrEqual(150);
    for (const row of summary.structures) {
      expect(Math.abs(row.bounds.minX)).toBeLessThan(halfWidth);
      expect(Math.abs(row.bounds.maxX)).toBeLessThan(halfWidth);
    }
  });

  test("the haul road spans the whole run", () => {
    expect(summary.roads).toHaveLength(1);
    expect(summary.roads[0]!.length).toBeGreaterThan(EXIT_Z);
  });

  test("ground, fog, and sky shift per zone along the run", () => {
    const grounds = new Set(ZONES.map((zone) => zone.ground.high));
    const fogs = new Set(ZONES.map((zone) => zone.fog.color));
    const horizons = new Set(ZONES.map((zone) => zone.sky.horizonColor));
    expect(grounds.size).toBe(ZONES.length);
    expect(fogs.size).toBe(ZONES.length);
    expect(horizons.size).toBe(ZONES.length);
  });
});
