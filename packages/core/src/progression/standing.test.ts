import { describe, expect, test } from "bun:test";

import { createStanding, type StandingConfig, type StandingState } from "@jgengine/core/progression/standing";

const DISTRICT_TIERS = [
  { id: "unknown", min: 0, relation: "neutral" as const },
  { id: "known", min: 10, relation: "friendly" as const },
  { id: "trusted", min: 25, relation: "friendly" as const },
];

const CONFIG: StandingConfig = {
  tracks: [
    { id: "market", label: "Market district", tiers: DISTRICT_TIERS, min: -20, max: 60 },
    { id: "yard", label: "The yard", tiers: DISTRICT_TIERS },
  ],
  outcomes: [
    { id: "delivered", impacts: { market: 8, yard: 3 } },
    { id: "shorted", impacts: { market: -12 } },
  ],
};

describe("standing", () => {
  test("an outcome moves every track it names, up and down", () => {
    const standing = createStanding(CONFIG);
    expect(standing.standing("jon", "market")).toBe(0);

    const gain = standing.apply("jon", "delivered");
    expect(gain.map((change) => [change.trackId, change.before, change.after])).toEqual([
      ["market", 0, 8],
      ["yard", 0, 3],
    ]);

    const fall = standing.apply("jon", "shorted");
    expect(fall).toHaveLength(1);
    expect(fall[0]!.after).toBe(-4);
    expect(fall[0]!.delta).toBe(-12);
    expect(standing.standing("jon", "market")).toBe(-4);
    expect(standing.standing("jon", "yard")).toBe(3);
  });

  test("tiers follow the standing, including across the fall", () => {
    const standing = createStanding(CONFIG);
    expect(standing.tier("jon", "market").id).toBe("unknown");
    const gained = standing.apply("jon", "delivered");
    expect(gained[0]!.previousTier).toBe("unknown");
    expect(gained[0]!.tier).toBe("unknown");
    standing.adjust("jon", "market", 4);
    expect(standing.tier("jon", "market").id).toBe("known");
    standing.adjust("jon", "market", -5);
    expect(standing.tier("jon", "market").id).toBe("unknown");
  });

  test("bounds clamp and the change reports what actually moved", () => {
    const standing = createStanding(CONFIG);
    standing.adjust("jon", "market", 500);
    expect(standing.standing("jon", "market")).toBe(60);
    const down = standing.apply("jon", "shorted");
    expect(down[0]!.delta).toBe(-12);
    standing.adjust("jon", "market", -500);
    expect(standing.standing("jon", "market")).toBe(-20);
  });

  test("meets reads floors and ceilings per track", () => {
    const standing = createStanding(CONFIG);
    standing.adjust("jon", "yard", 25);
    expect(standing.meets("jon", { trackId: "yard", min: 25 })).toBe(true);
    expect(standing.meets("jon", { trackId: "yard", min: 26 })).toBe(false);
    expect(standing.meets("jon", { trackId: "yard", min: 10, max: 30 })).toBe(true);
    expect(standing.meets("jon", { trackId: "yard", max: 20 })).toBe(false);
  });

  test("an unauthored outcome or track throws instead of moving nothing", () => {
    const standing = createStanding(CONFIG);
    expect(() => standing.apply("jon", "won-the-lottery")).toThrow(/won-the-lottery/);
    expect(() => standing.adjust("jon", "moon", 5)).toThrow(/moon/);
    expect(() => standing.standing("jon", "moon")).toThrow(/moon/);
  });

  test("authored content is checked at load", () => {
    expect(() => createStanding({ tracks: [{ id: "a" }, { id: "a" }] })).toThrow(/declared twice/);
    expect(() => createStanding({ tracks: [{ id: "a" }], outcomes: [{ id: "x", impacts: { b: 1 } }] })).toThrow(/unknown track "b"/);
    expect(() => createStanding({ tracks: [{ id: "a", min: 5, max: 1 }] })).toThrow(/min <= max/);
    expect(() => createStanding({ tracks: [{ id: "a", initial: 9, max: 5 }] })).toThrow(/outside its bounds/);
    expect(() => createStanding({ tracks: [{ id: "a" }], outcomes: [{ id: "x", impacts: {} }] })).toThrow(/moves no track/);
  });

  test("snapshot and restore round-trip every track and discard unknown ones", () => {
    const standing = createStanding(CONFIG);
    standing.apply("jon", "delivered");
    standing.adjust("jon", "market", -6);
    standing.adjust("amy", "yard", 12);
    const state = JSON.parse(JSON.stringify(standing.snapshot())) as StandingState;
    expect(state.records.jon).toEqual({ market: 2, yard: 3 });
    expect(state.records.amy).toEqual({ yard: 12 });

    const restored = createStanding(CONFIG);
    restored.restore({ records: { jon: { market: 2, yard: 3, moon: 99 }, amy: { yard: 12 } } });
    expect(restored.snapshot()).toEqual(standing.snapshot());
    expect(restored.standing("jon", "market")).toBe(2);
  });

  test("the same outcomes produce the same state every time", () => {
    const run = (): string => {
      const standing = createStanding(CONFIG);
      for (let index = 0; index < 5; index += 1) {
        standing.apply("jon", index % 2 === 0 ? "delivered" : "shorted");
        standing.adjust("amy", "yard", index);
      }
      return JSON.stringify(standing.snapshot());
    };
    expect(run()).toBe(run());
  });
});
