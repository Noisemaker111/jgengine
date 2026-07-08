import { describe, expect, test } from "bun:test";
import { raycastVoxel, type SolidQuery, type Vec3 } from "./raycast";

const only = (cx: number, cy: number, cz: number): SolidQuery => (x, y, z) =>
  x === cx && y === cy && z === cz;

describe("raycastVoxel", () => {
  test("looking straight down hits the block below and reports the top face", () => {
    const origin: Vec3 = [0.5, 5, 0.5];
    const hit = raycastVoxel(only(0, 0, 0), origin, [0, -1, 0], 10);
    expect(hit).not.toBeNull();
    expect(hit!.cell).toEqual([0, 0, 0]);
    expect(hit!.normal).toEqual([0, 1, 0]);
  });

  test("horizontal ray reports the facing side normal for placement", () => {
    const origin: Vec3 = [-2.5, 0.5, 0.5];
    const hit = raycastVoxel(only(0, 0, 0), origin, [1, 0, 0], 10);
    expect(hit!.cell).toEqual([0, 0, 0]);
    expect(hit!.normal).toEqual([-1, 0, 0]);
    const placeAt: Vec3 = [
      hit!.cell[0] + hit!.normal[0],
      hit!.cell[1] + hit!.normal[1],
      hit!.cell[2] + hit!.normal[2],
    ];
    expect(placeAt).toEqual([-1, 0, 0]);
  });

  test("returns null when nothing is within reach", () => {
    expect(raycastVoxel(only(0, 0, 0), [0.5, 5, 0.5], [0, 1, 0], 10)).toBeNull();
    expect(raycastVoxel(only(0, 0, 0), [0.5, 5, 0.5], [0, -1, 0], 2)).toBeNull();
  });

  test("a ray already inside a solid cell returns that cell", () => {
    const hit = raycastVoxel(only(3, 3, 3), [3.5, 3.5, 3.5], [0, -1, 0], 4);
    expect(hit!.cell).toEqual([3, 3, 3]);
  });
});
