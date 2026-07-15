import { describe, expect, test } from "bun:test";

import type { PlacedObject } from "../session";
import { coasterThrill, computeMetrics, demand, objectAppeal, ratingTarget } from "./rating";
import { buildableDef } from "../objects/catalog";

function placed(catalogId: string, x = 0, z = 0): PlacedObject {
  return { id: `${catalogId}#${x}${z}`, catalogId, x, z, stock: 0, soldTotal: 0, occupants: 0 };
}

describe("loopline rating math", () => {
  test("coaster appeal grows with track length", () => {
    const def = buildableDef("ride_coaster");
    expect(objectAppeal(def, 0)).toBe(def.appeal);
    expect(objectAppeal(def, 5)).toBeCloseTo(def.appeal + coasterThrill(5));
    expect(objectAppeal(def, 5)).toBeGreaterThan(objectAppeal(def, 0));
  });

  test("metrics count categories and variety", () => {
    const m = computeMetrics([
      placed("ride_carousel"),
      placed("ride_coaster"),
      placed("track_piece"),
      placed("track_piece"),
      placed("stall_food"),
      placed("stall_drink"),
      placed("deco_tree"),
    ]);
    expect(m.rides).toBe(2);
    expect(m.stalls).toBe(2);
    expect(m.tracks).toBe(2);
    expect(m.scenery).toBe(1);
    expect(m.variety).toBe(4);
    expect(m.dailyUpkeep).toBeGreaterThan(0);
  });

  test("rating rewards happiness and punishes litter", () => {
    const m = computeMetrics([placed("ride_carousel"), placed("stall_food")]);
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
