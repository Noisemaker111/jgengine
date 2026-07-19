import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { defineGameDefinition } from "@jgengine/core/game/defineGame";
import { createAssetCatalog } from "@jgengine/core/scene/assetCatalog";
import { createGameContext, type GameContext } from "@jgengine/core/runtime/gameContext";

import { InventoryGrid } from "./inventoryGrid";
import { GameProvider } from "./provider";

function makeContext(): GameContext {
  return createGameContext({
    definition: defineGameDefinition({
      name: "InventoryGridTest",
      assets: createAssetCatalog(),
      multiplayer: "off",
      inventories: { bag: { slots: 4 } },
    }),
    content: {},
    player: { userId: "user_a", isNew: true },
  });
}

function slots(ctx: GameContext) {
  return ctx.player.inventory.state("bag").slots;
}

describe("InventoryGrid render", () => {
  test("renders filled painted tiles, count badges, and empty placeholders in an accessible grid", () => {
    const ctx = makeContext();
    ctx.player.inventory.put("bag", "sword", 1, { slot: 0 });
    ctx.player.inventory.put("bag", "potion", 5, { slot: 1 });

    const html = renderToStaticMarkup(
      createElement(GameProvider, { context: ctx }, createElement(InventoryGrid, { inventoryId: "bag", columns: 2 })),
    );

    expect(html).toContain('role="grid"');
    expect(html).toContain('role="gridcell"');
    expect(html).toContain('data-inventory-grid="bag"');
    expect(html).toContain("data-icon-treatment"); // the sword + potion tiles are painted
    expect(html).toContain("data-count"); // the potion stack of 5
    expect(html).toContain("data-slot-empty"); // the two empty slots
    expect(html).toContain("repeat(2,"); // laid out at the requested column count
  });

  test("an all-empty inventory reads the shared --jg-slot tokens", () => {
    const ctx = makeContext();
    const html = renderToStaticMarkup(
      createElement(GameProvider, { context: ctx }, createElement(InventoryGrid, { inventoryId: "bag" })),
    );
    expect(html).toContain("var(--jg-slot-bg");
    expect(html).toContain("var(--jg-slot-border");
    expect(html).not.toContain("data-icon-treatment");
  });
});

describe("inventory.move / inventory.split commands (the grid's write path)", () => {
  test("moving onto an empty slot relocates the stack", () => {
    const ctx = makeContext();
    ctx.player.inventory.put("bag", "sword", 1, { slot: 0 });

    const result = ctx.game.commands.run("inventory.move", { inventoryId: "bag", from: 0, to: 2 });
    expect(result.status).toBe("applied");
    expect(slots(ctx)[0]).toBeNull();
    expect(slots(ctx)[2]).toEqual({ itemId: "sword", count: 1 });
  });

  test("moving onto a different item swaps the two slots", () => {
    const ctx = makeContext();
    ctx.player.inventory.put("bag", "sword", 1, { slot: 0 });
    ctx.player.inventory.put("bag", "shield", 1, { slot: 1 });

    ctx.game.commands.run("inventory.move", { inventoryId: "bag", from: 0, to: 1 });
    expect(slots(ctx)[0]).toEqual({ itemId: "shield", count: 1 });
    expect(slots(ctx)[1]).toEqual({ itemId: "sword", count: 1 });
  });

  test("moving onto the same item merges the stacks", () => {
    const ctx = makeContext();
    ctx.player.inventory.put("bag", "potion", 3, { slot: 0 });
    ctx.player.inventory.put("bag", "potion", 2, { slot: 1 });

    ctx.game.commands.run("inventory.move", { inventoryId: "bag", from: 0, to: 1 });
    expect(slots(ctx)[0]).toBeNull();
    expect(slots(ctx)[1]).toEqual({ itemId: "potion", count: 5 });
  });

  test("splitting a stack drops half into the first empty slot", () => {
    const ctx = makeContext();
    ctx.player.inventory.put("bag", "potion", 4, { slot: 0 });

    const result = ctx.game.commands.run("inventory.split", { inventoryId: "bag", slot: 0, amount: 2 });
    expect(result.status).toBe("applied");
    expect(slots(ctx)[0]).toEqual({ itemId: "potion", count: 2 });
    expect(slots(ctx)[1]).toEqual({ itemId: "potion", count: 2 });
  });

  test("an unknown inventory id and out-of-range slots are rejected", () => {
    const ctx = makeContext();
    ctx.player.inventory.put("bag", "potion", 4, { slot: 0 });

    expect(ctx.game.commands.run("inventory.move", { inventoryId: "nope", from: 0, to: 1 }).status).toBe("rejected");
    expect(ctx.game.commands.run("inventory.move", { inventoryId: "bag", from: 0, to: 9 }).status).toBe("rejected");
    expect(ctx.game.commands.run("inventory.split", { inventoryId: "bag", slot: 9, amount: 1 }).status).toBe("rejected");
  });

  test("an invalid split (amount >= stack) is a harmless no-op that leaves state unchanged", () => {
    const ctx = makeContext();
    ctx.player.inventory.put("bag", "potion", 4, { slot: 0 });

    const result = ctx.game.commands.run("inventory.split", { inventoryId: "bag", slot: 0, amount: 4 });
    expect(result.status).toBe("applied"); // validate passes; the model rejects and the apply no-ops
    expect(slots(ctx)[0]).toEqual({ itemId: "potion", count: 4 });
    expect(slots(ctx)[1]).toBeNull();
  });
});
