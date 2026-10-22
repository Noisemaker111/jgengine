import { describe, expect, test } from "bun:test";
import { devtools } from "@jgengine/core/devtools/devtools";
import { createNavRuntime, navMeshFromBake, type NavMeshData } from "@jgengine/core/world";

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

function islands(): NavMeshData {
  return {
    verts: [0, 0, 0, 1, 0, 0, 1, 0, 1, 0, 0, 1, 3, 3, 0, 4, 3, 0, 4, 3, 1, 3, 3, 1],
    polys: [[0, 1, 2, 3], [4, 5, 6, 7]],
    links: [],
  };
}

describe("navMeshFromBake", () => {
  test("returns the named nav bake and nothing when the document has none", () => {
    const mesh = gridMesh(2, 2);
    const bakes = [{ kind: "minimap", id: "main", data: {} }, { kind: "nav", id: "courtyard", data: mesh }];
    expect(navMeshFromBake(bakes, "courtyard")).toEqual(mesh);
    expect(navMeshFromBake(bakes)).toBeNull();
    expect(navMeshFromBake(undefined, "courtyard")).toBeNull();
  });

  test("copies the bake and rejects a corrupt one instead of routing on it", () => {
    const mesh = gridMesh(2, 2);
    const bakes = [{ kind: "nav", id: "main", data: mesh }];
    const read = navMeshFromBake(bakes)!;
    expect(read).not.toBe(mesh);
    read.verts[0] = 99;
    expect(mesh.verts[0]).toBe(0);
    expect(() => navMeshFromBake([{ kind: "nav", id: "main", data: { verts: [0, 0], polys: [] } }])).toThrow("xyz triples");
    expect(() => navMeshFromBake([{ kind: "nav", id: "main", data: { verts: [0, 0, 0], polys: [[0, 1, 2]] } }])).toThrow("index its verts");
    expect(() => navMeshFromBake([{ kind: "nav", id: "main", data: null }])).toThrow("no data object");
  });
});

describe("createNavRuntime", () => {
  test("routes across the baked mesh and exposes the query surface", () => {
    const runtime = createNavRuntime({ mesh: gridMesh(8, 2) });
    const path = runtime.plan([0.5, 0, 0.5], [7.5, 0, 1.5])!;
    expect(path.points[0]).toEqual([0.5, 0, 0.5]);
    expect(path.points.at(-1)).toEqual([7.5, 0, 1.5]);
    expect(runtime.raycast([0.5, 0, 0.5], [1.5, 0, 0.5])).toBe(true);
    expect(runtime.findPolygon([0.5, 0, 0.5])).toBe(0);
    expect(runtime.closestPoint([0.5, 4, 0.5])).toEqual([0.5, 0, 0.5]);
    expect(runtime.rebuilds()).toBe(0);
    runtime.dispose();
  });

  test("resolves authored links by kind and prices them, and reports ends that miss the mesh", () => {
    const runtime = createNavRuntime({
      mesh: islands(),
      links: [
        { id: "stepladder", kind: "ladder", from: [0.9, 0, 0.5], to: [3.1, 3, 0.5] },
        { id: "broken", kind: "door", from: [40, 0, 40], to: [3.1, 3, 0.5] },
      ],
    });
    expect(runtime.unresolvedLinks()).toEqual(["broken"]);
    expect(runtime.links()).toHaveLength(1);
    const link = runtime.links()[0]!;
    expect([link.from, link.to]).toEqual([0, 1]);
    expect(link.cost).toBe(4);
    expect(new Set([link.start![0], link.end![0]])).toEqual(new Set([0.9, 3.1]));
    const path = runtime.plan([0.2, 0, 0.5], [3.8, 3, 0.5])!;
    expect(path.partial).toBeUndefined();
    expect(path.polys).toEqual([0, 1]);
    expect(path.points.some((point) => point[1] === 3)).toBe(true);

    runtime.retune({ linkCosts: { ladder: 0.25 }, links: [{ id: "stepladder", kind: "ladder", from: [0.9, 0, 0.5], to: [3.1, 3, 0.5] }] });
    expect(runtime.links()[0]!.cost).toBe(0.25);
    runtime.dispose();
  });

  test("an authored cost overrides the kind price and a link between one polygon is dropped", () => {
    const runtime = createNavRuntime({
      mesh: islands(),
      links: [
        { id: "jump", kind: "jump", from: [0.9, 0, 0.5], to: [3.1, 3, 0.5], cost: 12 },
        { id: "self", from: [0.2, 0, 0.2], to: [0.8, 0, 0.8] },
      ],
    });
    expect(runtime.links()).toHaveLength(1);
    expect(runtime.links()[0]!.cost).toBe(12);
    expect(runtime.unresolvedLinks()).toEqual(["self"]);
    runtime.dispose();
  });

  test("re-baking keeps the identity of polygons that did not change", () => {
    const runtime = createNavRuntime({ mesh: gridMesh(4, 4) });
    const before = runtime.mesh.polys.length;
    const rebuilt = gridMesh(4, 4, 1, new Set([0]));
    const stats = runtime.applyMesh(rebuilt);
    expect(stats.removed).toBe(1);
    expect(stats.added).toBe(0);
    expect(stats.kept).toBe(before - 1);
    expect(runtime.mesh.polys.length).toBe(before - 1);
    expect(runtime.rebuilds()).toBe(1);
    // Every surviving polygon keeps its corner coordinates, so a route over them is still valid.
    const keptRing = runtime.mesh.polys[0]!.map((index) => [runtime.mesh.verts[index * 3], runtime.mesh.verts[index * 3 + 2]]);
    expect(keptRing).toEqual([[1, 0], [2, 0], [2, 1], [1, 1]]);
    for (let p = 0; p < stats.remap.length; p += 1) {
      if (p === 0) expect(stats.remap[p]).toBe(-1);
      else expect(stats.remap[p]).toBe(p - 1);
    }
    // The hole is no longer walkable: a route that used it now starts at the surviving edge.
    const path = runtime.plan([0.5, 0, 0.5], [3.5, 0, 0.5])!;
    expect(path.points[0]![0]).toBeGreaterThanOrEqual(1 - 1e-6);
    expect(path.points.at(-1)).toEqual([3.5, 0, 0.5]);
    runtime.dispose();
  });

  test("adding a removed polygon back adds it, and a different mesh invalidates every polygon", () => {
    const runtime = createNavRuntime({ mesh: gridMesh(4, 4, 1, new Set([0])) });
    const restored = runtime.applyMesh(gridMesh(4, 4));
    expect(restored.added).toBe(1);
    expect(restored.removed).toBe(0);
    expect(runtime.mesh.polys.length).toBe(16);
    const swapped = runtime.applyMesh(gridMesh(2, 2, 3));
    expect(swapped.removed).toBe(16);
    expect(swapped.kept).toBe(0);
    expect(swapped.added).toBe(4);
    expect(Array.from(swapped.remap)).toEqual(new Array(16).fill(-1));
    expect(runtime.mesh.polys.length).toBe(4);
    runtime.dispose();
  });

  test("links re-resolve after a rebuild, so a moved landing spot still routes", () => {
    const runtime = createNavRuntime({
      mesh: islands(),
      links: [{ id: "door", kind: "door", from: [0.9, 0, 0.5], to: [3.1, 3, 0.5] }],
    });
    expect(runtime.links()).toHaveLength(1);
    const raised = islands();
    raised.verts[13] = 6;
    raised.verts[16] = 6;
    raised.verts[19] = 6;
    raised.verts[22] = 6;
    const stats = runtime.applyMesh(raised);
    expect(stats.kept).toBe(1);
    expect(runtime.links()).toHaveLength(1);
    const path = runtime.plan([0.2, 0, 0.5], [3.8, 6, 0.5])!;
    expect(path.partial).toBeUndefined();
    expect(path.points.at(-1)![1]).toBe(6);
    runtime.dispose();
  });

  test("snapshot and restore round-trip tuning and authored links", () => {
    const runtime = createNavRuntime({
      mesh: islands(),
      links: [{ id: "ladder", kind: "ladder", from: [0.9, 0, 0.5], to: [3.1, 3, 0.5] }],
      areaCosts: { 1: 2 },
    });
    const saved = runtime.snapshot();
    runtime.retune({ links: [], linkCosts: { ladder: 99 }, linkSnapRadius: 0 });
    expect(runtime.links()).toHaveLength(0);
    expect(runtime.plan([0.2, 0, 0.5], [3.8, 3, 0.5])!.partial).toBe(true);
    runtime.restore(saved);
    expect(runtime.snapshot()).toEqual(saved);
    expect(runtime.links()[0]!.cost).toBe(4);
    expect(runtime.plan([0.2, 0, 0.5], [3.8, 3, 0.5])!.partial).toBeUndefined();
    runtime.dispose();
  });

  test("publishes a devtools probe line with mesh, link and routing counters", () => {
    const runtime = createNavRuntime({
      mesh: islands(),
      links: [{ id: "ladder", kind: "ladder", from: [0.9, 0, 0.5], to: [3.1, 3, 0.5] }],
      devtoolsName: "test.navRuntime",
    });
    runtime.plan([0.2, 0, 0.5], [3.8, 3, 0.5]);
    const probes = devtools.probes.read() as Record<string, unknown>;
    expect(String(probes["test.navRuntime"])).toContain("2 polys 1 links 0 unresolved 0 rebuilds 1 plans");
    runtime.dispose();
    expect((devtools.probes.read() as Record<string, unknown>)["test.navRuntime"]).toBeUndefined();
  });
});
