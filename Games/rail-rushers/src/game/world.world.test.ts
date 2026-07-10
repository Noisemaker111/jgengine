import { describe, expect, test } from "bun:test";
import { summarizeEnvironment } from "@jgengine/core/world/environmentSummary";

import { world } from "../world";
import { JUNCTION_NODE_IDS, RAIL_EDGES, RAIL_NODES } from "./rail/network";
import { generateTracksideProps } from "./world/dressing";

describe("rail-rushers world", () => {
  const summary = summarizeEnvironment(world);

  test("renders a populated scene", () => {
    expect(summary.isEmpty).toBe(false);
  });

  test("terrain height is finite (no NaN/flat noise field)", () => {
    expect(summary.terrain?.height.finite).toBe(true);
    expect(summary.terrain?.height.max).toBeGreaterThan(summary.terrain?.height.min ?? 0);
  });

  test("scene content budget: 20 segments, 8 junctions, 4 stations", () => {
    expect(RAIL_EDGES.length).toBe(20);
    expect(JUNCTION_NODE_IDS.length).toBe(8);
    expect(RAIL_NODES.filter((n) => n.kind === "station").length).toBe(4);
  });

  test("scene content budget: 100+ trackside props", () => {
    expect(generateTracksideProps().length).toBeGreaterThanOrEqual(100);
  });
});
