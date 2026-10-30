import { describe, expect, test } from "bun:test";
import { defineGameDefinition } from "@jgengine/core/game/defineGame";
import { createGameContext, type GameContext } from "@jgengine/core/runtime/gameContext";
import { createAssetCatalog } from "@jgengine/core/scene/assetCatalog";

import { registerCommands } from "./commands";
import { seededRng } from "@jgengine/core/random/rng";
import { gunById, rollGun } from "./handroll";
import { inventories } from "./inventories";
import { AMMO_CRATES, AMMO_RESTOCK_SECONDS } from "./items/ammoCrates";
import { CHEST_DROP_REACH, chestDropSpot } from "./items/chestDrops";
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
    content: { defaultRarity: "common" },
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
  test("an ammo crate pays ammo for the guns you carry, is empty a while, then restocks", () => {
    const ctx = bootContext();
    const rng = seededRng("crate-test");
    ctx.player.inventory.put("hotbar", rollGun(rng, 1, { family: "pistol" }).id, 1, { slot: 0 });
    ctx.player.inventory.put("hotbar", rollGun(rng, 1, { family: "shotgun" }).id, 1, { slot: 1 });
    const crate = AMMO_CRATES[0]?.id ?? "";
    ctx.scene.entity.stats.set("p1", "ammo_pistol", { current: 150, max: 200 });
    ctx.scene.entity.stats.set("p1", "ammo_shotgun", { current: 4, max: 80 });
    ctx.game.commands.run("chest.openAmmo", { instanceId: crate });
    // A pack per carried gun, and a second for the emptiest pool.
    expect(ctx.scene.worldItem.list().map((item) => item.itemId).sort()).toEqual(["ammo_pistol_pack", "ammo_shotgun_pack", "ammo_shotgun_pack"]);
    expect(ctx.scene.entity.stats.get("p1", "grenades")?.current).toBe(3);

    ctx.game.commands.run("chest.openAmmo", { instanceId: crate });
    expect(ctx.scene.worldItem.list()).toHaveLength(3);
    expect(ctx.scene.entity.stats.get("p1", "grenades")?.current).toBe(3);

    ctx.time.advance(AMMO_RESTOCK_SECONDS);
    ctx.game.commands.run("chest.openAmmo", { instanceId: crate });
    expect(ctx.scene.worldItem.list()).toHaveLength(6);
  });

  test("a chest sets its guns down on the opener's side, clear of the chest", () => {
    const ctx = bootContext();
    const chest: [number, number, number] = [10, 0, -4];
    ctx.scene.entity.update("p1", { position: [chest[0] + 3, chest[1], chest[2]] });
    const spots = [0, 1].map((index) => chestDropSpot(ctx, chest, index, 2));
    for (const at of spots) {
      expect(Math.hypot(at[0] - chest[0], at[2] - chest[2])).toBeGreaterThanOrEqual(CHEST_DROP_REACH - 0.001);
      expect(at[0]).toBeGreaterThan(chest[0] + 2);
    }
    const [first, second] = spots;
    if (first === undefined || second === undefined) throw new Error("two spots");
    expect(Math.abs(first[2] - second[2])).toBeGreaterThan(0.5);
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

describe("scrap-signal vault", () => {
  test("a stored gun leaves its slot and comes back into a free open slot", () => {
    const ctx = bootContext();
    journal(ctx).accept("p1", QUEST_IDS.firstGun);
    ctx.game.commands.run("chest.openRed", { instanceId: CRASH_CHEST });
    const pistol = onlyDrop(ctx);
    ctx.scene.entity.update("p1", { position: pistol.position });
    ctx.game.commands.run("pickup", {});

    ctx.game.commands.run("vault.deposit", { slot: 0 });
    expect(ctx.player.inventory.state("hotbar").slots[0]).toBeNull();
    expect(ctx.player.inventory.count("vault", pistol.itemId)).toBe(1);

    ctx.game.commands.run("vault.withdraw", { itemId: pistol.itemId });
    expect(ctx.player.inventory.state("hotbar").slots[0]?.itemId).toBe(pistol.itemId);
    expect(ctx.player.inventory.count("vault", pistol.itemId)).toBe(0);
  });

  test("nothing comes out while every open weapon slot is full", () => {
    const ctx = bootContext();
    ctx.player.inventory.put("vault", "spare", 1);
    ctx.game.commands.run("vault.withdraw", { itemId: "spare" });
    expect(ctx.player.inventory.count("vault", "spare")).toBe(1);
    expect(ctx.game.notices.list().map((notice) => notice.tone)).toEqual(["deny"]);
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

describe("scrap-signal pickup", () => {
  test("E takes the gun you stand on, else the one in front, else the nearest", () => {
    const rng = seededRng("pickup-test");
    const underfoot = rollGun(rng, 1, { family: "pistol", rarity: "common" });
    const ahead = rollGun(rng, 1, { family: "smg", rarity: "common" });
    const behind = rollGun(rng, 1, { family: "shotgun", rarity: "common" });
    const take = (drops: readonly (readonly [string, number])[]): string | undefined => {
      const ctx = bootContext();
      for (const [itemId, z] of drops) ctx.scene.worldItem.spawn({ itemId, position: [0.1, 0, z] });
      ctx.scene.entity.update("p1", { rotationY: 0 });
      ctx.game.commands.run("pickup", {});
      return ctx.player.inventory.state("hotbar").slots[0]?.itemId;
    };
    expect(take([[ahead.id, 1.8], [underfoot.id, 0.2], [behind.id, -1]])).toBe(underfoot.id);
    expect(take([[behind.id, -1], [ahead.id, 1.8]])).toBe(ahead.id);
    expect(take([[behind.id, -1], [ahead.id, -2]])).toBe(behind.id);
  });

  test("from a pile, E takes the rarest gun, whichever landed first", () => {
    const ctx = bootContext();
    const rng = seededRng("pile-test");
    const plain = rollGun(rng, 1, { family: "pistol", rarity: "common" });
    const rare = rollGun(rng, 1, { family: "pistol", rarity: "rare" });
    ctx.scene.worldItem.spawn({ itemId: plain.id, position: [0, 0, 1.2] });
    ctx.scene.worldItem.spawn({ itemId: rare.id, position: [0, 0, 1.2] });
    ctx.scene.entity.update("p1", { rotationY: Math.PI });
    ctx.game.commands.run("pickup", {});
    expect(ctx.player.inventory.state("hotbar").slots[0]?.itemId).toBe(rare.id);
  });

  test("a swapped-out gun lands behind the player", () => {
    const ctx = bootContext();
    const rng = seededRng("swap-test");
    const held = rollGun(rng, 1, { family: "pistol", rarity: "common" });
    const next = rollGun(rng, 1, { family: "smg", rarity: "common" });
    ctx.game.unlocks?.grant("p1", "slot:1");
    ctx.player.inventory.put("hotbar", held.id, 1, { slot: 0 });
    ctx.scene.worldItem.spawn({ itemId: next.id, position: [0, 0, 1.5] });
    ctx.scene.entity.update("p1", { rotationY: 0 });
    ctx.game.commands.run("pickup", {});
    expect(ctx.player.inventory.state("hotbar").slots[0]?.itemId).toBe(next.id);
    expect(onlyDrop(ctx).itemId).toBe(held.id);
    expect(onlyDrop(ctx).position[2]).toBeLessThan(-1);
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
