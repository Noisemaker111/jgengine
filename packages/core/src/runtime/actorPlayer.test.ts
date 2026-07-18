import { describe, expect, test } from "bun:test";

import { defineGameDefinition } from "../game/defineGameDefinition";
import { createAssetCatalog } from "../scene/assetCatalog";
import { createGameContext } from "./gameContext";

function makeContext() {
  return createGameContext({
    definition: defineGameDefinition({
      name: "ActorGame",
      assets: createAssetCatalog(),
      multiplayer: "off",
      inventories: { backpack: { slots: 9 } },
    }),
    content: {},
    player: { userId: "host", isNew: true },
  });
}

describe("actor-aware ctx.player", () => {
  test("outside a command everything resolves the local player", () => {
    const ctx = makeContext();
    expect(ctx.player.userId).toBe("host");
    expect(ctx.player.inventory).toBe(ctx.player.inventoryFor("host"));
    expect(ctx.player.stats).toBe(ctx.player.statsFor("host"));
    expect(ctx.player.motion).toBe(ctx.player.motionFor("host"));
  });

  test("runAs resolves ctx.player.userId to the actor and restores after", () => {
    const ctx = makeContext();
    let seen: string | null = null;
    ctx.game.commands.define("whoami", {
      apply(state) {
        seen = state.player.userId;
      },
    });
    const result = ctx.game.commands.runAs("player_b", "whoami", null);
    expect(result.status).toBe("applied");
    expect(seen).toBe("player_b");
    expect(ctx.player.userId).toBe("host");
  });

  test("runAs routes ctx.player.inventory to the actor's set only", () => {
    const ctx = makeContext();
    ctx.game.commands.define("grab", {
      apply(state) {
        state.player.inventory.put("backpack", "apple", 3);
      },
    });
    expect(ctx.game.commands.runAs("player_a", "grab", null).status).toBe("applied");
    expect(ctx.player.inventoryFor("player_a").count("backpack", "apple")).toBe(3);
    expect(ctx.player.inventoryFor("player_b").count("backpack", "apple")).toBe(0);
    expect(ctx.player.inventory.count("backpack", "apple")).toBe(0);
  });

  test("runAs routes ctx.player.stats to the actor's stats only", () => {
    const ctx = makeContext();
    ctx.game.commands.define("buff", {
      apply(state) {
        state.player.stats.setBase("power", 7);
      },
    });
    expect(ctx.game.commands.runAs("player_a", "buff", null).status).toBe("applied");
    expect(ctx.player.statsFor("player_a").get("power")).toBe(7);
    expect(ctx.player.statsFor("player_b").getBase("power")).toBeUndefined();
    expect(ctx.player.stats.getBase("power")).toBeUndefined();
  });

  test("plain run keeps the local player as the actor", () => {
    const ctx = makeContext();
    ctx.game.commands.define("grab", {
      apply(state) {
        state.player.inventory.put("backpack", "apple", 1);
      },
    });
    expect(ctx.game.commands.run("grab", null).status).toBe("applied");
    expect(ctx.player.inventory.count("backpack", "apple")).toBe(1);
    expect(ctx.player.inventoryFor("host").count("backpack", "apple")).toBe(1);
  });

  test("snapshot carries per-user inventories and hydrates them into a fresh context", () => {
    const host = makeContext();
    host.player.inventoryFor("player_a").put("backpack", "apple", 2);
    host.player.inventory.put("backpack", "sword", 1);

    const client = createGameContext({
      definition: defineGameDefinition({
        name: "ActorGame",
        assets: createAssetCatalog(),
        multiplayer: "off",
        inventories: { backpack: { slots: 9 } },
      }),
      content: {},
      player: { userId: "player_a", isNew: true },
    });
    client.hydrate(host.snapshot());

    expect(client.player.inventory.count("backpack", "apple")).toBe(2);
    expect(client.player.inventoryFor("host").count("backpack", "sword")).toBe(1);
  });
});
