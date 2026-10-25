import { describe, expect, test } from "bun:test";
import { createWorldModel, defineWorldModel, type WorldFactValue } from "./worldModel";

const run = (world: ReturnType<typeof createWorldModel>, seconds: number) => {
  const fired: string[] = [];
  for (let t = 0; t < seconds; t += 0.25) fired.push(...(world.tick(0.25).fired ?? []));
  return fired;
};

/** An open city: two blocks, a rival crew, fronts that earn, raids, heat the game reports live. */
const city = defineWorldModel({
  factions: { crew: { facts: { mood: 0 } } },
  places: {
    docks: { label: "the docks", position: [0, 0], radius: 50, owner: "crew", facts: { grip: { value: 30, min: 0, max: 100 } } },
    strip: { label: "the strip", position: [200, 0], radius: 50, owner: "player", facts: { grip: { value: 40, min: 0, max: 100 } } },
  },
  slots: { front: { lounge: { position: [200, 10], label: "the Neon Lounge" }, wash: { position: [0, 10], label: "the car wash" } } },
  kinds: { bar: { label: "Bar", slot: "front", facts: { income: 2, hit: false } } },
  totals: { "fronts.income": { of: "bar", sum: "income", where: { hit: false } } },
  flows: { takings: { to: "fronts.cash", from: "fronts.income", when: { "police.stars": { atMost: 2 } } } },
  ripples: {
    soldier_down: [
      { whenPlace: { owner: "crew" }, place: { grip: -15 }, faction: { mood: -5 } },
      { whenPlace: { owner: "player" }, place: { grip: 5 } },
    ],
    raid: { whenTarget: { hit: false }, target: { hit: true }, world: { "fronts.cash": -10 }, note: "The crew hit {target} in {place}." },
  },
  schedule: { raids: { every: 10, ripple: "raid", on: "bar", whenTarget: { hit: false }, when: { "crew.mood": { atMost: -5 } } } },
  triggers: {
    take_docks: { when: { "docks.owner": "crew", "docks.grip": { atMost: 0 } }, then: { "docks.owner": "player", "docks.grip": 25 }, note: "You took {place}.", place: "docks" },
    lose_docks: { when: { "docks.owner": "player", "docks.grip": { atMost: 0 } }, then: { "docks.owner": "crew", "docks.grip": 30 } },
    night: { when: { "clock.hour": { atLeast: 20 } }, then: { "crew.mood": -1 } },
  },
  facts: { "fronts.cash": 0 },
});

describe("world interlocks: variants by place, triggers, targeted schedules, live facts, catch-up", () => {
  test("the same event lands differently by who owns the block", () => {
    const world = createWorldModel(city);
    world.emit({ kind: "soldier_down", at: [5, 0], faction: "crew" });
    expect(world.num("docks.grip")).toBe(15);
    expect(world.num("crew.mood")).toBe(-5);
    world.emit({ kind: "soldier_down", at: [205, 0], faction: "crew" });
    expect(world.num("strip.grip")).toBe(45);
    expect(world.num("crew.mood")).toBe(-5);
  });

  test("turf changes hands the moment grip runs out, once, and can swing back", () => {
    const world = createWorldModel(city);
    world.emit({ kind: "soldier_down", at: [5, 0], faction: "crew" });
    world.emit({ kind: "soldier_down", at: [5, 0], faction: "crew" });
    expect(run(world, 0.25)).toEqual(["take_docks"]);
    expect(world.fact("docks.owner")).toBe("player");
    expect(world.num("docks.grip")).toBe(25);
    expect(world.log().at(-1)?.text).toBe("You took the docks.");
    expect(run(world, 2)).toEqual([]);
    world.change({ "docks.grip": -25 });
    expect(run(world, 0.25)).toEqual(["lose_docks"]);
    expect(world.fact("docks.owner")).toBe("crew");
  });

  test("live facts gate flows and fire triggers without ever being saved", () => {
    let live: Record<string, WorldFactValue> = { "police.stars": 0, "clock.hour": 12 };
    const world = createWorldModel(city, { live: () => live });
    world.place("bar", { slot: "lounge" });
    run(world, 4);
    expect(world.num("fronts.cash")).toBe(8);
    live = { "police.stars": 3, "clock.hour": 21 };
    expect(run(world, 4)).toEqual(["night"]);
    expect(world.num("fronts.cash")).toBe(8);
    expect(world.num("crew.mood")).toBe(-1);
    expect(world.snapshot().facts["police.stars"]).toBeUndefined();
    expect(world.test({ "clock.hour": 21 })).toBe(true);
  });

  test("a targeted schedule hits one standing front, names it, and skips fronts already hit", () => {
    const world = createWorldModel(city);
    world.place("bar", { slot: "lounge" });
    world.place("bar", { slot: "wash" });
    world.change({ "crew.mood": -10, "fronts.cash": 50 });
    run(world, 10);
    const hit = ["bar-1", "bar-2"].filter((id) => world.fact(`${id}.hit`) === true);
    expect(hit.length).toBe(1);
    expect(world.log().at(-1)?.text).toMatch(/^The crew hit (the Neon Lounge in the strip|the car wash in the docks)\.$/);
    run(world, 10);
    expect(["bar-1", "bar-2"].every((id) => world.fact(`${id}.hit`) === true)).toBe(true);
    const before = world.log().length;
    run(world, 10);
    expect(world.log().length).toBe(before);
  });

  test("the same world rolls the same targets", () => {
    const a = createWorldModel(city);
    const b = createWorldModel(city);
    for (const world of [a, b]) {
      world.place("bar", { slot: "lounge" });
      world.place("bar", { slot: "wash" });
      world.change({ "crew.mood": -10 });
      run(world, 10);
    }
    expect(a.fact("bar-1.hit")).toBe(b.fact("bar-1.hit"));
  });

  test("time away pays the flows, fires each schedule a bounded number of times and reports the gain", () => {
    const world = createWorldModel(city, { live: () => ({ "police.stars": 0 }) });
    world.place("bar", { slot: "lounge" });
    world.change({ "crew.mood": -10 });
    const away = world.advance(3600, { maxFires: 1 });
    expect(away.gained["fronts.cash"]).toBe(7200 - 10);
    expect(world.fact("bar-1.hit")).toBe(true);
    expect(away.log.map((entry) => entry.text)).toEqual(["The crew hit the Neon Lounge in the strip."]);
    expect(world.snapshot().time).toBe(3600);
  });

  test("a trigger whose conditions held at the start fires on the first tick; `once` never re-arms", () => {
    const world = createWorldModel(
      defineWorldModel({
        facts: { alarm: 1, rang: 0 },
        triggers: { ring: { when: { alarm: { atLeast: 1 } }, then: { rang: 1 }, once: true } },
      }),
    );
    run(world, 0.25);
    world.set("alarm", 0);
    run(world, 0.25);
    world.set("alarm", 1);
    run(world, 0.25);
    expect(world.num("rang")).toBe(1);
  });

  test("a trigger sees a value an event set before calming moves it back", () => {
    const calming = defineWorldModel({
      factions: { crew: {} },
      places: { docks: { label: "the docks", position: [0, 0], radius: 50, owner: "crew", facts: { grip: { value: 20, rest: 60, decay: 0.5, min: 0, max: 100 } } } },
      ripples: { soldier_down: { place: { grip: -20 } } },
      triggers: { take: { when: { "docks.owner": "crew", "docks.grip": { atMost: 0 } }, then: { "docks.owner": "player", "docks.grip": 25 } } },
    });
    const world = createWorldModel(calming);
    world.emit({ kind: "soldier_down", place: "docks" });
    expect(world.tick(0.3).fired).toEqual(["take"]);
    expect(world.fact("docks.owner")).toBe("player");
  });

  test("declarations are checked", () => {
    expect(() => defineWorldModel({ triggers: { t: { when: {}, then: {} } } })).toThrow(/needs conditions/);
    expect(() => defineWorldModel({ triggers: { t: { when: { a: 1 }, emit: "nope" } } })).toThrow(/unknown ripple/);
    expect(() => defineWorldModel({ ripples: { r: {} }, schedule: { s: { every: 1, ripple: "r", on: "ghost" } } })).toThrow(/unknown kind/);
    expect(() => defineWorldModel({ ripples: { r: {} }, schedule: { s: { every: 1, ripple: "r", chance: 2 } } })).toThrow(/chance/);
  });
});
