import { describe, expect, test } from "bun:test";
import { summarizeEnvironment } from "@jgengine/core/world/environmentSummary";

import { world } from "../world";

describe("ironhold world", () => {
  const summary = summarizeEnvironment(world);

  test("renders a populated battlefield", () => {
    expect(summary.isEmpty).toBe(false);
  });

  test("has a single ground plane and meadow field", () => {
    expect(summary.counts.terrain).toBe(1);
    expect(summary.counts.vegetationFields).toBe(1);
  });

  test("terrain resolves to a finite ground plane", () => {
    expect(summary.terrain?.height.finite).toBe(true);
  });
});
