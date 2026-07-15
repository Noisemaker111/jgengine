import { describe, expect, test } from "bun:test";
import { summarizeEnvironment } from "@jgengine/core/world/environmentSummary";

import { world } from "../world";

describe("loopline world", () => {
  const summary = summarizeEnvironment(world);

  test("renders a populated scene", () => {
    expect(summary.isEmpty).toBe(false);
  });

  test("frames the park with three building clusters", () => {
    expect(summary.counts.buildings).toBe(14);
  });

  test("has finite, resolvable terrain", () => {
    expect(summary.terrain?.height.finite).toBe(true);
  });

  test("uses this game's own look, not engine defaults", () => {
    expect(summary.terrain?.palette.low).not.toBe("#30402c");
    expect(summary.structures[0]?.palette.wall).not.toBe("#83766a");
  });
});
