import { describe, expect, test } from "bun:test";
import { createElement } from "@jgengine/core/ui/jsx";
import { renderToStaticMarkup } from "@jgengine/core/ui/jsx/markup";

import { defineGameDefinition } from "@jgengine/core/game/defineGame";
import { createAssetCatalog } from "@jgengine/core/scene/assetCatalog";
import { createGameContext, type GameContext } from "@jgengine/core/runtime/gameContext";

import { InventoryGrid, useInventoryTransfer } from "./inventoryGrid.view";
import { GameProvider } from "@jgengine/ui/provider";

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

describe("a stash beside the bag renders from the same model", () => {
  test("the stash grid shows the banked stack while the bag grid stays empty", () => {
    const ctx = createGameContext({
      definition: defineGameDefinition({
        name: "StashGridTest",
        assets: createAssetCatalog(),
        multiplayer: "off",
        inventories: { bag: { slots: 4 }, stash: { slots: 4, tier: "banked" } },
      }),
      content: {},
      player: { userId: "user_a", isNew: true },
    });
    ctx.player.inventory.put("stash", "rifle", 1, { slot: 1 });

    const html = renderToStaticMarkup(
      createElement(
        GameProvider,
        { context: ctx },
        createElement(InventoryGrid, { inventoryId: "stash", columns: 2 }),
      ),
    );
    expect(html).toContain('data-inventory-grid="stash"');
    expect(html).toContain("data-icon-treatment");
    expect(ctx.player.inventory.state("bag").slots.every((slot) => slot === null)).toBe(true);
  });
});

describe("inventory.move across two inventories (bag to stash)", () => {
  function stashContext(): GameContext {
    return createGameContext({
      definition: defineGameDefinition({
        name: "StashMoveTest",
        assets: createAssetCatalog(),
        multiplayer: "off",
        inventories: {
          bag: { slots: 3, traits: { stackLimit: (id) => (id === "ore" ? 10 : 1), kind: (id) => (id === "ore" ? "material" : "gear") } },
          stash: { slots: 3, tier: "banked" },
          satchel: { slots: 2, accepts: "material" },
        },
      }),
      content: {},
      player: { userId: "user_a", isNew: true },
    });
  }
  const state = (ctx: GameContext, id: string) => ctx.player.inventory.state(id).slots;
  const move = (ctx: GameContext, input: Record<string, unknown>) => ctx.game.commands.run("inventory.move", input);

  test("a stack moves onto an empty stash slot and leaves the bag slot empty", () => {
    const ctx = stashContext();
    ctx.player.inventory.put("bag", "rifle", 1, { slot: 0 });
    expect(move(ctx, { inventoryId: "bag", from: 0, toInventoryId: "stash", to: 2 }).status).toBe("applied");
    expect(state(ctx, "bag")[0]).toBeNull();
    expect(state(ctx, "stash")[2]).toEqual({ itemId: "rifle", count: 1 });
  });

  test("dropping onto a different item swaps the two stacks across inventories", () => {
    const ctx = stashContext();
    ctx.player.inventory.put("bag", "rifle", 1, { slot: 0 });
    ctx.player.inventory.put("stash", "helmet", 1, { slot: 1 });
    move(ctx, { inventoryId: "bag", from: 0, toInventoryId: "stash", to: 1 });
    expect(state(ctx, "bag")[0]).toEqual({ itemId: "helmet", count: 1 });
    expect(state(ctx, "stash")[1]).toEqual({ itemId: "rifle", count: 1 });
  });

  test("a merge fills the stash stack to its limit and leaves the remainder in the bag", () => {
    const ctx = stashContext();
    ctx.player.inventory.put("bag", "ore", 7, { slot: 0 });
    ctx.player.inventory.put("stash", "ore", 6, { slot: 0 });
    move(ctx, { inventoryId: "bag", from: 0, toInventoryId: "stash", to: 0 });
    expect(state(ctx, "stash")[0]).toEqual({ itemId: "ore", count: 10 });
    expect(state(ctx, "bag")[0]).toEqual({ itemId: "ore", count: 3 });
  });

  test("a slot filter refuses with wrong-kind both ways and leaves both inventories unchanged", () => {
    const ctx = stashContext();
    ctx.player.inventory.put("bag", "rifle", 1, { slot: 0 });
    ctx.player.inventory.put("satchel", "ore", 4, { slot: 0 });
    const before = { bag: [...state(ctx, "bag")], satchel: [...state(ctx, "satchel")] };
    // The satchel takes no gear, and a swap would push gear into it from the other side.
    expect(move(ctx, { inventoryId: "bag", from: 0, toInventoryId: "satchel", to: 1 })).toEqual({ status: "rejected", reason: "wrong-kind" });
    expect(move(ctx, { inventoryId: "satchel", from: 0, toInventoryId: "bag", to: 0 })).toEqual({ status: "rejected", reason: "wrong-kind" });
    expect(state(ctx, "bag")).toEqual(before.bag);
    expect(state(ctx, "satchel")).toEqual(before.satchel);
  });

  test("an unknown target inventory or an out-of-range target slot is refused", () => {
    const ctx = stashContext();
    ctx.player.inventory.put("bag", "rifle", 1, { slot: 0 });
    expect(move(ctx, { inventoryId: "bag", from: 0, toInventoryId: "vault", to: 0 }).status).toBe("rejected");
    expect(move(ctx, { inventoryId: "bag", from: 0, toInventoryId: "satchel", to: 2 })).toEqual({ status: "rejected", reason: "invalid-slot" });
  });

  test("two grids sharing one transfer render both inventories with globally unique drop targets", () => {
    const ctx = stashContext();
    ctx.player.inventory.put("bag", "rifle", 1, { slot: 0 });
    ctx.player.inventory.put("stash", "helmet", 1, { slot: 0 });
    function Both() {
      const transfer = useInventoryTransfer();
      return createElement(
        "div",
        null,
        createElement(InventoryGrid, { inventoryId: "bag", transfer }),
        createElement(InventoryGrid, { inventoryId: "stash", transfer }),
      );
    }
    const html = renderToStaticMarkup(createElement(GameProvider, { context: ctx }, createElement(Both)));
    expect(html).toContain('data-dropzone="bag#0"');
    expect(html).toContain('data-dropzone="stash#2"');
    expect(html).toContain('data-card="stash#0"');
    expect(html).toContain('role="status"');
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

  test("a refused move reports the model's reason and changes nothing", () => {
    const ctx = makeContext();
    const result = ctx.game.commands.run("inventory.move", { inventoryId: "bag", from: 0, to: 1 });
    expect(result).toEqual({ status: "rejected", reason: "empty-slot" });
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
