import { v } from "convex/values";

import {
  decideStartHosting,
  listVendorHostingOpportunities,
} from "@llmville/game/economy/marketplace";
import { getHostingRevenueShare } from "@llmville/game/economy/reputation";
import { computeModelVramFootprintGb } from "@llmville/game/models/quantization";
import { computeRackHardwareStats } from "@llmville/game/infrastructure/infrastructure";

import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";
import { getEditorAccess, getReadAccess } from "./permissions";
import { gameRacks, rackSnapshots } from "./jgengine/worldObjects";

const hostingOpportunityValidator = v.object({
  vendorModelId: v.string(),
  name: v.string(),
  creator: v.string(),
  description: v.string(),
  benchmarkScore: v.number(),
  paramsB: v.number(),
  isReasoning: v.boolean(),
  moneyPerToken: v.number(),
  tokensPerSecond: v.number(),
  tokensPerToken: v.number(),
  baseRevenueShareHost: v.number(),
  maxRevenueShareHost: v.number(),
  footprintGb: v.number(),
});

const hostedModelValidator = v.object({
  _id: v.id("hostedModels"),
  gameId: v.id("games"),
  revenueShareHost: v.number(),
  vendorModelId: v.optional(v.string()),
  active: v.boolean(),
  createdAt: v.number(),
  updatedAt: v.number(),
});

export async function loadActiveHostedModels(
  ctx: QueryCtx | MutationCtx,
  gameId: Id<"games">,
): Promise<Doc<"hostedModels">[]> {
  return ctx.db
    .query("hostedModels")
    .withIndex("by_game_id_and_active", (q) => q.eq("gameId", gameId).eq("active", true))
    .collect();
}

export const offers = query({
  args: { gameId: v.id("games"), reputation: v.optional(v.number()) },
  returns: v.array(hostingOpportunityValidator),
  handler: async (ctx, args) => {
    if (!(await getReadAccess(ctx, args.gameId, undefined))) return [];

    const reputation = args.reputation ?? 0;
    const maxShare = getHostingRevenueShare(reputation);

    return listVendorHostingOpportunities().map((entry) => ({
      ...entry,
      maxRevenueShareHost: maxShare,
      footprintGb: computeModelVramFootprintGb(entry.paramsB, "fp16"),
    }));
  },
});

export const listActiveHostedModels = query({
  args: { gameId: v.id("games") },
  returns: v.array(hostedModelValidator),
  handler: async (ctx, args) => {
    if (!(await getReadAccess(ctx, args.gameId, undefined))) return [];
    return loadActiveHostedModels(ctx, args.gameId);
  },
});

export const host = mutation({
  args: {
    gameId: v.id("games"),
    vendorModelId: v.string(),
    revenueShareHost: v.optional(v.number()),
  },
  returns: v.object({
    started: v.boolean(),
    hostedModelId: v.optional(v.id("hostedModels")),
    reason: v.optional(v.string()),
  }),
  handler: async (ctx, args) => {
    const owned = await getEditorAccess(ctx, args.gameId, undefined);

    const [existing, racks] = await Promise.all([
      loadActiveHostedModels(ctx, args.gameId),
      gameRacks(ctx, owned.game),
    ]);

    const decision = decideStartHosting({
      vendorModelId: args.vendorModelId,
      existingVendorModelIds: existing
        .map((row) => row.vendorModelId)
        .filter((id): id is string => id !== undefined),
      totalVramGb: computeRackHardwareStats(rackSnapshots(racks)).totalVramGb,
      reputation: owned.game.reputation ?? 0,
      requestedRevenueShare: args.revenueShareHost,
    });
    if (!decision.started) return { started: false, reason: decision.reason };

    const now = Date.now();
    const hostedModelId = await ctx.db.insert("hostedModels", {
      gameId: args.gameId,
      vendorModelId: args.vendorModelId,
      revenueShareHost: decision.revenueShareHost,
      active: true,
      createdAt: now,
      updatedAt: now,
    });

    return { started: true, hostedModelId };
  },
});

export const unhost = mutation({
  args: {
    gameId: v.id("games"),
    hostedModelId: v.id("hostedModels"),
  },
  returns: v.object({ stopped: v.boolean(), reason: v.optional(v.string()) }),
  handler: async (ctx, args) => {
    await getEditorAccess(ctx, args.gameId, undefined);

    const hosted = await ctx.db.get(args.hostedModelId);
    if (!hosted || hosted.gameId !== args.gameId) {
      return { stopped: false, reason: "Hosting contract not found" };
    }

    await ctx.db.patch(hosted._id, { active: false, updatedAt: Date.now() });
    return { stopped: true };
  },
});
