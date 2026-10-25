import { v } from "convex/values";
import {
  ASSIGN_RACK_CARD_COMMAND,
  UNASSIGN_RACK_CARD_COMMAND,
} from "@llmville/game/game/runtime/rackCommands";
import { shouldResetScrapingAnchor } from "@llmville/game/infrastructure/rackAssignments";
import { isScrapeTierRunnable } from "@llmville/game/models/scrapingTiers";
import { scrapeLaneTflopsForGame } from "./serving";
import { mutation } from "./_generated/server";
import { getEditorAccess, ownerExternalIdForActor } from "./permissions";
import { runWorldCommand } from "./jgengine/world";
import { computeLaneValidator, scrapeTierValidator } from "./schema";

export const assignCard = mutation({
  args: {
    gameId: v.id("games"),
    rackId: v.string(),
    slotIndex: v.number(),
    lane: computeLaneValidator,
    targetModelId: v.optional(v.id("models")),
    externalId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const owned = await getEditorAccess(ctx, args.gameId, args.externalId);
    const targetModel = args.targetModelId ? await ctx.db.get(args.targetModelId) : null;
    const outcome = await runWorldCommand(
      ctx,
      ownerExternalIdForActor(owned.actorExternalId),
      ASSIGN_RACK_CARD_COMMAND,
      {
        rackInstanceId: args.rackId,
        slotIndex: args.slotIndex,
        lane: args.lane,
        targetModelId: args.targetModelId,
        targetModelExists: targetModel !== null && targetModel.gameId === args.gameId,
      },
    );
    if (!outcome.ok) return { ok: false, reason: outcome.reason };

    const now = Date.now();
    await ctx.db.patch(args.gameId, {
      updatedAt: now,
      ...(shouldResetScrapingAnchor(args.lane, owned.game.lastScrapingTickAt !== undefined)
        ? { lastScrapingTickAt: now }
        : {}),
    });
    return { ok: true };
  },
});

export const unassignCard = mutation({
  args: {
    gameId: v.id("games"),
    rackId: v.string(),
    slotIndex: v.number(),
    externalId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const owned = await getEditorAccess(ctx, args.gameId, args.externalId);
    const outcome = await runWorldCommand(
      ctx,
      ownerExternalIdForActor(owned.actorExternalId),
      UNASSIGN_RACK_CARD_COMMAND,
      { rackInstanceId: args.rackId, slotIndex: args.slotIndex },
    );
    if (!outcome.ok) return { ok: false, reason: outcome.reason };
    await ctx.db.patch(owned.game._id, { updatedAt: Date.now() });
    return { ok: true };
  },
});

export const setScrapeTier = mutation({
  args: {
    gameId: v.id("games"),
    tier: scrapeTierValidator,
    externalId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const owned = await getEditorAccess(ctx, args.gameId, args.externalId);
    if (!isScrapeTierRunnable(args.tier, await scrapeLaneTflopsForGame(ctx, owned.game))) {
      return { ok: false, reason: "tier_locked" } as const;
    }
    await ctx.db.patch(args.gameId, {
      activeScrapeTier: args.tier,
      lastScrapingTickAt: Date.now(),
      updatedAt: Date.now(),
    });
    return { ok: true };
  },
});
