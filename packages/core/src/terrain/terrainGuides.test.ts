import { describe, expect, it } from "bun:test";

import {
  chooseContourInterval,
  drapePolyline,
  extractContours,
  sampleElevation,
  sampleHeightGrid,
  summarizeElevation,
  surfaceGridLines,
  surfaceRing,
  terrainContourGuides,
  type ContourLine,
  type GuideRegion,
} from "./terrainGuides";

const REGION: GuideRegion = { minX: -10, minZ: -10, maxX: 10, maxZ: 10 };

/** A linear east-facing ramp: height equals x, so iso-lines are vertical lines x = level. */
const ramp = (x: number, _z: number): number => x;

function segmentPoints(line: ContourLine): Array<[number, number]> {
  const pts: Array<[number, number]> = [];
  for (let i = 0; i < line.segments.length; i += 2) {
    pts.push([line.segments[i]!, line.segments[i + 1]!]);
  }
  return pts;
}

describe("sampleHeightGrid", () => {
  it("captures min/max over the region and clamps resolution to the budget", () => {
    const grid = sampleHeightGrid(ramp, REGION, 1000, 32);
    expect(grid.cols).toBe(33);
    expect(grid.rows).toBe(33);
    expect(grid.min).toBeCloseTo(-10, 6);
    expect(grid.max).toBeCloseTo(10, 6);
  });

  it("rejects a degenerate region", () => {
    expect(() => sampleHeightGrid(ramp, { minX: 0, minZ: 0, maxX: 0, maxZ: 5 }, 8)).toThrow();
  });
});

describe("extractContours", () => {
  it("traces vertical iso-lines on a linear ramp at the expected x", () => {
    const lines = extractContours(ramp, { region: REGION, interval: 5, resolution: 40 });
    // Levels strictly inside (-10, 10) at multiples of 5: -5, 0, 5.
    expect(lines.map((l) => l.level)).toEqual([-5, 0, 5]);
    for (const line of lines) {
      for (const [x] of segmentPoints(line)) {
        expect(x).toBeCloseTo(line.level, 4);
      }
    }
  });

  it("marks every majorEvery-th line as major", () => {
    const lines = extractContours(ramp, { region: REGION, interval: 5, resolution: 40, majorEvery: 2 });
    const byLevel = new Map(lines.map((l) => [l.level, l.major]));
    // step = level/interval: -5→-1 (odd→minor), 0→0 (major), 5→1 (odd→minor).
    expect(byLevel.get(0)).toBe(true);
    expect(byLevel.get(-5)).toBe(false);
    expect(byLevel.get(5)).toBe(false);
  });

  it("returns no contours on flat ground", () => {
    expect(extractContours(() => 3, { region: REGION, interval: 1 })).toEqual([]);
  });

  it("rejects a non-positive interval", () => {
    expect(() => extractContours(ramp, { region: REGION, interval: 0 })).toThrow();
  });

  it("closes a circular contour around a radial cone", () => {
    // Cone peaking at origin: height = 10 - distance. Iso-line at level L is a circle radius (10 - L).
    const cone = (x: number, z: number): number => 10 - Math.hypot(x, z);
    const lines = extractContours(cone, { region: REGION, interval: 3, resolution: 64 });
    const ring = lines.find((l) => l.level === 6);
    expect(ring).toBeDefined();
    for (const [x, z] of segmentPoints(ring!)) {
      expect(Math.hypot(x, z)).toBeCloseTo(4, 0);
    }
  });
});

describe("chooseContourInterval", () => {
  it("picks a nice 1/2/2.5/5 x 10^n step near the target line count", () => {
    expect(chooseContourInterval(100, 10)).toBe(10);
    expect(chooseContourInterval(50, 10)).toBe(5);
    expect(chooseContourInterval(1, 10)).toBeCloseTo(0.1, 6);
  });

  it("returns 0 for non-positive relief", () => {
    expect(chooseContourInterval(0)).toBe(0);
    expect(chooseContourInterval(-5)).toBe(0);
  });

  it("keeps the resulting band count reasonable", () => {
    const interval = chooseContourInterval(37, 12);
    expect(interval).toBeGreaterThan(0);
    const bands = 37 / interval;
    expect(bands).toBeGreaterThan(6);
    expect(bands).toBeLessThan(24);
  });
});

describe("sampleElevation", () => {
  it("reports height and signed delta from the reference plane", () => {
    const readout = sampleElevation(ramp, 4, 2, 1.5);
    expect(readout.height).toBe(4);
    expect(readout.delta).toBe(2.5);
    expect(readout.reference).toBe(1.5);
  });

  it("defaults the reference to zero", () => {
    expect(sampleElevation(ramp, -3, 0).delta).toBe(-3);
  });
});

describe("summarizeElevation", () => {
  it("computes min/max/mean/range and the extreme positions on a ramp", () => {
    const summary = summarizeElevation(ramp, REGION, 20);
    expect(summary.min).toBeCloseTo(-10, 6);
    expect(summary.max).toBeCloseTo(10, 6);
    expect(summary.mean).toBeCloseTo(0, 6);
    expect(summary.range).toBeCloseTo(20, 6);
    expect(summary.minAt[0]).toBeCloseTo(-10, 6);
    expect(summary.maxAt[0]).toBeCloseTo(10, 6);
  });
});

describe("drapePolyline", () => {
  it("lifts vertices onto the surface with an offset and subdivides long spans", () => {
    const draped = drapePolyline(ramp, [[-4, 0], [4, 0]], { spacing: 2, offset: 0.1 });
    expect(draped.length).toBeGreaterThanOrEqual(3 * 5); // start + 4 subdivisions
    // y follows surface (x) + offset; z stays 0.
    for (let i = 0; i < draped.length; i += 3) {
      const x = draped[i]!;
      const y = draped[i + 1]!;
      const z = draped[i + 2]!;
      expect(y).toBeCloseTo(x + 0.1, 6);
      expect(z).toBe(0);
    }
  });

  it("returns a single lifted vertex for a one-point path", () => {
    expect(drapePolyline(ramp, [[5, 5]], { offset: 1 })).toEqual([5, 6, 5]);
  });
});

describe("surfaceRing", () => {
  it("returns a closed loop draped on the surface", () => {
    const ring = surfaceRing(ramp, [0, 0], 3, 16, { offset: 0.2, spacing: 100 });
    const vertexCount = ring.length / 3;
    expect(vertexCount).toBe(17); // n + 1 vertices, loop closed (no subdivision at wide spacing)
    // First and last vertex coincide in XZ.
    expect(ring[0]).toBeCloseTo(ring[ring.length - 3]!, 6);
    expect(ring[2]).toBeCloseTo(ring[ring.length - 1]!, 6);
  });
});

describe("surfaceGridLines", () => {
  it("emits constant-x and constant-z lines at spacing, draped on the surface", () => {
    const lines = surfaceGridLines(ramp, { region: REGION, spacing: 5, majorEvery: 2 });
    const xLines = lines.filter((l) => l.axis === "x").map((l) => l.at);
    const zLines = lines.filter((l) => l.axis === "z").map((l) => l.at);
    expect(xLines).toEqual([-10, -5, 0, 5, 10]);
    expect(zLines).toEqual([-10, -5, 0, 5, 10]);
    // A constant-x line holds x; on the ramp its y equals x everywhere.
    const line0 = lines.find((l) => l.axis === "x" && l.at === 0)!;
    for (let i = 0; i < line0.points.length; i += 3) {
      expect(line0.points[i]).toBeCloseTo(0, 6);
      expect(line0.points[i + 1]).toBeCloseTo(0, 6);
    }
    expect(lines.find((l) => l.axis === "x" && l.at === 0)!.major).toBe(true);
    expect(lines.find((l) => l.axis === "x" && l.at === 5)!.major).toBe(false);
  });

  it("rejects non-positive spacing", () => {
    expect(() => surfaceGridLines(ramp, { region: REGION, spacing: 0 })).toThrow();
  });
});

describe("terrainContourGuides", () => {
  it("auto-picks an interval from relief and returns matching contours", () => {
    const field = { sampleHeight: ramp };
    const guides = terrainContourGuides(field, REGION, 8);
    expect(guides.summary.range).toBeCloseTo(20, 6);
    expect(guides.interval).toBeGreaterThan(0);
    expect(guides.contours.length).toBeGreaterThan(0);
    for (const line of guides.contours) {
      expect(line.level % guides.interval).toBeCloseTo(0, 6);
    }
  });

  it("yields an empty contour set for flat ground", () => {
    const guides = terrainContourGuides({ sampleHeight: () => 2 }, REGION);
    expect(guides.interval).toBe(0);
    expect(guides.contours).toEqual([]);
  });
});
