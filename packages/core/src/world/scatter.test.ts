import { describe, expect, test } from "bun:test";
import { type Aabb, pointInAabb, expandAabb } from "./geometry";
import { type ScatterConfig, scatter, scatterAabb } from "./scatter";

const areaAabb: Aabb = { minX: -50, minZ: -50, maxX: 50, maxZ: 50 };

function insideArea(aabb: Aabb): (p: { x: number; z: number }) => boolean {
  return (p) => pointInAabb([p.x, p.z], aabb);
}

describe("scatterAabb", () => {
  test("normalizes {w,d,center} correctly", () => {
    expect(scatterAabb({ w: 20, d: 10, center: [5, -3] })).toEqual({
      minX: -5,
      minZ: -8,
      maxX: 15,
      maxZ: 2,
    });
  });

  test("defaults center to origin", () => {
    expect(scatterAabb({ w: 8, d: 4 })).toEqual({ minX: -4, minZ: -2, maxX: 4, maxZ: 2 });
  });

  test("passes a raw Aabb through", () => {
    expect(scatterAabb(areaAabb)).toEqual(areaAabb);
  });
});

describe("scatter determinism", () => {
  test("same config → identical array", () => {
    const config: ScatterConfig = { area: areaAabb, count: 40, seed: "grass", minDistance: 3, jitter: 0.8 };
    expect(scatter(config)).toEqual(scatter(config));
  });

  test("different seed → different output", () => {
    const a = scatter({ area: areaAabb, count: 40, seed: "a" });
    const b = scatter({ area: areaAabb, count: 40, seed: "b" });
    expect(a).not.toEqual(b);
  });
});

describe("scatter bounds & count", () => {
  test("all points lie within the area Aabb", () => {
    const points = scatter({ area: { w: 100, d: 60, center: [10, 10] }, count: 200, seed: "bounds" });
    const aabb = scatterAabb({ w: 100, d: 60, center: [10, 10] });
    expect(points.every(insideArea(aabb))).toBe(true);
  });

  test("count is respected when there is room", () => {
    const points = scatter({ area: areaAabb, count: 50, seed: "count" });
    expect(points.length).toBe(50);
  });

  test("indices are a running sequence", () => {
    const points = scatter({ area: areaAabb, count: 30, seed: "idx" });
    expect(points.map((p) => p.index)).toEqual(points.map((_, i) => i));
  });

  test("count is <= target when space-constrained", () => {
    const points = scatter({ area: { w: 5, d: 5 }, count: 100, seed: "tight", minDistance: 4 });
    expect(points.length).toBeLessThan(100);
    expect(points.length).toBeGreaterThan(0);
  });
});

describe("scatter minDistance", () => {
  test("no two accepted points are closer than minDistance", () => {
    const minDistance = 6;
    const points = scatter({ area: areaAabb, count: 60, seed: "spacing", minDistance });
    for (let i = 0; i < points.length; i++) {
      for (let j = i + 1; j < points.length; j++) {
        const dx = points[i].x - points[j].x;
        const dz = points[i].z - points[j].z;
        expect(Math.hypot(dx, dz)).toBeGreaterThanOrEqual(minDistance - 1e-9);
      }
    }
  });
});

describe("scatter avoid", () => {
  test("no point lies inside an avoid AABB expanded by margin", () => {
    const avoid: Aabb = { minX: -10, minZ: -10, maxX: 10, maxZ: 10 };
    const avoidMargin = 5;
    const points = scatter({
      area: areaAabb,
      count: 300,
      seed: "avoid",
      avoid: [avoid],
      avoidMargin,
    });
    const forbidden = expandAabb(avoid, avoidMargin);
    expect(points.some((p) => pointInAabb([p.x, p.z], forbidden))).toBe(false);
    expect(points.length).toBeGreaterThan(0);
  });
});

describe("scatter density", () => {
  test("density-derived count works when count omitted", () => {
    const points = scatter({ area: areaAabb, density: 0.02, seed: "density" });
    expect(points.length).toBe(Math.floor(100 * 100 * 0.02));
  });

  test("default density applies when neither count nor density given", () => {
    const points = scatter({ area: areaAabb, seed: "default-density" });
    expect(points.length).toBe(Math.floor(100 * 100 * 0.01));
  });
});
