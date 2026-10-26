import { describe, expect, test } from "bun:test";

import { DEFAULT_INSTANCE_CELL_SIZE, groupInstancesByCell } from "./instanceCells";

const points: [number, number][] = [];
for (let x = -20; x < 20; x += 3) for (let z = -20; z < 20; z += 5) points.push([x + 0.5, z + 0.25]);

describe("groupInstancesByCell", () => {
  test("every item lands in exactly one cell that contains it", () => {
    const cells = groupInstancesByCell(points, 8, (p) => p);
    expect(cells.reduce((sum, cell) => sum + cell.items.length, 0)).toBe(points.length);
    for (const cell of cells) {
      expect(cell.items.length).toBeGreaterThan(0);
      for (const [x, z] of cell.items) {
        expect(x).toBeGreaterThanOrEqual(cell.min[0]);
        expect(x).toBeLessThan(cell.min[0] + cell.size);
        expect(z).toBeGreaterThanOrEqual(cell.min[1]);
        expect(z).toBeLessThan(cell.min[1] + cell.size);
      }
    }
  });

  test("cells come out row-major whatever the input order", () => {
    const a = groupInstancesByCell(points, 8, (p) => p);
    const b = groupInstancesByCell([...points].reverse(), 8, (p) => p);
    expect(a.map((cell) => cell.key)).toEqual(b.map((cell) => cell.key));
    for (let i = 1; i < a.length; i += 1) {
      const [px, pz] = a[i - 1]!.min;
      const [x, z] = a[i]!.min;
      expect(pz < z || (pz === z && px < x)).toBe(true);
    }
  });

  test("a bad cell size falls back to the default", () => {
    for (const size of [0, -4, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(groupInstancesByCell(points, size, (p) => p)[0]!.size).toBe(DEFAULT_INSTANCE_CELL_SIZE);
    }
  });
});
