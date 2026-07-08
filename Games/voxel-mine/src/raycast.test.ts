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

  test("a fully diagonal ray still resolves the correct crossing face", () => {
    const origin: Vec3 = [0.5, 5.5, 0.5];
    const raw: Vec3 = [1, -1.3, 0.5];
    const length = Math.hypot(...raw);
    const direction: Vec3 = [raw[0] / length, raw[1] / length, raw[2] / length];
    const isStoneLayer: SolidQuery = (_x, y, _z) => y === -3;
    const hit = raycastVoxel(isStoneLayer, origin, direction, 15);
    expect(hit).not.toBeNull();
    expect(hit!.cell[1]).toBe(-3);
    expect(hit!.normal).toEqual([0, 1, 0]);
  });

  test("negative-coordinate cells resolve correctly, matching the voxel-mine depth axis", () => {
    const origin: Vec3 = [0.5, -1.5, 0.5];
    const hit = raycastVoxel(only(0, -7, 0), origin, [0, -1, 0], 10);
    expect(hit).not.toBeNull();
    expect(hit!.cell).toEqual([0, -7, 0]);
    expect(hit!.normal).toEqual([0, 1, 0]);
  });
});
