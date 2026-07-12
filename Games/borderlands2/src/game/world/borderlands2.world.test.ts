import { describe, expect, test } from "bun:test";
import { summarizeEnvironment } from "@jgengine/core/world/environmentSummary";
import { terrainField, world } from "../../world";
import { BANDIT_CAMP, FYRESTONE, PLAYER_SPAWN } from "./sites";

describe("borderlands2 world", () => {
  const summary = summarizeEnvironment(world);

  test("renders a populated scene", () => {
    expect(summary.isEmpty).toBe(false);
  });

  test("has Fyrestone, the bandit camp, and Flynt's perch", () => {
    expect(summary.counts.structureGroups).toBe(3);
    expect(summary.counts.buildings).toBe(21);
  });

  test("terrain resolves finite heights with real relief", () => {
    const heights = [
      terrainField.sampleHeight(0, 0),
      terrainField.sampleHeight(120, -120),
      terrainField.sampleHeight(-150, 140),
    ];
    for (const height of heights) expect(Number.isFinite(height)).toBe(true);
    const spread = Math.max(...heights) - Math.min(...heights);
    expect(spread).toBeGreaterThan(2);
  });

  test("settlement sites are flattened near ground level", () => {
    const fyrestone = terrainField.sampleHeight(FYRESTONE.x, FYRESTONE.z);
    const fyrestoneEdge = terrainField.sampleHeight(FYRESTONE.x + 12, FYRESTONE.z - 10);
    const camp = terrainField.sampleHeight(BANDIT_CAMP.x, BANDIT_CAMP.z);
    const campEdge = terrainField.sampleHeight(BANDIT_CAMP.x - 11, BANDIT_CAMP.z + 9);
    expect(Math.abs(fyrestoneEdge - fyrestone)).toBeLessThan(0.75);
    expect(Math.abs(campEdge - camp)).toBeLessThan(0.75);
    expect(Number.isFinite(terrainField.sampleHeight(PLAYER_SPAWN[0], PLAYER_SPAWN[2]))).toBe(true);
  });
});
