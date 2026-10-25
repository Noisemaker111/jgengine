import { describe, expect, test } from "bun:test";
import { defineGameDefinition } from "@jgengine/core/game/defineGame";
import { createGameContext, type GameContext } from "@jgengine/core/runtime/gameContext";
import { createAssetCatalog } from "@jgengine/core/scene/assetCatalog";

import { registerCommands } from "./commands";

function bootContext(): GameContext {
  const ctx = createGameContext({
    definition: defineGameDefinition({
      name: "scrap-signal-commands-test",
      assets: createAssetCatalog(),
      multiplayer: "off",
      features: { quest: true, trade: true },
    }),
    content: {},
    player: { userId: "p1", isNew: true },
  });
  ctx.scene.entity.spawn("player", { id: "p1", position: [0, 0, 0] });
  ctx.scene.entity.stats.set("p1", "grenades", { current: 2, max: 6 });
  ctx.scene.entity.stats.set("p1", "level", { current: 1, max: 30 });
  registerCommands(ctx);
  return ctx;
}

describe("scrap-signal chests", () => {
  test("an ammo chest pays out once and is empty afterwards", () => {
    const ctx = bootContext();
    ctx.game.commands.run("chest.openAmmo", { instanceId: "ammo_chest_0" });
    expect(ctx.scene.worldItem.list()).toHaveLength(2);
    expect(ctx.scene.entity.stats.get("p1", "grenades")?.current).toBe(3);

    ctx.game.commands.run("chest.openAmmo", { instanceId: "ammo_chest_0" });
    expect(ctx.scene.worldItem.list()).toHaveLength(2);
    expect(ctx.scene.entity.stats.get("p1", "grenades")?.current).toBe(3);

    ctx.game.commands.run("chest.openAmmo", { instanceId: "ammo_chest_1" });
    expect(ctx.scene.worldItem.list()).toHaveLength(4);
  });

  test("a red chest pays out once", () => {
    const ctx = bootContext();
    ctx.game.commands.run("chest.openRed", { instanceId: "red_chest_0" });
    ctx.game.commands.run("chest.openRed", { instanceId: "red_chest_0" });
    expect(ctx.scene.worldItem.list()).toHaveLength(2);
  });
});

describe("scrap-signal terminal refusals", () => {
  test("an unaffordable vendor roll spends nothing and raises a deny notice", () => {
    const ctx = bootContext();
    ctx.game.commands.run("vendor.gunOfTheDay", { vendor: "rigg" });
    expect(ctx.game.economy.balance("p1", "cash")).toBe(0);
    expect(ctx.game.notices.list().map((notice) => [notice.text, notice.tone])).toEqual([["Not enough cash.", "deny"]]);
  });
});
