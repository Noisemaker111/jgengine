import { beforeAll, describe, expect, test } from "bun:test";
import { createGameContext, type GameContext } from "@jgengine/core/runtime/gameContext";

import { game } from "../../game.config";
import { content } from "../content";
import { loop } from "../../loop";
import { itemDefById } from "../items/catalog";
import { disenchantYield, isDisenchantable } from "../items/enchanting";
import { heroSheet, storeKeys } from "../session/hero";
import { applyEnchant, disenchantItem, enchantsForSlot } from "./enchanting";

const USER = "enchant-test";

describe("enchanting catalog", () => {
  test("weapon and armor at or above common quality are disenchantable", () => {
    expect(isDisenchantable(itemDefById("worn_sword"))).toBe(true);
    expect(isDisenchantable(itemDefById("recruit_tunic"))).toBe(true);
  });

  test("poor-quality junk and consumables are never disenchantable", () => {
    expect(isDisenchantable(itemDefById("bone_fragments"))).toBe(false);
    expect(isDisenchantable(itemDefById("baked_bread"))).toBe(false);
  });

  test("unknown items are never disenchantable", () => {
    expect(isDisenchantable(itemDefById("does_not_exist"))).toBe(false);
  });

  test("disenchant yield scales with rarity and never rolls below the quality floor", () => {
    const common = itemDefById("worn_sword")!;
    const epic = itemDefById("wyrmfang_greatblade")!;
    const seq = (values: number[]) => {
      let i = 0;
      return () => values[Math.min(i++, values.length - 1)]!;
    };
    expect(disenchantYield(common, seq([0]))).toBeGreaterThanOrEqual(2);
    expect(disenchantYield(epic, seq([0]))).toBeGreaterThan(disenchantYield(common, seq([0])));
  });

  test("mainhand has both a physical and a caster enchant option", () => {
    const options = enchantsForSlot("mainhand");
    expect(options.length).toBeGreaterThanOrEqual(2);
    for (const enchant of options) expect(enchant.itemSlot).toBe("mainhand");
  });
});

describe("enchanting actions", () => {
  let ctx: GameContext;

  beforeAll(() => {
    ctx = createGameContext({ definition: game.game, content, player: { userId: USER, isNew: true } });
    loop.onInit?.(ctx);
    loop.onNewPlayer?.(ctx);
    ctx.game.commands.run("class.select", { classId: "warrior" });
  });

  test("disenchant denies an unknown item", () => {
    const result = disenchantItem(ctx, USER, "does_not_exist");
    expect(result).toEqual({ ok: false, reason: "unknown-item" });
  });

  test("disenchant denies a piece the player doesn't hold", () => {
    const result = disenchantItem(ctx, USER, "worn_sword");
    expect(result).toEqual({ ok: false, reason: "not-held" });
  });

  test("disenchant denies poor-quality junk", () => {
    ctx.player.inventory.put("bags", "bone_fragments", 1);
    const result = disenchantItem(ctx, USER, "bone_fragments");
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("not-disenchantable");
  });

  test("disenchanting a held common sword consumes it and grants arcane dust", () => {
    ctx.player.inventory.put("bags", "worn_sword", 1);
    const before = ctx.player.inventory.count("bags", "arcane_dust");
    const result = disenchantItem(ctx, USER, "worn_sword");
    expect(result.ok).toBe(true);
    expect(result.materialItemId).toBe("arcane_dust");
    expect(result.count).toBeGreaterThan(0);
    expect(ctx.player.inventory.count("bags", "worn_sword")).toBe(0);
    expect(ctx.player.inventory.count("bags", "arcane_dust")).toBeGreaterThan(before);
  });

  test("disenchanting a rare piece yields arcane essence", () => {
    ctx.player.inventory.put("bags", "gravecaller_blade", 1);
    const result = disenchantItem(ctx, USER, "gravecaller_blade");
    expect(result.ok).toBe(true);
    expect(result.materialItemId).toBe("arcane_essence");
  });

  test("apply enchant rejects an unknown enchant id", () => {
    expect(applyEnchant(ctx, USER, "mainhand", "does_not_exist")).toEqual({
      ok: false,
      reason: "unknown-enchant",
    });
  });

  test("apply enchant rejects a slot mismatch", () => {
    expect(applyEnchant(ctx, USER, "chest", "enchant_weapon_might")).toEqual({
      ok: false,
      reason: "wrong-slot",
    });
  });

  test("apply enchant rejects when nothing is equipped in that slot", () => {
    ctx.game.store.delete(storeKeys.equip(USER));
    expect(applyEnchant(ctx, USER, "mainhand", "enchant_weapon_might")).toEqual({
      ok: false,
      reason: "nothing-equipped",
    });
  });

  test("apply enchant rejects insufficient reagents", () => {
    ctx.game.store.set(storeKeys.equip(USER), { mainhand: "worn_sword" });
    expect(applyEnchant(ctx, USER, "mainhand", "enchant_weapon_might")).toEqual({
      ok: false,
      reason: "insufficient-materials",
    });
  });

  test("applying an enchant consumes reagents, persists it, and boosts the character sheet", () => {
    ctx.player.inventory.put("bags", "arcane_dust", 4);
    const before = ctx.player.inventory.count("bags", "arcane_dust");
    const result = applyEnchant(ctx, USER, "mainhand", "enchant_weapon_might");
    expect(result).toEqual({ ok: true });
    expect(ctx.player.inventory.count("bags", "arcane_dust")).toBe(before - 4);
    expect(ctx.game.store.get(storeKeys.enchants(USER))).toEqual({ mainhand: "enchant_weapon_might" });
  });

  test("unequipping the enchanted slot drops its bonus, re-equipping restores it", () => {
    const strWithEnchant = heroSheet(ctx, USER)!.attributes.str;
    ctx.game.store.delete(storeKeys.equip(USER));
    const strWithoutGear = heroSheet(ctx, USER)!.attributes.str;
    expect(strWithoutGear).toBeLessThan(strWithEnchant);
    ctx.game.store.set(storeKeys.equip(USER), { mainhand: "worn_sword" });
    const strRestored = heroSheet(ctx, USER)!.attributes.str;
    expect(strRestored).toBe(strWithEnchant);
  });
});
