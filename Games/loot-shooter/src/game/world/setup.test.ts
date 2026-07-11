import { describe, expect, test } from "bun:test";
import { coverObjectById } from "../objects/catalog";
import { ARENA_HALF, COVER_LAYOUT, clampToArena } from "./setup";

describe("arena cover layout", () => {
  test("places a dense field of cover", () => {
    expect(COVER_LAYOUT.length).toBeGreaterThanOrEqual(70);
  });

  test("every placement resolves to a catalog object inside the arena", () => {
    for (const placement of COVER_LAYOUT) {
      expect(coverObjectById(placement.id)).toBeDefined();
      expect(Math.abs(placement.x)).toBeLessThan(ARENA_HALF - 1);
      expect(Math.abs(placement.z)).toBeLessThan(ARENA_HALF - 1);
    }
  });

  test("keeps the player spawn breathing room", () => {
    for (const placement of COVER_LAYOUT) {
      const distance = Math.hypot(placement.x, placement.z);
      expect(distance).toBeGreaterThanOrEqual(2.5);
    }
  });

  test("clampToArena walls the play space", () => {
    expect(clampToArena(500, -500)).toEqual([ARENA_HALF - 1.2, -(ARENA_HALF - 1.2)]);
    expect(clampToArena(3, 4)).toEqual([3, 4]);
  });
});
