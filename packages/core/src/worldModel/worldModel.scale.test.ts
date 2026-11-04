import { describe, expect, test } from "bun:test";
import { createWorldModel, defineWorldModel } from "./worldModel";

/**
 * A world 100 times bigger must answer a single fact as fast as a small one. Reads used to copy the
 * whole fact table and recount every total, so a HUD asking a few hundred questions a frame cost
 * facts x questions and a bigger game slowed down with the square of its size.
 */
const worldOf = (size: number) => {
  const places: Record<string, { facts: Record<string, number | string>; blip: { when: Record<string, { atLeast: number }> } }> = {};
  const people: Record<string, { at: string; facts: Record<string, number | boolean> }> = {};
  const things: Record<string, { kind: string; facts: Record<string, number> }> = {};
  for (let index = 0; index < size; index += 1) {
    places[`p${index}`] = { facts: { fear: index % 50, owner: "crew" }, blip: { when: { "clock.hour": { atLeast: 0 } } } };
    people[`n${index}`] = { at: `p${index}`, facts: { known: index % 2 === 0, mood: 0 } };
    things[`t${index}`] = { kind: "crate", facts: { value: index } };
  }
  const def = defineWorldModel({
    factions: { crew: { facts: { cash: 0 } } },
    places,
    people,
    kinds: { crate: { facts: { value: 0 } } },
    things,
    totals: { "crew.crates": { of: "crate" }, "crew.worth": { of: "crate", sum: "value" } },
  });
  const live = { "clock.hour": 12 };
  return createWorldModel(def, { live: () => live });
};

/** Fastest of five runs of twenty frames' reads, each frame after a write, in ms; the writes are not timed. */
const frameOfReads = (size: number): number => {
  const world = worldOf(size);
  let fastest = Number.POSITIVE_INFINITY;
  for (let run = 0; run < 5; run += 1) {
    let spent = 0;
    for (let frame = 0; frame < 20; frame += 1) {
      world.set("crew.cash", frame);
      const started = performance.now();
      for (let ask = 0; ask < 300; ask += 1) {
        world.num(`p${ask % 10}.fear`);
        world.fact(`n${ask % 10}.known`);
        world.test({ "clock.hour": { atLeast: 6 }, [`p${ask % 10}.owner`]: { is: "crew" } });
      }
      spent += performance.now() - started;
    }
    fastest = Math.min(fastest, spent);
  }
  return fastest;
};

describe("world model reads scale with the question, not the world", () => {
  test("a world of 3,000 subjects answers a fact about as fast as one of 30", () => {
    const small = frameOfReads(30);
    const large = frameOfReads(3_000);
    // A table copy per read makes this about 100; reading one key keeps it near 1.
    expect(large / small).toBeLessThan(5);
  });

  test("totals still count every member, and follow writes", () => {
    const world = worldOf(200);
    expect(world.num("crew.crates")).toBe(200);
    expect(world.num("crew.worth")).toBe((199 * 200) / 2);
    world.set("t0.value", 1_000);
    expect(world.num("crew.worth")).toBe((199 * 200) / 2 + 1_000);
    expect(world.facts()["crew.crates"]).toBe(200);
    expect(world.facts()["clock.hour"]).toBe(12);
  });
});
