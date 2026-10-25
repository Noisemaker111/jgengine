import { describe, expect, test } from "bun:test";
import { defineTurfWar } from "./turfWar";
import { calm, createWorldModel, defineWorldModel, type WorldModel } from "./worldModel";

const grip = (value: number) => calm(value, 0, { rest: value, min: 0, max: 100 });

/** A strip of four blocks: two crews hold one end each, the player holds Canal Row. */
const war = defineTurfWar({
  blocks: {
    docks: { borders: ["canal"] },
    canal: { borders: ["docks", "flats"] },
    flats: { borders: ["canal", "yards"] },
    yards: { borders: ["flats"] },
  },
  sides: ["player", "red", "blue"],
  labels: { player: "You", red: "The Reds", blue: "The Blues" },
  onTake: { player: { "red.mood": -10 } },
  fronts: {
    blue_push: { by: "blue", into: ["red", "player"], every: 10, hit: 20, note: "Blues are pushing into {place}.", world: { "war.tension": 5 }, hook: "push" },
    red_strike: { by: "red", into: ["blue"], every: 30, fromBorders: false, chance: 0 },
  },
});

const def = defineWorldModel({
  factions: { red: { facts: { mood: 0 } }, blue: { facts: { mood: 0 } } },
  places: {
    docks: { label: "the docks", position: [0, 0], radius: 40, owner: "red", facts: { grip: grip(30) } },
    canal: { label: "Canal Row", position: [100, 0], radius: 40, owner: "player", facts: { grip: grip(30) } },
    flats: { label: "the Flats", position: [200, 0], radius: 40, owner: "red", facts: { grip: grip(30) } },
    yards: { label: "the Yards", position: [300, 0], radius: 40, owner: "blue", facts: { grip: grip(60) } },
  },
  ripples: {
    ...war.ripples,
    soldier_down: { whenPlace: { owner: "red" }, place: { grip: -15, attacker: "player" } },
  },
  schedule: war.schedule,
  triggers: war.triggers,
  facts: { ...war.facts, "war.tension": 0 },
});

const make = (hooks: string[] = []) => createWorldModel(def, { hooks: { push: (call) => hooks.push(call.place ?? "") } });

/** Tick in half seconds until `done`, returning every trigger that fired on the way. */
const until = (world: WorldModel, done: () => boolean, limit = 400) => {
  const fired: string[] = [];
  for (let t = 0; t < limit && !done(); t += 0.5) fired.push(...(world.tick(0.5).fired ?? []));
  return fired;
};

describe("turf war", () => {
  test("a block changes hands to whoever wore its grip down, with the taker's changes", () => {
    const world = make();
    world.emit({ kind: "soldier_down", at: [2, 0] });
    world.emit({ kind: "soldier_down", at: [2, 0] });
    const fired = world.tick(0.5).fired ?? [];
    expect(fired).toEqual(["turf:docks:red:player"]);
    expect(war.handover(fired[0]!)).toEqual({ block: "docks", from: "red", to: "player" });
    expect(world.fact("docks.owner")).toBe("player");
    expect(world.num("docks.grip")).toBe(40);
    expect(world.fact("docks.attacker")).toBe("");
    expect(world.num("red.mood")).toBe(-10);
    expect(world.log().at(-1)?.text).toBe("You took the docks from The Reds.");
    expect(war.held(world, "player")).toBe(2);
  });

  test("a front pushes only into blocks bordering one it holds, and only into the sides it targets", () => {
    const hooks: string[] = [];
    const world = make(hooks);
    until(world, () => world.fact("flats.attacker") === "blue");
    // Blue holds only the Yards, so the Flats (red) are its one target; Canal Row is two blocks away.
    expect(world.num("flats.grip")).toBe(10);
    expect(world.num("canal.grip")).toBe(30);
    expect(world.fact("canal.attacker")).toBe("");
    expect(world.num("war.tension")).toBe(5);
    expect(hooks).toEqual(["flats"]);
    expect(world.log().at(-1)?.text).toBe("Blues are pushing into the Flats.");
    expect(war.view(world).find((block) => block.id === "flats")).toEqual({ id: "flats", owner: "red", grip: 10, attacker: "blue", contested: true });
  });

  test("taking a block opens the next one: the front rolls up the strip", () => {
    const world = make();
    const fired = until(world, () => world.fact("flats.owner") === "blue");
    expect(fired).toContain("turf:flats:red:blue");
    expect(war.view(world).find((block) => block.id === "flats")).toEqual({ id: "flats", owner: "blue", grip: 40, attacker: "", contested: false });
    expect(world.log().some((entry) => entry.text === "The Blues took the Flats from The Reds.")).toBe(true);
    // The Flats border the player's Canal Row, so the Blues push there next.
    until(world, () => world.fact("canal.attacker") === "blue");
    expect(world.num("canal.grip")).toBe(10);
    expect(world.fact("docks.attacker")).toBe("");
  });

  test("chance gates a front, and catch-up fires each push a bounded number of times", () => {
    const world = make();
    until(world, () => false, 240);
    // red_strike has chance 0: the Yards never move.
    expect(world.fact("yards.owner")).toBe("blue");
    expect(world.num("yards.grip")).toBe(60);
    const away = make();
    const result = away.advance(1000, { maxFires: 1 });
    expect(away.fact("flats.attacker")).toBe("blue");
    expect(result.gained["war.tension"]).toBe(5);
  });

  test("a lowercase label that opens the log line is capitalised, and stays lowercase mid-line", () => {
    const lower = defineTurfWar({ blocks: { a: {} }, sides: ["player", "red"], labels: { player: "you", red: "the Reds" } });
    expect(lower.triggers["turf:a:red:player"]?.note).toBe("You took {place} from the Reds.");
    expect(lower.triggers["turf:a:player:red"]?.note).toBe("The Reds took {place} from you.");
  });

  test("bad declarations fail loudly", () => {
    expect(() => defineTurfWar({ blocks: { a: {} }, sides: ["x"] })).toThrow("at least two sides");
    expect(() => defineTurfWar({ blocks: { a: { borders: ["b"] } }, sides: ["x", "y"] })).toThrow('unknown block "b"');
    expect(() => defineTurfWar({ blocks: { a: {} }, sides: ["x", "y"], fronts: { f: { by: "z" } } })).toThrow('unknown side "z"');
    expect(() => defineTurfWar({ blocks: { a: {} }, sides: ["x", "y"], fronts: { f: { by: "x", into: ["x"] } } })).toThrow("its own side");
    expect(war.handover("take_docks")).toBeNull();
    expect(() => war.pushRipple("nope")).toThrow('unknown front "nope"');
    expect(war.pushRipple("blue_push")).toBe("turf_push:blue_push");
  });
});
