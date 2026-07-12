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
      terrainField.heightAt(0, 0),
      terrainField.heightAt(120, -120),
      terrainField.heightAt(-150, 140),
    ];
    for (const height of heights) expect(Number.isFinite(height)).toBe(true);
    const spread = Math.max(...heights) - Math.min(...heights);
    expect(spread).toBeGreaterThan(2);
  });

  test("settlement sites are flattened near ground level", () => {
    const fyrestone = terrainField.heightAt(FYRESTONE.x, FYRESTONE.z);
    const camp = terrainField.heightAt(BANDIT_CAMP.x, BANDIT_CAMP.z);
    expect(Math.abs(fyrestone)).toBeLessThan(1.5);
    expect(Math.abs(camp)).toBeLessThan(1.5);
    expect(Number.isFinite(terrainField.heightAt(PLAYER_SPAWN[0], PLAYER_SPAWN[2]))).toBe(true);
  });
});
