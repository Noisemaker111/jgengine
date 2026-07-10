import { describe, expect, test } from "bun:test";
import {
  canyonBranches,
  canyonEdges,
  constrainToCanyon,
  deadendBranches,
  mainPolyline,
  nearestCanyonPoint,
  shortcutBranches,
} from "./canyon";

describe("canyon topology honesty invariant", () => {
  test("branch passability always matches whether it connects through (toIndex !== null)", () => {
    for (const branch of canyonBranches) {
      expect(branch.passable).toBe(branch.toIndex !== null);
    }
  });

  test("shortcuts are deceptive and dead-ends are inviting, never both", () => {
    for (const branch of canyonBranches) {
      expect(branch.deceptive && branch.inviting).toBe(false);
    }
    expect(shortcutBranches.every((branch) => branch.deceptive)).toBe(true);
    expect(deadendBranches.every((branch) => branch.inviting)).toBe(true);
  });

  test("every mapped shortcut is passable in the collision data all the way to its rejoin", () => {
    for (const branch of shortcutBranches) {
      const rejoin = mainPolyline[branch.toIndex as number];
      const hit = nearestCanyonPoint(rejoin);
      expect(hit.distance).toBeLessThanOrEqual(hit.edge.width);
      expect(hit.edge.kind).toBe("main");
    }
  });

  test("every mapped dead-end has no walkable edge beyond its terminus", () => {
    for (const branch of deadendBranches) {
      const last = branch.waypoints[branch.waypoints.length - 1];
      const prev = branch.waypoints[branch.waypoints.length - 2];
      const dx = last[0] - prev[0];
      const dz = last[2] - prev[2];
      const length = Math.hypot(dx, dz) || 1;
      const beyond: readonly [number, number, number] = [
        last[0] + (dx / length) * (branch.width * 4),
        last[1],
        last[2] + (dz / length) * (branch.width * 4),
      ];
      const hit = nearestCanyonPoint(beyond);
      expect(hit.distance).toBeGreaterThan(hit.edge.width);
    }
  });

  test("every branch contributes edges tagged with its own id", () => {
    for (const branch of canyonBranches) {
      const edges = canyonEdges.filter((edge) => edge.branchId === branch.id);
      expect(edges.length).toBe(branch.waypoints.length - 1);
      expect(edges.every((edge) => edge.kind === branch.kind)).toBe(true);
    }
  });
});

describe("constrainToCanyon", () => {
  test("leaves a position already inside a corridor untouched", () => {
    const onMain = mainPolyline[3];
    const result = constrainToCanyon(onMain);
    expect(result.position[0]).toBeCloseTo(onMain[0], 5);
    expect(result.position[2]).toBeCloseTo(onMain[2], 5);
  });

  test("clamps a position far outside every corridor back to the nearest wall", () => {
    const farAway: readonly [number, number, number] = [mainPolyline[3][0] + 500, 0, mainPolyline[3][2]];
    const result = constrainToCanyon(farAway);
    const hit = nearestCanyonPoint(result.position);
    expect(hit.distance).toBeLessThanOrEqual(hit.edge.width + 1e-6);
  });
});
