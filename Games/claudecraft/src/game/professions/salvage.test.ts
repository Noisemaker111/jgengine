import { beforeAll, describe, expect, test } from "bun:test";
import { createGameContext, type GameContext } from "@jgengine/core/runtime/gameContext";

import { game } from "../../game.config";
import { content } from "../content";
import { itemDefById } from "../items/catalog";
import { isSalvageable, salvageItem, salvageYield } from "./salvage";

const USER = "salvage-test";

describe("salvage eligibility and yield", () => {
  test("weapon and armor at or above common quality are salvageable", () => {
    expect(isSalvageable(itemDefById("worn_sword"))).toBe(true);
    expect(isSalvageable(itemDefById("recruit_tunic"))).toBe(true);
  });

  test("poor-quality junk, consumables, and unknown items are never salvageable", () => {
    expect(isSalvageable(itemDefById("bone_fragments"))).toBe(false);
    expect(isSalvageable(itemDefById("baked_bread"))).toBe(false);
    expect(isSalvageable(itemDefById("does_not_exist"))).toBe(false);
  });

  test("yield scales with rarity", () => {
    const seq = (values: number[]) => {
      let i = 0;
      return () => values[Math.min(i++, values.length - 1)]!;
    };
    const common = salvageYield(itemDefById("worn_sword")!, seq([0]));
    const rare = salvageYield(itemDefById("gravecaller_blade")!, seq([0]));
    expect(rare).toBeGreaterThan(common);
  });
});

describe("salvageItem", () => {
  let ctx: GameContext;

  beforeAll(() => {
    ctx = createGameContext({ definition: game.game, content, player: { userId: USER, isNew: true } });
  });

  test("denies an unknown item", () => {
    expect(salvageItem(ctx, USER, "does_not_exist")).toEqual({ ok: false, reason: "unknown-item" });
  });

  test("denies a piece the player doesn't hold", () => {
    expect(salvageItem(ctx, USER, "worn_sword")).toEqual({ ok: false, reason: "not-held" });
  });

  test("denies poor-quality junk", () => {
    ctx.player.inventory.put("bags", "tangled_weed", 1);
    const result = salvageItem(ctx, USER, "tangled_weed");
    expect(result).toEqual({ ok: false, reason: "not-salvageable" });
  });

  test("salvaging a common weapon consumes it and grants bone fragments", () => {
    ctx.player.inventory.put("bags", "worn_sword", 1);
    const before = ctx.player.inventory.count("bags", "bone_fragments");
    const result = salvageItem(ctx, USER, "worn_sword");
    expect(result.ok).toBe(true);
    expect(result.materialItemId).toBe("bone_fragments");
    expect(result.count).toBeGreaterThan(0);
    expect(ctx.player.inventory.count("bags", "worn_sword")).toBe(0);
    expect(ctx.player.inventory.count("bags", "bone_fragments")).toBeGreaterThan(before);
  });

  test("salvaging an uncommon armor piece grants linen scrap", () => {
    ctx.player.inventory.put("bags", "militia_vest", 1);
    const result = salvageItem(ctx, USER, "militia_vest");
    expect(result.ok).toBe(true);
    expect(result.materialItemId).toBe("linen_scrap");
  });

  test("salvaging a rare item grants spider legs", () => {
    ctx.player.inventory.put("bags", "gravecaller_blade", 1);
    const result = salvageItem(ctx, USER, "gravecaller_blade");
    expect(result.ok).toBe(true);
    expect(result.materialItemId).toBe("spider_leg");
  });

  test("salvaging only ever consumes exactly one copy", () => {
    ctx.player.inventory.put("bags", "worn_sword", 3);
    salvageItem(ctx, USER, "worn_sword");
    expect(ctx.player.inventory.count("bags", "worn_sword")).toBe(2);
  });
});
