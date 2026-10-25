import { v } from "convex/values";

import { query } from "./_generated/server";
import { getEffectiveFrontierForGame } from "./dailyMarket";

/** SOTA benchmark this world faces: baseline at creation, rising with the world's age plus release jumps. */
export const getFrontierBenchmark = query({
  args: { gameId: v.id("games"), nowMs: v.optional(v.number()) },
  returns: v.number(),
  handler: async (ctx, args) => {
    return getEffectiveFrontierForGame(ctx, await ctx.db.get(args.gameId), args.nowMs ?? Date.now());
  },
});

export {
  computeFrontierBenchmark,
  computeEffectiveFrontierBenchmark,
  computeFrontierDecayMultiplier,
  computeDemandSaturation,
  FRONTIER_BASELINE,
  FRONTIER_RISE_PER_DAY,
} from "@llmville/game/economy/frontier";
