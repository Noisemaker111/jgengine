import { describe, expect, test } from "bun:test";

import { BASE_CATALOG_ID } from "./entities/base/catalog";
import { entityModels } from "./models";

describe("keep entityModels", () => {
  const keep = entityModels[BASE_CATALOG_ID]!;

  test("assembles the keep from a resolved base with catalog dims", () => {
    expect(keep.url).toBe("/models/kenney-castle/tower-square-base.glb");
    expect(keep.dims?.footprint).toEqual({ w: 1, d: 1 });
  });

  test("stacks the mid and roof kit pieces as static parts, scaled with the base", () => {
    expect(keep.scale).toBe(1.6);
    expect(keep.parts).toEqual([
      { model: "kenney-castle/tower-square-mid-windows", position: [0, 1.616, 0], scale: 1.6 },
      { model: "kenney-castle/tower-square-roof", position: [0, 3.232, 0], scale: 1.6 },
    ]);
  });
});
