import { describe, expect, test } from "bun:test";
import { buildNavAdjacency, closestPoint, findPath, raycastNav, type NavMeshData } from "@jgengine/core/nav/navMesh";

const lMesh: NavMeshData = {
  verts: [0, 0, 0, 2, 0, 0, 2, 0, 1, 1, 0, 1, 1, 0, 3, 0, 0, 3],
  polys: [[0, 1, 2, 3], [3, 2, 4, 5]],
  links: [],
};

describe("navMesh", () => {
  test("builds adjacency and routes around an L", () => {
    expect(buildNavAdjacency(lMesh).map((entry) => entry.neighbors)).toEqual([[1], [0]]);
    const path = findPath(lMesh, [0.5, 0, 0.5], [0.5, 0, 2.5]);
    expect(path?.polys).toEqual([0, 1]);
    expect(path?.points[0]).toEqual([0.5, 0, 0.5]);
    expect(path?.points.at(-1)).toEqual([0.5, 0, 2.5]);
    expect(path?.points.length).toBeGreaterThanOrEqual(2);
  });

  test("supports explicit off-mesh links", () => {
    const mesh: NavMeshData = { ...lMesh, links: [{ from: 0, to: 1, cost: 0.25 }] };
    expect(buildNavAdjacency(mesh)[0]?.neighbors).toEqual([1]);
    expect(findPath(mesh, [0.5, 0, 0.5], [0.5, 0, 2.5])?.polys).toEqual([0, 1]);
  });

  test("finds surface points and raycasts walkable space", () => {
    expect(closestPoint(lMesh, [1, 3, 0.5])).toEqual([1, 0, 0.5]);
    expect(raycastNav(lMesh, [0.5, 0, 0.5], [1.5, 0, 0.5])).toBe(true);
    expect(raycastNav(lMesh, [0.5, 0, 0.5], [3, 0, 2])).toBe(false);
  });
});
