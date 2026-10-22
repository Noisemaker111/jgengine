import { describe, expect, test } from "bun:test";
import { createNavCrowd, createNavRuntime, type NavMeshData } from "@jgengine/core/world";
import { seededRng } from "../random/rng";

function gridMesh(cols: number, rows: number, size = 1): NavMeshData {
  const verts: number[] = [];
  for (let r = 0; r <= rows; r += 1) for (let c = 0; c <= cols; c += 1) verts.push(c * size, 0, r * size);
  const polys: number[][] = [];
  for (let r = 0; r < rows; r += 1) for (let c = 0; c < cols; c += 1) {
    const a = r * (cols + 1) + c;
    polys.push([a, a + 1, a + cols + 2, a + cols + 1]);
  }
  return { verts, polys, links: [] };
}

const AGENTS = 500;

/** 500 agents on a 1600-polygon editor-sized field, each walking to the far side. */
function crowdOf500(): { nav: ReturnType<typeof createNavRuntime>; crowd: ReturnType<typeof createNavCrowd> } {
  const nav = createNavRuntime({ mesh: gridMesh(40, 40, 2) });
  const crowd = createNavCrowd({ nav, speed: 2.5, radius: 0.4 });
  for (let i = 0; i < AGENTS; i += 1) {
    const col = i % 25;
    const row = Math.floor(i / 25);
    const x = 4 + col * 2.8;
    const z = 4 + row * 2.8;
    crowd.add(`a${i}`, { position: [x, 0, z], goal: [76 - col * 2.8, 0, 76 - row * 2.8] });
  }
  return { nav, crowd };
}

function median(samples: readonly number[]): number {
  const sorted = [...samples].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)]!;
}

describe("nav crowd budget", () => {
  test("500 agents route, avoid and move in under 2 ms per tick", () => {
    const { nav, crowd } = crowdOf500();
    expect(crowd.count()).toBe(AGENTS);
    for (let t = 0; t < 120; t += 1) crowd.tick(1 / 30);
    const samples: number[] = [];
    for (let t = 0; t < 600; t += 1) {
      const started = performance.now();
      crowd.tick(1 / 30);
      samples.push(performance.now() - started);
    }
    const p50 = median(samples);
    const p90 = [...samples].sort((a, b) => a - b)[Math.floor(samples.length * 0.9)]!;
    console.log(
      `500 agents, 1 tick: p50 ${p50.toFixed(3)} ms, p90 ${p90.toFixed(3)} ms, max ${Math.max(...samples).toFixed(3)} ms, ` +
        `first 5 ${samples.slice(0, 5).map((value) => value.toFixed(3)).join(" ")} ms`,
    );
    expect(p50).toBeLessThan(2);
    expect(crowd.stats().unroutable).toBe(0);
    crowd.dispose();
    nav.dispose();
  }, 120_000);

  test("ten simulated minutes leave no agent stuck and no NaN", () => {
    const { nav, crowd } = crowdOf500();
    const rng = seededRng("nav-crowd-soak");
    const goalPoint = (): [number, number, number] => [6 + rng() * 68, 0, 6 + rng() * 68];
    const dt = 1 / 30;
    const window = 900;
    const windows = 20;
    for (let t = 0; t < 60; t += 1) crowd.tick(dt);
    const previous = new Map<string, [number, number, number]>();
    for (const id of crowd.ids()) previous.set(id, crowd.agent(id)!.position);

    let worstMove = Infinity;
    let worstId = "";
    for (let w = 0; w < windows; w += 1) {
      for (let t = 0; t < window; t += 1) crowd.tick(dt);
      for (const id of crowd.ids()) {
        const view = crowd.agent(id)!;
        const before = previous.get(id)!;
        expect(Number.isFinite(view.position[0]) && Number.isFinite(view.position[1]) && Number.isFinite(view.position[2])).toBe(true);
        const moved = Math.hypot(view.position[0] - before[0], view.position[2] - before[2]);
        const atGoal = Math.hypot(view.position[0] - view.goal[0], view.position[2] - view.goal[2]);
        if (moved < 2 && atGoal > 2.5) {
          expect({ id, moved: Number(moved.toFixed(2)), atGoal: Number(atGoal.toFixed(2)) }).toEqual({ id: "stuck" });
        }
        if (moved < worstMove) {
          worstMove = moved;
          worstId = id;
        }
        previous.set(id, view.position);
        if (atGoal <= 2.5) crowd.setGoal(id, goalPoint());
      }
    }
    const stats = crowd.stats();
    console.log(
      `soak: ${stats.ticks} ticks (${((stats.ticks * dt) / 60).toFixed(0)} min), ${stats.agents} agents, ` +
        `${stats.plans} plans, slowest tick ${stats.slowestTickMs.toFixed(2)} ms, least movement in one 30 s window ` +
        `${worstMove.toFixed(2)} m (${worstId}), arrived ${stats.arrived}`,
    );
    expect(stats.ticks).toBe(window * windows + 60);
    expect(stats.agents).toBe(AGENTS);
    crowd.dispose();
    nav.dispose();
  }, 300_000);
});
