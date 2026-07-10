import { describe, expect, test } from "bun:test";
import { projectToMinimap, type MinimapView } from "@jgengine/core/world/minimap";

import { unprojectFromMinimap, windBearingRad } from "./mapProjection";

const view: MinimapView = { center: [0, 0], worldRadius: 1250, size: 400 };

describe("unprojectFromMinimap", () => {
  test("round-trips a projected world point back to world space", () => {
    const world: readonly [number, number] = [320, -540];
    const pixel = projectToMinimap(world, view);
    const back = unprojectFromMinimap(pixel.x, pixel.y, view);
    expect(back.x).toBeCloseTo(world[0], 4);
    expect(back.z).toBeCloseTo(world[1], 4);
  });

  test("the panel center maps back to the view center", () => {
    const back = unprojectFromMinimap(view.size / 2, view.size / 2, view);
    expect(back.x).toBeCloseTo(0, 5);
    expect(back.z).toBeCloseTo(0, 5);
  });
});

describe("windBearingRad", () => {
  test("a wind blowing toward north (-Z) points up on the map", () => {
    expect(windBearingRad([0, -1])).toBeCloseTo(0, 5);
  });

  test("a wind blowing toward east (+X) points right", () => {
    expect(windBearingRad([1, 0])).toBeCloseTo(Math.PI / 2, 5);
  });
});
