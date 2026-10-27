import { describe, expect, test } from "bun:test";
import { defineGameDefinition } from "@jgengine/core/game/defineGame";
import { createGameContext, type GameContext } from "@jgengine/core/runtime/gameContext";
import { createAssetCatalog } from "@jgengine/core/scene/assetCatalog";

import { registerCommands } from "./commands";
import { gunById } from "./handroll";
import { inventories } from "./inventories";
import { session } from "./session";
import type { QuestJournal } from "@jgengine/core/mission/quest";
import { CRASH_CHEST, QUEST_IDS, quests } from "./quests/catalog";

function bootContext(): GameContext {
  const ctx = createGameContext({
    definition: defineGameDefinition({
      name: "scrap-signal-commands-test",
      assets: createAssetCatalog(),
      multiplayer: "off",
      features: { quest: true, trade: true, unlocks: true },
      inventories,
    }),
    content: {},
    player: { userId: "p1", isNew: true },
  });
  ctx.scene.entity.spawn("player", { id: "p1", position: [0, 0, 0] });
  ctx.scene.entity.stats.set("p1", "grenades", { current: 2, max: 6 });
  ctx.scene.entity.stats.set("p1", "level", { current: 1, max: 30 });
  journal(ctx).register(quests);
  registerCommands(ctx);
  return ctx;
}

function journal(ctx: GameContext): QuestJournal {
  const quest = ctx.game.quest;
  if (quest === undefined) throw new Error("quest feature is off");
  return quest;
}

/** The one gun lying on the ground, and where it lies. */
function onlyDrop(ctx: GameContext): { itemId: string; position: readonly [number, number, number] } {
  const [drop, ...rest] = ctx.scene.worldItem.list();
  if (drop === undefined || rest.length > 0) throw new Error("expected exactly one drop");
  const entity = ctx.scene.entity.get(drop.instanceId);
  if (entity === null) throw new Error("drop has no world entity");
  return { itemId: drop.itemId, position: entity.position };
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
    ctx.game.commands.run("chest.openRed", { instanceId: "red_chest_1" });
    ctx.game.commands.run("chest.openRed", { instanceId: "red_chest_1" });
    expect(ctx.scene.worldItem.list()).toHaveLength(2);
  });

  test("the crash chest stays shut until Bolt sends you, then holds one plain pistol", () => {
    const ctx = bootContext();
    ctx.game.commands.run("chest.openRed", { instanceId: CRASH_CHEST });
    expect(ctx.scene.worldItem.list()).toHaveLength(0);

    journal(ctx).accept("p1", QUEST_IDS.firstGun);
    ctx.game.commands.run("chest.openRed", { instanceId: CRASH_CHEST });
    const pistol = gunById(onlyDrop(ctx).itemId);
    expect(pistol?.family).toBe("pistol");
    expect(pistol?.rarity).toBe("common");
    expect(pistol?.element).toBe("none");
    const chest = journal(ctx).list("p1").find((entry) => entry.questId === QUEST_IDS.firstGun);
    expect(chest?.objectives.find((objective) => objective.id === "chest")?.progress).toBe(1);
  });
});

describe("scrap-signal weapon slots", () => {
  test("slot 1 opens with the first gun; the other slots stay locked", () => {
    const ctx = bootContext();
    journal(ctx).accept("p1", QUEST_IDS.firstGun);
    ctx.game.commands.run("chest.openRed", { instanceId: CRASH_CHEST });
    const pistol = onlyDrop(ctx);
    ctx.scene.entity.update("p1", { position: pistol.position });
    expect(ctx.game.unlocks?.has("p1", "slot:1")).toBe(false);
    ctx.game.commands.run("pickup", {});
    expect(ctx.player.inventory.state("hotbar").slots[0]?.itemId).toBe(pistol.itemId);
    expect(ctx.game.unlocks?.has("p1", "slot:1")).toBe(true);
    expect(ctx.game.unlocks?.has("p1", "slot:2")).toBe(false);
    expect(journal(ctx).canTurnIn("p1", QUEST_IDS.firstGun)).toBeNull();
    ctx.game.commands.run("selectSlot2", {});
    expect(session.selectedSlot()).toBe(0);
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
