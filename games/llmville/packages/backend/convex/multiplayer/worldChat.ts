import { helpers, worldServerRow } from "../runtime";
import { LLMVILLE_GAME_ID } from "@llmville/game/game/runtime/definition";
import { v } from "convex/values";
import { createChatFunctions, recentChatMessages, sendChatMessage } from "@jgengine/convex/server";
import type { ChatMessage } from "@jgengine/core/chat/chat";
import type { ChatSendOutcome } from "@jgengine/core/chat/chatContract";
import { WORLD_CHAT_CHANNEL, preferredPresenceLabel } from "@llmville/game/multiplayer/presencePolicy";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { internalMutation, mutation, query } from "../_generated/server";
import { resolveActor } from "../permissions";

async function sendAs(ctx: MutationCtx, text: string, channelId: string): Promise<ChatSendOutcome> {
  if (channelId !== WORLD_CHAT_CHANNEL) return { ok: false, reason: "unknown_channel" };
  const actor = await resolveActor(ctx, undefined);
  if (!actor) return { ok: false, reason: "unauthenticated" };
  const server = await worldServerRow(ctx);
  if (!server) return { ok: false, reason: "no_world" };
  const member = await ctx.db.query("jgServerMembers").withIndex("by_server_and_user", q => q.eq("serverId", server._id).eq("userId", actor)).unique();
  if (!member && !server.memberUserIds.includes(actor)) return { ok: false, reason: "no_world" };
  const user = await ctx.db.query("users").withIndex("by_external_id", q => q.eq("externalId", actor)).unique();
  return sendChatMessage(ctx, { serverId: server._id, userId: actor, channelId, body: text, authorName: preferredPresenceLabel(user) ?? "Anonymous" });
}

async function history(ctx: QueryCtx, channelId: string, limit: number | undefined) {
  if (channelId !== WORLD_CHAT_CHANNEL || !(await ctx.auth.getUserIdentity())) return [];
  const server = await worldServerRow(ctx);
  if (!server) return [];
  return recentChatMessages(ctx, { serverId: server._id, channelId, ...(limit === undefined ? {} : { limit }) });
}

const chatMessageValidator = v.object({ id: v.string(), channelId: v.string(), fromUserId: v.string(), fromLabel: v.optional(v.string()), body: v.string(), at: v.number() });

/** The engine chat contract (`createConvexChatTransport`) over the shared world's channels, oldest first. */
export const messages = query({
  args: { channelId: v.string() },
  returns: v.array(chatMessageValidator),
  handler: async (ctx, args): Promise<ChatMessage[]> => (await history(ctx, args.channelId, undefined)).reverse().map(row => ({
    id: row._id, channelId: row.channelId, fromUserId: row.userId, fromLabel: row.authorName ?? "Anonymous", body: row.body, at: row.at,
  })),
});

export const sendMessage = mutation({
  args: { channelId: v.string(), body: v.string() },
  returns: v.object({ ok: v.boolean(), reason: v.optional(v.string()) }),
  handler: (ctx, args) => sendAs(ctx, args.body, args.channelId),
});

/** Bot API: post to the shared world chat. */
export const send = mutation({
  args: { text: v.string(), externalId: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const result = await sendAs(ctx, args.text, WORLD_CHAT_CHANNEL);
    return { sent: result.ok, reason: result.reason };
  },
});

/** Bot API: the latest shared world chat, newest first. */
export const recent = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => (await history(ctx, WORLD_CHAT_CHANNEL, args.limit)).map(row => ({
    id: row._id, authorExternalId: row.userId, authorName: row.authorName ?? "Anonymous", text: row.body, createdAt: row.at,
  })),
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
