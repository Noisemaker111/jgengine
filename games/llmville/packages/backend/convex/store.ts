import { readQuantity } from "@jgengine/core/runtime/commandInput";
import { v } from "convex/values";
import { getBuildItem, getBuildItemResaleValue, isBuildItemId, normalizeBuildInventory } from "@llmville/game/build/catalog";
import type { BuildItemId } from "@llmville/game/build/catalog";
import { getHardwareDefinition, type HardwareModelId } from "@llmville/game/infrastructure/catalog";
import { hardwareResaleValue } from "@llmville/game/store/resale";
import {
  getRackCoolingUnitDefinition,
  isRackCoolingUnitId,
  normalizeRackCoolingInventory,
  type RackCoolingUnitId,
} from "@llmville/game/infrastructure/catalog";
import {
  applyShopPriceMultiplier,
  buildShopItems,
  canAffordPowerForHardware,
  canAffordPowerForHardwareQuantity,
  classifyShopItem,
  computeInstalledPowerDrawKw,
  computeStockedHardwarePowerDrawKw,
  decideResearchUnlock,
} from "@llmville/game/economy/storeTransition";
import { mutation, query } from "./_generated/server";
import { getEditorAccess } from "./permissions";
import { readStock, writeStock, STOCK_ID } from "./inventory";
import { grantUnlock, readResearchUnlocks, researchUnlockId } from "./unlocks";
import { addCurrency, currencyBalance, deductCurrency } from "./currency";
import { getFounderMultipliers } from "@llmville/game/user/founder";
import { getFounderMultipliersForGameId } from "./founderContext";
import { getHardwareInventoryCount, normalizeHardwareInventory, setHardwareInventoryCount } from "@llmville/game/infrastructure/infrastructure";
import { isResearchCatalogItem, isResearchUnlocked, type ResearchUnlocks } from "@llmville/game/research/researchUnlocks";
import { getBaseModelDefinition } from "@llmville/game/models/baseModels";
import { adjustBuildInventoryCount } from "@llmville/game/build/buildTransition";
import { gameRacksById, rackSnapshots } from "./jgengine/worldObjects";
import { sellModelInternal, unlockBaseModelInternal } from "./models";
import { computeUpgradeEffects } from "@llmville/game/user/personalUpgrades";
import type { MutationCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";

const ERRORS = {
  unauthorized: "Unauthorized",
  locked: "Not researched",
  unknownItem: "Unknown item",
  outOfStock: "Out of stock",
  powerCapacity: "Power capacity exceeded",
} as const;

type BuyResult = {
  ok: boolean;
  reason?: string;
  kind?: "hardware" | "cooling" | "build";
  itemId?: string;
  quantity?: number;
  itemCount?: number;
  totalCost?: number;
};

async function getCommittedPowerDrawKw(
  ctx: MutationCtx,
  game: Doc<"games">,
): Promise<number> {
  const racks = await gameRacksById(ctx, game._id);
  const stock = normalizeHardwareInventory(await readStock(ctx, game, STOCK_ID.hardware));
  return computeInstalledPowerDrawKw(rackSnapshots(racks)) + computeStockedHardwarePowerDrawKw(stock);
}

async function getPowerCapacityKw(ctx: MutationCtx, game: Doc<"games">): Promise<number> {
  const owner = await ctx.db
    .query("users")
    .withIndex("by_external_id", (q) => q.eq("externalId", game.createdBy))
    .unique();
  return computeUpgradeEffects(owner).powerCapacityKw;
}

function hardwareResearched(researchUnlocks: ResearchUnlocks | undefined, itemId: string) {
  return isResearchUnlocked(researchUnlocks, itemId);
}

function buildResearched(researchUnlocks: ResearchUnlocks | undefined, itemId: string): boolean {
  if (!isResearchCatalogItem(itemId)) return true;
  return isResearchUnlocked(researchUnlocks, itemId);
}

export const catalog = query({
  args: {
    gameId: v.optional(v.id("games")),
  },
  handler: async (ctx, args) => {
    let researchUnlocks: ResearchUnlocks | undefined;
    if (args.gameId) {
      const game = await ctx.db.get("games", args.gameId);
      researchUnlocks = game === null ? undefined : await readResearchUnlocks(ctx, game);
    }
    const shopMult = args.gameId
      ? (await getFounderMultipliersForGameId(ctx, args.gameId)).shopPriceMultiplier
      : getFounderMultipliers(undefined).shopPriceMultiplier;
    return buildShopItems(researchUnlocks).map((row) => ({
      ...row,
      cost: applyShopPriceMultiplier(row.cost, shopMult),
    }));
  },
});

// --- buy: dispatch by item kind --------------------------------------------

async function buyHardwareSingle(
  ctx: MutationCtx,
  gameId: Id<"games">,
  externalId: string | undefined,
  hardwareModelId: HardwareModelId,
): Promise<BuyResult> {
  const owned = await getEditorAccess(ctx, gameId, externalId);
  if (!hardwareResearched(await readResearchUnlocks(ctx, owned.game), hardwareModelId)) {
    return { ok: false, reason: ERRORS.locked };
  }
  const hdw = getHardwareDefinition(hardwareModelId);
  const currentPowerDrawKw = await getCommittedPowerDrawKw(ctx, owned.game);
  if (!canAffordPowerForHardware(hdw, currentPowerDrawKw, await getPowerCapacityKw(ctx, owned.game))) {
    return { ok: false, reason: ERRORS.powerCapacity };
  }
  const shopMult = (await getFounderMultipliersForGameId(ctx, gameId)).shopPriceMultiplier;
  const price = applyShopPriceMultiplier(hdw.buyPrice, shopMult);
  const res = await deductCurrency(ctx, owned.game._id, "money", price);
  if (!res.success) return { ok: false, reason: res.reason };
  const inv = normalizeHardwareInventory(await readStock(ctx, owned.game, STOCK_ID.hardware)), q = getHardwareInventoryCount(inv, hardwareModelId);
  await writeStock(ctx, owned.game.createdBy, STOCK_ID.hardware, setHardwareInventoryCount(inv, hardwareModelId, q + 1));
  await ctx.db.patch(owned.game._id, { updatedAt: Date.now() });
  return { ok: true, kind: "hardware", itemId: hardwareModelId, quantity: q + 1, itemCount: 1, totalCost: price };
}

async function buyHardwareBulk(
  ctx: MutationCtx,
  gameId: Id<"games">,
  externalId: string | undefined,
  hardwareModelId: HardwareModelId,
  quantity: number,
): Promise<BuyResult> {
  const owned = await getEditorAccess(ctx, gameId, externalId);
  const q = quantity;
  if (!hardwareResearched(await readResearchUnlocks(ctx, owned.game), hardwareModelId)) {
    return { ok: false, reason: ERRORS.locked, itemCount: 0, totalCost: 0 };
  }
  const hdw = getHardwareDefinition(hardwareModelId);
  const currentPowerDrawKw = await getCommittedPowerDrawKw(ctx, owned.game);
  if (!canAffordPowerForHardwareQuantity(hdw, currentPowerDrawKw, await getPowerCapacityKw(ctx, owned.game), q)) {
    return { ok: false, reason: ERRORS.powerCapacity, itemCount: 0, totalCost: 0 };
  }
  const shopMult = (await getFounderMultipliersForGameId(ctx, gameId)).shopPriceMultiplier;
  const cost = applyShopPriceMultiplier(hdw.buyPrice, shopMult) * q;
  const res = await deductCurrency(ctx, owned.game._id, "money", cost);
  if (!res.success) return { ok: false, reason: res.reason, itemCount: 0, totalCost: cost };
  let inv = normalizeHardwareInventory(await readStock(ctx, owned.game, STOCK_ID.hardware));
  inv = setHardwareInventoryCount(inv, hardwareModelId, getHardwareInventoryCount(inv, hardwareModelId) + q);
  await writeStock(ctx, owned.game.createdBy, STOCK_ID.hardware, inv);
  await ctx.db.patch(owned.game._id, { updatedAt: Date.now() });
  return { ok: true, kind: "hardware", itemId: hardwareModelId, itemCount: q, totalCost: cost };
}

async function buyCooling(
  ctx: MutationCtx,
  gameId: Id<"games">,
  externalId: string | undefined,
  coolingUnitId: string,
): Promise<BuyResult> {
  const owned = await getEditorAccess(ctx, gameId, externalId);
  if (!isRackCoolingUnitId(coolingUnitId)) {
    return { ok: false, reason: "Legacy cooling retired — research a rack cooler" };
  }
  if (!hardwareResearched(await readResearchUnlocks(ctx, owned.game), coolingUnitId)) {
    return { ok: false, reason: ERRORS.locked };
  }
  const unit = getRackCoolingUnitDefinition(coolingUnitId);
  const shopMult = (await getFounderMultipliersForGameId(ctx, gameId)).shopPriceMultiplier;
  const price = applyShopPriceMultiplier(unit.buyPrice, shopMult);
  const res = await deductCurrency(ctx, owned.game._id, "money", price);
  if (!res.success) return { ok: false, reason: res.reason };
  const inv = normalizeRackCoolingInventory(await readStock(ctx, owned.game, STOCK_ID.cooling));
  const next = normalizeRackCoolingInventory({
    ...inv,
    [coolingUnitId]: (inv[coolingUnitId] ?? 0) + 1,
  });
  await writeStock(ctx, owned.game.createdBy, STOCK_ID.cooling, next);
  await ctx.db.patch(owned.game._id, { updatedAt: Date.now() });
  return { ok: true, kind: "cooling", itemId: coolingUnitId, quantity: next[coolingUnitId], itemCount: 1, totalCost: price };
}

async function orderBuild(
  ctx: MutationCtx,
  gameId: Id<"games">,
  externalId: string | undefined,
  itemId: BuildItemId,
  quantity: number,
): Promise<BuyResult> {
  const owned = await getEditorAccess(ctx, gameId, externalId);
  if (!buildResearched(await readResearchUnlocks(ctx, owned.game), itemId)) {
    return { ok: false, reason: ERRORS.locked };
  }
  const q = quantity;
  const shopMult = (await getFounderMultipliersForGameId(ctx, gameId)).shopPriceMultiplier;
  const cost = applyShopPriceMultiplier(getBuildItem(itemId).price, shopMult) * q;
  const res = await deductCurrency(ctx, owned.game._id, "money", cost);
  if (!res.success) return { ok: false, reason: res.reason };
  const inventory = adjustBuildInventoryCount(normalizeBuildInventory(await readStock(ctx, owned.game, STOCK_ID.build)), itemId, q);
  await writeStock(ctx, owned.game.createdBy, STOCK_ID.build, inventory);
  await ctx.db.patch(owned.game._id, { updatedAt: Date.now() });
  return { ok: true, kind: "build", itemId, quantity: inventory[itemId], itemCount: q, totalCost: cost };
}

export const buy = mutation({
  args: {
    gameId: v.id("games"),
    itemId: v.string(),
    quantity: v.optional(v.number()),
    externalId: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<BuyResult> => {
    const requested = readQuantity(args.quantity ?? 1, { min: 1, max: 99 });
    if (!requested.ok) return { ok: false, reason: requested.reason };
    const quantity = requested.quantity;
    switch (classifyShopItem(args.itemId)) {
      case "build":
        return orderBuild(ctx, args.gameId, args.externalId, args.itemId as BuildItemId, quantity);
      case "cooling":
        return buyCooling(ctx, args.gameId, args.externalId, args.itemId);
      case "hardware": {
        const hardwareModelId = args.itemId as HardwareModelId;
        return quantity > 1
          ? buyHardwareBulk(ctx, args.gameId, args.externalId, hardwareModelId, quantity)
          : buyHardwareSingle(ctx, args.gameId, args.externalId, hardwareModelId);
      }
      default:
        return { ok: false, reason: ERRORS.unknownItem };
    }
  },
});

// --- unlock: dispatch base model vs research ------------------------------

async function unlockResearchInternal(
  ctx: MutationCtx,
  args: { gameId: Id<"games">; itemId: string; externalId?: string },
) {
  const owned = await getEditorAccess(ctx, args.gameId, args.externalId);
  const decision = decideResearchUnlock({
    itemId: args.itemId,
    researchUnlocks: await readResearchUnlocks(ctx, owned.game),
    dataTokens: await currencyBalance(ctx, owned.game, "data"),
  });
  if (!decision.unlocked) return { unlocked: false as const, reason: decision.reason };
  if (decision.tokenCost > 0) {
    const payment = await deductCurrency(ctx, owned.game._id, "data", decision.tokenCost);
    if (!payment.success) {
      return { unlocked: false as const, reason: payment.reason ?? "Insufficient data tokens" };
    }
  }
  await grantUnlock(ctx, owned.game.createdBy, researchUnlockId(args.itemId));
  await ctx.db.patch(owned.game._id, { updatedAt: Date.now() });
  return { unlocked: true as const, itemId: args.itemId };
}

export const unlock = mutation({
  args: { gameId: v.id("games"), itemId: v.string(), externalId: v.optional(v.string()) },
  handler: async (ctx, args) => {
    // A licensable base model, otherwise a research-catalog item.
    if (getBaseModelDefinition(args.itemId)) {
      return unlockBaseModelInternal(ctx, {
        gameId: args.gameId,
        externalId: args.externalId,
        baseModelId: args.itemId,
      });
    }
    return unlockResearchInternal(ctx, { gameId: args.gameId, itemId: args.itemId, externalId: args.externalId });
  },
});

async function sellBuildItem(ctx: MutationCtx, game: Doc<"games">, itemId: BuildItemId) {
  const inventory = normalizeBuildInventory(await readStock(ctx, game, STOCK_ID.build));
  if ((inventory[itemId] ?? 0) < 1) return { sold: false, reason: ERRORS.outOfStock } as const;

  const refund = getBuildItemResaleValue(itemId);
  await writeStock(ctx, game.createdBy, STOCK_ID.build, adjustBuildInventoryCount(inventory, itemId, -1));
  await ctx.db.patch(game._id, { updatedAt: Date.now() });
  await addCurrency(ctx, game._id, "money", refund);
  return { sold: true, refund } as const;
}

async function sellHardware(ctx: MutationCtx, game: Doc<"games">, hardwareModelId: HardwareModelId) {
  const inventory = normalizeHardwareInventory(await readStock(ctx, game, STOCK_ID.hardware));
  const owned = getHardwareInventoryCount(inventory, hardwareModelId);
  if (owned < 1) return { sold: false, reason: ERRORS.outOfStock } as const;

  const refund = hardwareResaleValue(getHardwareDefinition(hardwareModelId).buyPrice);
  await writeStock(
    ctx,
    game.createdBy,
    STOCK_ID.hardware,
    setHardwareInventoryCount(inventory, hardwareModelId, owned - 1),
  );
  await ctx.db.patch(game._id, { updatedAt: Date.now() });
  await addCurrency(ctx, game._id, "money", refund);
  return { sold: true, refund } as const;
}

async function sellCooling(ctx: MutationCtx, game: Doc<"games">, coolingUnitId: RackCoolingUnitId) {
  const inventory = normalizeRackCoolingInventory(await readStock(ctx, game, STOCK_ID.cooling));
  if ((inventory[coolingUnitId] ?? 0) < 1) return { sold: false, reason: ERRORS.outOfStock } as const;

  const refund = hardwareResaleValue(getRackCoolingUnitDefinition(coolingUnitId).buyPrice);
  await writeStock(
    ctx,
    game.createdBy,
    STOCK_ID.cooling,
    normalizeRackCoolingInventory({ ...inventory, [coolingUnitId]: (inventory[coolingUnitId] ?? 0) - 1 }),
  );
  await ctx.db.patch(game._id, { updatedAt: Date.now() });
  await addCurrency(ctx, game._id, "money", refund);
  return { sold: true, refund } as const;
}

export const sell = mutation({
  args: { gameId: v.id("games"), itemId: v.string(), externalId: v.optional(v.string()) },
  handler: async (ctx, args) => {
    // Storage inventory sells by catalog id; anything else is a trained-model document id.
    const kind = classifyShopItem(args.itemId);
    if (kind === "unknown") {
      return sellModelInternal(ctx, { modelId: args.itemId as Id<"models">, externalId: args.externalId });
    }
    const owned = await getEditorAccess(ctx, args.gameId, args.externalId);
    if (kind === "hardware") return sellHardware(ctx, owned.game, args.itemId as HardwareModelId);
    if (kind === "cooling" && isRackCoolingUnitId(args.itemId)) {
      return sellCooling(ctx, owned.game, args.itemId);
    }
    return sellBuildItem(ctx, owned.game, args.itemId as BuildItemId);
  },
});

/** Resale value of everything sitting in storage — what a lab could raise without touching its racks. */
export async function storageLiquidationValue(ctx: MutationCtx, game: Doc<"games">): Promise<number> {
  const [hardware, cooling, build] = await Promise.all([
    readStock(ctx, game, STOCK_ID.hardware),
    readStock(ctx, game, STOCK_ID.cooling),
    readStock(ctx, game, STOCK_ID.build),
  ]);
  const hardwareInventory = normalizeHardwareInventory(hardware);
  const coolingInventory = normalizeRackCoolingInventory(cooling);
  const buildInventory = normalizeBuildInventory(build);

  let total = 0;
  for (const [itemId, count] of Object.entries(hardwareInventory)) {
    total += hardwareResaleValue(getHardwareDefinition(itemId).buyPrice) * Math.max(0, count ?? 0);
  }
  for (const [itemId, count] of Object.entries(coolingInventory) as [RackCoolingUnitId, number][]) {
    total += hardwareResaleValue(getRackCoolingUnitDefinition(itemId).buyPrice) * Math.max(0, count ?? 0);
  }
  for (const [itemId, count] of Object.entries(buildInventory)) {
    if (!isBuildItemId(itemId)) continue;
    total += getBuildItemResaleValue(itemId) * Math.max(0, count ?? 0);
  }
  return total;
}

/** Sells every stored item at the resale rate and credits the proceeds. */
export async function liquidateStorage(ctx: MutationCtx, game: Doc<"games">): Promise<number> {
  const proceeds = await storageLiquidationValue(ctx, game);
  if (proceeds <= 0) return 0;
  await writeStock(ctx, game.createdBy, STOCK_ID.hardware, normalizeHardwareInventory({}));
  await writeStock(ctx, game.createdBy, STOCK_ID.cooling, normalizeRackCoolingInventory({}));
  await writeStock(ctx, game.createdBy, STOCK_ID.build, normalizeBuildInventory({}));
  await addCurrency(ctx, game._id, "money", proceeds);
  return proceeds;
}
