import { describe, expect, test } from "bun:test";

import { editorLayers } from "../editorLayers";

describe("habitat ambience", () => {
  test("the scene authors drifting spores and pulsing shell lights", () => {
    const ids = (editorLayers.simulation?.emitters ?? []).map((emitter) => emitter.id);
    expect(ids.filter((id) => id.startsWith("spores-")).length).toBeGreaterThan(3);
    expect(ids.filter((id) => id.startsWith("shell-light-")).length).toBeGreaterThan(3);
  });
});
