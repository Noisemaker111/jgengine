import { describe, expect, test } from "bun:test";

import { resolveTileLayerInstances } from "../../world/tileLayerInstances";
import { drawProceduralTileLayer } from "./proceduralTileLayer";

describe("procedural tile-layer fixture", () => {
  test("draws a deterministic atlas and resolves nine cells", () => {
    const context = { fillStyle: "", clearRect() {}, fillRect() {} };
    const config = drawProceduralTileLayer({ width: 0, height: 0, getContext: () => context, toDataURL: () => "data:image/png;base64,fixture" });
    expect(config.tileSet?.atlas.image).toBe("data:image/png;base64,fixture");
    expect(resolveTileLayerInstances(config)).toHaveLength(9);
  });
});
