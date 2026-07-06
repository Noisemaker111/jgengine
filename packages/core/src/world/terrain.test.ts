import { describe, expect, test } from "bun:test";
import { arena, flat, heightfield, rolling } from "@jgengine/core/world/features";
import {
  arenaField,
  flatField,
  rollingField,
  terrainFieldFor,
} from "@jgengine/core/world/terrain";

describe("terrain", () => {
  test("flat field is zero everywhere with an up normal", () => {
    const field = flatField();
    expect(field.sampleHeight(0, 0)).toBe(0);
    expect(field.sampleHeight(37, -12)).toBe(0);
    expect(field.sampleNormal(5, 5)).toEqual([0, 1, 0]);
  });

  test("rolling field stays subtle and is deterministic", () => {
    const field = rollingField();
    for (let x = -60; x <= 60; x += 7) {
      for (let z = -60; z <= 60; z += 7) {
        expect(Math.abs(field.sampleHeight(x, z))).toBeLessThanOrEqual(1);
      }
    }
    expect(field.sampleHeight(13, -21)).toBe(rollingField().sampleHeight(13, -21));
  });

  test("arena is flat at spawn, rises to a plateau, and grounds a hill", () => {
    const field = arenaField();
    expect(Math.abs(field.sampleHeight(0, 0))).toBeLessThan(0.01);
    expect(Math.abs(field.sampleHeight(6, 4))).toBeLessThan(0.01);
    expect(field.sampleHeight(55, 0)).toBeGreaterThan(4);
    expect(field.sampleHeight(-34, 30)).toBeGreaterThan(3);
  });

  test("arena path is walkable-gentle while the flank is a cliff", () => {
    const field = arenaField();
    const pathRise = field.sampleHeight(30, 0) - field.sampleHeight(24, 0);
    const cliffRise = field.sampleHeight(27, 16) - field.sampleHeight(21, 16);
    expect(cliffRise).toBeGreaterThan(pathRise);
  });

  test("normals are unit length", () => {
    const field = arenaField();
    const [nx, ny, nz] = field.sampleNormal(24, 3);
    expect(Math.abs(Math.hypot(nx, ny, nz) - 1)).toBeLessThan(1e-6);
  });

  test("terrainFieldFor maps world features", () => {
    expect(terrainFieldFor(flat()).sampleHeight(20, 20)).toBe(0);
    expect(terrainFieldFor(undefined).sampleHeight(20, 20)).toBe(
      rollingField().sampleHeight(20, 20),
    );
    expect(terrainFieldFor(arena()).sampleHeight(55, 0)).toBeGreaterThan(4);
    expect(
      terrainFieldFor(heightfield({ amplitude: 12, frequency: 0.02, seed: "x" })).sampleHeight(40, 40),
    ).toBe(
      terrainFieldFor(heightfield({ amplitude: 12, frequency: 0.02, seed: "x" })).sampleHeight(40, 40),
    );
    expect(typeof terrainFieldFor(rolling({ amplitude: 2 })).sampleHeight(10, 10)).toBe("number");
  });
});
