import { ConvexError, v } from "convex/values";
import { mutation, query } from "../_generated/server";
import { resolveActor } from "../permissions";
import { getGameRuntime } from "./registry";
import { loadServerSnapshot, persistServerSnapshot } from "./persistence";
import type { SaveConfig } from "@jgengine/core/runtime/save";
import { clearDirtyFlags } from "@jgengine/core/runtime/snapshot";
import { trimFeedEntries } from "@jgengine/core/runtime/hostPersistence";

const saveConfigValidator = v.union(
  v.literal("none"),
  v.object({
    auto: v.string(),
    scope: v.union(v.literal("player"), v.literal("chunks"), v.literal("player+chunks")),
  }),
);

export const joinServer = mutation({
  args: {
    gameId: v.string(),
    serverId: v.optional(v.id("jgGameServers")),
    slotsPerServer: v.optional(v.number()),
    save: v.optional(saveConfigValidator),
    mode: v.optional(v.string()),
    modeConfig: v.optional(v.any()),
  },
  returns: v.object({
    serverId: v.id("jgGameServers"),
    isNew: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const actorUserId = await resolveActor(ctx, undefined);
    if (!actorUserId) {
      throw new ConvexError("Not authenticated");
    }

    const now = Date.now();
    const runtime = getGameRuntime(args.gameId);
    const save = (args.save ?? runtime.save) as SaveConfig;
    const slotsPerServer = args.slotsPerServer ?? 16;

    let server =
      args.serverId !== undefined ? await ctx.db.get("jgGameServers", args.serverId) : null;

    if (server && server.gameId !== args.gameId) {
      throw new ConvexError("Server belongs to a different game");
    }

    if (!server) {
      const serverId = await ctx.db.insert("jgGameServers", {
        gameId: args.gameId,
        status: "running",
        mode: args.mode,
        modeConfig: args.modeConfig,
        memberUserIds: [],
        slotsPerServer,
        save,
        serverState: { entities: [], objects: [], session: {}, feeds: {} },
        sessionPlayers: {},
        revision: 0,
        tickAnchorMs: now,
        createdAt: now,
        updatedAt: now,
      });
      server = await ctx.db.get("jgGameServers", serverId);
      if (!server) throw new ConvexError("Failed to create server");
    }

    if (server.memberUserIds.length >= server.slotsPerServer && !server.memberUserIds.includes(actorUserId)) {
      throw new ConvexError("Server is full");
    }

    const profile = await ctx.db
      .query("jgPlayerProfiles")
      .withIndex("by_user_and_game", (q) => q.eq("userId", actorUserId).eq("gameId", args.gameId))
      .unique();

    const isNew = profile === null;
    const memberUserIds = server.memberUserIds.includes(actorUserId)
      ? server.memberUserIds
      : [...server.memberUserIds, actorUserId];

    await ctx.db.patch(server._id, {
      memberUserIds,
      status: "running",
      updatedAt: now,
      dirtyAt: now,
    });

    const refreshed = await ctx.db.get("jgGameServers", server._id);
    if (!refreshed) throw new ConvexError("Server missing after join");

    let snapshot = await loadServerSnapshot(ctx, refreshed);
    snapshot = runtime.joinPlayer(snapshot, actorUserId, isNew);
    await persistServerSnapshot(ctx, refreshed, clearDirtyFlags(snapshot), save);

    return { serverId: refreshed._id, isNew };
  },
});

export const leaveServer = mutation({
  args: {
    serverId: v.id("jgGameServers"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const actorUserId = await resolveActor(ctx, undefined);
    if (!actorUserId) {
      throw new ConvexError("Not authenticated");
    }

    const server = await ctx.db.get("jgGameServers", args.serverId);
    if (!server) return null;
    if (!server.memberUserIds.includes(actorUserId)) return null;

    const now = Date.now();
    const snapshot = await loadServerSnapshot(ctx, server);
    await persistServerSnapshot(ctx, server, snapshot, server.save as SaveConfig);

    const memberUserIds = server.memberUserIds.filter((id) => id !== actorUserId);
    const sessionPlayers = { ...(server.sessionPlayers as Record<string, unknown>) };
    delete sessionPlayers[actorUserId];

    await ctx.db.patch(server._id, {
      memberUserIds,
      sessionPlayers,
      updatedAt: now,
      dirtyAt: now,
      status: memberUserIds.length === 0 ? "open" : server.status,
    });

    return null;
  },
});

export const runCommand = mutation({
  args: {
    serverId: v.id("jgGameServers"),
    command: v.string(),
    input: v.any(),
  },
  returns: v.union(
    v.object({ ok: v.literal(true) }),
    v.object({ ok: v.literal(false), reason: v.string() }),
  ),
  handler: async (ctx, args) => {
    const actorUserId = await resolveActor(ctx, undefined);
    if (!actorUserId) {
      throw new ConvexError("Not authenticated");
    }

    const server = await ctx.db.get("jgGameServers", args.serverId);
    if (!server) {
      return { ok: false as const, reason: "Server not found" };
    }
    if (!server.memberUserIds.includes(actorUserId)) {
      return { ok: false as const, reason: "Not a member of this server" };
    }

    const runtime = getGameRuntime(server.gameId);
    const snapshot = await loadServerSnapshot(ctx, server);
    const result = runtime.runCommand(snapshot, actorUserId, args.command, args.input);
    if (!result.ok) {
      return result;
    }

    await persistServerSnapshot(ctx, server, result.snapshot, server.save as SaveConfig);
    return { ok: true as const };
  },
});

export const flushSave = mutation({
  args: {
    serverId: v.id("jgGameServers"),
  },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const actorUserId = await resolveActor(ctx, undefined);
    if (!actorUserId) {
      throw new ConvexError("Not authenticated");
    }

    const server = await ctx.db.get("jgGameServers", args.serverId);
    if (!server) return false;
    if (!server.memberUserIds.includes(actorUserId)) return false;

    const snapshot = await loadServerSnapshot(ctx, server);
    await persistServerSnapshot(ctx, server, clearDirtyFlags(snapshot), server.save as SaveConfig);
    return true;
  },
});

export const getServer = query({
  args: {
    serverId: v.id("jgGameServers"),
  },
  returns: v.union(
    v.object({
      _id: v.id("jgGameServers"),
      gameId: v.string(),
      status: v.union(v.literal("open"), v.literal("running"), v.literal("closed")),
      mode: v.optional(v.string()),
      memberUserIds: v.array(v.string()),
      slotsPerServer: v.number(),
      save: saveConfigValidator,
      revision: v.number(),
      serverState: v.any(),
      sessionPlayers: v.any(),
      updatedAt: v.number(),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const actorUserId = await resolveActor(ctx, undefined);
    if (!actorUserId) return null;

    const server = await ctx.db.get("jgGameServers", args.serverId);
    if (!server) return null;
    if (!server.memberUserIds.includes(actorUserId)) return null;

    return {
      _id: server._id,
      gameId: server.gameId,
      status: server.status,
      mode: server.mode,
      memberUserIds: server.memberUserIds,
      slotsPerServer: server.slotsPerServer,
      save: server.save,
      revision: server.revision,
      serverState: server.serverState,
      sessionPlayers: server.sessionPlayers,
      updatedAt: server.updatedAt,
    };
  },
});

export const getPlayerProfile = query({
  args: {
    gameId: v.string(),
  },
  returns: v.union(
    v.object({
      userId: v.string(),
      gameId: v.string(),
      playerState: v.any(),
      revision: v.number(),
      updatedAt: v.number(),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const actorUserId = await resolveActor(ctx, undefined);
    if (!actorUserId) return null;

    const profile = await ctx.db
      .query("jgPlayerProfiles")
      .withIndex("by_user_and_game", (q) => q.eq("userId", actorUserId).eq("gameId", args.gameId))
      .unique();

    if (!profile) return null;
    return {
      userId: profile.userId,
      gameId: profile.gameId,
      playerState: profile.playerState,
      revision: profile.revision,
      updatedAt: profile.updatedAt,
    };
  },
});

export const getFeed = query({
  args: {
    serverId: v.id("jgGameServers"),
    action: v.string(),
  },
  returns: v.array(v.any()),
  handler: async (ctx, args) => {
    const actorUserId = await resolveActor(ctx, undefined);
    if (!actorUserId) return [];

    const server = await ctx.db.get("jgGameServers", args.serverId);
    if (!server || !server.memberUserIds.includes(actorUserId)) return [];

    const row = await ctx.db
      .query("jgFeedBuffers")
      .withIndex("by_server_and_action", (q) => q.eq("serverId", args.serverId).eq("action", args.action))
      .unique();

    return row?.entries ?? [];
  },
});

export const pushFeedEntry = mutation({
  args: {
    serverId: v.id("jgGameServers"),
    action: v.string(),
    entry: v.any(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const actorUserId = await resolveActor(ctx, undefined);
    if (!actorUserId) {
      throw new ConvexError("Not authenticated");
    }

    const server = await ctx.db.get("jgGameServers", args.serverId);
    if (!server || !server.memberUserIds.includes(actorUserId)) {
      throw new ConvexError("Not a member of this server");
    }

    const now = Date.now();
    const existing = await ctx.db
      .query("jgFeedBuffers")
      .withIndex("by_server_and_action", (q) => q.eq("serverId", args.serverId).eq("action", args.action))
      .unique();

    const entries = trimFeedEntries([...(existing?.entries ?? []), args.entry]);

    if (existing) {
      await ctx.db.patch(existing._id, { entries, updatedAt: now });
    } else {
      await ctx.db.insert("jgFeedBuffers", {
        serverId: args.serverId,
        action: args.action,
        entries,
        updatedAt: now,
      });
    }

    return null;
  },
});

export const listOpenServers = query({
  args: {
    gameId: v.string(),
    limit: v.optional(v.number()),
  },
  returns: v.array(
    v.object({
      _id: v.id("jgGameServers"),
      status: v.union(v.literal("open"), v.literal("running"), v.literal("closed")),
      memberCount: v.number(),
      slotsPerServer: v.number(),
      mode: v.optional(v.string()),
      updatedAt: v.number(),
    }),
  ),
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("jgGameServers")
      .withIndex("by_game_and_status", (q) => q.eq("gameId", args.gameId).eq("status", "running"))
      .take(args.limit ?? 20);

    return rows.map((row) => ({
      _id: row._id,
      status: row.status,
      memberCount: row.memberUserIds.length,
      slotsPerServer: row.slotsPerServer,
      mode: row.mode,
      updatedAt: row.updatedAt,
    }));
  },
});
