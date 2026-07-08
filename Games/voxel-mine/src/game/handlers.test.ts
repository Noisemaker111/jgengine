import { describe, expect, test } from "bun:test";
import { createGameContext } from "@jgengine/core/runtime/gameContext";
import { BEDROCK_BLOCK, ORE_COAL } from "./blocks";
import { content } from "./content";
import { game } from "../game.config";
import { createEditorHandlers } from "./handlers";
import { creditPickupsToQuests, EYE_HEIGHT, REACH } from "../loop";
import { QUEST_PROSPECTING, quests } from "./quests";
import { createVoxelField, VOXEL_FACE_NORMALS } from "@jgengine/core/world/voxelField";
import type { Vec3, VoxelGrid, VoxelHit } from "./voxelGrid";

function createFakeGrid(initial: Record<string, string>): VoxelGrid {
  const field = createVoxelField();
  for (const [k, catalogId] of Object.entries(initial)) {
    const [x, y, z] = k.split(",").map(Number) as [number, number, number];
    field.set(x, y, z, catalogId);
  }

  return {
    set(catalogId, x, y, z) {
      if (field.has(x, y, z)) return false;
      field.set(x, y, z, catalogId);
      return true;
    },
    remove(x, y, z) {
      return field.remove(x, y, z);
    },
    has(x, y, z) {
      return field.has(x, y, z);
    },
    catalogAt(x, y, z) {
      return field.get(x, y, z);
    },
    count() {
      return field.count();
    },
    raycast(origin: Vec3, direction: Vec3, maxDistance: number): VoxelHit | null {
      const hit = field.raycast([origin[0] + 0.5, origin[1], origin[2] + 0.5], direction, maxDistance);
      if (hit === null) return null;
      const normal = hit.distance === 0 ? ([0, 0, 0] as Vec3) : ([...VOXEL_FACE_NORMALS[hit.face]] as Vec3);
      return { cell: [hit.x, hit.y, hit.z], normal };
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
  test("mining an ore drops a collectable resource; collecting it credits the quest", () => {
    const ctx = createTestContext();
    creditPickupsToQuests(ctx);
    const grid = createFakeGrid({ "0,-1,0": ORE_COAL.id });
    const handlers = createEditorHandlers(grid, EYE_HEIGHT, REACH);

    handlers.mine!.apply(ctx, { from: ctx.player.userId, itemId: "tool_pickaxe", aim: straightDown });

    expect(grid.has(0, -1, 0)).toBe(false);
    // The break yields a ground item, not an instant inventory grant.
    const dropped = ctx.scene.worldItem.list();
    expect(dropped.length).toBe(1);
    expect(dropped[0]!.itemId).toBe(ORE_COAL.resourceId);
    expect(ctx.player.inventory.count("resources", ORE_COAL.resourceId)).toBe(0);

    ctx.scene.worldItem.pickup(dropped[0]!.instanceId, ctx.player.userId);

    expect(ctx.player.inventory.count("resources", ORE_COAL.resourceId)).toBe(1);
    const quest = ctx.game.quest.list(ctx.player.userId).find((q) => q.questId === QUEST_PROSPECTING);
    const objective = quest?.objectives.find((o) => o.id === ORE_COAL.resourceId);
    expect(objective?.progress).toBe(1);
  });

  test("bedrock cannot be mined and drops nothing", () => {
    const ctx = createTestContext();
    const grid = createFakeGrid({ "0,-1,0": BEDROCK_BLOCK });
    const handlers = createEditorHandlers(grid, EYE_HEIGHT, REACH);

    handlers.mine!.apply(ctx, { from: ctx.player.userId, itemId: "tool_pickaxe", aim: straightDown });

    expect(grid.has(0, -1, 0)).toBe(true);
    expect(ctx.scene.worldItem.list().length).toBe(0);
  });

  test("mining a plain block drops the block itself", () => {
    const ctx = createTestContext();
    const grid = createFakeGrid({ "0,-1,0": "block_stone" });
    const handlers = createEditorHandlers(grid, EYE_HEIGHT, REACH);

    handlers.mine!.apply(ctx, { from: ctx.player.userId, itemId: "tool_pickaxe", aim: straightDown });

    expect(grid.has(0, -1, 0)).toBe(false);
    const dropped = ctx.scene.worldItem.list();
    expect(dropped.length).toBe(1);
    expect(dropped[0]!.itemId).toBe("block_stone");
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
