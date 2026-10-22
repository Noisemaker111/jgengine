import { describe, expect, test } from "bun:test";
import { devtools } from "@jgengine/core/devtools/devtools";
import {
  coverPointsFromSolids,
  coverPointsNear,
  createCoverField,
  scoreCoverPoint,
  selectCover,
  type CoverPoint,
  type CoverSolid,
  type CoverThreat,
} from "@jgengine/core/combat";
import { hasWallLineOfSight, type VisionWall } from "@jgengine/core/sensor/visionCone";

/** The four XZ edges of an axis-aligned authored box, as sight-blocking wall segments. */
function edges(box: CoverSolid): VisionWall[] {
  const [cx, , cz] = box.center;
  const [hx, , hz] = box.halfExtents;
  const a: [number, number] = [cx - hx, cz - hz];
  const b: [number, number] = [cx + hx, cz - hz];
  const c: [number, number] = [cx + hx, cz + hz];
  const d: [number, number] = [cx - hx, cz + hz];
  return [
    { from: a, to: b },
    { from: b, to: c },
    { from: c, to: d },
    { from: d, to: a },
  ];
}

function sightFrom(boxes: readonly CoverSolid[]): (from: readonly [number, number, number], to: readonly [number, number, number]) => boolean {
  const walls = boxes.flatMap(edges);
  return (from, to) => !hasWallLineOfSight([from[0], from[2]], [to[0], to[2]], walls);
}

const PILLAR: CoverSolid = { center: [6, 1, 6], halfExtents: [3, 1, 3] };

function offsetAroundThreat(point: CoverPoint, threat: CoverThreat, line: readonly [number, number, number]): number {
  const axisX = line[0] - threat.position[0];
  const axisZ = line[2] - threat.position[2];
  const dirX = point.position[0] - threat.position[0];
  const dirZ = point.position[2] - threat.position[2];
  let delta = Math.atan2(dirX, dirZ) - Math.atan2(axisX, axisZ);
  while (delta > Math.PI) delta -= Math.PI * 2;
  while (delta < -Math.PI) delta += Math.PI * 2;
  return Math.abs(delta);
}

describe("cover points from authored geometry", () => {
  test("every stand point sits beside a box face and the layout, not a coordinate list, decides them", () => {
    const points = coverPointsFromSolids([PILLAR], { standOff: 0.7, spacing: 2, maxPerFace: 3 });
    expect(points.length).toBe(8);
    for (const point of points) {
      const dx = Math.max(Math.abs(point.position[0] - PILLAR.center[0]) - PILLAR.halfExtents[0], 0);
      const dz = Math.max(Math.abs(point.position[2] - PILLAR.center[2]) - PILLAR.halfExtents[2], 0);
      expect(Math.hypot(dx, dz)).toBeCloseTo(0.7, 6);
      expect(Math.hypot(point.normal[0], point.normal[1])).toBeCloseTo(1, 6);
      // Stand points keep clear of the corners, where a shooter at an angle sees around the wall.
      expect(Math.abs(point.position[0] - PILLAR.center[0])).toBeLessThanOrEqual(PILLAR.halfExtents[0] + 0.71);
      expect(Math.abs(point.position[2] - PILLAR.center[2])).toBeLessThanOrEqual(PILLAR.halfExtents[2] + 0.71);
    }
    const moved = coverPointsFromSolids([{ ...PILLAR, center: [20, 1, 20] }]);
    expect(moved.map((point) => point.id)).not.toEqual(points.map((point) => point.id));
    const wider = coverPointsFromSolids([{ ...PILLAR, halfExtents: [8, 1, 3] }], { maxPerFace: 8 });
    expect(wider.length).toBeGreaterThan(points.length);
  });

  test("a rotated box turns its face normals with it", () => {
    const points = coverPointsFromSolids([{ center: [0, 1, 0], halfExtents: [2, 1, 1], rotationY: Math.PI / 4 }]);
    const normals = points.map((point) => `${point.normal[0].toFixed(2)},${point.normal[1].toFixed(2)}`);
    expect(normals).toContain("0.71,0.71");
    expect(normals).toContain("-0.71,-0.71");
  });

  test("walkable rejects stand points off the ground the game allows", () => {
    const all = coverPointsFromSolids([PILLAR]);
    const kept = coverPointsFromSolids([PILLAR], { walkable: (point) => point[0] < 6 });
    expect(kept.length).toBeGreaterThan(0);
    expect(kept.length).toBeLessThan(all.length);
  });

  test("the nearest-cover query is bounded and ordered", () => {
    const points = coverPointsFromSolids([PILLAR]);
    const near = coverPointsNear(points, [6, 0, 6], 5, 3);
    expect(near).toHaveLength(3);
    const distances = near.map((point) => Math.hypot(point.position[0] - 6, point.position[2] - 6));
    expect(distances[0]).toBeLessThanOrEqual(distances[1]!);
    expect(distances[1]).toBeLessThanOrEqual(distances[2]!);
    expect(coverPointsNear(points, [0, 0, 0], 1)).toHaveLength(0);
  });

  test("the field rebuilds from edited geometry and round-trips through its snapshot", () => {
    const field = createCoverField({ solids: [PILLAR], devtoolsName: "test.cover" });
    const before = field.count();
    const snapshot = field.snapshot();
    field.rebuild([PILLAR, { center: [6, 1, -6], halfExtents: [3, 1, 3] }]);
    expect(field.count()).toBe(before * 2);
    expect(String((devtools.probes.read() as Record<string, unknown>)["test.cover"])).toContain(`${before * 2} points from 2 solids`);
    field.restore(snapshot);
    expect(field.count()).toBe(before);
    expect(field.near([6, 0, 6], 20).length).toBe(before);
    field.dispose();
    expect((devtools.probes.read() as Record<string, unknown>)["test.cover"]).toBeUndefined();
  });
});

describe("cover selection by threat", () => {
  const boxes: CoverSolid[] = [PILLAR];
  const blocked = sightFrom(boxes);
  const points = coverPointsFromSolids(boxes, { standOff: 0.7, spacing: 2, maxPerFace: 3 });
  const position: readonly [number, number, number] = [0, 0, 6];
  const THREAT: CoverThreat = { id: "enemy", position: [0, 0, 0], confidence: 1 };

  test("a hidden point beats the one nearest the member while a threat is watching", () => {
    const nearest = coverPointsNear(points, position, 20, 1)[0]!;
    expect(blocked(nearest.position, THREAT.position)).toBe(false);

    const choice = selectCover(points, {
      position,
      radius: 20,
      threats: [THREAT],
      preferredRange: 8,
      blocked,
      hiddenOnly: true,
    });
    expect(choice).not.toBeNull();
    expect(choice!.hidden).toBeCloseTo(1, 6);
    expect(blocked(choice!.point.position, THREAT.position)).toBe(true);
    expect(choice!.point.id).not.toBe(nearest.id);
  });

  test("no remembered threat means no cover decision", () => {
    const choice = selectCover(points, { position, radius: 20, threats: [], preferredRange: 8, blocked, hiddenOnly: true });
    expect(choice).toBeNull();
  });

  test("a memory below the confidence bar stops steering cover", () => {
    const hidden = points.find((point) => blocked(point.position, THREAT.position))!;
    const fresh = scoreCoverPoint(hidden, { position, radius: 20, threats: [THREAT], preferredRange: 8, blocked })!;
    expect(fresh.hidden).toBeCloseTo(1, 6);
    expect(
      selectCover(points, {
        position,
        radius: 20,
        threats: [{ ...THREAT, confidence: 0.01 }],
        preferredRange: 8,
        blocked,
        hiddenOnly: true,
      }),
    ).toBeNull();
  });

  test("a flanker takes the off-axis point an assault walks past", () => {
    const query = { position, radius: 20, threats: [THREAT], preferredRange: 8, blocked, hiddenOnly: true } as const;
    const assault = selectCover(points, { ...query, flankAngle: 0 })!;
    const flanker = selectCover(points, { ...query, flankAngle: 1.3, weights: { near: 0.1 } })!;

    expect(assault.hidden).toBeCloseTo(1, 6);
    expect(flanker.hidden).toBeCloseTo(1, 6);
    const assaultOffset = offsetAroundThreat(assault.point, THREAT, position);
    const flankerOffset = offsetAroundThreat(flanker.point, THREAT, position);
    expect(flankerOffset).toBeGreaterThan(assaultOffset + 0.5);
    expect(flankerOffset).toBeGreaterThan(1.1);
    expect(assaultOffset).toBeLessThan(0.8);
    expect(flanker.flank).toBeGreaterThan(assault.flank);
  });

  test("a squadmate's point is avoided", () => {
    const query = { position, radius: 20, threats: [THREAT], preferredRange: 8, blocked, hiddenOnly: true } as const;
    const first = selectCover(points, query)!;
    const second = selectCover(points, { ...query, taken: new Set([first.point.id]) })!;
    expect(second.point.id).not.toBe(first.point.id);
    expect(second.score).toBeLessThan(first.score);
  });
});
