import { beforeAll, describe, expect, test } from "bun:test";
import { createNavCrowd, createNavRuntime, navAuthoringFromDocument, navLinksFromDocument, navMeshFromBake } from "@jgengine/core/world";
import { createEmptyEditorDocument } from "@jgengine/core/editor/document";
import type { EditorDocument, EditorPath, EditorVolume } from "@jgengine/core/editor/types";
import { bakeAuthoredNavMesh, bakeNavMesh, initNavBake } from "./index";

/**
 * An authored scene document in the shape the editor writes: walkable slabs and props are boxes.
 * A game hands their triangles to the baker; nothing here is baked into the runtime.
 */
interface SceneBox {
  id: string;
  center: readonly [number, number, number];
  half: readonly [number, number, number];
}

const FLOOR: SceneBox = { id: "floor", center: [5, -0.1, 5], half: [5, 0.1, 5] };
const DECK: SceneBox = { id: "deck", center: [15, 2.9, 5], half: [5, 0.1, 5] };
const WALL: SceneBox = { id: "wall", center: [8, 1, 5], half: [0.3, 1, 2] };

function boxSoup(boxes: readonly SceneBox[]): { positions: number[]; indices: number[] } {
  const positions: number[] = [];
  const indices: number[] = [];
  for (const box of boxes) {
    const base = positions.length / 3;
    const minX = box.center[0] - box.half[0];
    const maxX = box.center[0] + box.half[0];
    const minY = box.center[1] - box.half[1];
    const maxY = box.center[1] + box.half[1];
    const minZ = box.center[2] - box.half[2];
    const maxZ = box.center[2] + box.half[2];
    for (let corner = 0; corner < 8; corner += 1) {
      positions.push(corner & 1 ? maxX : minX, corner & 2 ? maxY : minY, corner & 4 ? maxZ : minZ);
    }
    for (const face of [
      [0, 2, 3, 1],
      [4, 5, 7, 6],
      [0, 1, 5, 4],
      [2, 6, 7, 3],
      [0, 4, 6, 2],
      [1, 3, 7, 5],
    ] as const) {
      indices.push(base + face[0], base + face[1], base + face[2], base + face[0], base + face[2], base + face[3]);
    }
  }
  return { positions, indices };
}

const agent = { agentRadius: 0.4, agentHeight: 1.8, maxSlope: 45, maxClimb: 0.4 };

function bake(boxes: readonly SceneBox[]): ReturnType<typeof bakeNavMesh> {
  return bakeNavMesh({ ...boxSoup(boxes), ...agent });
}

function pathLength(points: readonly (readonly [number, number, number])[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i += 1) {
    const a = points[i - 1]!;
    const b = points[i]!;
    total += Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  }
  return total;
}

describe("authored scene to moving agents", () => {
  beforeAll(async () => {
    await initNavBake();
  });

  test("routes the baked scene, then crosses to the deck only through the authored ladder", () => {
    const baked = bake([FLOOR, DECK]);
    const document = { version: 1, markers: [], volumes: [], paths: [], bakes: [{ kind: "nav", id: "main", data: baked }] };
    const mesh = navMeshFromBake(document.bakes)!;
    expect(mesh.polys.length).toBeGreaterThan(0);

    const bare = createNavRuntime({ mesh });
    const withoutLink = bare.plan([2, 0, 2], [13, 3, 5])!;
    expect(withoutLink.partial).toBe(true);
    expect(Math.max(...withoutLink.points.map((point) => point[1]))).toBeLessThan(1);
    bare.dispose();

    const runtime = createNavRuntime({
      mesh,
      links: [{ id: "ladder", kind: "ladder", from: [9.2, 0, 5], to: [10.8, 3, 5] }],
    });
    expect(runtime.links()).toHaveLength(1);
    const path = runtime.plan([2, 0, 2], [13, 3, 5])!;
    expect(path.partial).toBeUndefined();
    expect(path.points.at(-1)![0]).toBeGreaterThan(12);
    expect(Math.abs(path.points.at(-1)![1]! - 3)).toBeLessThan(0.2);

    const crowd = createNavCrowd({ nav: runtime, speed: 3, radius: 0.4, goalRadius: 0.6, spread: 1.5 });
    for (let i = 0; i < 6; i += 1) {
      crowd.add(`climber${i}`, { position: [1.5 + i * 0.9, 0, 2], goal: [13.5, 3, 5] });
    }
    for (let t = 0; t < 900; t += 1) crowd.tick(1 / 30);
    expect(crowd.stats().arrived).toBe(6);
    for (const id of crowd.ids()) {
      const view = crowd.agent(id)!;
      expect(Math.abs(view.position[1] - 3)).toBeLessThan(0.2);
      expect(view.position[0]).toBeGreaterThan(12);
    }
    crowd.dispose();
    runtime.dispose();
  });

  test("a wall added in one authored region rebuilds that region and re-routes around it", () => {
    const runtime = createNavRuntime({ mesh: bake([FLOOR, DECK]) });
    const before = runtime.plan([2, 0, 5], [9.5, 0, 5])!;
    expect(before.partial).toBeUndefined();
    const region = { min: [6.8, 3.4] as const, max: [9.2, 6.6] as const };
    const stats = runtime.applyMesh(bake([FLOOR, DECK, WALL]));
    expect(stats.kept).toBeGreaterThan(5);
    expect(stats.added + stats.removed).toBeGreaterThan(0);
    expect(runtime.mesh.polys.length).toBeGreaterThan(stats.kept);
    const after = runtime.plan([2, 0, 5], [9.5, 0, 5])!;
    expect(after.partial).toBeUndefined();
    expect(pathLength(after.points)).toBeGreaterThan(pathLength(before.points) + 1);
    expect(runtime.rebuilds()).toBe(1);
    runtime.dispose();
  });

  test("agents re-plan after a wall is added, and only within the per-tick budget", () => {
    const runtime = createNavRuntime({ mesh: bake([FLOOR, DECK]) });
    const crowd = createNavCrowd({ nav: runtime, speed: 2.5, replanBudget: 1 });
    crowd.add("south", { position: [2, 0, 1], goal: [8, 0, 1] });
    crowd.add("north", { position: [2, 0, 8], goal: [8, 0, 8] });
    crowd.tick(1 / 30);
    const plansBefore = crowd.stats().plans;
    const stats = runtime.applyMesh(bake([FLOOR, DECK, WALL]));
    const revalidated = crowd.revalidate(stats, { min: [6.8, 3.4], max: [9.2, 6.6] });
    expect(revalidated.queued + revalidated.untouched).toBe(2);
    crowd.tick(1 / 30);
    expect(crowd.stats().plans - plansBefore).toBeLessThanOrEqual(1);
    for (let t = 0; t < 900; t += 1) crowd.tick(1 / 30);
    expect(crowd.agent("south")!.arrived).toBe(true);
    expect(crowd.agent("north")!.arrived).toBe(true);
    crowd.dispose();
    runtime.dispose();
  });
});

function navArea(id: string, center: [number, number, number], half: [number, number, number], meta: Record<string, unknown>): EditorVolume {
  return { id, kind: "nav_area", shape: "box", center: { x: center[0], y: center[1], z: center[2] }, halfExtents: { x: half[0], y: half[1], z: half[2] }, meta };
}

function navLink(id: string, from: [number, number, number], to: [number, number, number], meta: Record<string, unknown>): EditorPath {
  return { id, kind: "nav_link", points: [{ x: from[0], y: from[1], z: from[2] }, { x: to[0], y: to[1], z: to[2] }], meta };
}

describe("a nav mesh baked from authored areas and links", () => {
  beforeAll(async () => {
    await initNavBake();
  });

  /** Two decks either side of a 3 m gap, a crate stack on the near one, and a jump across the gap. */
  function deckScene(jumpCost: number): EditorDocument {
    return {
      ...createEmptyEditorDocument(),
      volumes: [
        navArea("near-deck", [5, 0, 5], [5, 1, 5], { mode: "walkable", area: 2 }),
        navArea("far-deck", [18, 0, 5], [5, 1, 5], { mode: "walkable" }),
        navArea("crates", [5, 0.5, 5], [1, 1.5, 3], { mode: "blocked" }),
        // A bridge round the long way, so the far deck is reachable on foot as well.
        navArea("bridge", [11.5, 0, 12], [7.5, 1, 1], { mode: "walkable" }),
        navArea("near-ramp", [5, 0, 11], [1, 1, 2], { mode: "walkable" }),
        navArea("far-ramp", [18, 0, 11], [1, 1, 2], { mode: "walkable" }),
      ],
      paths: [navLink("gap-jump", [9.2, 0, 5], [13.8, 0, 5], { linkKind: "jump", cost: jumpCost })],
    };
  }

  function bakeScene(document: EditorDocument) {
    const { areas } = navAuthoringFromDocument(document);
    const data = bakeAuthoredNavMesh({ areas, ...agent });
    const withBake = { ...document, bakes: [{ kind: "nav" as const, id: "main", data }] };
    // The bake is stored on the document and read back the way a game loads it.
    return JSON.parse(JSON.stringify(withBake)) as EditorDocument;
  }

  test("the bake honours walkable and blocked areas", () => {
    const document = bakeScene(deckScene(1));
    const mesh = navMeshFromBake(document.bakes)!;
    expect(mesh.polys.length).toBeGreaterThan(0);
    const runtime = createNavRuntime({ mesh });
    // Floor exists only where a walkable area authors it, and the crate stack cut out of it.
    expect(runtime.findPolygon([18, 0, 5])).not.toBeNull();
    expect(Math.hypot(...(runtime.closestPoint([5, 0, 5])!.map((value, i) => value - [5, 0, 5][i]!) as [number, number, number]))).toBeGreaterThan(0.9);
    expect(runtime.raycast([2, 0, 5], [8, 0, 5])).toBe(false);
    const around = runtime.plan([2, 0, 5], [8, 0, 5])!;
    expect(around.partial).toBeUndefined();
    expect(pathLength(around.points)).toBeGreaterThan(6.5);
    // Walkable areas stamp their area id on the polygons they cover.
    expect(mesh.areas?.some((id) => id === 2)).toBe(true);
    runtime.dispose();
  });

  test("routes take the authored jump when it is cheaper than the bridge and the bridge when it is not", () => {
    for (const [cost, jumps] of [[1, true], [500, false]] as const) {
      const document = bakeScene(deckScene(cost));
      const runtime = createNavRuntime({ mesh: navMeshFromBake(document.bakes)!, links: navLinksFromDocument(document) });
      expect(runtime.unresolvedLinks()).toEqual([]);
      const path = runtime.plan([7, 0, 3], [16, 0, 3])!;
      expect(path.partial).toBeUndefined();
      expect(path.links !== undefined).toBe(jumps);
      if (jumps) expect(path.links![0]!.link).toMatchObject({ id: "gap-jump", kind: "jump" });
      else expect(Math.max(...path.points.map((point) => point[2]))).toBeGreaterThan(10);
      runtime.dispose();
    }
  });
});
