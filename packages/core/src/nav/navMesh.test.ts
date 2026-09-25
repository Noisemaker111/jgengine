import { describe, expect, test } from "bun:test";
import { buildNavAdjacency, closestPoint, createNavMeshQuery, findPath, raycastNav, type NavMeshData } from "@jgengine/core/nav/navMesh";

const lMesh: NavMeshData = {
  verts: [0, 0, 0, 2, 0, 0, 2, 0, 1, 1, 0, 1, 1, 0, 3, 0, 0, 3],
  polys: [[0, 1, 2, 3], [3, 2, 4, 5]],
  links: [],
};

function gridMesh(cols: number, rows: number, size = 1, holes: ReadonlySet<number> = new Set()): NavMeshData {
  const verts: number[] = [];
  for (let r = 0; r <= rows; r += 1) for (let c = 0; c <= cols; c += 1) verts.push(c * size, 0, r * size);
  const polys: number[][] = [];
  for (let r = 0; r < rows; r += 1) for (let c = 0; c < cols; c += 1) {
    if (holes.has(r * cols + c)) continue;
    const a = r * (cols + 1) + c;
    polys.push([a, a + 1, a + cols + 2, a + cols + 1]);
  }
  return { verts, polys, links: [] };
}

describe("navMesh", () => {
  test("builds adjacency and bends the route at the inner corner of an L", () => {
    expect(buildNavAdjacency(lMesh).map((entry) => entry.neighbors)).toEqual([[1], [0]]);
    const path = findPath(lMesh, [0.5, 0, 0.5], [0.5, 0, 2.5]);
    expect(path?.polys).toEqual([0, 1]);
    expect(path?.points).toEqual([[0.5, 0, 0.5], [1, 0, 1], [0.5, 0, 2.5]]);
  });

  test("funnels a straight corridor down to its two endpoints", () => {
    const mesh = gridMesh(8, 1);
    const path = findPath(mesh, [0.5, 0, 0.5], [7.5, 0, 0.5]);
    expect(path?.polys).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(path?.points).toEqual([[0.5, 0, 0.5], [7.5, 0, 0.5]]);
  });

  test("routes around a hole touching only the hole's corners", () => {
    const mesh = gridMesh(3, 3, 1, new Set([4]));
    const path = findPath(mesh, [0.5, 0, 1.5], [2.5, 0, 1.5])!;
    expect(path.points.length).toBe(4);
    for (const point of path.points.slice(1, -1)) expect([1, 2]).toContain(point[0]);
    for (let i = 1; i < path.points.length; i += 1) expect(raycastNav(mesh, path.points[i - 1]!, path.points[i]!)).toBe(true);
  });

  test("supports explicit off-mesh links with landing points", () => {
    const islands: NavMeshData = {
      verts: [0, 0, 0, 1, 0, 0, 1, 0, 1, 0, 0, 1, 3, 1, 0, 4, 1, 0, 4, 1, 1, 3, 1, 1],
      polys: [[0, 1, 2, 3], [4, 5, 6, 7]],
      links: [{ from: 0, to: 1, cost: 0.25, start: [0.9, 0, 0.5], end: [3.1, 1, 0.5] }],
    };
    expect(buildNavAdjacency(islands)[0]?.neighbors).toEqual([1]);
    const path = findPath(islands, [0.2, 0, 0.5], [3.8, 1, 0.5]);
    expect(path?.polys).toEqual([0, 1]);
    expect(path?.points).toEqual([[0.2, 0, 0.5], [0.9, 0, 0.5], [3.1, 1, 0.5], [3.8, 1, 0.5]]);
    expect(findPath({ ...islands, links: [] }, [0.2, 0, 0.5], [3.8, 1, 0.5])?.partial).toBe(true);
  });

  test("prices and blocks areas through a retunable query", () => {
    const mesh = { ...gridMesh(3, 3), areas: [0, 0, 0, 0, 1, 0, 0, 0, 0] };
    const query = createNavMeshQuery(mesh);
    expect(query.findPath([1.5, 0, 0.2], [1.5, 0, 2.8])?.polys).toEqual([1, 4, 7]);
    query.retune({ areaCosts: { 1: 10 } });
    expect(query.findPath([1.5, 0, 0.2], [1.5, 0, 2.8])?.polys).not.toContain(4);
    const saved = query.snapshot();
    query.retune({ areaCosts: { 1: Number.POSITIVE_INFINITY } });
    expect(query.raycast([1.5, 0, 0.2], [1.5, 0, 2.8])).toBe(false);
    expect(query.findPath([0.5, 0, 0.5], [1.5, 0, 1.5])).toBeNull();
    query.restore(saved);
    expect(query.snapshot()).toEqual({ areaCosts: { 1: 10 }, maxNodes: 2048 });
    expect(query.raycast([1.5, 0, 0.2], [1.5, 0, 2.8])).toBe(true);
  });

  test("resolves stacked floors by height", () => {
    const stacked: NavMeshData = {
      verts: [0, 0, 0, 4, 0, 0, 4, 0, 4, 0, 0, 4, 1, 3, 1, 3, 3, 1, 3, 3, 3, 1, 3, 3],
      polys: [[0, 1, 2, 3], [4, 5, 6, 7]],
      links: [],
    };
    const query = createNavMeshQuery(stacked);
    expect(query.findPolygon([2, 0.1, 2])).toBe(0);
    expect(query.findPolygon([2, 2.9, 2])).toBe(1);
    expect(query.closestPoint([2, 2.5, 2])).toEqual([2, 3, 2]);
  });

  test("returns a partial route when the node budget runs out", () => {
    const query = createNavMeshQuery(gridMesh(20, 1), { maxNodes: 5 });
    const path = query.findPath([0.5, 0, 0.5], [19.5, 0, 0.5])!;
    expect(path.partial).toBe(true);
    expect(path.polys[0]).toBe(0);
    expect(path.polys.length).toBeLessThan(20);
  });

  test("finds surface points and raycasts walkable space", () => {
    expect(closestPoint(lMesh, [1, 3, 0.5])).toEqual([1, 0, 0.5]);
    expect(closestPoint({ verts: [], polys: [], links: [] }, [0, 0, 0])).toBeNull();
    expect(raycastNav(lMesh, [0.5, 0, 0.5], [1.5, 0, 0.5])).toBe(true);
    expect(raycastNav(lMesh, [1.5, 0, 0.5], [0.5, 0, 2.5])).toBe(true);
    expect(raycastNav(lMesh, [0.5, 0, 0.5], [0.5, 0, 2.5])).toBe(false);
    expect(raycastNav(lMesh, [0.5, 0, 0.5], [3, 0, 2])).toBe(false);
  });

  test("keeps large-mesh queries off full scans", () => {
    const mesh = gridMesh(200, 200);
    const query = createNavMeshQuery(mesh, { maxNodes: 40_000 });
    const started = performance.now();
    for (let i = 0; i < 20; i += 1) {
      const to = [199.5, 0, 199.5 - i] as const;
      const path = query.findPath([0.5, 0, 0.5 + i], to)!;
      expect(path.partial).toBeUndefined();
      expect(path.points.at(-1)).toEqual(to);
      expect(path.points.length).toBeLessThanOrEqual(3);
    }
    expect(performance.now() - started).toBeLessThan(3000);
  });
});
