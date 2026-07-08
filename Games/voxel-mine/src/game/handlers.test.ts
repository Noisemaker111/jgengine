import { describe, expect, test } from "bun:test";
import { createGameContext } from "@jgengine/core/runtime/gameContext";
import { BEDROCK_BLOCK, ORE_COAL } from "./blocks";
import { content } from "./content";
import { game } from "../game.config";
import { createEditorHandlers } from "./handlers";
import { EYE_HEIGHT, REACH } from "../loop";
import { QUEST_PROSPECTING, quests } from "./quests";
import { raycastVoxel, type Vec3, type VoxelHit } from "./raycast";
import type { VoxelGrid } from "./voxelGrid";

function createFakeGrid(initial: Record<string, string>): VoxelGrid {
  const cells = new Map(Object.entries(initial));
  const key = (x: number, y: number, z: number) => `${x},${y},${z}`;

  return {
    set(catalogId, x, y, z) {
      const k = key(x, y, z);
      if (cells.has(k)) return false;
      cells.set(k, catalogId);
      return true;
    },
    remove(x, y, z) {
      const k = key(x, y, z);
      if (!cells.has(k)) return false;
      cells.delete(k);
      return true;
    },
    has(x, y, z) {
      return cells.has(key(x, y, z));
    },
    catalogAt(x, y, z) {
      return cells.get(key(x, y, z)) ?? null;
    },
    count() {
      return cells.size;
    },
    raycast(origin: Vec3, direction: Vec3, maxDistance: number): VoxelHit | null {
      const latticeOrigin: Vec3 = [origin[0] + 0.5, origin[1], origin[2] + 0.5];
      return raycastVoxel((x, y, z) => cells.has(key(x, y, z)), latticeOrigin, direction, maxDistance);
    },
  };
}

let nextTesterId = 0;

function createTestContext() {
  nextTesterId += 1;
  const userId = `tester-${nextTesterId}`;
  const ctx = createGameContext({ definition: game.game, content, player: { userId, isNew: true } });
  ctx.scene.entity.spawn("player", { id: ctx.player.userId, position: [0, 0, 0] });
  ctx.game.quest.register(quests);
  ctx.game.quest.bind("inventory.added");
  ctx.game.quest.accept(ctx.player.userId, QUEST_PROSPECTING);
  return ctx;
}

const straightDown = { yaw: 0, pitch: -Math.PI / 2 };

describe("createEditorHandlers", () => {
  test("mining an ore block grants its resource and credits the matching quest objective", () => {
    const ctx = createTestContext();
    const grid = createFakeGrid({ "0,-1,0": ORE_COAL.id });
    const handlers = createEditorHandlers(grid, EYE_HEIGHT, REACH);

    handlers.mine!.apply(ctx, { from: ctx.player.userId, itemId: "tool_pickaxe", aim: straightDown });

    expect(grid.has(0, -1, 0)).toBe(false);
    expect(ctx.player.inventory.count("resources", ORE_COAL.resourceId)).toBe(1);
    const quest = ctx.game.quest.list(ctx.player.userId).find((q) => q.questId === QUEST_PROSPECTING);
    const objective = quest?.objectives.find((o) => o.id === ORE_COAL.resourceId);
    expect(objective?.progress).toBe(1);
  });

  test("bedrock cannot be mined", () => {
    const ctx = createTestContext();
    const grid = createFakeGrid({ "0,-1,0": BEDROCK_BLOCK });
    const handlers = createEditorHandlers(grid, EYE_HEIGHT, REACH);

    handlers.mine!.apply(ctx, { from: ctx.player.userId, itemId: "tool_pickaxe", aim: straightDown });

    expect(grid.has(0, -1, 0)).toBe(true);
  });

  test("mining a plain block grants no resource", () => {
    const ctx = createTestContext();
    const grid = createFakeGrid({ "0,-1,0": "block_stone" });
    const handlers = createEditorHandlers(grid, EYE_HEIGHT, REACH);

    handlers.mine!.apply(ctx, { from: ctx.player.userId, itemId: "tool_pickaxe", aim: straightDown });

    expect(grid.has(0, -1, 0)).toBe(false);
    expect(ctx.player.inventory.state("resources").slots.every((slot) => slot === null)).toBe(true);
  });

  test("cannot place a block into the cell the player occupies", () => {
    const ctx = createTestContext();
    const grid = createFakeGrid({ "0,-1,0": "block_stone" });
    const handlers = createEditorHandlers(grid, EYE_HEIGHT, REACH);

    handlers.placeBlock!.apply(ctx, { from: ctx.player.userId, itemId: "block_dirt", aim: straightDown });

    expect(grid.has(0, 0, 0)).toBe(false);
  });

  test("placing a block away from the player succeeds", () => {
    const ctx = createTestContext();
    const grid = createFakeGrid({ "0,1,3": "block_stone" });
    const handlers = createEditorHandlers(grid, EYE_HEIGHT, REACH);

    handlers.placeBlock!.apply(ctx, {
      from: ctx.player.userId,
      itemId: "block_dirt",
      aim: { yaw: 0, pitch: 0 },
    });

    expect(grid.has(0, 1, 2)).toBe(true);
  });
});
