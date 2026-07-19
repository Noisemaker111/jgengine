import { describe, expect, test } from "bun:test";

import { deriveBuildingLots, facingRotation, type RoadFrontage } from "./buildingLots";
import { resolveStructureBuildings } from "./environmentSummary";
import { building } from "./features";
import type { Vec2 } from "./cityGeometry";

function line(a: Vec2, b: Vec2, n = 6): Vec2[] {
  const pts: Vec2[] = [];
  for (let i = 0; i <= n; i += 1) pts.push([a[0] + ((b[0] - a[0]) * i) / n, a[1] + ((b[1] - a[1]) * i) / n]);
  return pts;
}

/** Nearest distance from a point to a polyline. */
function distToPolyline(path: readonly Vec2[], x: number, z: number): number {
  let best = Infinity;
  for (let i = 0; i + 1 < path.length; i += 1) {
    const [ax, az] = path[i]!;
    const [bx, bz] = path[i + 1]!;
    const vx = bx - ax;
    const vz = bz - az;
    const len2 = vx * vx + vz * vz;
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((x - ax) * vx + (z - az) * vz) / len2));
    best = Math.min(best, Math.hypot(x - (ax + vx * t), z - (az + vz * t)));
  }
  return best;
}

const ROAD: RoadFrontage = { path: line([-60, 0], [60, 0]), width: 8 };

describe("deriveBuildingLots — frontage placement", () => {
  test("lots set back off the road: every front face clears the carriageway", () => {
    const setback = 3;
    const footprint = { w: 12, d: 10 };
    const lots = deriveBuildingLots({ roads: [ROAD], footprint, setback });
    expect(lots.length).toBeGreaterThan(4);
    for (const lot of lots) {
      // frontDistance is the curb + sidewalk offset the API promises.
      expect(lot.frontDistance).toBeCloseTo(ROAD.width / 2 + setback, 6);
      // Front face point = center moved footprint.d/2 toward the road along the facing direction.
      const fx = Math.sin(lot.rotationY);
      const fz = Math.cos(lot.rotationY);
      const frontX = lot.center[0] + fx * (footprint.d / 2);
      const frontZ = lot.center[1] + fz * (footprint.d / 2);
      const d = distToPolyline(ROAD.path, frontX, frontZ);
      // Front face sits on the sidewalk edge, never inside the road half-width.
      expect(d).toBeGreaterThanOrEqual(ROAD.width / 2 - 1e-6);
      expect(d).toBeCloseTo(ROAD.width / 2 + setback, 4);
    }
  });

  test("buildings face their frontage road (orientation math)", () => {
    const lots = deriveBuildingLots({ roads: [ROAD], footprint: { w: 12, d: 10 }, setback: 3 });
    for (const lot of lots) {
      // Facing direction (engine +z under yaw) must point from the lot center toward the road.
      const fx = Math.sin(lot.rotationY);
      const fz = Math.cos(lot.rotationY);
      // Nearest point on the road centerline (a straight road along x → nearest is (cx, 0)).
      const toRoadX = lot.center[0] - lot.center[0]; // 0
      const toRoadZ = 0 - lot.center[1];
      const len = Math.hypot(toRoadX, toRoadZ) || 1;
      const dot = fx * (toRoadX / len) + fz * (toRoadZ / len);
      expect(dot).toBeGreaterThan(0.999);
    }
  });

  test("both sides sit on opposite sides of the road; single side does not", () => {
    const both = deriveBuildingLots({ roads: [ROAD], footprint: { w: 12, d: 10 }, setback: 3 });
    expect(both.some((l) => l.center[1] > 0)).toBe(true);
    expect(both.some((l) => l.center[1] < 0)).toBe(true);
    const one = deriveBuildingLots({ roads: [ROAD], footprint: { w: 12, d: 10 }, setback: 3, bothSides: false });
    expect(one.every((l) => l.side === 1)).toBe(true);
    expect(one.every((l) => l.center[1] > 0)).toBe(true);
    expect(one.length).toBeLessThan(both.length);
  });

  test("identical inputs (and seed) yield identical layouts", () => {
    const opts = { roads: [ROAD], footprint: { w: 12, d: 10 }, setback: 3, seed: "vice" } as const;
    expect(deriveBuildingLots(opts)).toEqual(deriveBuildingLots(opts));
  });

  test("counts are bounded by maxLots", () => {
    const longRoad: RoadFrontage = { path: line([-2000, 0], [2000, 0], 40), width: 8 };
    const lots = deriveBuildingLots({ roads: [longRoad], footprint: { w: 8, d: 8 }, spacing: 1, maxLots: 25 });
    expect(lots.length).toBeLessThanOrEqual(25);
    expect(lots.length).toBeGreaterThan(0);
  });

  test("area clips lots to the district rectangle", () => {
    const lots = deriveBuildingLots({
      roads: [ROAD],
      footprint: { w: 12, d: 10 },
      setback: 3,
      area: { center: [0, 0], halfExtents: [20, 40] },
    });
    expect(lots.length).toBeGreaterThan(0);
    for (const lot of lots) {
      expect(Math.abs(lot.center[0])).toBeLessThanOrEqual(20);
      expect(Math.abs(lot.center[1])).toBeLessThanOrEqual(40);
    }
  });

  test("crossing roads do not stack buildings at the corner", () => {
    const roads: RoadFrontage[] = [
      { path: line([-40, 0], [40, 0]), width: 8 },
      { path: line([0, -40], [0, 40]), width: 8 },
    ];
    const lots = deriveBuildingLots({ roads, footprint: { w: 12, d: 10 }, setback: 3 });
    const minSep = Math.hypot(12, 10) * 0.5;
    for (let i = 0; i < lots.length; i += 1) {
      for (let j = i + 1; j < lots.length; j += 1) {
        const d = Math.hypot(lots[i]!.center[0] - lots[j]!.center[0], lots[i]!.center[1] - lots[j]!.center[1]);
        expect(d).toBeGreaterThan(minSep - 1e-6);
      }
    }
  });

  test("facingRotation turns local +z to face away from the outward normal", () => {
    // Outward normal +z → building must face −z (toward a road on its −z side).
    const yaw = facingRotation([0, 1]);
    expect(Math.sin(yaw)).toBeCloseTo(0, 6);
    expect(Math.cos(yaw)).toBeCloseTo(-1, 6);
  });

  test("empty / degenerate roads produce no lots without throwing", () => {
    expect(deriveBuildingLots({ roads: [] })).toEqual([]);
    expect(deriveBuildingLots({ roads: [{ path: [[0, 0]], width: 8 }] })).toEqual([]);
    expect(deriveBuildingLots({ roads: [{ path: [[0, 0], [0, 0]], width: 8 }] })).toEqual([]);
  });
});

describe("deriveBuildingLots — blockFill frontage compaction", () => {
  const longRoad: RoadFrontage = { path: line([-120, 0], [120, 0]), width: 9 };
  const oneSide = (blockFill: number | undefined) =>
    deriveBuildingLots({ roads: [longRoad], blockFill })
      .filter((l) => l.side === 1)
      .sort((a, b) => a.center[0] - b.center[0]);

  test("the reference dial (0.45) is byte-identical to omitting it entirely", () => {
    // The default look must be reproducible so callers can leave the dial unset.
    expect(deriveBuildingLots({ roads: [longRoad], blockFill: 0.45 })).toEqual(
      deriveBuildingLots({ roads: [longRoad] }),
    );
  });

  test("full fill closes the along-road gap: consecutive lots touch (step ≈ width)", () => {
    const lots = oneSide(1);
    expect(lots.length).toBeGreaterThan(4);
    const w = lots[0]!.footprint.w;
    for (let i = 1; i < lots.length; i += 1) {
      const step = lots[i]!.center[0] - lots[i - 1]!.center[0];
      // Edge-to-edge: the gap between footprints is a hair ≤ 0, never a visible gap.
      expect(step - w).toBeLessThanOrEqual(0.01);
    }
  });

  test("a low dial reads sparser than the default (wider gaps, fewer lots)", () => {
    const sparse = oneSide(0);
    const dfl = oneSide(undefined);
    expect(sparse.length).toBeLessThan(dfl.length);
    const gap = (ls: typeof sparse) => (ls[1]!.center[0] - ls[0]!.center[0]) - ls[0]!.footprint.w;
    expect(gap(sparse)).toBeGreaterThan(gap(dfl));
  });

  test("compaction is monotonic and deterministic", () => {
    const gapAt = (f: number) => {
      const ls = oneSide(f);
      return (ls[1]!.center[0] - ls[0]!.center[0]) - ls[0]!.footprint.w;
    };
    expect(gapAt(0)).toBeGreaterThan(gapAt(0.45));
    expect(gapAt(0.45)).toBeGreaterThan(gapAt(0.8));
    expect(gapAt(0.8)).toBeGreaterThan(gapAt(1));
    expect(oneSide(1)).toEqual(oneSide(1));
  });
});

describe("resolveStructureBuildings — along mode", () => {
  test("along descriptor produces street-aligned, rotated buildings", () => {
    const descriptor = building({
      along: { roads: [{ path: line([-40, 0], [40, 0]), width: 8 }], setback: 3 },
      footprint: { w: 12, d: 10 },
      stories: [2, 5],
      seed: "isle",
    });
    const built = resolveStructureBuildings(descriptor);
    expect(built.length).toBeGreaterThan(3);
    for (const b of built) {
      expect(typeof b.rotationY).toBe("number");
      expect(b.parts.length).toBeGreaterThan(0);
    }
    // Some building faces the −z side road (front dir points back toward z=0).
    expect(built.some((b) => Math.abs((b.rotationY ?? 0)) > 0.01)).toBe(true);
  });

  test("grid mode is unchanged and carries no rotation", () => {
    const grid = resolveStructureBuildings(building({ count: 4, footprint: { w: 8, d: 8 } }));
    expect(grid.length).toBe(4);
    for (const b of grid) expect(b.rotationY).toBeUndefined();
  });

  test("same seed ⇒ identical resolved layout in along mode", () => {
    const make = () =>
      resolveStructureBuildings(
        building({ along: { roads: [{ path: line([-40, 0], [40, 0]), width: 8 }] }, seed: "same", footprint: { w: 12, d: 10 } }),
      );
    const a = make();
    const b = make();
    expect(a.length).toBe(b.length);
    expect(a.map((x) => [x.center, x.rotationY])).toEqual(b.map((x) => [x.center, x.rotationY]));
  });
});
