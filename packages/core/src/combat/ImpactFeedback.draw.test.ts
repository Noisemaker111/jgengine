import { describe, expect, test } from "bun:test";

import { IMPACT_PROFILES } from "@jgengine/core/combat/impactProfile";

import { classFor, createHitstop, impactKick } from "./ImpactFeedback.draw";

function clock(initial = 1) {
  let scale = initial;
  return { timescale: () => scale, setTimescale: (next: number) => void (scale = next) };
}

describe("createHitstop", () => {
  test("slows the clock for the stop and restores the game's own timescale", () => {
    const time = clock(0.5);
    const stop = createHitstop(time);
    stop.start(60, 1000);
    expect(time.timescale()).toBeCloseTo(0.025, 6);
    stop.tick(1050);
    expect(time.timescale()).toBeCloseTo(0.025, 6);
    stop.tick(1060);
    expect(time.timescale()).toBe(0.5);
    expect(stop.active()).toBe(false);
  });

  test("overlapping stops extend instead of stacking slower", () => {
    const time = clock();
    const stop = createHitstop(time);
    stop.start(40, 0);
    stop.start(80, 20);
    expect(time.timescale()).toBeCloseTo(0.05, 6);
    stop.tick(60);
    expect(stop.active()).toBe(true);
    stop.tick(100);
    expect(time.timescale()).toBe(1);
  });

  test("a game that changes the timescale during the stop keeps its value", () => {
    const time = clock();
    const stop = createHitstop(time);
    stop.start(50, 0);
    time.setTimescale(0.3);
    stop.tick(60);
    expect(time.timescale()).toBe(0.3);
  });

  test("a zero-length stop does nothing", () => {
    const time = clock();
    const stop = createHitstop(time);
    stop.start(0, 0);
    expect(stop.active()).toBe(false);
    expect(time.timescale()).toBe(1);
  });
});

describe("impactKick", () => {
  test("an explosion kicks hardest at the player and fades to nothing at its radius", () => {
    const blast = IMPACT_PROFILES.explosive;
    expect(impactKick(blast, 0)).toBeCloseTo(blast.kick);
    expect(impactKick(blast, blast.kickRadius / 2)).toBeCloseTo(blast.kick / 4);
    expect(impactKick(blast, blast.kickRadius)).toBe(0);
    expect(impactKick(blast, blast.kickRadius * 3)).toBe(0);
  });

  test("light gunfire never kicks the camera on its own", () => {
    expect(impactKick(IMPACT_PROFILES.light, 0)).toBe(0);
  });
});

describe("classFor", () => {
  test("a grenade's item names its blast even when the effect is plain damage", () => {
    expect(classFor("grenade_pineapple", "damage")).toBe("explosive");
    expect(classFor("pistol_vice", "damage")).toBe("light");
    expect(classFor("shotgun_boardwalk", "damage")).toBe("heavy");
  });

  test("a game's classes entry wins for the item or the effect", () => {
    expect(classFor("flare", "damage", { flare: "explosive" })).toBe("explosive");
    expect(classFor("pistol", "plasma", { plasma: "heavy" })).toBe("heavy");
  });
});
