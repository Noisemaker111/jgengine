import { beforeAll, describe, expect, test } from "bun:test";
import { findPath, raycastNav } from "@jgengine/core/nav/navMesh";
import { bakeNavMesh, initNavBake, navBakeReady } from "./index";

function floorWithWall(): { positions: number[]; indices: number[] } {
  const positions = [0, 0, 0, 10, 0, 0, 10, 0, 10, 0, 0, 10];
  const indices = [0, 2, 1, 0, 3, 2];
  const base = positions.length / 3;
  const [x0, x1, z0, z1, h] = [4, 6, 0, 7, 2];
  for (const [x, y, z] of [[x0, 0, z0], [x1, 0, z0], [x1, 0, z1], [x0, 0, z1], [x0, h, z0], [x1, h, z0], [x1, h, z1], [x0, h, z1]] as const) positions.push(x, y, z);
  for (const face of [[4, 6, 5], [4, 7, 6], [0, 1, 5], [0, 5, 4], [1, 2, 6], [1, 6, 5], [2, 3, 7], [2, 7, 6], [3, 0, 4], [3, 4, 7]]) {
    indices.push(...face.map((i) => i + base));
  }
  return { positions, indices };
}

const agent = { agentRadius: 0.4, agentHeight: 1.8, maxSlope: 45, maxClimb: 0.4 };

describe("bakeNavMesh", () => {
  beforeAll(async () => {
    await initNavBake();
  });

  test("routes around a wall standing on the floor", () => {
    expect(navBakeReady()).toBe(true);
    const mesh = bakeNavMesh({ ...floorWithWall(), ...agent });
    expect(mesh.polys.length).toBeGreaterThan(0);
    const path = findPath(mesh, [2, 0, 2], [8, 0, 2]);
    expect(path).not.toBeNull();
    expect(Math.max(...path!.points.map((point) => point[2]))).toBeGreaterThan(7);
    for (const point of path!.points) expect(point[0] > 4 - 0.01 && point[0] < 6 + 0.01 && point[2] < 7).toBe(false);
    for (let i = 1; i < path!.points.length; i += 1) expect(raycastNav(mesh, path!.points[i - 1]!, path!.points[i]!)).toBe(true);
    expect(raycastNav(mesh, [2, 0, 2], [8, 0, 2])).toBe(false);
  });

  test("erodes the walkable edge by the agent radius and is deterministic", () => {
    const first = bakeNavMesh({ ...floorWithWall(), ...agent });
    const xs = first.verts.filter((_, i) => i % 3 === 0 && first.verts[i + 1]! < 1);
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(0.4 - 1e-6);
    expect(Math.max(...xs)).toBeLessThanOrEqual(9.6 + 1e-6);
    expect(bakeNavMesh({ ...floorWithWall(), ...agent })).toEqual(first);
  });

  test("rejects down-facing and too-steep triangles", () => {
    const flipped = bakeNavMesh({ positions: [0, 0, 0, 4, 0, 0, 4, 0, 4, 0, 0, 4], indices: [0, 1, 2, 0, 2, 3], ...agent });
    expect(flipped.polys).toEqual([]);
    const ramp = bakeNavMesh({ positions: [0, 0, 0, 4, 0, 0, 4, 8, 4, 0, 8, 4], indices: [0, 2, 1, 0, 3, 2], ...agent });
    expect(ramp.polys).toEqual([]);
  });

  test("validates input", () => {
    expect(() => bakeNavMesh({ positions: [0, 0], indices: [], ...agent })).toThrow("xyz");
    expect(() => bakeNavMesh({ positions: [0, 0, 0], indices: [0, 0, 5], ...agent })).toThrow("out of range");
    expect(bakeNavMesh({ positions: [], indices: [], ...agent })).toEqual({ verts: [], polys: [], links: [] });
  });
});
