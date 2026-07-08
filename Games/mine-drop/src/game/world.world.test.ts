import { describe, expect, test } from "bun:test";
import { summarizeEnvironment } from "@jgengine/core/world/environmentSummary";

import { world } from "../world";

describe("mine-drop world", () => {
  test("world is an environment feature", () => {
    expect(world.kind).toBe("environment");
  });

  const summary = summarizeEnvironment(world.kind === "environment" ? world : { kind: "environment" });

  test("renders a populated, non-empty living room", () => {
    expect(summary.isEmpty).toBe(false);
  });

  test("declares the flat floor terrain", () => {
    expect(summary.counts.terrain).toBe(1);
    expect(summary.terrain?.height.finite).toBe(true);
  });
});
