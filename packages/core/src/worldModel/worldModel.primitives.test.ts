import { describe, expect, test } from "bun:test";
import { createWorldModel, defineWorldModel } from "./worldModel";

const run = (world: ReturnType<typeof createWorldModel>, seconds: number) => {
  const ready: string[] = [];
  const removed: string[] = [];
  const landed: string[] = [];
  for (let t = 0; t < seconds; t += 0.25) {
    const result = world.tick(0.25);
    for (const entry of result.ready ?? []) ready.push(entry.id);
    for (const id of result.removed ?? []) removed.push(id);
    for (const entry of result.landed ?? []) landed.push(entry.action);
  }
  return { ready, removed, landed };
};

describe("tower defense: slots, refusing costs, timed builds, upgrades by level", () => {
  const keep = defineWorldModel({
    factions: { keep: { facts: { gold: { value: 300, min: 0 }, lives: 20 } } },
    slots: { plot: { a1: { position: [10, 0] }, a2: { position: [20, 0] } } },
    kinds: {
      archer: { label: "Archer tower", slot: "plot", cost: { "keep.gold": -150 }, takes: 2, refund: 0.5, facts: { level: 1, damage: 12 } },
    },
    actions: {
      upgrade: { label: "Upgrade", on: "archer", whenTarget: { level: { atMost: 2 } }, cost: { "keep.gold": -60 }, scaleBy: "level", effect: { level: 1, damage: 8 } },
      sell: { label: "Sell", on: "archer", removes: true },
    },
    totals: { "keep.towers": { of: "archer" }, "keep.firepower": { of: "archer", sum: "damage" } },
  });

  test("a build reserves its plot at once, pays up front, and stands after its build time", () => {
    const world = createWorldModel(keep);
    const placed = world.place("archer", { slot: "a1" });
    expect(placed).toEqual({ ok: true, id: "archer-1", queued: true });
    expect(world.num("keep.gold")).toBe(150);
    expect(world.canPlace("archer", { slot: "a1" })?.reason).toBe("taken");
    expect(world.num("keep.towers")).toBe(0);
    expect(world.orders()[0]?.label).toBe("Archer tower");
    expect(run(world, 2).ready).toEqual(["archer-1"]);
    expect(world.num("keep.towers")).toBe(1);
    expect(world.instance("archer-1")?.position).toEqual([10, 0]);
  });

  test("a cost it can't pay is refused with what is short, and nothing moves", () => {
    const world = createWorldModel(keep);
    world.place("archer", { slot: "a1" });
    world.place("archer", { slot: "a2" });
    const third = world.canPlace("archer", { slot: "a2" });
    expect(third?.reason).toBe("taken");
    run(world, 4);
    expect(world.num("keep.gold")).toBe(0);
    const refused = world.act("upgrade", "archer-1");
    expect(refused).toMatchObject({ ok: false, reason: "cost", short: { "keep.gold": 60 }, message: "Upgrade needs 60 more gold" });
    expect(world.num("archer-1.level")).toBe(1);
  });

  test("upgrades cost more per level, stop at the cap, and feed the totals; selling refunds half", () => {
    const world = createWorldModel(keep);
    world.place("archer", { slot: "a1" });
    run(world, 2);
    world.change({ "keep.gold": 500 });
    expect(world.costOf("upgrade", "archer-1")).toEqual({ "keep.gold": -60 });
    expect(world.act("upgrade", "archer-1").ok).toBe(true);
    expect(world.costOf("upgrade", "archer-1")).toEqual({ "keep.gold": -120 });
    expect(world.act("upgrade", "archer-1").ok).toBe(true);
    expect(world.num("keep.gold")).toBe(470);
    expect(world.canAct("upgrade", "archer-1")?.reason).toBe("locked");
    expect(world.num("keep.firepower")).toBe(28);
    expect(world.act("sell", "archer-1").ok).toBe(true);
    expect(world.num("keep.gold")).toBe(545);
    expect(world.occupant("a1")).toBeNull();
    expect(world.fact("archer-1.level")).toBeUndefined();
    expect(run(world, 0.25).removed).toEqual(["archer-1"]);
  });

  test("removing a tower still being built cancels it and pays all of it back", () => {
    const world = createWorldModel(keep);
    world.place("archer", { slot: "a1" });
    expect(world.remove("archer-1").ok).toBe(true);
    expect(world.num("keep.gold")).toBe(300);
    expect(world.orders()).toEqual([]);
    expect(run(world, 3).ready).toEqual([]);
  });

  test("placed towers and queued builds survive a save and load", () => {
    const world = createWorldModel(keep);
    world.place("archer", { slot: "a1" });
    run(world, 1);
    const saved = world.snapshot();
    const loaded = createWorldModel(keep);
    loaded.restore(saved);
    expect(loaded.orders()[0]?.progress).toBeCloseTo(0.5);
    expect(run(loaded, 1).ready).toEqual(["archer-1"]);
  });
});

describe("park sim: a grid with footprints, a rating total, gate income that stops on a breakdown", () => {
  const park = defineWorldModel({
    factions: { park: { facts: { cash: { value: 1000, min: 0 }, mood: 60 } } },
    grids: { lot: { cols: 10, rows: 10, cell: 4 } },
    kinds: {
      coaster: { label: "Coaster", grid: "lot", size: [3, 2], cost: { "park.cash": -600 }, facts: { rating: 30, broken: false, riders: 0 } },
      stall: { label: "Stall", grid: "lot", cost: { "park.cash": -100 }, facts: { rating: 5, broken: false } },
    },
    actions: {
      fix: { label: "Repair", on: "coaster", whenTarget: { broken: true }, cost: { "park.cash": -50 }, takes: 3, queue: "crew", effect: { broken: false }, note: "Crew fixed the {target}." },
    },
    ripples: { breakdown: { world: { "park.mood": -15 }, note: "A ride broke down." } },
    totals: {
      "park.rating": { of: "coaster", sum: "rating", where: { broken: false } },
      "park.open_rides": { of: "coaster", where: { broken: false } },
    },
    flows: { gate: { to: "park.cash", from: "park.open_rides", rate: 10 } },
    queues: { crew: { lanes: 1 } },
  });

  test("footprints refuse overlaps and the lot's edge", () => {
    const world = createWorldModel(park);
    expect(world.place("coaster", { cell: [0, 0] }).ok).toBe(true);
    expect(world.canPlace("stall", { cell: [2, 1] })?.reason).toBe("taken");
    expect(world.canPlace("stall", { cell: [3, 0] })).toBeNull();
    expect(world.canPlace("coaster", { cell: [8, 0] })?.reason).toBe("blocked");
    expect(world.instance("coaster-1")?.position).toEqual([6, 4]);
  });

  test("an open coaster earns at the gate; broken, it earns nothing and rates nothing until the crew fixes it", () => {
    const world = createWorldModel(park);
    world.place("coaster", { cell: [0, 0] });
    run(world, 10);
    expect(world.num("park.cash")).toBe(500);
    expect(world.num("park.rating")).toBe(30);
    world.set("coaster-1.broken", true);
    world.emit({ kind: "breakdown" });
    expect(world.num("park.rating")).toBe(0);
    run(world, 5);
    expect(world.num("park.cash")).toBe(500);
    expect(world.act("fix", "coaster-1")).toMatchObject({ ok: true, queued: true });
    expect(world.num("park.cash")).toBe(450);
    expect(run(world, 3).landed).toEqual(["fix"]);
    expect(world.fact("coaster-1.broken")).toBe(false);
    expect(world.log().at(-1)?.text).toBe("Crew fixed the Coaster.");
    run(world, 2);
    expect(world.num("park.cash")).toBe(470);
  });
});

describe("AI lab tycoon: hardware into training into serving income", () => {
  const lab = defineWorldModel({
    factions: { lab: { facts: { cash: { value: 2000, min: 0 }, models: 0 } } },
    kinds: {
      rack: { label: "GPU rack", cost: { "lab.cash": -800 }, takes: 4, limit: 4, facts: { compute: 10, serving: 0 } },
    },
    actions: {
      train: { label: "Train a model", when: { "lab.compute": { atLeast: 20 } }, cost: { "lab.cash": -300 }, takes: 6, queue: "training", world: { "lab.models": 1 } },
      serve: { label: "Serve a model", on: "rack", when: { "lab.models": { atLeast: 1 } }, whenTarget: { serving: 0 }, effect: { serving: 1 } },
    },
    totals: { "lab.compute": { of: "rack", sum: "compute" }, "lab.serving": { of: "rack", sum: "serving" } },
    flows: { revenue: { to: "lab.cash", from: "lab.serving", rate: 25 } },
    queues: { build: { lanes: 2 }, training: { lanes: 1 } },
  });

  test("buy racks, train once there is compute, then serve for per-second income", () => {
    const world = createWorldModel(lab);
    expect(world.place("rack").ok).toBe(true);
    expect(world.place("rack").ok).toBe(true);
    expect(world.canAct("train")?.reason).toBe("locked");
    expect(world.canPlace("rack")?.reason).toBe("cost");
    run(world, 4);
    expect(world.num("lab.compute")).toBe(20);
    expect(world.act("train").ok).toBe(true);
    expect(world.canAct("serve", "rack-1")?.reason).toBe("locked");
    run(world, 6);
    expect(world.num("lab.models")).toBe(1);
    expect(world.act("serve", "rack-1").ok).toBe(true);
    const before = world.num("lab.cash");
    run(world, 4);
    expect(world.num("lab.cash")).toBe(before + 100);
  });

  test("kinds and actions are checked when declared", () => {
    expect(() => defineWorldModel({ kinds: { tower: { slot: "plot" } } })).toThrow(/unknown slot group/);
    expect(() => defineWorldModel({ actions: { up: { effect: { level: 1 } } } })).toThrow(/names no kind/);
    expect(() => defineWorldModel({ totals: { "a.b": { of: "ghost" } } })).toThrow(/unknown kind/);
  });
});
