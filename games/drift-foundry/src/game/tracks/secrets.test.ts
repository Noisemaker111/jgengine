import { describe, expect, test } from "bun:test";

import { SECRET_SHORTCUTS, trackById } from "./catalog";

function distanceToPolyline(points: readonly (readonly [number, number])[], x: number, z: number): number {
  let best = Infinity;
  for (let i = 1; i < points.length; i += 1) {
    const [ax, az] = points[i - 1]!;
    const [bx, bz] = points[i]!;
    const dx = bx - ax, dz = bz - az;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1)));
    best = Math.min(best, Math.hypot(x - (ax + dx * t), z - (az + dz * t)));
  }
  return best;
}

describe("secret stockroom shortcuts", () => {
  test("the store hides two, each a real time-saver across a hairpin", () => {
    expect(SECRET_SHORTCUTS).toEqual(["produce:cold-room", "toy-aisle:staff-stairs"]);
    for (const id of SECRET_SHORTCUTS) {
      const [trackId, branchId] = id.split(":") as [string, string];
      const track = trackById(trackId)!;
      const branch = track.def.branches.find((entry) => entry.id === branchId)!;
      const route = track.course.routes.find((entry) => entry.id === branchId)!;
      const saved = branch.to - branch.from - route.length;
      expect(saved).toBeGreaterThan(30);
    }
  });

  test("no landmark or set-piece stands in a secret shortcut", () => {
    for (const id of SECRET_SHORTCUTS) {
      const [trackId, branchId] = id.split(":") as [string, string];
      const track = trackById(trackId)!;
      const branch = track.def.branches.find((entry) => entry.id === branchId)!;
      const route = track.course.routes.find((entry) => entry.id === branchId)!;
      for (const mark of track.def.dressing.landmarks) {
        const at = typeof mark.at === "number" ? track.point("main", mark.at, mark.side ?? 0) : { x: mark.at[0], z: mark.at[1] };
        expect({ mark: mark.object, clear: distanceToPolyline(route.points, at.x, at.z) > branch.halfWidth + 3 }).toEqual({ mark: mark.object, clear: true });
      }
    }
  });

  test("rivals keep to the lines they know: no rival takes a secret", () => {
    for (const id of SECRET_SHORTCUTS) {
      const [trackId, branchId] = id.split(":") as [string, string];
      const takes = Object.values(trackById(trackId)!.def.rivalTake).flat();
      expect(takes).not.toContain(branchId);
    }
  });
});
