import { v } from "convex/values";
import { internalQuery } from "./_generated/server";

export const getOwnedGameIdInternal = internalQuery({
  args: { externalId: v.string() },
  returns: v.union(v.id("games"), v.null()),
  handler: async (ctx, args) => {
    const worlds = await ctx.db
      .query("games")
      .withIndex("by_created_by", (q) => q.eq("createdBy", args.externalId))
      .collect();
    const sorted = [...worlds].sort(
      (a, b) => b.updatedAt - a.updatedAt || b.createdAt - a.createdAt,
    );
    return sorted[0]?._id ?? null;
  },
});
