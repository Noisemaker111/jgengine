import { describe, expect, test } from "bun:test";

import {
  applyLateral,
  buildLap,
  distance3,
  lapLength,
  positiveMod,
  sampleAtDistance,
  zoneRange,
  BASE_SPEED,
  BRIDGE_HEIGHT,
  MAIN_LANES,
} from "./geometry";

describe("track geometry", () => {
  test("a clean lap at 1x pace takes roughly 45 seconds", () => {
    const segments = buildLap(MAIN_LANES);
    const total = lapLength(segments);
    const seconds = total / BASE_SPEED;
    expect(seconds).toBeGreaterThan(35);
    expect(seconds).toBeLessThan(55);
  });

  test("the lap closes: start and end distance land at the same crossing point", () => {
    const segments = buildLap(MAIN_LANES);
    const total = lapLength(segments);
    const start = sampleAtDistance(segments, 0);
    const end = sampleAtDistance(segments, total);
    expect(Math.abs(start.x - end.x)).toBeLessThan(0.05);
    expect(Math.abs(start.z - end.z)).toBeLessThan(0.05);
  });

  test("the bridge pass is elevated and the grade pass is not, at the same world x/z", () => {
    const segments = buildLap(MAIN_LANES);
    const total = lapLength(segments);
    const rampZone = zoneRange(segments, "rampUp")!;
    const bridgePeak = sampleAtDistance(segments, rampZone.end);
    const gradeCrossing = sampleAtDistance(segments, total);
    expect(bridgePeak.y).toBeCloseTo(BRIDGE_HEIGHT, 1);
    expect(gradeCrossing.y).toBeCloseTo(0, 5);
    expect(Math.abs(bridgePeak.x - gradeCrossing.x)).toBeLessThan(0.5);
    expect(Math.abs(bridgePeak.z - gradeCrossing.z)).toBeLessThan(0.5);
  });

  test("fork A branch detours longer than the main arc (costs time)", () => {
    const mainSegments = buildLap({ forkA: "main", forkB: "main" });
    const branchSegments = buildLap({ forkA: "branch", forkB: "main" });
    expect(lapLength(branchSegments)).toBeGreaterThan(lapLength(mainSegments));
  });

  test("fork B branch chord is shorter than the main arc (saves time)", () => {
    const mainSegments = buildLap({ forkA: "main", forkB: "main" });
    const branchSegments = buildLap({ forkA: "main", forkB: "branch" });
    expect(lapLength(branchSegments)).toBeLessThan(lapLength(mainSegments));
  });

  test("both fork variants reconverge at the same exit point", () => {
    const mainSegments = buildLap({ forkA: "main", forkB: "main" });
    const branchSegments = buildLap({ forkA: "branch", forkB: "main" });
    const mainZone = zoneRange(mainSegments, "forkA")!;
    const branchZone = zoneRange(branchSegments, "forkA")!;
    const mainExit = sampleAtDistance(mainSegments, mainZone.end);
    const branchExit = sampleAtDistance(branchSegments, branchZone.end);
    expect(distance3(mainExit, branchExit)).toBeLessThan(0.01);
  });

  test("lateral offset moves the sample perpendicular to heading", () => {
    const segments = buildLap(MAIN_LANES);
    const centered = sampleAtDistance(segments, 10);
    const offset = applyLateral(centered, 1);
    expect(distance3(centered, offset)).toBeGreaterThan(1);
  });

  test("positiveMod always returns a non-negative result", () => {
    expect(positiveMod(-5, 3)).toBeCloseTo(1, 5);
    expect(positiveMod(7, 3)).toBeCloseTo(1, 5);
  });
});
