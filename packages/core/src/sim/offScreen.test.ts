import { describe, expect, test } from "bun:test";
import { devtools } from "@jgengine/core/devtools/devtools";
import { createNavRuntime, type NavMeshData } from "@jgengine/core/world";
import type { NeedDefinition } from "./needs";
import { createNearAgents } from "./nearAgents";
import { createOffScreenWorld, type OffScreenPolicy } from "./offScreen";
import { resolveRoutine } from "./routine";

const NEEDS: readonly NeedDefinition[] = [{ id: "hunger", max: 100, rate: 0.02 }];

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

const PLACES = { home: [6, 0, 6] as const, work: [40, 0, 6] as const, diner: [40, 0, 40] as const };
/** A six-minute day: home, work, meal, home, with twenty seconds of walking between each. */
function day(travel = 20) {
  return resolveRoutine({
    cycleSeconds: 600,
    stops: [
      { place: "home", arriveAt: 0, activity: "sleep", travelSeconds: 0 },
      { place: "work", arriveAt: 120, activity: "work", travelSeconds: travel },
      { place: "diner", arriveAt: 300, activity: "meal", travelSeconds: travel },
      { place: "home", arriveAt: 420, activity: "home", travelSeconds: travel },
    ],
  });
}

interface World {
  nav: ReturnType<typeof createNavRuntime>;
  crowd: ReturnType<typeof createNearAgents>;
  world: ReturnType<typeof createOffScreenWorld>;
}

function build(options: {
  policy?: Partial<OffScreenPolicy>;
  residents: Parameters<typeof createOffScreenWorld>[0]["residents"];
  places?: Readonly<Record<string, readonly [number, number, number]>>;
}): World {
  const nav = createNavRuntime({ mesh: gridMesh(30, 30) });
  const crowd = createNearAgents({
    nav,
    needs: NEEDS,
    options: [{ id: "eat", terms: [{ need: "hunger", curve: { kind: "linear", from: 0.1, to: 0.9 } }] }],
    candidates: (agent) => (agent.needs.values["hunger"]! < 50 ? [{ option: "eat", cost: 1 }] : []),
    crowd: { speed: 4, radius: 0.4, goalRadius: 0.6, replanMs: 100 },
  });
  const world = createOffScreenWorld({
    places: (options.places ?? PLACES) as Record<string, readonly [number, number, number]>,
    needs: NEEDS,
    policy: { nearRadius: 8, farRadius: 10, ...options.policy },
    near: crowd,
    residents: options.residents,
  });
  return { nav, crowd, world };
}

function advance(target: World, from: number, to: number, viewer: readonly [number, number, number], dt = 1 / 30): number {
  let now = from;
  while (now < to) {
    now = Math.min(to, now + dt);
    target.world.tick(dt, now, viewer);
  }
  return now;
}

describe("createOffScreenWorld", () => {
  test("an agent that walks out of range and back keeps schedule progress, needs and its own position", () => {
    const id = "cook";
    const scene = build({ residents: [{ id, home: [6, 0, 6], routine: day() }] });
    const viewer = [6, 0, 6] as const;

    let now = advance(scene, 0, 1, viewer);
    expect(scene.world.agent(id)!.mode).toBe("near");
    expect(scene.crowd.crowd().count()).toBe(1);
    expect(scene.crowd.decisions()).toBeGreaterThan(0);

    now = advance(scene, now, 150, viewer);
    const walkedAway = scene.world.agent(id)!;
    expect(walkedAway.mode).toBe("far");
    expect(scene.crowd.crowd().count()).toBe(0);
    const decisionsAway = scene.crowd.decisions();
    expect(walkedAway.stop).toBe(1);
    expect(walkedAway.place).toBe("work");
    expect(Math.hypot(walkedAway.position[0] - 40, walkedAway.position[2] - 6)).toBeLessThan(1);

    now = advance(scene, now, 419.9, viewer);
    expect(scene.crowd.decisions()).toBe(decisionsAway);
    const cheapAtDiner = scene.world.agent(id)!;
    expect(cheapAtDiner.stop).toBe(2);
    expect(scene.world.needsAt(id, now)!["hunger"]).toBeCloseTo(100 - 0.02 * now, 1);

    now = advance(scene, now, 421, viewer);
    const back = scene.world.agent(id)!;
    expect(back.mode).toBe("near");
    expect(scene.crowd.decisions()).toBeGreaterThan(decisionsAway);
    expect(back.stop).toBe(3);
    expect(back.place).toBe("home");

    const spawned = scene.crowd.view(id)!;
    expect(Math.hypot(spawned.position[0] - 6, spawned.position[2] - 6)).toBeLessThan(1);
    expect(Math.hypot(spawned.position[0], spawned.position[2])).toBeGreaterThan(4);
    expect(spawned.needs.values["hunger"]).toBeCloseTo(100 - 0.02 * now, 0);

    // Same phase, no routine boundary: the resident leaves and returns standing exactly where it left.
    const held = scene.world.agent(id)!.position;
    const awayViewer = [5000, 0, 0] as const;
    now = advance(scene, now, now + 1, awayViewer);
    expect(scene.world.agent(id)!.mode).toBe("far");
    const cheapHeld = scene.world.agent(id)!.position;
    expect(Math.hypot(cheapHeld[0] - held[0], cheapHeld[2] - held[2])).toBeLessThan(0.01);
    now = advance(scene, now, now + 1, viewer);
    const returned = scene.crowd.view(id)!;
    expect(Math.hypot(returned.position[0] - cheapHeld[0], returned.position[2] - cheapHeld[2])).toBeLessThan(0.05);

    scene.world.dispose();
    scene.nav.dispose();
  });

  test("a resident whose day puts it across the map spawns there, not at home or the origin", () => {
    const routine = resolveRoutine({
      cycleSeconds: 600,
      stops: [{ place: "work", arriveAt: 0, activity: "work", travelSeconds: 0 }],
    });
    const scene = build({ residents: [{ id: "clerk", home: [6, 0, 6], routine }] });
    const far = [5000, 0, 0] as const;
    let now = advance(scene, 0, 30, far);
    expect(scene.world.agent("clerk")!.mode).toBe("far");

    now = advance(scene, now, 31, [40, 0, 6]);
    const view = scene.crowd.view("clerk")!;
    expect(scene.world.agent("clerk")!.mode).toBe("near");
    expect(Math.hypot(view.position[0] - 40, view.position[2] - 6)).toBeLessThan(0.5);
    expect(Math.hypot(view.position[0] - 6, view.position[2] - 6)).toBeGreaterThan(30);
    expect(Math.hypot(view.position[0], view.position[2])).toBeGreaterThan(30);

    scene.world.dispose();
    scene.nav.dispose();
  });

  test("far agents run no nav and no utility decisions; near ones do", () => {
    const residents = Array.from({ length: 40 }, (_, i) => ({
      id: `guest${i}`,
      home: [i * 3, 0, 0] as const,
    }));
    const scene = build({ residents, policy: { nearRadius: 30, farRadius: 30 } });
    const viewer = [0, 0, 0] as const;

    let now = advance(scene, 0, 1, viewer);
    const nearNow = scene.world.stats();
    expect(nearNow.near).toBe(11);
    expect(nearNow.far).toBe(29);
    expect(scene.crowd.crowd().count()).toBe(11);
    for (let i = 20; i < 40; i += 1) expect(scene.crowd.crowd().has(`guest${i}`)).toBe(false);

    const decisionsNear = scene.crowd.decisions();
    now = advance(scene, now, 2, viewer);
    expect(scene.crowd.decisions()).toBeGreaterThan(decisionsNear);

    const farViewer = [5000, 0, 0] as const;
    now = advance(scene, now, 2.1, farViewer);
    expect(scene.world.stats().near).toBe(0);
    const decisionsAllFar = scene.crowd.decisions();
    const refreshesAllFar = scene.world.stats().farRefreshes;
    now = advance(scene, now, 62, farViewer);
    expect(scene.crowd.decisions()).toBe(decisionsAllFar);
    expect(scene.world.stats().farRefreshes).toBe(refreshesAllFar);
    expect(scene.crowd.crowd().count()).toBe(0);

    scene.world.dispose();
    scene.nav.dispose();
  });

  test("a whole street crossing the boundary spawns within the per-tick switch budget", () => {
    const residents = Array.from({ length: 100 }, (_, i) => ({ id: `r${i}`, home: [6, 0, 6] as const }));
    const scene = build({ residents, policy: { switchBudget: 8 } });
    const viewer = [6, 0, 6] as const;

    let now = advance(scene, 0, 1 / 30, viewer);
    expect(scene.world.stats().near).toBe(8);
    expect(scene.world.stats().promotions).toBe(8);
    now = advance(scene, now, 1, viewer);
    expect(scene.world.stats().near).toBe(100);
    expect(scene.world.stats().promotions).toBe(100);

    scene.world.dispose();
    scene.nav.dispose();
  });

  test("a meal refills needs at the authored stop while the agent is off screen", () => {
    const routine = resolveRoutine({
      cycleSeconds: 600,
      stops: [
        { place: "home", arriveAt: 0, travelSeconds: 0 },
        { place: "diner", arriveAt: 240, activity: "meal", travelSeconds: 20, refill: { hunger: 400 } },
        { place: "home", arriveAt: 480, travelSeconds: 20 },
      ],
    });
    const scene = build({
      residents: [{ id: "eater", home: [6, 0, 6], routine, needs: { hunger: 90 } }],
    });
    const far = [5000, 0, 0] as const;

    let now = advance(scene, 0, 239, far);
    expect(scene.world.needsAt("eater", now)!["hunger"]).toBeCloseTo(90 - 0.02 * 239, 2);
    now = advance(scene, now, 241, far);
    expect(scene.world.agent("eater")!.stop).toBe(1);
    expect(scene.world.needsAt("eater", now)!["hunger"]).toBeCloseTo(100 - 0.02 * (now - 240), 2);

    scene.world.dispose();
    scene.nav.dispose();
  });

  test("snapshot and restore resume the same off-screen day", () => {
    const residents = Array.from({ length: 20 }, (_, i) => ({
      id: `worker${i}`,
      home: [6, 0, 6] as const,
      needs: { hunger: 40 + i },
    }));
    const viewer = [5000, 0, 0] as const;

    const first = build({ residents });
    const a = advance(first, 0, 200, viewer);
    const saved = first.world.snapshot();
    const b = advance(first, a, 400, viewer);
    const expected = first.world.snapshot();

    const second = build({ residents });
    second.world.restore(saved);
    advance(second, a, 400, viewer);
    expect(second.world.snapshot()).toEqual(expected);

    first.world.dispose();
    first.nav.dispose();
    second.world.dispose();
    second.nav.dispose();
  });

  test("named residents follow their own authored days through the same clock", () => {
    const baker = resolveRoutine({
      cycleSeconds: 600,
      stops: [
        { place: "home", arriveAt: 0, travelSeconds: 0 },
        { place: "diner", arriveAt: 60, activity: "bake", travelSeconds: 10 },
        { place: "diner", arriveAt: 500, activity: "close", travelSeconds: 0 },
      ],
    });
    const clerk = resolveRoutine({
      cycleSeconds: 600,
      stops: [
        { place: "work", arriveAt: 0, travelSeconds: 0 },
        { place: "home", arriveAt: 300, travelSeconds: 15 },
      ],
    });
    const scene = build({
      residents: [
        { id: "baker", home: [6, 0, 6], routine: baker },
        { id: "clerk", home: [6, 0, 6], routine: clerk },
      ],
    });
    const viewer = [6, 0, 6] as const;

    let now = advance(scene, 0, 30, viewer);
    expect(scene.world.agent("baker")!.place).toBe("home");
    expect(scene.world.agent("clerk")!.place).toBe("work");

    now = advance(scene, now, 70, viewer);
    expect(scene.world.agent("baker")!.place).toBe("diner");
    expect(scene.world.agent("baker")!.activity).toBe("bake");
    expect(scene.world.agent("clerk")!.place).toBe("work");

    now = advance(scene, now, 320, viewer);
    expect(scene.world.agent("baker")!.place).toBe("diner");
    expect(scene.world.agent("clerk")!.place).toBe("home");
    expect(scene.world.agent("clerk")!.stop).toBe(1);

    scene.world.dispose();
    scene.nav.dispose();
  });

  test("pin keeps a resident near from any distance, and remove takes it out of both halves", () => {
    const scene = build({ residents: [{ id: "npc", home: [6, 0, 6] }] });
    const far = [5000, 0, 0] as const;
    let now = advance(scene, 0, 1, far);
    expect(scene.world.agent("npc")!.mode).toBe("far");

    expect(scene.world.pin("npc")).toBe(true);
    now = advance(scene, now, 2, far);
    expect(scene.world.agent("npc")!.mode).toBe("near");
    expect(scene.world.agent("npc")!.pinned).toBe(true);
    expect(scene.crowd.crowd().has("npc")).toBe(true);

    expect(scene.world.pin("npc", false)).toBe(true);
    now = advance(scene, now, 3, far);
    expect(scene.world.agent("npc")!.mode).toBe("far");
    expect(scene.crowd.crowd().has("npc")).toBe(false);

    now = advance(scene, now, 4, [6, 0, 6]);
    expect(scene.world.remove("npc")).toBe(true);
    expect(scene.world.has("npc")).toBe(false);
    expect(scene.world.count()).toBe(0);
    expect(scene.crowd.crowd().count()).toBe(0);

    scene.world.dispose();
    scene.nav.dispose();
  });

  test("registers a devtools probe with the near and far census", () => {
    const nav = createNavRuntime({ mesh: gridMesh(30, 30) });
    const probed = createOffScreenWorld({
      places: PLACES,
      needs: NEEDS,
      policy: { nearRadius: 8 },
      near: createNearAgents({ nav, needs: NEEDS }),
      residents: [{ id: "a", home: [6, 0, 6] }],
      devtoolsName: "offscreen-test",
    });
    probed.tick(1 / 30, 1 / 30, [6, 0, 6]);
    expect(devtools.snapshot().probes["offscreen-test"]).toContain("1 near 0 far");
    probed.dispose();
    nav.dispose();
  });
});
