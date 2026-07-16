import { describe, expect, test } from "bun:test";

import { DIR_ORDER, DIR_VECTORS, addCell, cellKey, sameCell, yawToDir } from "./gridCell";

describe("gridCell", () => {
  test("DIR_VECTORS point along the cardinal axes", () => {
    expect(DIR_VECTORS.north).toEqual({ x: 0, z: -1 });
    expect(DIR_VECTORS.south).toEqual({ x: 0, z: 1 });
    expect(DIR_VECTORS.east).toEqual({ x: 1, z: 0 });
    expect(DIR_VECTORS.west).toEqual({ x: -1, z: 0 });
  });

  test("DIR_ORDER is clockwise from north", () => {
    expect(DIR_ORDER).toEqual(["north", "east", "south", "west"]);
  });

  test("cellKey is stable and unique per square", () => {
    expect(cellKey({ x: 2, z: -3 })).toBe("2,-3");
    expect(cellKey({ x: 2, z: -3 })).toBe(cellKey({ x: 2, z: -3 }));
    expect(cellKey({ x: 2, z: -3 })).not.toBe(cellKey({ x: -3, z: 2 }));
  });

  test("sameCell compares by coordinate", () => {
    expect(sameCell({ x: 1, z: 1 }, { x: 1, z: 1 })).toBe(true);
    expect(sameCell({ x: 1, z: 1 }, { x: 1, z: 2 })).toBe(false);
  });

  test("addCell steps a cell by a direction vector", () => {
    expect(addCell({ x: 4, z: 4 }, DIR_VECTORS.east)).toEqual({ x: 5, z: 4 });
    expect(addCell({ x: 4, z: 4 }, DIR_VECTORS.north)).toEqual({ x: 4, z: 3 });
  });

  test("yawToDir quantizes yaw to the nearest cardinal", () => {
    expect(yawToDir(0)).toBe("south");
    expect(yawToDir(Math.PI / 2)).toBe("east");
    expect(yawToDir(Math.PI)).toBe("north");
    expect(yawToDir(-Math.PI / 2)).toBe("west");
    expect(yawToDir(Math.PI / 2 - 0.1)).toBe("east");
  });

  test("yawToDir round-trips DIR_VECTORS facings", () => {
    for (const dir of DIR_ORDER) {
      const { x, z } = DIR_VECTORS[dir];
      expect(yawToDir(Math.atan2(x, z))).toBe(dir);
    }
  });
});
