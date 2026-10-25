import { describe, expect, test } from "bun:test";
import { summarizeEnvironment } from "@jgengine/core/world/environmentSummary";

import { world } from "../world";
import { editorLayers } from "../editorLayers";

describe("ember-command world", () => {
  const summary = summarizeEnvironment(world);

  test("renders a populated battlefield", () => {
    expect(summary.isEmpty).toBe(false);
  });

  test("has a single ground plane and editor-owned meadow field", () => {
    expect(summary.counts.terrain).toBe(1);
    expect(summary.counts.vegetationFields).toBe(0);
    expect(editorLayers.volumes.filter(volume => volume.kind === "grass_field")).toHaveLength(1);
  });

  test("terrain resolves to a finite ground plane", () => {
    expect(summary.terrain?.height.finite).toBe(true);
  });
});
