import { describe, expect, test } from "bun:test";
import { bakeNavMesh } from "./index";

describe("bakeNavMesh", () => {
  test("keeps walkable floor triangles and rejects a vertical wall", () => {
    const mesh = bakeNavMesh({ positions: [0, 0, 0, 2, 0, 0, 2, 0, 2, 0, 0, 2, 1, 0, 0, 1, 2, 0, 1, 2, 2, 1, 0, 2], indices: [0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7], agentRadius: 0.3, agentHeight: 1.8, maxSlope: 45, maxClimb: 0.4 });
    expect(mesh.polys).toEqual([[0, 1, 2], [0, 2, 3]]);
    expect(mesh.links).toEqual([]);
  });
});
