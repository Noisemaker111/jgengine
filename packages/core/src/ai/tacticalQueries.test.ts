import { describe, expect, test } from "bun:test";
import { coverPoints, scorePositions } from "./tacticalQueries";
import type { NavMeshData } from "../nav/navMesh";

const mesh: NavMeshData = { verts: [0, 0, 0, 2, 0, 0, 2, 0, 2, 0, 0, 2], polys: [[0, 1, 2, 3]], links: [] };

describe("tactical queries", () => {
  test("returns only hidden boundary midpoints", () => {
    const points = coverPoints(mesh, [4, 0, 1], (a) => a[0] < 1);
    expect(points).toEqual([[0, 0, 1]]);
  });

  test("scores deterministically and bounds candidates", () => {
    const points = [[0, 0, 0], [1, 0, 0], [2, 0, 0]] as const;
    const result = scorePositions(points, { flankOf: (p) => p[0], retreatFrom: (p) => 2 - p[0] }, { flankOf: 2, retreatFrom: 1, maxCandidates: 2 });
    expect(result).toEqual([{ point: [2, 0, 0], score: 4 }, { point: [1, 0, 0], score: 3 }]);
  });
});
