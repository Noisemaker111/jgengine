import { describe, expect, test } from "bun:test";
import { defineGameDefinition } from "@jgengine/core/game/defineGame";
import { createGameContext } from "@jgengine/core/runtime/gameContext";

import { content } from "../content";
import { buildableDef } from "../objects/catalog";
import { cellFor, freshWorld, parkMetrics, placeFree } from "../park";
import { demand, ratingTarget } from "./rating";

function world(kinds: readonly [string, number, number][]) {
  const ctx = createGameContext({ definition: defineGameDefinition({ name: "Brightway rating test", multiplayer: "off" }), content, player: { userId: "p1", isNew: true } });
  const w = freshWorld(ctx);
  // Every milestone reached, so the locked blueprints (the drinks kiosk) can stand too.
  w.set("park.peak", 1000);
  for (const [kind, x, z] of kinds) {
    const id = placeFree(w, kind, cellFor(kind, x, z));
    expect(id).not.toBeNull();
    // Joined to the paths: the rating math is about what is open, not how it is reached.
    if (w.fact(`${id}.closed`) === true) w.set(`${id}.closed`, false);
  }
  return w;
}

describe("brightway-park rating math", () => {
  test("the world's totals count categories, variety, appeal and upkeep", () => {
    const w = world([
      ["ride_carousel", -40, -40],
      ["ride_coaster", 0, -40],
      ["track_piece", 8, -40],
      ["track_piece", 12, -40],
      ["stall_food", -40, 0],
      ["stall_drink", -32, 0],
      ["deco_tree", 40, 40],
    ]);
    const m = parkMetrics(w);
    expect(m.rides).toBe(2);
    expect(m.ridesOpen).toBe(2);
    expect(m.stalls).toBe(2);
    expect(m.tracks).toBe(2);
    expect(m.variety).toBe(4);
    expect(m.totalAppeal).toBeCloseTo(
      ["ride_carousel", "ride_coaster", "track_piece", "track_piece", "stall_food", "stall_drink", "deco_tree"].reduce((sum, kind) => sum + buildableDef(kind).appeal, 0),
    );
    expect(m.dailyUpkeep).toBeGreaterThan(0);
  });

  test("a broken ride's appeal drops out of the park's until it is fixed", () => {
    const w = world([["ride_carousel", -40, -40]]);
    const [ride] = w.instances();
    const up = parkMetrics(w);
    w.set(`${ride!.id}.broken`, true);
    const down = parkMetrics(w);
    expect(down.ridesOpen).toBe(0);
    expect(down.totalAppeal).toBeCloseTo(up.totalAppeal - buildableDef("ride_carousel").appeal);
  });

  test("rating rewards happiness and punishes litter", () => {
    const m = parkMetrics(world([["ride_carousel", -40, -40], ["stall_food", 0, 0]]));
    const clean = ratingTarget(m, 80, 100, 0);
    const dirty = ratingTarget(m, 80, 100, 90);
    expect(clean).toBeGreaterThan(dirty);
    expect(ratingTarget(m, 0, 0, 0)).toBeGreaterThanOrEqual(0);
  });

  test("demand falls as ticket price rises and is zero when closed", () => {
    expect(demand(20, 4, 100, false)).toBe(0);
    const cheap = demand(20, 8, 100, true);
    const pricey = demand(20, 40, 100, true);
    expect(cheap).toBeGreaterThan(pricey);
    expect(pricey).toBeGreaterThanOrEqual(0);
  });
});
