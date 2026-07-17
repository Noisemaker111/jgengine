import { describe, expect, test } from "bun:test";

import { seededRng } from "../random/rng";
import type { Aabb, Vec2 } from "./geometry";
import {
  annulusRegion,
  boxRegion,
  customRegion,
  discRegion,
  pointSetRegion,
  polygonRegion,
  rectRegion,
  sampleBatch,
  samplePoint,
  sampleStratified,
  shellRegion,
  sphereRegion,
  weightedRegion,
  type Point3,
} from "./spatialSample";

const RECT: Aabb = { minX: -50, minZ: -50, maxX: 50, maxZ: 50 };

function dist(a: readonly number[], b: readonly number[]): number {
  let sum = 0;
  for (let i = 0; i < Math.min(a.length, b.length); i += 1) sum += (a[i]! - b[i]!) ** 2;
  return Math.sqrt(sum);
}

describe("samplePoint determinism", () => {
  test("same seed → identical result", () => {
    const opts = () => ({ region: rectRegion(RECT), rng: seededRng("s") });
    expect(samplePoint(opts())).toEqual(samplePoint(opts()));
  });

  test("different seed → different point", () => {
    const a = samplePoint({ region: rectRegion(RECT), rng: seededRng("a") });
    const b = samplePoint({ region: rectRegion(RECT), rng: seededRng("b") });
    expect(a.point).not.toEqual(b.point);
  });

  test("accepts an in-region point and reports attempts", () => {
    const result = samplePoint({ region: rectRegion(RECT), rng: seededRng("ok") });
    expect(result.ok).toBe(true);
    expect(result.reason).toBe("accepted");
    expect(result.attempts).toBe(1);
    expect(result.usedFallback).toBe(false);
  });
});

describe("region distribution policies", () => {
  test("rect uniform draws x then z within bounds", () => {
    const rng = seededRng("rect");
    const region = rectRegion(RECT);
    for (let i = 0; i < 200; i += 1) {
      const [x, z] = region.sample(rng);
      expect(x).toBeGreaterThanOrEqual(RECT.minX);
      expect(x).toBeLessThanOrEqual(RECT.maxX);
      expect(z).toBeGreaterThanOrEqual(RECT.minZ);
      expect(z).toBeLessThanOrEqual(RECT.maxZ);
    }
  });

  test("disc points stay within radius; area vs radial differ", () => {
    const area = discRegion([0, 0], 10, { distribution: "area" });
    const radial = discRegion([0, 0], 10, { distribution: "radial" });
    const ra = seededRng("d");
    const rr = seededRng("d");
    let anyDiffer = false;
    for (let i = 0; i < 100; i += 1) {
      const pa = area.sample(ra);
      const pr = radial.sample(rr);
      expect(dist(pa, [0, 0])).toBeLessThanOrEqual(10 + 1e-9);
      expect(dist(pr, [0, 0])).toBeLessThanOrEqual(10 + 1e-9);
      if (dist(pa, [0, 0]).toFixed(5) !== dist(pr, [0, 0]).toFixed(5)) anyDiffer = true;
    }
    expect(anyDiffer).toBe(true);
  });

  test("annulus points fall inside the ring band", () => {
    const region = annulusRegion([5, 5], 4, 9, { distribution: "radial" });
    const rng = seededRng("ann");
    for (let i = 0; i < 100; i += 1) {
      const d = dist(region.sample(rng), [5, 5]);
      expect(d).toBeGreaterThanOrEqual(4 - 1e-9);
      expect(d).toBeLessThanOrEqual(9 + 1e-9);
    }
  });

  test("radial-uniform disc matches the raw angle-then-radius idiom (migration parity)", () => {
    const center: Vec2 = [3, -7];
    const radius = 12;
    const region = discRegion(center, radius, { distribution: "radial" });
    const regionRng = seededRng("parity");
    const rawRng = seededRng("parity");
    for (let i = 0; i < 50; i += 1) {
      const p = region.sample(regionRng);
      const angle = rawRng() * Math.PI * 2;
      const r = rawRng() * radius;
      const expected: Vec2 = [center[0] + Math.cos(angle) * r, center[1] + Math.sin(angle) * r];
      expect(p[0]).toBeCloseTo(expected[0], 10);
      expect(p[1]).toBeCloseTo(expected[1], 10);
    }
  });

  test("edge distribution biases toward the boundary", () => {
    const region = rectRegion(RECT, { distribution: "edge", edgeThickness: 4 });
    const rng = seededRng("edge");
    for (let i = 0; i < 100; i += 1) {
      const [x, z] = region.sample(rng);
      const edgeDist = Math.min(x - RECT.minX, RECT.maxX - x, z - RECT.minZ, RECT.maxZ - z);
      expect(edgeDist).toBeLessThanOrEqual(4 + 1e-9);
    }
  });

  test("weighted region never picks a zero-weight member", () => {
    const region = weightedRegion<Vec2>([
      { region: discRegion([100, 0], 1), weight: 0 },
      { region: discRegion([-100, 0], 1), weight: 1 },
    ]);
    const rng = seededRng("w");
    for (let i = 0; i < 50; i += 1) expect(region.sample(rng)[0]).toBeLessThan(0);
  });

  test("point set honors weights", () => {
    const region = pointSetRegion([[0, 0], [10, 10]], { weights: [0, 1] });
    const rng = seededRng("ps");
    for (let i = 0; i < 30; i += 1) expect(region.sample(rng)).toEqual([10, 10]);
  });
});

describe("constraints", () => {
  test("exclude disc keeps points out of the keep-out", () => {
    const result = samplePoint({
      region: rectRegion(RECT),
      rng: seededRng("excl"),
      constraints: { exclude: [discRegion([0, 0], 20)] },
      maxAttempts: 50,
    });
    expect(result.ok).toBe(true);
    expect(dist(result.point!, [0, 0])).toBeGreaterThan(20);
  });

  test("include gate requires membership in every include region", () => {
    const result = samplePoint({
      region: rectRegion(RECT),
      rng: seededRng("incl"),
      constraints: { include: [discRegion([0, 0], 10)] },
      maxAttempts: 200,
    });
    expect(result.ok).toBe(true);
    expect(dist(result.point!, [0, 0])).toBeLessThanOrEqual(10);
  });

  test("project can reject by returning null and reshape accepted points", () => {
    const result = samplePoint<Vec2>({
      region: rectRegion(RECT),
      rng: seededRng("proj"),
      constraints: { project: (p) => (p[0] < 0 ? null : [Math.round(p[0]), Math.round(p[1])]) },
      maxAttempts: 100,
    });
    expect(result.ok).toBe(true);
    expect(result.point![0]).toBeGreaterThanOrEqual(0);
    expect(Number.isInteger(result.point![0])).toBe(true);
  });

  test("accept predicate is applied", () => {
    const result = samplePoint({
      region: rectRegion(RECT),
      rng: seededRng("acc"),
      constraints: { accept: (p) => p[0] > 25 },
      maxAttempts: 200,
    });
    expect(result.ok).toBe(true);
    expect(result.point![0]).toBeGreaterThan(25);
  });
});

describe("bounded attempts and fallback policy", () => {
  const impossible = { exclude: [discRegion([0, 0], 1000)] };

  test("exhaustion without fallback reports failure honestly", () => {
    const result = samplePoint({
      region: rectRegion(RECT),
      rng: seededRng("ex"),
      constraints: impossible,
      maxAttempts: 12,
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("exhausted");
    expect(result.attempts).toBe(12);
    expect(result.point).toBeNull();
    expect(result.usedFallback).toBe(false);
  });

  test("fixed-point fallback returns the safe spot flagged as fallback", () => {
    const result = samplePoint<Vec2>({
      region: rectRegion(RECT),
      rng: seededRng("fb"),
      constraints: impossible,
      maxAttempts: 5,
      fallback: { point: [999, 999] },
    });
    expect(result.ok).toBe(false);
    expect(result.usedFallback).toBe(true);
    expect(result.point).toEqual([999, 999]);
  });

  test("last-candidate fallback returns the final rejected draw", () => {
    const result = samplePoint({
      region: rectRegion(RECT),
      rng: seededRng("last"),
      constraints: impossible,
      maxAttempts: 5,
      fallback: "last-candidate",
    });
    expect(result.usedFallback).toBe(true);
    expect(result.point).not.toBeNull();
  });

  test("empty region is reported, not sampled", () => {
    const result = samplePoint({ region: discRegion([0, 0], 0), rng: seededRng("empty") });
    expect(result.reason).toBe("empty-region");
    expect(result.attempts).toBe(0);
    expect(result.point).toBeNull();
  });
});

describe("sampleBatch", () => {
  test("deterministic: same seed → same points", () => {
    const opts = () => ({ region: rectRegion(RECT), rng: seededRng("batch"), count: 20 });
    expect(sampleBatch(opts())).toEqual(sampleBatch(opts()));
  });

  test("honors minimum separation via spatial index", () => {
    const minSeparation = 8;
    const result = sampleBatch({
      region: rectRegion(RECT),
      rng: seededRng("sep"),
      count: 25,
      constraints: { minSeparation },
      maxAttempts: 60,
    });
    expect(result.placed).toBeGreaterThan(0);
    for (let i = 0; i < result.points.length; i += 1) {
      for (let j = i + 1; j < result.points.length; j += 1) {
        expect(dist(result.points[i]!, result.points[j]!)).toBeGreaterThanOrEqual(minSeparation - 1e-9);
      }
    }
  });

  test("reports incomplete fills instead of silently under-delivering", () => {
    const result = sampleBatch({
      region: rectRegion({ minX: 0, minZ: 0, maxX: 5, maxZ: 5 }),
      rng: seededRng("tight"),
      count: 100,
      constraints: { minSeparation: 4 },
      maxAttempts: 40,
    });
    expect(result.complete).toBe(false);
    expect(result.placed).toBeLessThan(100);
    expect(result.placed).toBe(result.points.length);
  });

  test("count 0 is complete with no points", () => {
    const result = sampleBatch({ region: rectRegion(RECT), rng: seededRng("z"), count: 0 });
    expect(result.complete).toBe(true);
    expect(result.points).toEqual([]);
  });
});

describe("polygon and custom regions", () => {
  test("polygon rejection keeps accepted points inside the polygon", () => {
    const triangle: Vec2[] = [
      [0, 0],
      [20, 0],
      [0, 20],
    ];
    const region = polygonRegion(triangle);
    const result = samplePoint({ region, rng: seededRng("poly"), maxAttempts: 100 });
    expect(result.ok).toBe(true);
    const [x, z] = result.point!;
    expect(x + z).toBeLessThanOrEqual(20 + 1e-9);
  });

  test("custom region wires a caller sampler and bounds", () => {
    const region = customRegion<Vec2>({
      dimensions: 2,
      sample: (rng) => [rng() * 2 - 1, 0],
      contains: (p) => Math.abs(p[0]) <= 1 && p[1] === 0,
    });
    const result = samplePoint({ region, rng: seededRng("custom") });
    expect(result.ok).toBe(true);
    expect(Math.abs(result.point![0])).toBeLessThanOrEqual(1);
  });
});

describe("3D regions", () => {
  test("box points lie within bounds", () => {
    const region = boxRegion([-2, 0, -2], [2, 4, 2]);
    const rng = seededRng("box");
    for (let i = 0; i < 100; i += 1) {
      const [x, y, z] = region.sample(rng);
      expect(x).toBeGreaterThanOrEqual(-2);
      expect(x).toBeLessThanOrEqual(2);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThanOrEqual(4);
      expect(z).toBeGreaterThanOrEqual(-2);
      expect(z).toBeLessThanOrEqual(2);
    }
  });

  test("sphere points stay within radius", () => {
    const center: Point3 = [1, 2, 3];
    const region = sphereRegion(center, 5, { distribution: "volume" });
    const rng = seededRng("sphere");
    for (let i = 0; i < 100; i += 1) expect(dist(region.sample(rng), center)).toBeLessThanOrEqual(5 + 1e-9);
  });

  test("shell points fall inside the shell band", () => {
    const center: Point3 = [0, 0, 0];
    const region = shellRegion(center, 3, 6);
    const rng = seededRng("shell");
    for (let i = 0; i < 100; i += 1) {
      const d = dist(region.sample(rng), center);
      expect(d).toBeGreaterThanOrEqual(3 - 1e-9);
      expect(d).toBeLessThanOrEqual(6 + 1e-9);
    }
  });

  test("batch separation works in 3D", () => {
    const result = sampleBatch({
      region: boxRegion([-10, -10, -10], [10, 10, 10]),
      rng: seededRng("box-sep"),
      count: 15,
      constraints: { minSeparation: 4 },
      maxAttempts: 80,
    });
    for (let i = 0; i < result.points.length; i += 1) {
      for (let j = i + 1; j < result.points.length; j += 1) {
        expect(dist(result.points[i]!, result.points[j]!)).toBeGreaterThanOrEqual(4 - 1e-9);
      }
    }
  });
});

describe("sampleStratified", () => {
  test("one point per cell, deterministic, evenly covered", () => {
    const points = sampleStratified({ area: RECT, rng: seededRng("strat"), cols: 4, rows: 5 });
    expect(points.length).toBe(20);
    expect(points).toEqual(sampleStratified({ area: RECT, rng: seededRng("strat"), cols: 4, rows: 5 }));
    for (const [x, z] of points) {
      expect(x).toBeGreaterThanOrEqual(RECT.minX);
      expect(x).toBeLessThanOrEqual(RECT.maxX);
      expect(z).toBeGreaterThanOrEqual(RECT.minZ);
      expect(z).toBeLessThanOrEqual(RECT.maxZ);
    }
  });

  test("zero jitter yields a rigid lattice", () => {
    const points = sampleStratified({ area: RECT, rng: seededRng("lat"), cols: 2, rows: 2, jitter: 0 });
    expect(points).toEqual([
      [-25, -25],
      [25, -25],
      [-25, 25],
      [25, 25],
    ]);
  });
});
