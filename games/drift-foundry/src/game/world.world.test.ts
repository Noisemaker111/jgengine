import { describe, expect, test } from "bun:test";
import { findLibraryMaterial } from "@jgengine/assets/catalogs/materialLibrary";
import { summarizeEnvironment } from "@jgengine/core/world/environmentSummary";

import { CORRIDOR_HALF_WIDTH, EXIT_Z } from "./run/constants";
import { world } from "../world";
import { ZONES } from "./zones/catalog";
import { AISLE_NINE_TRACK, TRACKS, trackById } from "./tracks/catalog";
import { YARD_GROUND } from "./tracks/ground";

describe("drift-foundry world", () => {
  const summary = summarizeEnvironment(world);

  test("renders a populated scene", () => {
    expect(summary.isEmpty).toBe(false);
  });

  test("three zones of canyon walls exceed the content floor", () => {
    expect(summary.counts.structureGroups).toBe(6);
    expect(summary.counts.buildings).toBeGreaterThan(30);
  });

  test("the aisles are ceramic tile and the store floor is terrazzo", () => {
    const roads = world.roads ?? [];
    expect(roads.length).toBeGreaterThan(0);
    for (const road of roads) expect(road.materials?.road?.maps?.color).toBe("/materials/ambientcg-tiles007/color.jpg");
    expect(world.terrain?.detail?.material?.maps?.color).toBe("/materials/ambientcg-terrazzo005/color.jpg");
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

  test("every zone facade is a named shared-library material, not a flat colour", () => {
    for (const zone of ZONES) {
      const entry = findLibraryMaterial(zone.facadeMaterial);
      expect(entry).not.toBeNull();
      for (const kind of ["wall", "corner", "roof"] as const) {
        const surface = zone.palette[kind];
        if (typeof surface === "string") throw new Error(`${zone.id}.${kind} is still a flat colour`);
        const match = /^\/materials\/([a-z0-9-]+)\/color\.jpg$/.exec(surface.maps?.color ?? "");
        expect(match).not.toBeNull();
        expect(match![1]).toBe(entry?.source);
        expect(surface.maps?.normal).toBeDefined();
        expect(surface.maps?.roughness).toBeDefined();
        expect(surface.repeat).toBeDefined();
      }
    }
  });

  test("each zone names its own facade material so the corridor still reads in three zones", () => {
    const named = ZONES.map((zone) => zone.facadeMaterial);
    expect(new Set(named).size).toBe(ZONES.length);
  });

  test("terrain is wide enough that the far wall row stands on ground", () => {
    const halfWidth = (summary.terrain?.bounds.w ?? 0) / 2;
    expect(halfWidth).toBeGreaterThanOrEqual(150);
    for (const row of summary.structures) {
      expect(Math.abs(row.bounds.minX)).toBeLessThan(halfWidth);
      expect(Math.abs(row.bounds.maxX)).toBeLessThan(halfWidth);
    }
  });

  test("the haul road spans the whole run, and every other track's routes are paved", () => {
    const laid = TRACKS.filter((track) => track !== AISLE_NINE_TRACK);
    expect(summary.roads).toHaveLength(1 + laid.reduce((sum, track) => sum + track.course.routes.length, 0));
    expect(summary.roads[0]!.length).toBeGreaterThan(EXIT_Z);
  });

  test("every department has its own light and ground, the juice flood and koi pond are liquid, and no rain falls indoors", () => {
    const laid = TRACKS.filter((track) => track !== AISLE_NINE_TRACK);
    const bands = world.kind === "environment" ? world.terrain?.biomeBands ?? [] : [];
    for (const track of laid) expect(bands.some((band) => band.z === track.def.bandZ && band.sky === track.def.sky)).toBe(true);
    expect(new Set(laid.map((track) => track.def.sky.horizonColor)).size).toBe(laid.length);
    // Band weather follows the camera everywhere, so it would rain inside the store: no department sets it.
    expect(bands.filter((band) => band.weather !== undefined)).toHaveLength(0);
    expect(summary.counts.water ?? (world.kind === "environment" ? [world.water].flat().length : 0)).toBe(laid.filter((track) => track.def.liquid !== undefined).length);
    // The terrain is the course's own grade: a kart on the smelter's top deck stands on it.
    const top = trackById("toy-aisle")!.point("main", 600);
    expect(YARD_GROUND(top.x, top.z)).toBeCloseTo(top.elevation, 1);
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
