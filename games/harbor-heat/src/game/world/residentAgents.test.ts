import { describe, expect, test } from "bun:test";

import type { AgentSystemState, Vec3 } from "@jgengine/core/agents/system";

import { createResidentAgents, residentOffers } from "./residentAgents";
import { RESIDENTS, RESIDENT_PLACES } from "./residents";

const PLACES: Record<string, Vec3> = Object.fromEntries(
  RESIDENT_PLACES.map((place) => [place.id, place.position as Vec3]),
);
const placeOf = (id: string): Vec3 | null => PLACES[id] ?? null;

function cast(now = 300, initial?: AgentSystemState) {
  const box: { state: AgentSystemState | undefined } = { state: initial };
  const people = createResidentAgents({
    clock: { now: () => now },
    rng: () => 0.5,
    position: (id) => placeOf(RESIDENTS.find((spec) => spec.id === id)?.work ?? "") ?? null,
    places: placeOf,
    storage: { read: () => box.state, write: (next) => { box.state = next; } },
  });
  return { people, box };
}

describe("harbor-heat residents on the shared agent system", () => {
  test("the town offers each resident its own meal, home, shift and the avenue", () => {
    const rosa = RESIDENTS[0]!;
    const offers = residentOffers(rosa, PLACES[rosa.work] ?? null, placeOf);
    expect(offers.map((offer) => offer.option)).toEqual(["meal", "home", "work", "wander"]);
    expect(offers.map((offer) => offer.target)).toEqual([rosa.meal, rosa.home, rosa.work, "place_avenue_cafe"]);
  });

  test("one tick gives every resident a mood and a decision", () => {
    const { people } = cast();
    people.system.tick(0.5);
    for (const spec of RESIDENTS) {
      const mood = people.system.mood(spec.id);
      const action = people.system.action(spec.id);
      expect(mood?.label).toBeTruthy();
      expect(action?.option).not.toBeNull();
      expect(["meal", "home", "work", "wander"]).toContain(action?.option ?? "");
    }
  });

  test("an empty belly pulls a resident off its shift to a meal", () => {
    const { people } = cast(300);
    const rosa = RESIDENTS[0]!;
    const agent = people.system.get(rosa.id)!;
    agent.needs.refill("hunger", -70);
    people.system.tick(0.5);
    expect(people.system.action(rosa.id)?.option).toBe("meal");
    expect(people.system.action(rosa.id)?.target).toBe(rosa.meal);
  });

  test("a save keeps needs and mood across a fresh cast", () => {
    const first = cast(300);
    first.people.system.tick(0.5);
    const rosa = RESIDENTS[0]!;
    first.people.system.get(rosa.id)!.needs.refill("rest", -40);
    const before = first.people.system.get(rosa.id)!.mood().score;
    const state = first.people.system.save();

    const second = cast(300, state);
    // The store is picked up on the first tick, not by a restore call at every boot.
    second.people.system.tick(0.5);
    expect(second.people.system.get(rosa.id)!.mood().score).toBeCloseTo(before, 1);
  });
});
