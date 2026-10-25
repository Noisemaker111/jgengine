import { v } from "convex/values";
import {
  PERSONAL_UPGRADE_ID_VALUES,
  buildPersonalUpgradeItems,
  decidePersonalUpgradePurchase,
} from "@llmville/game/user/personalUpgrades";
import { applyShopPriceMultiplier } from "@llmville/game/economy/storeTransition";
import { mutation, query } from "./_generated/server";
import { buildLiteralUnion } from "./schema";
import { getEditorAccess } from "./permissions";
import { deductCurrency } from "./currency";
import { getFounderMultipliersForGameId } from "./founderContext";

const PERSONAL_UPGRADE_ID_VALIDATOR = buildLiteralUnion(PERSONAL_UPGRADE_ID_VALUES);

export const listPersonalUpgrades = query({
  args: { gameId: v.optional(v.id("games")) },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];
    const u = await ctx.db.query("users").withIndex("by_external_id", q => q.eq("externalId", identity.subject)).unique();
    const items = buildPersonalUpgradeItems(u?.ownedUpgrades);
    if (!args.gameId) return items;
    const mult = (await getFounderMultipliersForGameId(ctx, args.gameId)).shopPriceMultiplier;
    return items.map((item) => ({
      ...item,
      cost: applyShopPriceMultiplier(item.cost, mult),
    }));
  },
});

export const buyPersonalUpgrade = mutation({
  args: { gameId: v.id("games"), upgradeId: PERSONAL_UPGRADE_ID_VALIDATOR },
  handler: async (ctx, args) => {
    const owned = await getEditorAccess(ctx, args.gameId, undefined);
    const u = await ctx.db.query("users").withIndex("by_external_id", q => q.eq("externalId", owned.actorExternalId)).unique();
    if (!u) return { purchased: false, reason: "Missing player" };
    const shopMult = (await getFounderMultipliersForGameId(ctx, args.gameId)).shopPriceMultiplier;
    const decision = decidePersonalUpgradePurchase({
      upgradeId: args.upgradeId,
      ownedUpgrades: u.ownedUpgrades,
      shopPriceMultiplier: shopMult,
    });
    if (!decision.purchased) return { purchased: false, reason: decision.reason };
    const res = await deductCurrency(ctx, owned.game._id, "money", decision.cost);
    if (!res.success) return { purchased: false, reason: res.reason };
    await ctx.db.patch(u._id, {
      ownedUpgrades: { ...(u.ownedUpgrades ?? {}), [args.upgradeId]: decision.nextLevel },
      updatedAt: Date.now(),
    });
    return { purchased: true };
  },
});
