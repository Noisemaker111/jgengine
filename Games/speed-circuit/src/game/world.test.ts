import { describe, expect, test } from "bun:test";
import { summarizeEnvironment } from "@jgengine/core/world/environmentSummary";

import { world } from "../world";

describe("speed-circuit world", () => {
  test("world is an environment feature", () => {
    expect(world.kind).toBe("environment");
  });

  const summary = summarizeEnvironment(world.kind === "environment" ? world : { kind: "environment" });

  test("renders a populated, non-empty scene", () => {
    expect(summary.isEmpty).toBe(false);
  });

  test("declares terrain", () => {
    expect(summary.counts.terrain).toBe(1);
  });

  test("terrain has finite rolling relief", () => {
    expect(summary.terrain?.height.finite).toBe(true);
    expect(summary.terrain?.height.max).toBeGreaterThan(summary.terrain?.height.min ?? 0);
  });
});
