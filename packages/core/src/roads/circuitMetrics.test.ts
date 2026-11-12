import { describe, expect, test } from "bun:test";
import { analyzeCircuit, circuitMetrics } from "./circuitMetrics";
import type { PlanPoint } from "./streetMetrics";

type Piece = { straight: number } | { radius: number; angle: number; dir: 1 | -1 };

/** Lay a closed lap from straight and arc pieces at 1 m spacing, starting at the origin heading +x. */
function lay(pieces: readonly Piece[]): { points: PlanPoint[]; length: number } {
  const points: PlanPoint[] = [];
  let x = 0;
  let z = 0;
  let h = 0;
  let length = 0;
  for (const piece of pieces) {
    if ("straight" in piece) {
      const n = Math.round(piece.straight);
      for (let i = 0; i < n; i += 1) {
        points.push([x, z]);
        x += Math.cos(h) * (piece.straight / n);
        z += Math.sin(h) * (piece.straight / n);
      }
      length += piece.straight;
    } else {
      const arc = (piece.radius * piece.angle * Math.PI) / 180;
      const n = Math.max(4, Math.round(arc));
      const dh = ((piece.angle * Math.PI) / 180 / n) * piece.dir;
      const chord = 2 * piece.radius * Math.sin(Math.abs(dh) / 2);
      for (let i = 0; i < n; i += 1) {
        points.push([x, z]);
        x += Math.cos(h + dh / 2) * chord;
        z += Math.sin(h + dh / 2) * chord;
        h += dh;
      }
      length += arc;
    }
  }
  return { points, length };
}

const corner = (radius: number, angle = 90, dir: 1 | -1 = 1): Piece => ({ radius, angle, dir });

/** A 500 × 200 m rectangle with four R20 right-angle corners, starting mid-way down a long side. */
const rectangle = lay([{ straight: 250 }, corner(20), { straight: 200 }, corner(20), { straight: 500 }, corner(20), { straight: 200 }, corner(20), { straight: 250 }]);

describe("circuitMetrics", () => {
  test("a rounded rectangle: four right-angle R20 corners, two long straights, two overtaking spots", () => {
    const a = analyzeCircuit({ centerline: rectangle.points }, { requestedLength: 1500 });
    const m = a.metrics;
    expect(m.lengthM).toBeCloseTo(rectangle.length, 0);
    expect(m.lengthErrorPct).toBeCloseTo((100 * (rectangle.length - 1500)) / 1500, 1);
    expect(m.corners).toBe(4);
    expect(m.cornerKinds["right-angle"]).toBe(4);
    for (const c of a.corners) {
      expect(c.angleDeg).toBeGreaterThan(87);
      expect(c.angleDeg).toBeLessThan(93);
      expect(c.radius).toBeGreaterThan(19.5);
      expect(c.radius).toBeLessThan(20.5);
      expect(c.direction).toBe(1);
    }
    expect(m.rightAngleShare).toBe(1);
    expect(m.cornersPerKm).toBeCloseTo(4 / (rectangle.length / 1000), 2);
    expect(m.radiusP50).toBeCloseTo(20, 0);
    expect(m.straightsOver400).toBe(2);
    expect(m.straightsOver250).toBe(2);
    expect(Math.abs(m.longestStraightM - 500)).toBeLessThan(20);
    expect(m.chicanes).toBe(0);
    // Every corner is braked for hard; only the two ends of the 500 m straights set up an overtake.
    expect(m.heavyBrakingZones).toBe(4);
    expect(m.overtakingSpots).toBe(2);
    expect(m.minKph).toBeCloseTo(Math.sqrt(1.7 * 9.81 * 20) * 3.6, 0);
  });

  test("hairpins and a chicane are told apart from right angles", () => {
    // A stadium with R15 hairpin ends and a +40°/-80°/+40° R60 chicane on the back straight (it returns
    // to the same line 2·3·60·sin 40° further on, so the lap still closes).
    const chicaneRun = 4 * 60 * Math.sin((40 * Math.PI) / 180);
    const lap = lay([{ straight: 300 }, corner(15, 180), { straight: 50 }, corner(60, 40, 1), corner(60, 80, -1), corner(60, 40, 1), { straight: 250 - chicaneRun }, corner(15, 180)]);
    const a = analyzeCircuit({ centerline: lap.points });
    expect(a.metrics.cornerKinds.hairpin).toBe(2);
    expect(a.metrics.cornerKinds["right-angle"]).toBe(0);
    expect(a.metrics.chicanes).toBe(2);
    const sBend = a.corners.filter((c) => c.kind !== "hairpin");
    expect(sBend.map((c) => c.direction)).toEqual([1, -1, 1]);
    expect(sBend.map((c) => Math.round(c.angleDeg / 10) * 10)).toEqual([40, 80, 40]);
  });

  test("elevation range, climb and steepest grade on a sine profile", () => {
    const L = rectangle.points.length;
    const heights = rectangle.points.map((_, i) => 10 * Math.sin((2 * Math.PI * i) / L));
    const m = circuitMetrics({ centerline: rectangle.points, heights });
    expect(m.elevationRangeM).toBeCloseTo(20, 1);
    expect(m.climbM).toBeCloseTo(20, 1);
    expect(m.maxGrade).toBeCloseTo((10 * 2 * Math.PI) / rectangle.length, 3);
  });

  test("grid slots in corners, sector boundaries in corners, pit connectivity and pit seals", () => {
    const widths = rectangle.points.map(() => 12);
    const apex = rectangle.points[250 + 15]!;
    const pit: PlanPoint[] = [
      [-100, 6],
      [-100, 20],
      [100, 20],
      [100, 6],
    ];
    const m = circuitMetrics({
      centerline: rectangle.points,
      widths,
      grid: [
        { x: 0, z: 0 },
        { x: -20, z: 0 },
        { x: apex[0], z: apex[1] },
      ],
      seals: [
        { x: 0, z: 20 },
        { x: 0, z: -200 },
      ],
      sectors: [0, (250 + 15.7) / rectangle.length, 0.5],
      start: { distance: 0 },
      pits: [pit],
    });
    expect(m.widthMin).toBe(12);
    expect(m.gridSlots).toBe(3);
    expect(m.gridInCorner).toBe(1);
    expect(m.sectors).toBe(3);
    expect(m.sectorBoundariesInCorners).toBe(1);
    expect(m.pits).toBe(1);
    expect(m.pitsConnected).toBe(1);
    expect(m.sealsBlockingPit).toBe(1);
    expect(m.sealsPerKm).toBeCloseTo(2 / (rectangle.length / 1000), 1);
  });
});
