import { describe, expect, test } from "bun:test";
import { createGameContext } from "@jgengine/core/runtime/gameContext";
import { content } from "./content";
import { game } from "./game";
import { loop } from "./loop";
import { WORLD_RADIUS } from "./worldgen";

describe("voxel-mine world", () => {
  const ctx = createGameContext({
    definition: game,
    content,
    player: { userId: "tester", isNew: true },
  });
  loop.onInit(ctx);
  const objects = ctx.scene.object.list();
  const countOf = (catalogId: string) =>
    objects.filter((object) => object.catalogId === catalogId).length;
  const span = WORLD_RADIUS * 2 + 1;

  test("places a populated voxel field into the scene", () => {
    expect(objects.length).toBeGreaterThan(span * span * 2);
  });

  test("every placed block sits at an integer lattice cell", () => {
    for (const object of objects) {
      expect(Number.isInteger(object.position[0])).toBe(true);
      expect(Number.isInteger(object.position[1])).toBe(true);
      expect(Number.isInteger(object.position[2])).toBe(true);
    }
  });

  test("all six palette block types are present in the world", () => {
    expect(countOf("block_stone")).toBe(span * span);
    expect(countOf("block_dirt")).toBe(span * span);
    expect(countOf("block_grass")).toBeGreaterThan(span * span);
    expect(countOf("block_wood")).toBeGreaterThan(0);
    expect(countOf("block_leaves")).toBeGreaterThan(0);
    expect(countOf("block_sand")).toBe(4);
  });
});
