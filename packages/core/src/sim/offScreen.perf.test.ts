import { describe, expect, test } from "bun:test";
import { createNavRuntime, type NavMeshData } from "@jgengine/core/world";
import { gateTimingMs, gateTimingRatio } from "../../../../scripts/timing-budget";
import type { NeedDefinition } from "./needs";
import { createNearAgents } from "./nearAgents";
import { createOffScreenWorld } from "./offScreen";
import { resolveRoutine } from "./routine";

function gridMesh(cols: number, rows: number, size = 2): NavMeshData {
  const verts: number[] = [];
  for (let r = 0; r <= rows; r += 1) for (let c = 0; c <= cols; c += 1) verts.push(c * size, 0, r * size);
  const polys: number[][] = [];
  for (let r = 0; r < rows; r += 1) for (let c = 0; c < cols; c += 1) {
    const a = r * (cols + 1) + c;
    polys.push([a, a + 1, a + cols + 2, a + cols + 1]);
  }
  return { verts, polys, links: [] };
}

const NEEDS: readonly NeedDefinition[] = [
  { id: "hunger", max: 100, rate: 0.02 },
  { id: "energy", max: 100, rate: 0.01 },
];

/** Each resident owns a home, a workplace and a diner on the field, so nobody shares an anchor. */
function placesFor(count: number): Record<string, readonly [number, number, number]> {
  const places: Record<string, readonly [number, number, number]> = {};
  for (let i = 0; i < count; i += 1) {
    const x = 8 + (i % 20) * 2.6;
    const z = 8 + Math.floor(i / 20) * 2.6;
    places[`home${i}`] = [x, 0, z];
    places[`work${i}`] = [Math.min(56, x + 4), 0, z];
    places[`meal${i}`] = [x, 0, Math.min(56, z + 4)];
  }
  return places;
}

function dayFor(i: number) {
  return resolveRoutine({
    cycleSeconds: 600,
    stops: [
      { place: `home${i}`, arriveAt: 0, travelSeconds: 0 },
      { place: `work${i}`, arriveAt: 120, activity: "work", travelSeconds: 20 },
      { place: `meal${i}`, arriveAt: 300, activity: "meal", travelSeconds: 20, refill: { hunger: 45 } },
      { place: `home${i}`, arriveAt: 420, travelSeconds: 20 },
    ],
  });
}

function median(samples: readonly number[]): number {
  const sorted = [...samples].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)]!;
}

function scene(count: number, viewer: readonly [number, number, number]) {
  const nav = createNavRuntime({ mesh: gridMesh(30, 30) });
  const crowd = createNearAgents({
    nav,
    needs: NEEDS,
    options: [
      { id: "eat", terms: [{ need: "hunger", curve: { kind: "linear", from: 0.1, to: 0.9 } }] },
      { id: "rest", terms: [{ need: "energy", curve: { kind: "linear", from: 0.1, to: 0.9 } }] },
    ],
    crowd: { speed: 3, radius: 0.4, goalRadius: 0.6, replanMs: 100 },
  });
  const residents = Array.from({ length: count }, (_, i) => ({
    id: `agent${i}`,
    home: [8 + (i % 20) * 2.6, 0, 8 + Math.floor(i / 20) * 2.6] as const,
    routine: dayFor(i),
  }));
  const world = createOffScreenWorld({
    places: placesFor(count),
    needs: NEEDS,
    policy: { nearRadius: 30, farRadius: 34 },
    near: crowd,
    residents,
  });
  return { nav, crowd, world, viewer };
}

describe("off-screen world cost", () => {
  test("1,000 far agents cost a fraction of the near ones, and run no nav or brains", () => {
    const far = scene(1000, [5000, 0, 5000]);
    const near = scene(200, [30, 0, 15]);

    let now = 0;
    const dt = 1 / 30;
    for (let t = 0; t < 60; t += 1) {
      now += dt;
      far.world.tick(dt, now, far.viewer);
      near.world.tick(dt, now, near.viewer);
    }
    expect(far.crowd.crowd().count()).toBe(0);
    expect(near.world.stats().near).toBeGreaterThan(0);

    const farSamples: number[] = [];
    const nearSamples: number[] = [];
    for (let t = 0; t < 600; t += 1) {
      now += dt;
      const startedFar = performance.now();
      far.world.tick(dt, now, far.viewer);
      farSamples.push(performance.now() - startedFar);
      const startedNear = performance.now();
      near.world.tick(dt, now, near.viewer);
      nearSamples.push(performance.now() - startedNear);
    }

    const farP50 = median(farSamples);
    const nearP50 = median(nearSamples);
    const farStats = far.world.stats();
    const nearStats = near.world.stats();
    // Fastest windows 0.015 ms far / 0.11 ms near idle (this machine, 2026-10-22).
    gateTimingMs(
      "off-screen far world tick, 1000 agents",
      farSamples,
      0.04,
      `${farStats.farRefreshes} cheap refreshes, ${farStats.decisions} decisions`,
    );
    gateTimingMs(
      "near world tick, 200 agents",
      nearSamples,
      0.3,
      `${nearStats.decisions} decisions, ${nearStats.near} near`,
    );

    expect(farStats.decisions).toBe(0);
    expect(farStats.near).toBe(0);
    gateTimingRatio("off-screen far tick against the near tick", farP50, nearP50);
    expect(far.crowd.crowd().stats().plans).toBe(0);

    far.world.dispose();
    far.nav.dispose();
    near.world.dispose();
    near.nav.dispose();
  }, 120_000);
});
