import { describe, expect, test } from "bun:test";

import { editorLayers } from "./editorLayers";
import { world } from "./world";

describe("Fernwild sky", () => {
  test("draws the cloud deck authored in editor.scene.json, not a code constant", () => {
    const authored = editorLayers.environment?.volumetricClouds;
    expect(authored).toBeDefined();
    expect(authored?.height).toBe(420);
    expect(world.sky?.volumetricClouds).toEqual(authored);
  });
});
