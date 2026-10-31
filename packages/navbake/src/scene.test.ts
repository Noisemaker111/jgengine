import { beforeAll, describe, expect, test } from "bun:test";
import { createNavCrowd, createNavRuntime, navMeshFromBake } from "@jgengine/core/world";
import { bakeNavMesh, initNavBake } from "./index";

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
