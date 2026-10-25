import { describe, expect, test } from "bun:test";
import { defineGameDefinition } from "@jgengine/core/game/defineGame";
import { createGameContext } from "@jgengine/core/runtime/gameContext";

import { content } from "../content";
import { cellCentres, cellFor, freshWorld, placeFree } from "../park";
import { placementAt } from "./placement";

function world() {
  const ctx = createGameContext({ definition: defineGameDefinition({ name: "Brightway placement test", multiplayer: "off" }), content, player: { userId: "p1", isNew: true } });
  return freshWorld(ctx, 1_000_000);
}

describe("brightway-park placement on the world lot", () => {
  test("footprint scales with object size and centres on the pointer's cell", () => {
    expect(cellCentres("path_walk", cellFor("path_walk", 0, 0))).toEqual([[0, 0]]);
    expect(cellCentres("ride_carousel", cellFor("ride_carousel", 0, 0))).toHaveLength(4);
    expect(cellCentres("ride_ferris", cellFor("ride_ferris", 0, 0))).toHaveLength(9);
    // A 3 x 3 ride centres on the cell the pointer is over.
    expect(cellCentres("ride_ferris", cellFor("ride_ferris", 0, 0))).toContainEqual([0, 0]);
  });

  test("rejects placement outside the park and on taken cells", () => {
    const w = world();
    expect(placementAt(w, "deco_tree", 400, 0).ok).toBe(false);
    expect(placeFree(w, "deco_tree", cellFor("deco_tree", 0, 0))).not.toBeNull();
    expect(placementAt(w, "deco_tree", 0, 0)).toMatchObject({ ok: false, code: "taken" });
    expect(placementAt(w, "deco_tree", 8, 0).ok).toBe(true);
  });

  test("the world refuses a blueprint the till cannot pay for", () => {
    const w = world();
    w.change({ "park.cash": -w.num("park.cash") + 100 });
    expect(placementAt(w, "ride_carousel", 0, 0)).toMatchObject({ ok: false, code: "cost" });
  });

  test("track must connect to the station or existing track", () => {
    const w = world();
    expect(placementAt(w, "track_piece", 0, 0).ok).toBe(false);
    placeFree(w, "ride_coaster", cellFor("ride_coaster", 0, 0));
    expect(placementAt(w, "track_piece", 8, 0).ok).toBe(true);
    expect(placementAt(w, "track_piece", 40, 40).ok).toBe(false);
    placeFree(w, "track_piece", cellFor("track_piece", 8, 0));
    expect(placementAt(w, "track_piece", 12, 0).ok).toBe(true);
  });
});
