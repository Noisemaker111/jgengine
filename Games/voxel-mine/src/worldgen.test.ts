import { describe, expect, test } from "bun:test";
import { generateWorld, WORLD_RADIUS } from "./worldgen";

describe("generateWorld", () => {
  const placements = generateWorld();
  const countOf = (catalogId: string) =>
    placements.filter((placement) => placement.catalogId === catalogId).length;
  const span = WORLD_RADIUS * 2 + 1;

  test("emits a full ground layer per terrain block type", () => {
    expect(countOf("block_dirt")).toBe(span * span);
    expect(countOf("block_stone")).toBe(span * span);
    expect(countOf("block_grass")).toBeGreaterThan(span * span);
  });

  test("includes trees and a sand patch", () => {
    expect(countOf("block_wood")).toBe(9);
    expect(countOf("block_leaves")).toBeGreaterThan(0);
    expect(countOf("block_sand")).toBe(4);
  });
});
