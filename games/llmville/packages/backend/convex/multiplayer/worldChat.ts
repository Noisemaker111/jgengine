import { helpers } from "../jgengine/runtime";
import { LLMVILLE_GAME_ID } from "@llmville/game/game/runtime/definition";
import { v } from "convex/values";
import { createChatFunctions, recentChatMessages, sendChatMessage } from "@jgengine/convex/server";
import { preferredPresenceLabel } from "@llmville/game/multiplayer/presencePolicy";
import { internalMutation, mutation, query } from "../_generated/server";
import { resolveActor } from "../permissions";
import { worldServerRow } from "../jgengine/world";

export const send = mutation({
  args: { text: v.string(), externalId: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const actor = await resolveActor(ctx, args.externalId);
    if (!actor) return { sent: false, reason: "unauthenticated" };
    const server = await worldServerRow(ctx);
    if (!server) return { sent: false, reason: "no_world" };
    const member = await ctx.db.query("jgServerMembers").withIndex("by_server_and_user", q => q.eq("serverId", server._id).eq("userId", actor)).unique();
    if (!member && !server.memberUserIds.includes(actor)) return { sent: false, reason: "no_world" };
    const user = await ctx.db.query("users").withIndex("by_external_id", q => q.eq("externalId", actor)).unique();
    const result = await sendChatMessage(ctx, { serverId: server._id, userId: actor, body: args.text, authorName: preferredPresenceLabel(user) ?? "Anonymous" });
    return { sent: result.ok, reason: result.reason };
  },
});

export const recent = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    if (!(await ctx.auth.getUserIdentity())) return [];
    const server = await worldServerRow(ctx);
    if (!server) return [];
    const rows = await recentChatMessages(ctx, { serverId: server._id, limit: args.limit });
    return rows.map(row => ({ id: row._id, authorExternalId: row.userId, authorName: row.authorName ?? "Anonymous", text: row.body, createdAt: row.at }));
  },
});

export const { pruneChatMessages: pruneOldChatMessages } = createChatFunctions();

/** One-shot history migration preserving author identity, display name, body and event time. */
export const migrateLegacyMessages = internalMutation({
  args: {},
  returns: v.object({ migrated: v.number(), remaining: v.boolean() }),
  handler: async (ctx) => {
    const page = await ctx.db.query("worldChatMessages").withIndex("by_created_at").paginate({
      cursor: null, numItems: 128, maximumBytesRead: 2 * 1024 * 1024,
    });
    if (page.page.length === 0) return { migrated: 0, remaining: !page.isDone };
    const server = await helpers.ensureServer(ctx, LLMVILLE_GAME_ID);
    for (const row of page.page) {
      await ctx.db.insert("jgChatMessages", {
        serverId: server._id,
        channelId: "global",
        userId: row.authorExternalId,
        authorName: row.authorName,
        body: row.text,
        at: row.createdAt,
      });
      await ctx.db.delete(row._id);
    }
    return { migrated: page.page.length, remaining: !page.isDone };
  },
});
