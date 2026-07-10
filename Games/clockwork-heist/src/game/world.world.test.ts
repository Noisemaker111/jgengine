import { describe, expect, test } from "bun:test";
import { ROOMS, generateAllWallBoxes, staticLosSegments } from "./mansion/floorPlan";
import { furniturePropCount, generateFurniturePlacements } from "./mansion/furniture";
import { GUARD_DEFS } from "./entities/guards";
import { DOOR_DEFS } from "./entities/doors";
import { CAMERA_DEFS } from "./entities/cameras";
import { SIDE_LOOT_DEFS, TREASURE_DEFS } from "./items/treasures";

describe("clockwork heist mansion floor plan", () => {
  test("has 12 rooms across 4 wings", () => {
    expect(ROOMS.length).toBe(12);
    const wings = new Set(ROOMS.map((room) => room.wing));
    expect(wings.size).toBe(4);
    for (const wing of wings) {
      expect(ROOMS.filter((room) => room.wing === wing).length).toBe(3);
    }
  });

  test("generates a dense, non-empty wall layout", () => {
    const boxes = generateAllWallBoxes();
    expect(boxes.length).toBeGreaterThan(100);
  });

  test("wall layout resolves to finite line-of-sight geometry", () => {
    const segments = staticLosSegments();
    expect(segments.length).toBeGreaterThan(0);
    for (const segment of segments) {
      expect(Number.isFinite(segment.x1)).toBe(true);
      expect(Number.isFinite(segment.z1)).toBe(true);
      expect(Number.isFinite(segment.x2)).toBe(true);
      expect(Number.isFinite(segment.z2)).toBe(true);
    }
  });

  test("furniture props meet the content budget (80+)", () => {
    expect(furniturePropCount()).toBeGreaterThanOrEqual(80);
    expect(generateFurniturePlacements().length).toBe(furniturePropCount());
  });

  test("furniture is deterministic across generations", () => {
    const a = generateFurniturePlacements();
    const b = generateFurniturePlacements();
    expect(a).toEqual(b);
  });

  test("has 6 named guards with distinct loop lengths in [20, 60]", () => {
    expect(GUARD_DEFS.length).toBe(6);
    const names = new Set(GUARD_DEFS.map((guard) => guard.name));
    expect(names.size).toBe(6);
    for (const guard of GUARD_DEFS) {
      expect(guard.loopSeconds).toBeGreaterThanOrEqual(20);
      expect(guard.loopSeconds).toBeLessThanOrEqual(60);
    }
  });

  test("has 4 scheduled doors", () => {
    expect(DOOR_DEFS.length).toBe(4);
  });

  test("has 3 rotating sentry-eye cameras", () => {
    expect(CAMERA_DEFS.length).toBe(3);
  });

  test("has 5 treasures and 6 side-loot pieces", () => {
    expect(TREASURE_DEFS.length).toBe(5);
    expect(SIDE_LOOT_DEFS.length).toBe(6);
    const wings = new Set(TREASURE_DEFS.map((treasure) => ROOMS.find((room) => room.id === treasure.roomId)?.wing));
    expect(wings.size).toBeGreaterThanOrEqual(4);
  });
});
