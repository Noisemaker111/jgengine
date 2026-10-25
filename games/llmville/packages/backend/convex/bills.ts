import { ownedClaimCount } from "./datacenter";
import { forEachOnlinePlayer } from "@jgengine/convex/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { internalMutation, mutation, query } from "./_generated/server";
import {
  computeBillTotalDue,
  computeDailyBills,
  decideBillAutoPay,
  isBillOverdue,
  orderBillsForAutoPay,
  shouldSpawnDailyBills,
} from "@llmville/game/economy/billing";
import { getDailyModifier, formatDailyMarketDateKey } from "@llmville/game/economy/dailyMarket";
import { loadGlobalFrontierOffset } from "./dailyMarket";
import { getEditorAccess, getReadAccess } from "./permissions";
import { currencyBalance, deductCurrency } from "./currency";
import { resetWorldForInsolvency } from "./world";
import { liquidateStorage, storageLiquidationValue } from "./store";
import { trainingJobsForGame } from "./training";
import { getFounderMultipliersForGameId } from "./founderContext";
import { gameRacks, rackSnapshots } from "./jgengine/worldObjects";

export async function trySpawnDailyBills(ctx: MutationCtx, gameId: Id<"games">): Promise<number> {
  const game = await ctx.db.get(gameId);
  const now = Date.now();
  if (
    !game ||
    !shouldSpawnDailyBills({
      now,
      createdAt: game.createdAt,
      gameTimeScale: game.gameTimeScale,
      lastBilledGameDay: game.lastBilledGameDay,
    })
  ) {
    return 0;
  }

  const [racks, trainingJobs, models, hostedModels, datacenterClaims] = await Promise.all([
    gameRacks(ctx, game),
    trainingJobsForGame(ctx, game, now),
    ctx.db.query("models").withIndex("by_game_id", (q) => q.eq("gameId", gameId)).collect(),
    ctx.db.query("hostedModels").withIndex("by_game_id_and_active", (q) => q.eq("gameId", gameId).eq("active", true)).collect(),
    ownedClaimCount(ctx, gameId),
  ]);
  const founderMults = await getFounderMultipliersForGameId(ctx, gameId);

  const decision = computeDailyBills({
    now,
    createdAt: game.createdAt,
    gameTimeScale: game.gameTimeScale,
    lastBilledGameDay: game.lastBilledGameDay,
    racks: rackSnapshots(racks),
    hasActiveCompute:
      trainingJobs.length > 0 || models.some((m) => m.launchState === "serving") || hostedModels.length > 0,
    electricityBillMultiplier: founderMults.electricityBillMultiplier,
    claimedCellCount: datacenterClaims,
  });
  if (decision.kind === "skip") return 0;

  await Promise.all(decision.bills.map((bill) => ctx.db.insert("bills", { gameId, ...bill })));
  await ctx.db.patch(game._id, { lastBilledGameDay: decision.gameDay, updatedAt: now });
  if (decision.bills.length > 0) {
    await autoPayBillsForGame(ctx, gameId);
  }
  return decision.bills.length;
}

async function payBill(
  ctx: MutationCtx,
  gameId: Id<"games">,
  billId: Id<"bills">,
  totalDue: number,
): Promise<boolean> {
  const payment = await deductCurrency(ctx, gameId, "money", totalDue);
  if (!payment.success) return false;
  await ctx.db.patch(billId, { paidAt: Date.now(), isOverdue: false });
  return true;
}

/**
 * One collection pass: pay what the lab can afford, accrue late fees on the rest, sell storage to
 * cover an overdue bill, and only reset the world when the debt outruns every asset it owns.
 */
export async function autoPayBillsForGame(
  ctx: MutationCtx,
  gameId: Id<"games">,
): Promise<{ paid: number; unpaid: number; liquidated: number; insolvent: boolean }> {
  const game = await ctx.db.get(gameId);
  if (!game) return { paid: 0, unpaid: 0, liquidated: 0, insolvent: false };

  const now = Date.now();
  const unpaidBills = orderBillsForAutoPay(
    await ctx.db.query("bills").withIndex("by_game_id", (q) => q.eq("gameId", gameId)).collect(),
  );

  let paid = 0;
  let unpaid = 0;
  let liquidated = 0;
  let liquidationValue = await storageLiquidationValue(ctx, game);

  for (const bill of unpaidBills) {
    const decision = decideBillAutoPay({
      bill,
      now,
      timeScale: game.gameTimeScale,
      money: await currencyBalance(ctx, game, "money"),
      liquidationValue,
    });

    if (decision.lateFeeAccrued !== bill.lateFeeAccrued || isBillOverdue(bill, now) !== bill.isOverdue) {
      await ctx.db.patch(bill._id, {
        lateFeeAccrued: decision.lateFeeAccrued,
        isOverdue: isBillOverdue(bill, now),
      });
    }

    if (decision.kind === "pay") {
      if (await payBill(ctx, gameId, bill._id, decision.totalDue)) paid++;
      else unpaid++;
      continue;
    }

    if (decision.kind === "defer") {
      unpaid++;
      continue;
    }

    if (decision.kind === "liquidate") {
      liquidated += await liquidateStorage(ctx, game);
      liquidationValue = 0;
      if (
        (await currencyBalance(ctx, game, "money")) >= decision.totalDue
        && (await payBill(ctx, gameId, bill._id, decision.totalDue))
      ) {
        paid++;
        continue;
      }
    }

    await resetWorldForInsolvency(ctx, gameId);
    return { paid, unpaid, liquidated, insolvent: true };
  }

  return { paid, unpaid, liquidated, insolvent: false };
}

export const list = query({
  args: { gameId: v.id("games") },
  handler: async (ctx, args) => {
    if (!(await getReadAccess(ctx, args.gameId, undefined))) return [];
    return (await ctx.db.query("bills").withIndex("by_game_id", (q) => q.eq("gameId", args.gameId)).collect())
      .filter((b) => !b.paidAt).sort((a, b) => b.createdAt - a.createdAt).slice(0, 50).map((b) => ({
        ...b, id: b._id, type: b.billType, category: b.billCategory,
        gracePeriodDays: b.gracePeriodDays, aprRate: b.aprRate,
        lateFeeAccrued: b.lateFeeAccrued, isOverdue: b.isOverdue,
        billingPeriod: b.billingPeriod, totalDue: computeBillTotalDue(b)
      }));
  },
});

export const spawnBillsForAllGames = internalMutation({
  args: { cursor: v.optional(v.union(v.string(), v.null())), nowMs: v.optional(v.number()) },
  handler: async (ctx, args): Promise<{ scheduled: number; remaining: boolean }> => forEachOnlinePlayer(ctx, {
    batchSize: 25, groupBy: "homeGameId", handler: internal.bills.spawnBillsBatch, continuation: internal.bills.spawnBillsForAllGames, ...args,
  }),
});

export const spawnBillsBatch = internalMutation({
  args: { players: v.array(v.object({ serverId: v.string(), userId: v.string(), homeGameId: v.optional(v.string()) })), nowMs: v.number() },
  handler: async (ctx, args) => {
    let dailySpawned = 0;
    for (const homeGameId of new Set(args.players.map(player => player.homeGameId))) {
      const gameId = homeGameId ? ctx.db.normalizeId("games", homeGameId) : null;
      if (!gameId) continue;
      dailySpawned += await trySpawnDailyBills(ctx, gameId);
    }
    return { dailySpawned };
  },
});

export const autoPayBillsForAllGames = internalMutation({
  args: { cursor: v.optional(v.union(v.string(), v.null())), nowMs: v.optional(v.number()) },
  handler: async (ctx, args): Promise<{ scheduled: number; remaining: boolean }> => forEachOnlinePlayer(ctx, {
    batchSize: 25, groupBy: "homeGameId", handler: internal.bills.autoPayBillsBatch, continuation: internal.bills.autoPayBillsForAllGames, ...args,
  }),
});

export const autoPayBillsBatch = internalMutation({
  args: { players: v.array(v.object({ serverId: v.string(), userId: v.string(), homeGameId: v.optional(v.string()) })), nowMs: v.number() },
  handler: async (ctx, args) => {
    let paid = 0;
    let unpaid = 0;
    let insolvent = 0;
    for (const homeGameId of new Set(args.players.map(player => player.homeGameId))) {
      const gameId = homeGameId ? ctx.db.normalizeId("games", homeGameId) : null;
      if (!gameId) continue;
      const result = await autoPayBillsForGame(ctx, gameId);
      paid += result.paid;
      unpaid += result.unpaid;
      if (result.insolvent) insolvent++;
    }
    return { paid, unpaid, insolvent };
  },
});

/** Applies today's frontier_release jump once per UTC day. */
export const applyDailyFrontierRelease = internalMutation({
  args: { nowMs: v.optional(v.number()) },
  returns: v.object({
    applied: v.boolean(),
    frontierOffset: v.number(),
    jump: v.number(),
  }),
  handler: async (ctx, args) => {
    const nowMs = args.nowMs ?? Date.now();
    const modifier = getDailyModifier(new Date(nowMs));
    const today = formatDailyMarketDateKey(new Date(nowMs));

    if (modifier.type !== "frontier_release" || modifier.frontierJump <= 0) {
      const offset = await loadGlobalFrontierOffset(ctx);
      return { applied: false, frontierOffset: offset, jump: 0 };
    }

    const existing = await ctx.db.query("globalEconomy").first();
    if (existing?.lastFrontierReleaseDate === today) {
      return { applied: false, frontierOffset: existing!.frontierOffset, jump: 0 };
    }

    const nextOffset = (existing?.frontierOffset ?? 0) + modifier.frontierJump;
    const updatedAt = Date.now();

    if (existing) {
      await ctx.db.patch(existing._id, {
        frontierOffset: nextOffset,
        lastFrontierReleaseDate: today,
        updatedAt,
      });
    } else {
      await ctx.db.insert("globalEconomy", {
        frontierOffset: nextOffset,
        lastFrontierReleaseDate: today,
        updatedAt,
      });
    }

    return { applied: true, frontierOffset: nextOffset, jump: modifier.frontierJump };
  },
});

export const pay = mutation({
  args: { gameId: v.id("games"), billId: v.id("bills"), externalId: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const [owned, bill] = await Promise.all([getEditorAccess(ctx, args.gameId, args.externalId), ctx.db.get(args.billId)]);
    if (!bill) return { paid: false, reason: "Bill not found" };
    if (bill.gameId !== args.gameId) return { paid: false, reason: "Bill does not belong to this game" };
    if (bill.paidAt) return { paid: false, reason: "Bill already paid" };

    const res = await deductCurrency(ctx, owned.game._id, "money", computeBillTotalDue(bill));

    if (!res.success) return { paid: false, reason: res.reason };
    await ctx.db.patch(bill._id, { paidAt: Date.now(), isOverdue: false });
    return { paid: true, newBalance: res.newBalance };
  },
});
