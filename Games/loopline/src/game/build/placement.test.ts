import { describe, expect, test, beforeEach } from "bun:test";

import { buildableDef } from "../objects/catalog";
import { resetSession, session, type PlacedObject } from "../session";
import { blockCenter, canPlace, footprintCells } from "./placement";

function register(catalogId: string, x: number, z: number): void {
  const def = buildableDef(catalogId);
  const placed: PlacedObject = { id: `${catalogId}@${x},${z}`, catalogId, x, z, stock: 0, soldTotal: 0, occupants: 0 };
  session.placed.set(placed.id, placed);
  session.grid.reserve(placed.id, catalogId, footprintCells(def, x, z));
}

describe("loopline placement", () => {
  beforeEach(() => resetSession());

  test("footprint scales with object size", () => {
    expect(footprintCells(buildableDef("path_walk"), 0, 0)).toHaveLength(1);
    expect(footprintCells(buildableDef("ride_carousel"), 0, 0)).toHaveLength(4);
    expect(footprintCells(buildableDef("ride_ferris"), 0, 0)).toHaveLength(9);
  });

  test("centers the render over the footprint block", () => {
    expect(blockCenter(buildableDef("path_walk"), 0, 0)).toEqual([0, 0]);
    expect(blockCenter(buildableDef("ride_ferris"), 0, 0)).toEqual([0, 0]);
  });

  test("rejects placement outside the park and on taken cells", () => {
    expect(canPlace("deco_tree", 400, 0).ok).toBe(false);
    register("deco_tree", 0, 0);
    expect(canPlace("deco_tree", 0, 0).ok).toBe(false);
    expect(canPlace("deco_tree", 8, 0).ok).toBe(true);
  });

  test("track must connect to the station or existing track", () => {
    expect(canPlace("track_piece", 0, 0).ok).toBe(false);
    register("ride_coaster", 0, 0);
    expect(canPlace("track_piece", 8, 0).ok).toBe(true);
    expect(canPlace("track_piece", 40, 40).ok).toBe(false);
    register("track_piece", 8, 0);
    expect(canPlace("track_piece", 12, 0).ok).toBe(true);
  });
});
