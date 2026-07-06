import { v } from "convex/values";
import { internalMutation, query } from "../_generated/server";
import type { MutationCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import type { LeaderboardIncrement } from "@jgengine/core/runtime/hostPersistence";

const scopeValidator = v.union(v.literal("global"), v.literal("server"), v.literal("profile"));

const MAX_TOP_LIMIT = 100;

export const getTop = query({
  args: {
    gameId: v.string(),
    stat: v.string(),
    scope: scopeValidator,
    serverId: v.optional(v.id("jgGameServers")),
    limit: v.optional(v.number()),
  },
  returns: v.array(v.object({ userId: v.string(), value: v.number() })),
  handler: async (ctx, args) => {
    const limit = Math.min(Math.max(args.limit ?? MAX_TOP_LIMIT, 1), MAX_TOP_LIMIT);
    const ordered = ctx.db
      .query("jgLeaderboardRows")
      .withIndex("by_game_scope_stat_value", (q) =>
        q.eq("gameId", args.gameId).eq("scope", args.scope).eq("stat", args.stat),
      )
      .order("desc");

    const rows =
      args.serverId !== undefined
        ? await ordered.filter((q) => q.eq(q.field("serverId"), args.serverId)).take(limit)
        : await ordered.take(limit);

    return rows.map((row) => ({ userId: row.userId, value: row.value }));
  },
});

export const getProfile = query({
  args: {
    gameId: v.string(),
    userId: v.string(),
  },
  returns: v.record(v.string(), v.number()),
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("jgLeaderboardRows")
      .withIndex("by_user_scope_stat", (q) => q.eq("userId", args.userId).eq("scope", "profile"))
      .collect();

    const profile: Record<string, number> = {};
    for (const row of rows) {
      if (row.gameId === args.gameId) profile[row.stat] = row.value;
    }
    return profile;
  },
});

export async function applyLeaderboardIncrements(
  ctx: MutationCtx,
  gameId: string,
  entries: LeaderboardIncrement[],
): Promise<void> {
  const now = Date.now();
  for (const entry of entries) {
    const serverId = entry.serverId as Id<"jgGameServers"> | undefined;
    const candidates = await ctx.db
      .query("jgLeaderboardRows")
      .withIndex("by_user_scope_stat", (q) =>
        q.eq("userId", entry.userId).eq("scope", entry.scope).eq("stat", entry.stat),
      )
      .collect();

    const existing = candidates.find((row) => row.gameId === gameId && row.serverId === serverId);
    if (existing) {
      await ctx.db.patch(existing._id, { value: existing.value + entry.by, updatedAt: now });
    } else {
      await ctx.db.insert("jgLeaderboardRows", {
        gameId,
        stat: entry.stat,
        scope: entry.scope,
        serverId,
        userId: entry.userId,
        value: entry.by,
        updatedAt: now,
      });
    }
  }
}

export const incrementMany = internalMutation({
  args: {
    gameId: v.string(),
    entries: v.array(
      v.object({
        userId: v.string(),
        stat: v.string(),
        scope: scopeValidator,
        serverId: v.optional(v.id("jgGameServers")),
        by: v.number(),
      }),
    ),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await applyLeaderboardIncrements(ctx, args.gameId, args.entries);
    return null;
  },
});
