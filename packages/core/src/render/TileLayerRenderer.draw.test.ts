import { describe, expect, test } from "bun:test";

import { resolveTileLayerInstances } from "./tileLayerInstances";

describe("resolveTileLayerInstances", () => {
  test("resolves a 3x3 map to atlas frame UV rectangles", () => {
    const instances = resolveTileLayerInstances({
      map: "aba\nbcb\naba",
      tileSet: {
        atlas: {
          image: "data:image/png;base64,procedural",
          size: [16, 16],
          frames: {
            floor: { x: 0, y: 0, w: 8, h: 8 },
            wall: { x: 8, y: 0, w: 8, h: 8 },
            water: { x: 0, y: 8, w: 8, h: 8 },
          },
          animations: {},
        },
        tiles: { a: "floor", b: "wall", c: "water" },
      },
    });

    expect(instances).toHaveLength(9);
    expect(instances[0]).toMatchObject({ x: -1, z: -1, frame: "floor", uvOffset: [0, 0.5], uvScale: [0.5, 0.5] });
    expect(instances[4]).toMatchObject({ x: 0, z: 0, frame: "water", uvOffset: [0, 0], uvScale: [0.5, 0.5] });
  });
});
