import { describe, expect, test } from "bun:test";
import { devtools } from "@jgengine/core/devtools/devtools";
import { createNavCrowd, createNavRuntime, type NavMeshData } from "@jgengine/core/world";

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

function run(crowd: ReturnType<typeof createNavCrowd>, ticks: number, dt = 1 / 30): { gap: number; nan: boolean } {
  let gap = Infinity;
  let nan = false;
  const ids = crowd.ids();
  for (let t = 0; t < ticks; t += 1) {
    crowd.tick(dt);
    const positions = ids.map((id) => crowd.agent(id)!.position);
    for (const position of positions) if (!Number.isFinite(position[0]) || !Number.isFinite(position[2])) nan = true;
    for (let i = 0; i < positions.length; i += 1) {
      for (let j = i + 1; j < positions.length; j += 1) {
        gap = Math.min(gap, Math.hypot(positions[i]![0] - positions[j]![0], positions[i]![2] - positions[j]![2]));
      }
    }
  }
  return { gap, nan };
}

describe("createNavCrowd", () => {
  test("routes a corridor full of agents to their goals without overlapping", () => {
    const nav = createNavRuntime({ mesh: gridMesh(20, 4) });
    const crowd = createNavCrowd({ nav, speed: 2, radius: 0.4 });
    for (let i = 0; i < 6; i += 1) {
      const lane = 0.6 + (i % 3) * 1.3;
      const row = Math.floor(i / 3);
      crowd.add(`forward${i}`, { position: [0.5 + row * 0.9, 0, lane], goal: [18.5 + row * 0.3, 0, lane] });
      crowd.add(`back${i}`, { position: [19.5 - row * 0.9, 0, lane], goal: [1.5 - row * 0.3, 0, lane] });
    }
    expect(crowd.count()).toBe(12);
    const { gap, nan } = run(crowd, 1500);
    expect(nan).toBe(false);
    expect(gap).toBeGreaterThan(0.4 * 2 * 0.9);
    expect(crowd.stats().arrived).toBe(12);
    expect(crowd.stats().unroutable).toBe(0);
    for (const view of crowd.ids().map((id) => crowd.agent(id)!)) {
      expect(Math.hypot(view.position[0] - view.goal[0], view.position[2] - view.goal[2])).toBeLessThan(1.2);
    }
    crowd.dispose();
    nav.dispose();
  });

  test("climbs an authored ladder link the baked mesh alone cannot cross", () => {
    const nav = createNavRuntime({
      mesh: islands(),
      links: [{ id: "ladder", kind: "ladder", from: [0.9, 0, 0.5], to: [3.1, 3, 0.5] }],
    });
    const crowd = createNavCrowd({ nav, speed: 2, radius: 0.3, goalRadius: 0.4 });
    crowd.add("climber", { position: [0.3, 0, 0.3], goal: [3.7, 3, 0.7] });
    run(crowd, 240);
    const climber = crowd.agent("climber")!;
    expect(climber.arrived).toBe(true);
    expect(climber.position[0]).toBeGreaterThan(3);
    expect(climber.position[1]).toBe(3);

    const bare = createNavCrowd({ nav: createNavRuntime({ mesh: islands() }) });
    expect(bare.add("stuck", { position: [0.3, 0, 0.3], goal: [3.7, 3, 0.7] })).toBe(true);
    expect(bare.stats().unroutable).toBe(0);
    for (let t = 0; t < 120; t += 1) bare.tick(1 / 30);
    expect(bare.agent("stuck")!.arrived).toBe(false);
    expect(bare.agent("stuck")!.position[0]).toBeLessThan(1.01);
    bare.dispose();
    crowd.dispose();
    nav.dispose();
  });

  test("a region rebuild re-plans only the agents whose route crossed it", () => {
    const nav = createNavRuntime({ mesh: gridMesh(12, 4) });
    const crowd = createNavCrowd({ nav, speed: 2, replanBudget: 4 });
    crowd.add("near", { position: [0.5, 0, 1.5], goal: [11.5, 0, 1.5] });
    crowd.add("far", { position: [0.5, 0, 3.5], goal: [0.5, 0, 0.5] });
    crowd.tick(1 / 30);
    const before = crowd.stats().plans;
    // Wall off one cell on the near agent's straight line.
    const stats = nav.applyMesh(gridMesh(12, 4, 1, new Set([1 * 12 + 6])));
    const revalidated = crowd.revalidate(stats, { min: [6.1, 1.1], max: [6.9, 1.9] });
    expect(revalidated.queued).toBeGreaterThanOrEqual(1);
    expect(revalidated.queued + revalidated.untouched).toBe(2);
    run(crowd, 6);
    expect(crowd.stats().plans).toBeGreaterThan(before);
    expect(crowd.agent("near")!.arrived).toBe(false);
    run(crowd, 900);
    expect(crowd.agent("near")!.arrived).toBe(true);
    expect(crowd.agent("far")!.arrived).toBe(true);
    crowd.dispose();
    nav.dispose();
  });

  test("setGoal, remove and the devtools probe keep reporting live state", () => {
    const nav = createNavRuntime({ mesh: gridMesh(6, 2) });
    const crowd = createNavCrowd({ nav, speed: 2, devtoolsName: "test.navCrowd" });
    crowd.add("a", { position: [0.5, 0, 0.5], goal: [5.5, 0, 0.5] });
    crowd.add("b", { position: [5.5, 0, 1.5], goal: [0.5, 0, 1.5] });
    expect(crowd.setGoal("a", [3.5, 0, 1.5])).toBe(true);
    expect(crowd.setGoal("a", [3.5, 0, 1.5])).toBe(true);
    run(crowd, 400);
    expect(crowd.agent("a")!.arrived).toBe(true);
    expect(crowd.remove("b")).toBe(true);
    expect(crowd.ids()).toEqual(["a"]);
    const line = String((devtools.probes.read() as Record<string, unknown>)["test.navCrowd"]);
    expect(line).toContain("1 agents");
    crowd.dispose();
    expect((devtools.probes.read() as Record<string, unknown>)["test.navCrowd"]).toBeUndefined();
    nav.dispose();
  });

  test("is deterministic and survives a snapshot round trip", () => {
    const build = () => {
      const nav = createNavRuntime({ mesh: gridMesh(8, 8) });
      const crowd = createNavCrowd({ nav, speed: 2.5 });
      for (let i = 0; i < 16; i += 1) {
        crowd.add(`a${i}`, { position: [0.5 + (i % 4), 0, 0.5 + Math.floor(i / 4)], goal: [7.5, 0, 7.5 - Math.floor(i / 4)] });
      }
      return { nav, crowd };
    };
    const first = build();
    run(first.crowd, 120);
    const saved = first.crowd.snapshot();
    run(first.crowd, 60);
    const continued = first.crowd.snapshot();
    first.crowd.restore(saved);
    expect(first.crowd.snapshot()).toEqual(saved);
    run(first.crowd, 60);
    expect(first.crowd.snapshot()).toEqual(continued);

    const second = build();
    run(second.crowd, 180);
    expect(second.crowd.snapshot()).toEqual(continued);
    first.crowd.dispose();
    first.nav.dispose();
    second.crowd.dispose();
    second.nav.dispose();
  });

  test("re-tunes speed, goal radius and the avoidance dials in play", () => {
    const nav = createNavRuntime({ mesh: gridMesh(10, 2) });
    const crowd = createNavCrowd({ nav, speed: 1 });
    crowd.add("a", { position: [0.5, 0, 0.5], goal: [9.5, 0, 0.5] });
    crowd.retune({ speed: 4, goalRadius: 1, waypointRadius: 1.2, replanBudget: 2, avoid: { maxNeighbors: 3, neighborDist: 2 } });
    const saved = crowd.snapshot();
    expect(saved.tunables.speed).toBe(4);
    expect(saved.tunables.avoid.maxNeighbors).toBe(3);
    run(crowd, 400);
    expect(crowd.agent("a")!.arrived).toBe(true);
    crowd.restore(saved);
    expect(crowd.snapshot()).toEqual(saved);
    crowd.dispose();
    nav.dispose();
  });
});
