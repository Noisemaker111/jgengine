import { describe, expect, test } from "bun:test";

import {
  buildRibbonGeometry,
  cumulativeLengths,
  lateralOffset,
  sampleCheckpoints,
  stadiumCenterline,
  tangentAt,
} from "./geometry";

const CONFIG = { straightLength: 70, turnRadius: 24, segmentsPerTurn: 20 };
const CENTERLINE = stadiumCenterline(CONFIG);
const LENGTHS = cumulativeLengths(CENTERLINE);

describe("stadiumCenterline", () => {
  test("produces a closed loop with the expected point count", () => {
    expect(CENTERLINE.length).toBe(2 + CONFIG.segmentsPerTurn * 2);
  });

  test("total length matches two straights plus two semicircles", () => {
    const expected = CONFIG.straightLength * 2 + Math.PI * CONFIG.turnRadius * 2;
    expect(LENGTHS[LENGTHS.length - 1]!).toBeGreaterThan(expected * 0.97);
    expect(LENGTHS[LENGTHS.length - 1]!).toBeLessThan(expected * 1.03);
  });
});

describe("sampleCheckpoints", () => {
  const checkpoints = sampleCheckpoints(CENTERLINE, LENGTHS, 10, 12);

  test("returns the requested count, last one is the finish line", () => {
    expect(checkpoints.length).toBe(10);
    expect(checkpoints[9]!.id).toBe("finish");
    expect(checkpoints[0]!.id).toBe("cp-0");
  });

  test("checkpoints are spaced roughly evenly along the loop", () => {
    const total = LENGTHS[LENGTHS.length - 1]!;
    const expectedSpacing = total / 10;
    for (let i = 0; i < checkpoints.length; i += 1) {
      const a = checkpoints[i]!.center;
      const b = checkpoints[(i + 1) % checkpoints.length]!.center;
      const dist = Math.hypot(b[0] - a[0], b[2] - a[2]);
      expect(dist).toBeGreaterThan(expectedSpacing * 0.5);
      expect(dist).toBeLessThan(expectedSpacing * 1.6);
    }
  });
});

describe("lateralOffset", () => {
  test("is ~0 for points sitting on the centerline", () => {
    for (const p of CENTERLINE) {
      expect(lateralOffset([p.x, p.z], CENTERLINE)).toBeLessThan(0.01);
    }
  });

  test("grows for points far off the track", () => {
    const straightMid = { x: 0, z: -24 };
    expect(lateralOffset([straightMid.x, straightMid.z - 40], CENTERLINE)).toBeGreaterThan(30);
  });
});

describe("tangentAt", () => {
  test("returns a unit vector", () => {
    const t = tangentAt(CENTERLINE, LENGTHS, 5);
    expect(Math.hypot(t.x, t.z)).toBeCloseTo(1, 5);
  });
});

describe("buildRibbonGeometry", () => {
  test("emits two vertices per centerline point and two triangles per segment", () => {
    const ribbon = buildRibbonGeometry(CENTERLINE, 12, 0.02);
    expect(ribbon.positions.length).toBe(CENTERLINE.length * 2 * 3);
    expect(ribbon.indices.length).toBe(CENTERLINE.length * 6);
    for (const index of ribbon.indices) {
      expect(index).toBeLessThan(CENTERLINE.length * 2);
    }
  });
});
