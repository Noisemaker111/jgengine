import { internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { createClientErrorFunctions } from "@jgengine/convex/server";

export const { reportClientError: submit, pruneClientErrors: pruneOldClientErrors, pruneRateLimits } = createClientErrorFunctions();

/** One-shot history migration; existing reports bypass current submission policy. */
export const migrateLegacyReports = internalMutation({
  args: {},
  returns: v.object({ migrated: v.number(), remaining: v.boolean() }),
  handler: async (ctx) => {
    const page = await ctx.db.query("clientErrorReports").withIndex("by_created_at").paginate({
      cursor: null, numItems: 128, maximumBytesRead: 2 * 1024 * 1024,
    });
    const identities = new Map<string, string>();
    for (const row of page.page) {
      let userId = "legacy:anonymous";
      if (row.userId) {
        const cached = identities.get(row.userId);
        const user = cached === undefined ? await ctx.db.get(row.userId) : null;
        userId = cached ?? user?.externalId ?? `legacy:missing-user:${row.userId}`;
        identities.set(row.userId, userId);
      }
      const { _id, _creationTime, message, createdAt, userId: legacyUserId, ...details } = row;
      await ctx.db.insert("jgClientErrors", {
        userId,
        message,
        createdAt,
        details: { ...details, legacyId: _id, ...(legacyUserId ? { legacyUserId } : {}) },
      });
      await ctx.db.delete(row._id);
    }
    return { migrated: page.page.length, remaining: !page.isDone };
  },
});
