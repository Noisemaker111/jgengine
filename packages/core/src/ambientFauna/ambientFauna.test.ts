import { describe, expect, test } from "bun:test";

import { gateTimingMs } from "../../../../scripts/timing-budget";
import { windField } from "../world/wind";
import { createEditableTerrain } from "../terrain/terraform";
import {
  createAmbientFauna,
  windowPresence,
  type FaunaArea,
  type FaunaFrame,
  type FaunaGroup,
  type FaunaGroupState,
  type FaunaMotion,
  type FaunaWorld,
} from "./ambientFauna";

function only<T>(list: readonly T[]): T {
  const first = list[0];
  if (first === undefined) throw new Error("expected one entry");
  return first;
}

const SEA = 0;
const wavy = (x: number, z: number, time: number): number => SEA + Math.sin(x * 0.3 + time) * 0.25 + Math.cos(z * 0.2 + time * 0.7) * 0.15;
const shore = (x: number): number => (x < 0 ? -6 : -6 + x * 0.5);
const world: FaunaWorld = {
  surfaceAt: wavy,
  groundAt: (x) => shore(x),
  groundRevision: () => 0,
  plantAt: (x, z) => Math.sin(x * 0.4) + Math.cos(z * 0.4) > -0.5,
  wind: windField({ direction: [1, 0.4], speed: 6, gust: 2 }),
};

const disc: FaunaArea = { shape: "disc", x: 0, z: 0, radius: 30 };
const box: FaunaArea = { shape: "box", x: -10, z: 5, halfX: 25, halfZ: 18 };

function group(motion: FaunaMotion, area: FaunaArea, count: number, extra: Partial<FaunaGroup> = {}): FaunaGroup {
  return { id: `${motion}-${area.shape}`, species: motion, motion, area, count, seed: "s", ...extra };
}

function frame(time: number, dt = 1 / 30): FaunaFrame {
  return { dt, time, sunHeight: 0.8, focusX: 0, focusZ: 0 };
}

function inside(area: FaunaArea, x: number, z: number): boolean {
  const slack = 1e-3;
  if (area.shape === "disc") return Math.hypot(x - area.x, z - area.z) <= area.radius + slack;
  return Math.abs(x - area.x) <= area.halfX + slack && Math.abs(z - area.z) <= area.halfZ + slack;
}

function everyAgent(state: FaunaGroupState, visit: (x: number, y: number, z: number, i: number) => void): void {
  for (let i = 0; i < state.count; i += 1) visit((state.position[i * 3] ?? 0), (state.position[i * 3 + 1] ?? 0), (state.position[i * 3 + 2] ?? 0), i);
}

describe("each motion stays inside its area", () => {
  for (const motion of ["school", "swarm", "drift", "soar"] as const) {
    for (const area of [disc, box]) {
      test(`${motion} in a ${area.shape} over 30 simulated minutes`, () => {
        const fauna = createAmbientFauna([group(motion, area, 40)], world);
        const state = only(fauna.groups);
        expect(state.count).toBeGreaterThan(0);
        for (let step = 0; step < 54_000; step += 1) {
          fauna.update(frame(step / 30));
          if (step % 600 === 0) everyAgent(state, (x, y, z) => {
            expect(Number.isFinite(x + y + z)).toBe(true);
            if (motion !== "soar") expect(inside(area, x, z)).toBe(true);
          });
        }
        everyAgent(state, (x, y, z) => expect(Number.isFinite(x + y + z)).toBe(true));
        for (const value of state.velocity) expect(Number.isFinite(value)).toBe(true);
      });
    }
  }

  test("soarers circle the area's centre at their altitude band", () => {
    const fauna = createAmbientFauna([group("soar", disc, 12, { band: { min: 50, max: 80 } })], world);
    const state = only(fauna.groups);
    for (let step = 0; step < 6000; step += 1) fauna.update(frame(step / 30));
    everyAgent(state, (x, y, z) => {
      expect(Math.hypot(x, z)).toBeLessThan(30 * 0.7 + 30 * 0.25 + 0.5);
      expect(y).toBeGreaterThanOrEqual(shore(0) + 50 - 1e-3);
      expect(y).toBeLessThanOrEqual(shore(0) + 80 + 1e-3);
    });
  });
});

describe("fish", () => {
  test("never break the surface or touch the seabed, over waves and a sloping shore", () => {
    const fauna = createAmbientFauna([group("school", box, 120, { band: { min: 0.3, max: 2.5 } })], world);
    const state = only(fauna.groups);
    for (let step = 0; step < 36_000; step += 1) {
      const time = step / 30;
      fauna.update(frame(time));
      if (step % 5 === 0) everyAgent(state, (x, y, z) => {
        expect(y).toBeLessThanOrEqual(wavy(x, z, time) - 0.3 + 1e-4);
        expect(y).toBeGreaterThanOrEqual(shore(x) + 0.25 - 1e-4);
      });
    }
  });

  test("never leave the water for the beach", () => {
    const fauna = createAmbientFauna([group("school", box, 80)], world);
    const state = only(fauna.groups);
    for (let step = 0; step < 18_000; step += 1) {
      const time = step / 30;
      fauna.update(frame(time));
      if (step % 10 === 0) everyAgent(state, (x, _y, z) => expect(wavy(x, z, time) - shore(x)).toBeGreaterThanOrEqual(0.9 - 1e-3));
    }
  });

  test("a zone with no water holds no fish", () => {
    const dry: FaunaWorld = { ...world, groundAt: () => 5 };
    const fauna = createAmbientFauna([group("school", disc, 50)], dry);
    expect(only(fauna.groups).count).toBe(0);
  });
});

describe("insects and motes", () => {
  test("spawn only where a plant grows, and stay within reach of the plant", () => {
    const fauna = createAmbientFauna([group("swarm", box, 60), group("drift", box, 60, { id: "motes" })], world);
    for (const state of fauna.groups) everyAgent(state, (x, _y, z) => expect(Math.sin(x * 0.4) + Math.cos(z * 0.4)).toBeGreaterThan(-0.5 - 1e-3));
    const starts = fauna.groups.map((state) => Array.from(state.position));
    for (let step = 0; step < 9000; step += 1) fauna.update(frame(step / 30));
    fauna.groups.forEach((state, index) => {
      const start = starts[index] ?? [];
      everyAgent(state, (x, y, z, i) => {
        expect(Math.hypot(x - (start[i * 3] ?? 0), z - (start[i * 3 + 2] ?? 0))).toBeLessThan(state.spec.wander * 4 + 2);
        expect(y).toBeGreaterThanOrEqual(shore(x) + state.spec.band.min - 1e-3);
        expect(y).toBeLessThanOrEqual(shore(x) + state.spec.band.max + 1e-3);
      });
    });
  });
});

describe("budget and window", () => {
  test("the global cap and the group limit bound the agent count", () => {
    const fauna = createAmbientFauna([group("school", disc, 900), group("swarm", disc, 900, { id: "b" }), group("drift", disc, 900, { id: "c" })], world, { globalCap: 1500 });
    expect(fauna.total()).toBeLessThanOrEqual(1500);
    expect(fauna.groups.map((g) => g.count)).toEqual([900, 600, 0]);
    const huge = createAmbientFauna([group("drift", { shape: "disc", x: 0, z: 0, radius: 1000 }, 1e9)], world, { globalCap: 1e9 });
    expect(only(huge.groups).count).toBeLessThanOrEqual(4096);
  });

  test("density counts agents per 1000 m²", () => {
    const fauna = createAmbientFauna([{ id: "d", species: "x", motion: "soar", area: { shape: "box", x: 0, z: 0, halfX: 50, halfZ: 50 }, density: 2 }], world);
    expect(only(fauna.groups).count).toBe(20);
  });

  test("a time-of-day window fades the group in and out", () => {
    expect(windowPresence({ sunMin: 0.1 }, 0.5)).toBe(1);
    expect(windowPresence({ sunMin: 0.1 }, -0.2)).toBe(0);
    expect(windowPresence({ sunMax: -0.05 }, 0.5)).toBe(0);
    expect(windowPresence({ sunMax: -0.05 }, -0.5)).toBe(1);
    expect(windowPresence({ sunMin: 0.1, fade: 0.2 }, 0.2)).toBeCloseTo(0.5);
    expect(windowPresence({ sunMin: 0.1 }, null)).toBe(0);
    expect(windowPresence(undefined, null)).toBe(1);
    const fauna = createAmbientFauna([group("swarm", disc, 40, { window: { sunMax: -0.1 } })], world);
    fauna.update({ ...frame(0), sunHeight: 0.9 });
    expect(fauna.activeTotal()).toBe(0);
    fauna.update({ ...frame(1), sunHeight: -0.9 });
    expect(fauna.activeTotal()).toBe(fauna.total());
  });

  test("a group beyond the simulate range stays where it is", () => {
    const fauna = createAmbientFauna([group("drift", disc, 20)], world, { simulateRange: 100 });
    const before = Array.from(only(fauna.groups).position);
    for (let step = 0; step < 100; step += 1) fauna.update({ ...frame(step / 30), focusX: 5000 });
    expect(Array.from(only(fauna.groups).position)).toEqual(before);
  });
});

describe("state", () => {
  test("same seed same placement; snapshot restores and survives JSON; reset replaces", () => {
    const make = () => createAmbientFauna([group("school", box, 30), group("swarm", disc, 30, { id: "b" })], world);
    const a = make();
    const b = make();
    expect(Array.from(only(a.groups).position)).toEqual(Array.from(only(b.groups).position));
    for (let step = 0; step < 300; step += 1) { a.update(frame(step / 30)); b.update(frame(step / 30)); }
    const saved = JSON.parse(JSON.stringify(a.snapshot()));
    for (let step = 300; step < 600; step += 1) a.update(frame(step / 30));
    a.restore(saved);
    for (let step = 300; step < 600; step += 1) { a.update(frame(step / 30)); b.update(frame(step / 30)); }
    expect(Array.from(only(a.groups).position)).toEqual(Array.from(only(b.groups).position));
    a.reset();
    expect(Array.from(only(a.groups).position)).toEqual(Array.from(only(make().groups).position));
    expect(() => a.restore({ groups: [] })).toThrow();
  });
});

describe("cost", () => {
  const plain: FaunaWorld = { surfaceAt: () => SEA, groundAt: () => -6, wind: { atHeight: () => [3, 1] } };
  const big = (): FaunaGroup[] => [
    group("school", { shape: "disc", x: 0, z: 0, radius: 120 }, 700),
    group("swarm", { shape: "disc", x: 300, z: 0, radius: 120 }, 700, { id: "swarm" }),
    group("drift", { shape: "disc", x: 0, z: 300, radius: 120 }, 400, { id: "drift" }),
    group("soar", { shape: "disc", x: 300, z: 300, radius: 120 }, 200, { id: "soar" }),
  ];

  test("an update allocates nothing per frame", () => {
    const fauna = createAmbientFauna(big(), plain, { simulateRange: 1e6 });
    for (let step = 0; step < 120; step += 1) fauna.update(frame(step / 30));
    Bun.gc(true);
    const before = process.memoryUsage().heapUsed;
    for (let step = 120; step < 720; step += 1) fauna.update(frame(step / 30));
    const grown = process.memoryUsage().heapUsed - before;
    expect(grown).toBeLessThan(400_000);
  });

  test("agents read the ground as they move across it, not every frame", () => {
    let reads = 0;
    const counted: FaunaWorld = { ...world, groundAt: (x, z) => { reads += 1; return world.groundAt?.(x, z) ?? 0; } };
    const fauna = createAmbientFauna([group("school", box, 120, { band: { min: 0.3, max: 2.5 } }), group("swarm", box, 60, { id: "b" }), group("drift", box, 60, { id: "c" })], counted);
    const agents = fauna.total();
    for (let step = 0; step < 60; step += 1) fauna.update(frame(step / 30));
    reads = 0;
    const frames = 900;
    for (let step = 60; step < 60 + frames; step += 1) fauna.update(frame(step / 30));
    // Every frame used to read it once per insect and twice per fish.
    expect(reads).toBeLessThan((agents * frames) / 4);
  });

  test("terrain edits invalidate cached heights and unknown revisions never reuse across updates", () => {
    const terrain = createEditableTerrain({ bounds: { minX: -50, minZ: -50, maxX: 50, maxZ: 50 }, cellSize: 2 });
    let reads = 0;
    const make = (tracked: boolean) => createAmbientFauna([group("drift", disc, 30)], {
      groundAt: (x, z) => { reads += 1; return terrain.sampleHeight(x, z); },
      ...(tracked ? { groundRevision: terrain.heightRevision } : {}),
    });
    const fauna = make(true);
    const stale = createAmbientFauna([group("drift", disc, 30)], { groundAt: terrain.sampleHeight, groundRevision: () => 0 });
    for (let step = 0; step < 60; step += 1) { fauna.update(frame(step / 30)); stale.update(frame(step / 30)); }
    reads = 0;
    fauna.update(frame(2));
    const reused = reads;
    terrain.apply({ mode: "raise", center: [0, 0], radius: 45, strength: 10, falloff: "none" });
    reads = 0;
    fauna.update(frame(2 + 1 / 30));
    stale.update(frame(2 + 1 / 30));
    expect(reads).toBeGreaterThan(reused);
    for (const state of fauna.groups) everyAgent(state, (x, y, z) => {
      expect(y).toBeGreaterThanOrEqual(terrain.sampleHeight(x, z) + state.spec.band.min - 1e-3);
    });
    let staleAgents = 0;
    for (const state of stale.groups) everyAgent(state, (x, y, z) => {
      if (y < terrain.sampleHeight(x, z) + state.spec.band.min - 1e-3) staleAgents += 1;
    });
    expect(staleAgents).toBeGreaterThan(0);
    const untracked = make(false);
    for (let step = 0; step < 3; step += 1) untracked.update(frame(step / 30));
    reads = 0;
    untracked.update(frame(0.1));
    expect(reads).toBeGreaterThanOrEqual(untracked.activeTotal());
  });

  test("a reused ground height keeps insects inside their band over ground steeper than 45°", () => {
    const steep = (x: number, z: number): number => Math.sin(x * 0.8) * 3 + Math.cos(z * 0.6) * 2;
    const fauna = createAmbientFauna([group("swarm", disc, 100), group("drift", disc, 100, { id: "c" })], { groundAt: steep, plantAt: () => true });
    for (let step = 0; step < 3600; step += 1) {
      fauna.update(frame(step / 30));
      for (const state of fauna.groups) everyAgent(state, (x, y, z) => {
        expect(y).toBeGreaterThanOrEqual(steep(x, z) + state.spec.band.min - 1e-3);
        expect(y).toBeLessThanOrEqual(steep(x, z) + state.spec.band.max + 1e-3);
      });
    }
  });

  test("a 2,000-agent set ticks inside a stated budget", () => {
    const fauna = createAmbientFauna(big(), plain, { simulateRange: 1e6 });
    expect(fauna.total()).toBe(2000);
    for (let step = 0; step < 60; step += 1) fauna.update(frame(step / 30));
    const samples: number[] = [];
    for (let pass = 0; pass < 7; pass += 1) {
      const t0 = performance.now();
      for (let step = 0; step < 30; step += 1) fauna.update(frame((60 + pass * 30 + step) / 30));
      samples.push(performance.now() - t0);
    }
    // 30 updates of 2,000 agents; the budget is 4 ms per update, a quarter of a 60 fps frame.
    gateTimingMs("ambient fauna, 2000 agents x 30 updates", samples, 120);
    expect(Math.min(...samples) / 30).toBeLessThan(40);
  });
});
