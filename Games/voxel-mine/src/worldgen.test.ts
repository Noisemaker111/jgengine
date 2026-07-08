import { describe, expect, test } from "bun:test";
import { BEDROCK_BLOCK, ORES } from "./blocks";
import { generateWorld, BEDROCK_Y, SHAFT_BOTTOM, SHAFT_TOP, WORLD_RADIUS } from "./worldgen";

describe("generateWorld", () => {
  const placements = generateWorld();
  const countOf = (catalogId: string) =>
    placements.filter((placement) => placement.catalogId === catalogId).length;
  const span = WORLD_RADIUS * 2 + 1;
  const columns = span * span;

  test("emits a full crust layer per terrain block type", () => {
    expect(countOf("block_dirt")).toBe(columns);
    expect(placements.filter((placement) => placement.y === -3).every((p) => p.catalogId === "block_stone")).toBe(
      true,
    );
    expect(placements.filter((placement) => placement.y === -3)).toHaveLength(columns);
    expect(countOf("block_grass")).toBeGreaterThan(columns);
  });

  test("includes trees and a sand patch", () => {
    expect(countOf("block_wood")).toBe(9);
    expect(countOf("block_leaves")).toBeGreaterThan(0);
    expect(countOf("block_sand")).toBe(4);
  });

  test("digs a mineable shaft under the crust to a bedrock floor", () => {
    expect(countOf(BEDROCK_BLOCK)).toBe(columns);
    for (const placement of placements) {
      if (placement.catalogId === BEDROCK_BLOCK) expect(placement.y).toBe(BEDROCK_Y);
    }
  });

  test("every shaft depth is a full column of stone-or-ore", () => {
    for (let y = SHAFT_TOP; y >= SHAFT_BOTTOM; y -= 1) {
      expect(placements.filter((placement) => placement.y === y)).toHaveLength(columns);
    }
  });

  test("ore veins appear only within their own depth band", () => {
    for (const ore of ORES) {
      const deposits = placements.filter((placement) => placement.catalogId === ore.id);
      expect(deposits.length).toBeGreaterThan(0);
      const bandColumns = (ore.top - ore.bottom + 1) * columns;
      expect(deposits.length).toBeLessThan(bandColumns);
      for (const deposit of deposits) {
        expect(deposit.y).toBeLessThanOrEqual(ore.top);
        expect(deposit.y).toBeGreaterThanOrEqual(ore.bottom);
      }
    }
  });
});
