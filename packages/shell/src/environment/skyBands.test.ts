import { describe, expect, test } from "bun:test";
import { sky } from "@jgengine/core/world/features";

import { biomeBandsForSky } from "./skyBands";

describe("biomeBandsForSky", () => {
  const world = sky({ preset: "day" });
  const bands = [{ z: 0, sky: { horizonColor: "#ff9d3d" } }, { z: 900, sky: { horizonColor: "#1d2340" }, fog: { color: "#0e1224" } }];

  test("the world's sky keeps its bands", () => {
    expect(biomeBandsForSky(world, world, bands)).toBe(bands);
  });

  test("a look preset's backdrop sky drops them", () => {
    expect(biomeBandsForSky(sky({ preset: "night" }), world, bands)).toBeUndefined();
  });

  test("no sky, no bands", () => {
    expect(biomeBandsForSky(undefined, undefined, bands)).toBeUndefined();
  });
});
