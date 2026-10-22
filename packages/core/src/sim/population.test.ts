import { describe, expect, test } from "bun:test";
import { createNavRuntime, type NavMeshData } from "@jgengine/core/world";
import { gateTimingMs } from "../../../../scripts/timing-budget";
import type { Vec3 } from "../world/geometry";
import { createNearAgents } from "./nearAgents";
import type { NeedDefinition } from "./needs";
import {
  createVisitorPopulation,
  type VisitorPopulation,
  type VisitorPopulationSnapshot,
  type VisitorWorld,
} from "./population";

const NEEDS: readonly NeedDefinition[] = [{ id: "hunger", max: 100, rate: 0 }];
/** The walkable park: the grid, inside a 2..38 m square the bounds check accepts. */
const PARK_MIN = 2;
const PARK_MAX = 38;
const GATE: Vec3 = [4, 0, 4];
const MIDWAY: Vec3 = [34, 0, 34];

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

interface Park {
  nav: ReturnType<typeof createNavRuntime>;
  crowd: ReturnType<typeof createNearAgents>;
  population: VisitorPopulation;
  /** Bodies the world has made, in admission order. */
  bodies: string[];
  /** Every `admit` the world was asked for, refusals included. */
  attempts: number;
  /** Place one more body the game made itself, outside the flow. */
  spawnBody(id: string): void;
  restoreBodies(next: VisitorPopulationSnapshot): void;
  dispose(): void;
}

function park(options: { capacity?: number; rate?: number; stay?: number; refuseEvery?: number; place?: Vec3 } = {}): Park {
  const nav = createNavRuntime({ mesh: gridMesh(20, 20) });
  const crowd = createNearAgents({
    nav,
    needs: NEEDS,
    crowd: { speed: 4, radius: 0.3, goalRadius: 0.5, replanMs: 100 },
  });
  const bodies: string[] = [];
  const at = options.place ?? GATE;
  const refuseEvery = options.refuseEvery ?? 0;
  const park = { attempts: 0 } as Park;

  function spawnBody(visitor: { id: string }, position: Vec3): void {
    crowd.spawn({
      id: visitor.id,
      position,
      place: "gate",
      activity: "arriving",
      needs: {},
      goal: MIDWAY,
      stop: 0,
      travelling: true,
    });
    bodies.push(visitor.id);
  }

  const world: VisitorWorld = {
    admit(visitor) {
      park.attempts += 1;
      if (refuseEvery > 0 && park.attempts % refuseEvery === 0) return null;
      spawnBody(visitor, at);
      return at;
    },
    release(visitor) {
      crowd.despawn(visitor.id);
      const index = bodies.indexOf(visitor.id);
      if (index >= 0) bodies.splice(index, 1);
    },
    has: (id) => crowd.crowd().has(id),
  };

  const capacity = options.capacity ?? 40;
  const rate = options.rate ?? 3;
  const stay = options.stay ?? 0;
  const population = createVisitorPopulation({
    world,
    policy: {
      capacity,
      arrivalRate: () => rate,
      ...(stay > 0 ? { shouldLeave: (visitor, flow) => flow.now - visitor.admittedAt >= stay } : {}),
    },
    arrivalBudget: 8,
    inside: ([x, , z]) => x >= PARK_MIN && x <= PARK_MAX && z >= PARK_MIN && z <= PARK_MAX,
  });

  park.nav = nav;
  park.crowd = crowd;
  park.population = population;
  park.bodies = bodies;
  park.spawnBody = (id) => spawnBody({ id }, GATE);
  park.restoreBodies = (next) => {
    for (const visitor of next.visitors) spawnBody(visitor, GATE);
  };
  park.dispose = () => {
    population.dispose();
    crowd.dispose();
    nav.dispose();
  };
  return park;
}

/** Advance the flow and the bodies it made; fails the moment the count leaves the crowd. */
function advance(target: Park, from: number, to: number, dt = 1 / 30): number {
  let now = from;
  while (now < to) {
    now = Math.min(to, now + dt);
    target.population.tick(dt, now);
    target.crowd.tick(dt, now);
    expect(target.population.onSite()).toBe(target.crowd.crowd().count());
    expect(target.population.onSite()).toBe(target.bodies.length);
  }
  return now;
}

describe("createVisitorPopulation", () => {
  test("the on-site count is the crowd on the ground and the day is the sum of its arrivals", () => {
    const scene = park({ capacity: 40, rate: 3, stay: 25 });
    let now = advance(scene, 0, 180);

    const stats = scene.population.stats();
    expect(stats.onSite).toBeGreaterThan(0);
    expect(stats.onSite).toBe(scene.crowd.crowd().count());
    expect(stats.arrivalsToday).toBe(scene.bodies.length + stats.departuresToday);
    expect(stats.arrivalsToday).toBeGreaterThan(stats.onSite);
    expect(stats.departuresToday).toBeGreaterThan(0);
    expect(new Set(scene.population.ids())).toEqual(new Set(scene.crowd.crowd().ids()));

    // The reported crowd is what the park can hold, not what it would like to have admitted.
    expect(stats.onSite).toBeLessThanOrEqual(40);
    expect(stats.peakToday).toBeLessThanOrEqual(40);

    now = advance(scene, now, now + 30);
    expect(scene.population.onSite()).toBe(scene.crowd.crowd().count());
    scene.dispose();
  });

  test("a refused body cannot be counted: the attempt tally over-reports and the crowd does not", () => {
    const scene = park({ capacity: 60, rate: 8, refuseEvery: 3 });
    advance(scene, 0, 60);

    const stats = scene.population.stats();
    const crowd = scene.crowd.crowd().count();
    expect(stats.refused).toBeGreaterThan(0);
    expect(scene.attempts).toBe(stats.refused + stats.arrivalsToday);
    expect(scene.bodies.length).toBe(stats.arrivalsToday);
    expect(stats.onSite).toBe(crowd);
    expect(stats.onSite).toBe(scene.population.ids().length);
    scene.dispose();
  });

  test("a body the world places outside the park is released and never counted", () => {
    const scene = park({ capacity: 20, rate: 2, place: [200, 0, 200] });
    advance(scene, 0, 20);

    const stats = scene.population.stats();
    expect(stats.refused).toBeGreaterThan(0);
    expect(stats.arrivalsToday).toBe(0);
    expect(stats.onSite).toBe(0);
    expect(scene.crowd.crowd().count()).toBe(0);

    scene.population.retune({ inside: null });
    advance(scene, 20, 22);
    expect(scene.population.onSite()).toBeGreaterThan(0);
    expect(scene.population.onSite()).toBe(scene.crowd.crowd().count());
    scene.dispose();
  });

  test("a day rolls without emptying the park, and leaving is the only way down", () => {
    const scene = park({ capacity: 12, rate: 1 });
    advance(scene, 0, 30);
    const admitted = scene.population.arrivalsToday();
    const onSite = scene.population.onSite();
    expect(onSite).toBeGreaterThan(0);
    expect(admitted).toBe(onSite);

    scene.population.rollDay();
    expect(scene.population.arrivalsToday()).toBe(0);
    expect(scene.population.onSite()).toBe(onSite);
    expect(scene.population.peakToday()).toBe(onSite);

    const [first] = scene.population.ids();
    expect(scene.population.leave(first!)).toBe(true);
    expect(scene.population.leave(first!)).toBe(false);
    expect(scene.population.onSite()).toBe(onSite - 1);
    expect(scene.crowd.crowd().count()).toBe(onSite - 1);
    expect(scene.population.departuresToday()).toBe(1);

    advance(scene, 30, 60);
    expect(scene.population.arrivalsToday()).toBe(1);
    expect(scene.population.onSite()).toBe(onSite);
    expect(scene.population.peakToday()).toBe(onSite);
    expect(scene.crowd.crowd().count()).toBe(scene.bodies.length);
    scene.dispose();
  });

  test("a save restores the same crowd and the same day, and never trusts a stored total", () => {
    const first = park({ capacity: 40, rate: 3, stay: 20 });
    advance(first, 0, 40);
    const saved = first.population.snapshot();
    advance(first, 40, 80);
    const live = first.population.stats();
    const liveIds = [...first.population.ids()];
    const liveCrowd = first.crowd.crowd().count();

    const second = park({ capacity: 40, rate: 3, stay: 20 });
    second.restoreBodies(saved);
    second.population.restore(saved);
    expect(second.population.onSite()).toBe(saved.visitors.length);
    expect(second.crowd.crowd().count()).toBe(saved.visitors.length);
    advance(second, 40, 80);

    expect(second.population.stats()).toEqual(live);
    expect([...second.population.ids()]).toEqual(liveIds);
    expect(second.crowd.crowd().count()).toBe(liveCrowd);

    const three = park({ capacity: 10, rate: 0 });
    const slice = { visitors: saved.visitors.slice(0, 3), arrivalsToday: 99, departuresToday: 0, peakToday: 99, pending: 0, sequence: 9 };
    three.population.restore(slice);
    expect(three.population.onSite()).toBe(0);
    expect(three.population.stats().refused).toBe(3);
    expect(three.population.snapshot().sequence).toBe(9);
    for (const visitor of slice.visitors) {
      three.spawnBody(visitor.id);
      expect(three.population.adopt(visitor.id, { admittedAt: visitor.admittedAt })).toBe(true);
    }
    expect(three.population.onSite()).toBe(3);
    expect(three.population.onSite()).toBe(three.crowd.crowd().count());

    expect(three.population.adopt("vip#1", { arrival: true })).toBe(false);
    three.spawnBody("vip#1");
    expect(three.population.adopt("vip#1", { arrival: true })).toBe(true);
    expect(three.population.adopt("vip#1", { arrival: true })).toBe(false);
    expect(three.population.onSite()).toBe(4);
    expect(three.population.onSite()).toBe(three.crowd.crowd().count());
    expect(three.population.arrivalsToday()).toBe(100);
    three.dispose();

    first.dispose();
    second.dispose();
  });

  test("reading the count for a HUD does not walk the crowd", () => {
    const scene = park({ capacity: 500, rate: 40, stay: 0 });
    advance(scene, 0, 20);
    expect(scene.population.onSite()).toBeGreaterThan(200);

    const samples: number[] = [];
    let sink = 0;
    for (let sample = 0; sample < 20; sample += 1) {
      const started = performance.now();
      for (let read = 0; read < 10_000; read += 1) sink += scene.population.onSite();
      samples.push(performance.now() - started);
    }
    expect(sink).toBe(20 * 10_000 * scene.population.onSite());
    gateTimingMs("population on-site read, 10,000 reads", samples, 0.2, `${scene.population.onSite()} visitors`);
    scene.dispose();
  });
});
