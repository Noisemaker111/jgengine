import { v } from "convex/values";

import {
  getDailyModifier,
  type DailyMarketModifier,
} from "@llmville/game/economy/dailyMarket";
import { computeEffectiveFrontierBenchmark } from "@llmville/game/economy/frontier";

import type { Doc } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { query } from "./_generated/server";

const dailyMarketModifierValidator = v.object({
  type: v.string(),
  label: v.string(),
  description: v.string(),
  revenueMult: v.number(),
  dataYieldMult: v.number(),
  ambientCoolingMult: v.number(),
  electricityMult: v.number(),
  frontierJump: v.number(),
  reasoningRevenueMult: v.number(),
});

export async function loadGlobalFrontierOffset(ctx: QueryCtx | MutationCtx): Promise<number> {
  const row = await ctx.db.query("globalEconomy").first();
  return row?.frontierOffset ?? 0;
}

export async function getEffectiveFrontierForGame(
  ctx: QueryCtx | MutationCtx,
  game: Pick<Doc<"games">, "frontierBenchmark" | "createdAt"> | null,
  nowMs: number = Date.now(),
): Promise<number> {
  const offset = await loadGlobalFrontierOffset(ctx);
  return computeEffectiveFrontierBenchmark({
    nowMs,
    gameCreatedAtMs: game?.createdAt,
    frontierOffset: offset,
    gameOverride: game?.frontierBenchmark,
  });
}

export const getDailyMarketModifier = query({
  args: { nowMs: v.optional(v.number()) },
  returns: dailyMarketModifierValidator,
  handler: async (_ctx, args) => {
    const modifier = getDailyModifier(new Date(args.nowMs ?? Date.now()));
    return modifier satisfies DailyMarketModifier;
  },
});

export {
  getDailyModifier,
  formatDailyMarketDateKey,
} from "@llmville/game/economy/dailyMarket";
