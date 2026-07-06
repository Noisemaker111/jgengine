import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  jgGameServers: defineTable({
    gameId: v.string(),
    status: v.union(v.literal("open"), v.literal("running"), v.literal("closed")),
    mode: v.optional(v.string()),
    modeConfig: v.optional(v.any()),
    memberUserIds: v.array(v.string()),
    slotsPerServer: v.number(),
    save: v.union(
      v.literal("none"),
      v.object({
        auto: v.string(),
        scope: v.union(v.literal("player"), v.literal("chunks"), v.literal("player+chunks")),
      }),
    ),
    serverState: v.any(),
    sessionPlayers: v.any(),
    revision: v.number(),
    tickAnchorMs: v.number(),
    lastSavedAt: v.optional(v.number()),
    dirtyAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_game_and_status", ["gameId", "status"]),
  jgPlayerProfiles: defineTable({
    userId: v.string(),
    gameId: v.string(),
    playerState: v.any(),
    revision: v.number(),
    dirtyAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_user_and_game", ["userId", "gameId"]),
  jgWorldChunks: defineTable({
    serverId: v.id("jgGameServers"),
    chunkKey: v.string(),
    snapshot: v.any(),
    dirtyAt: v.optional(v.number()),
    updatedAt: v.number(),
  })
    .index("by_server_and_chunk", ["serverId", "chunkKey"])
    .index("by_server", ["serverId"]),
  jgLeaderboardRows: defineTable({
    gameId: v.string(),
    stat: v.string(),
    scope: v.union(v.literal("global"), v.literal("server"), v.literal("profile")),
    serverId: v.optional(v.id("jgGameServers")),
    userId: v.string(),
    value: v.number(),
    updatedAt: v.number(),
  })
    .index("by_game_scope_stat_value", ["gameId", "scope", "stat", "value"])
    .index("by_user_scope_stat", ["userId", "scope", "stat"]),
  jgFeedBuffers: defineTable({
    serverId: v.id("jgGameServers"),
    action: v.string(),
    entries: v.array(v.any()),
    updatedAt: v.number(),
  }).index("by_server_and_action", ["serverId", "action"]),
});
