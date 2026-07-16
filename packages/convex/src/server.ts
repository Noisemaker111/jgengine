import {
  defineSchema,
  defineTable,
  internalMutationGeneric,
  mutationGeneric,
  queryGeneric,
} from "convex/server";
import type {
  Auth,
  DataModelFromSchemaDefinition,
  DocumentByName,
  GenericMutationCtx,
  GenericQueryCtx,
  MutationBuilder,
  QueryBuilder,
} from "convex/server";
import type { GenericId } from "convex/values";
import { ConvexError, v } from "convex/values";
import type { ChatMessage } from "@jgengine/core/game/chat";
import type { LeaderboardScope } from "@jgengine/core/game/leaderboard";
import type { ChatSendOutcome } from "@jgengine/core/multiplayer/chatContract";
import {
  createFeedWriteGate,
  validateFeedWrite,
  type FeedWriteGate,
} from "@jgengine/core/multiplayer/feedWriteGate";
import {
  decidePoseSync,
  spawnPresenceState,
  type PoseSyncRules,
  type PresencePoseState,
} from "@jgengine/core/multiplayer/presenceModel";
import type { CommandDef } from "@jgengine/core/runtime/commandRunner";
import type { GameRuntime } from "@jgengine/core/runtime/gameRuntime";
import { createGameRuntime } from "@jgengine/core/runtime/gameRuntime";
import type { GameServerRecord, LeaderboardIncrement, PlayerProfileRecord } from "@jgengine/core/runtime/hostPersistence";
import { buildHydratePlayers, planServerPersist, shouldAutoSave, trimFeedEntries } from "@jgengine/core/runtime/hostPersistence";
import type { SaveConfig } from "@jgengine/core/runtime/save";
import type { GameRuntimeSnapshot, RuntimeChunkRow, RuntimePlayerRow, RuntimeServerRow } from "@jgengine/core/runtime/snapshot";
import { clearDirtyFlags, createEmptyServerRow } from "@jgengine/core/runtime/snapshot";
import { applyCommandWithOcc, commitIfRevisionMatch } from "./occ";

const saveConfigValidator = v.union(
  v.literal("none"),
  v.object({
    auto: v.string(),
    scope: v.union(v.literal("player"), v.literal("chunks"), v.literal("player+chunks")),
  }),
);

/** @internal */
export function jgengineTables() {
  return {
    jgGameServers: defineTable({
      gameId: v.string(),
      status: v.union(v.literal("open"), v.literal("running"), v.literal("closed")),
      mode: v.optional(v.string()),
      modeConfig: v.optional(v.any()),
      visibility: v.optional(v.union(v.literal("public"), v.literal("private"))),
      joinCode: v.optional(v.string()),
      memberUserIds: v.array(v.string()),
      slotsPerServer: v.number(),
      save: saveConfigValidator,
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
    jgPoses: defineTable({
      serverId: v.string(),
      userId: v.string(),
      x: v.number(),
      y: v.number(),
      z: v.number(),
      rotationY: v.number(),
      rotationPitch: v.number(),
      updatedAt: v.number(),
    })
      .index("by_server", ["serverId"])
      .index("by_server_and_user", ["serverId", "userId"]),
    jgChatMessages: defineTable({
      serverId: v.string(),
      channelId: v.string(),
      userId: v.string(),
      body: v.string(),
      at: v.number(),
    }).index("by_server_channel", ["serverId", "channelId"]),
  };
}

/**
 * Convex table for the hosted GameContext-world path: one row per (gameId, serverId) holding the full
 * `WorldSnapshot` blob, its revision, the member roster, and each member's held input. A sibling of
 * {@link jgengineTables} — spread either (or both) into `defineSchema`.
  * @internal
  */
export function jgengineHostedTables() {
  return {
    jgHostedWorlds: defineTable({
      gameId: v.string(),
      serverId: v.string(),
      snapshot: v.any(),
      revision: v.number(),
      memberUserIds: v.array(v.string()),
      inputs: v.any(),
      tickAnchorMs: v.number(),
      createdAt: v.number(),
      updatedAt: v.number(),
    }).index("by_game_and_server", ["gameId", "serverId"]),
  };
}

const schemaForTypes = defineSchema(jgengineTables());
type JGDataModel = DataModelFromSchemaDefinition<typeof schemaForTypes>;
type JGQueryCtx = GenericQueryCtx<JGDataModel>;
type JGMutationCtx = GenericMutationCtx<JGDataModel>;
const query = queryGeneric as QueryBuilder<JGDataModel, "public">;
const mutation = mutationGeneric as MutationBuilder<JGDataModel, "public">;
const internalMutation = internalMutationGeneric as MutationBuilder<JGDataModel, "internal">;

type ServerDoc = DocumentByName<JGDataModel, "jgGameServers">;

export type JgAuthMode = "anonymous" | "required";

export const DEFAULT_CONVEX_POSE_RULES: PoseSyncRules = {
  maxSpeed: 12,
  maxVerticalOffset: 3,
  minElapsedSec: 0.05,
  maxElapsedSec: 0.5,
  keepAliveRefreshMs: 10_000,
};

/** Resolve the acting user id under a {@link JgAuthMode}: the Convex identity when signed in (rejecting a mismatched claim), the claimed external id under `"anonymous"`, else `null`.
 * @internal
 */
export async function resolveActor(
  ctx: { auth: Auth },
  claimedExternalId: string | undefined,
  mode: JgAuthMode,
): Promise<string | null> {
  const identity = await ctx.auth.getUserIdentity();
  if (identity !== null) {
    if (
      claimedExternalId !== undefined &&
      claimedExternalId.length > 0 &&
      claimedExternalId !== identity.subject
    ) {
      return null;
    }
    return identity.subject;
  }
  if (mode === "anonymous" && claimedExternalId !== undefined && claimedExternalId.length > 0) {
    return claimedExternalId;
  }
  return null;
}

async function requireServerMember(
  ctx: JGQueryCtx | JGMutationCtx,
  serverId: string,
  actorUserId: string,
): Promise<ServerDoc | null> {
  const server = await ctx.db.get("jgGameServers", serverId as GenericId<"jgGameServers">);
  if (!server) return null;
  if (!server.memberUserIds.includes(actorUserId)) return null;
  return server;
}

const builtinRuntimeCommands: Record<string, CommandDef> = {
  "engine.ping": {
    validate: (_snapshot: GameRuntimeSnapshot) => null,
    apply: (snapshot: GameRuntimeSnapshot) => snapshot,
  },
};

function buildRuntimeRegistry(runtimes: GameRuntime[] | undefined): Map<string, GameRuntime> {
  const registry = new Map<string, GameRuntime>();
  for (const runtime of runtimes ?? []) registry.set(runtime.gameId, runtime);
  return registry;
}

function resolveRuntime(registry: Map<string, GameRuntime>, gameId: string): GameRuntime {
  const existing = registry.get(gameId);
  if (existing) return existing;
  const fallback = createGameRuntime({ gameId, save: "none", commands: builtinRuntimeCommands });
  registry.set(gameId, fallback);
  return fallback;
}

function defaultServerStateForGame(gameId: string): RuntimeServerRow {
  void gameId;
  return createEmptyServerRow();
}

function serverDocToRecord(server: ServerDoc): GameServerRecord {
  return {
    serverId: server._id,
    gameId: server.gameId,
    status: server.status,
    mode: server.mode,
    modeConfig: server.modeConfig,
    visibility: server.visibility,
    joinCode: server.joinCode,
    memberUserIds: server.memberUserIds,
    slotsPerServer: server.slotsPerServer,
    save: server.save as SaveConfig,
    serverState: server.serverState as RuntimeServerRow,
    sessionPlayers: server.sessionPlayers as Record<string, RuntimePlayerRow>,
    revision: server.revision,
    tickAnchorMs: server.tickAnchorMs,
    lastSavedAt: server.lastSavedAt,
    dirtyAt: server.dirtyAt,
    createdAt: server.createdAt,
    updatedAt: server.updatedAt,
  };
}

async function loadServerSnapshot(
  ctx: JGMutationCtx,
  server: ServerDoc,
  runtime: GameRuntime,
): Promise<GameRuntimeSnapshot> {
  const profiles: Record<string, PlayerProfileRecord | null> = {};

  for (const userId of server.memberUserIds) {
    const profile = await ctx.db
      .query("jgPlayerProfiles")
      .withIndex("by_user_and_game", (q) => q.eq("userId", userId).eq("gameId", server.gameId))
      .unique();

    profiles[userId] = profile
      ? {
          userId,
          gameId: server.gameId,
          playerState: profile.playerState as RuntimePlayerRow,
          revision: profile.revision,
          updatedAt: profile.updatedAt,
        }
      : null;
  }

  const playersByUserId = buildHydratePlayers(serverDocToRecord(server), profiles);

  const chunks = await ctx.db
    .query("jgWorldChunks")
    .withIndex("by_server", (q) => q.eq("serverId", server._id))
    .collect();

  const chunksByKey: Record<string, RuntimeChunkRow> = {};
  for (const chunk of chunks) {
    chunksByKey[chunk.chunkKey] = chunk.snapshot as RuntimeChunkRow;
  }

  return runtime.hydrate({
    gameId: server.gameId,
    serverId: server._id,
    serverRow: server.serverState as RuntimeServerRow,
    playersByUserId,
    chunksByKey,
    revision: server.revision,
  });
}

/** @internal */
export async function applyLeaderboardIncrements(
  ctx: JGMutationCtx,
  gameId: string,
  entries: LeaderboardIncrement[],
): Promise<void> {
  const now = Date.now();
  for (const entry of entries) {
    const serverId = entry.serverId as GenericId<"jgGameServers"> | undefined;
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

async function persistServerSnapshot(
  ctx: JGMutationCtx,
  server: ServerDoc,
  snapshot: GameRuntimeSnapshot,
  save: SaveConfig,
): Promise<void> {
  const now = Date.now();
  const plan = planServerPersist(serverDocToRecord(server), snapshot, save, now);

  if (plan.leaderboard.length > 0) {
    await applyLeaderboardIncrements(ctx, server.gameId, plan.leaderboard);
  }

  for (const profile of plan.profiles) {
    const existing = await ctx.db
      .query("jgPlayerProfiles")
      .withIndex("by_user_and_game", (q) => q.eq("userId", profile.userId).eq("gameId", profile.gameId))
      .unique();

    const profilePatch = {
      playerState: profile.playerState,
      revision: profile.revision,
      dirtyAt: undefined,
      updatedAt: profile.updatedAt,
    };

    if (existing) {
      await ctx.db.patch(existing._id, profilePatch);
    } else {
      await ctx.db.insert("jgPlayerProfiles", {
        userId: profile.userId,
        gameId: profile.gameId,
        ...profilePatch,
        createdAt: now,
      });
    }
  }

  for (const chunk of plan.chunks) {
    const existing = await ctx.db
      .query("jgWorldChunks")
      .withIndex("by_server_and_chunk", (q) => q.eq("serverId", server._id).eq("chunkKey", chunk.chunkKey))
      .unique();

    const chunkPatch = {
      snapshot: chunk.snapshot,
      dirtyAt: undefined,
      updatedAt: chunk.updatedAt,
    };

    if (existing) {
      await ctx.db.patch(existing._id, chunkPatch);
    } else {
      await ctx.db.insert("jgWorldChunks", {
        serverId: server._id,
        chunkKey: chunk.chunkKey,
        ...chunkPatch,
      });
    }
  }

  for (const chunkKey of plan.deletedChunks) {
    const existing = await ctx.db
      .query("jgWorldChunks")
      .withIndex("by_server_and_chunk", (q) => q.eq("serverId", server._id).eq("chunkKey", chunkKey))
      .unique();
    if (existing) await ctx.db.delete(existing._id);
  }

  await ctx.db.patch(server._id, {
    serverState: plan.server.serverState,
    sessionPlayers: plan.server.sessionPlayers,
    revision: plan.server.revision,
    dirtyAt: plan.server.dirtyAt,
    updatedAt: plan.server.updatedAt,
    lastSavedAt: plan.server.lastSavedAt,
  });
}

async function flushServerIfDue(
  ctx: JGMutationCtx,
  server: ServerDoc,
  now: number,
  runtime: GameRuntime,
): Promise<boolean> {
  if (!shouldAutoSave(server.save as SaveConfig, server.dirtyAt, server.lastSavedAt, now)) {
    return false;
  }

  const snapshot = await loadServerSnapshot(ctx, server, runtime);
  await persistServerSnapshot(ctx, server, clearDirtyFlags(snapshot), server.save as SaveConfig);
  return true;
}

export const JG_RUNTIME_TICK_MS = 1_000;

/** @internal */
export function createGameServerFunctions(options?: {
  runtimes?: GameRuntime[];
  auth?: JgAuthMode;
  slotsPerServer?: number;
  allowedFeedActions?: readonly string[];
}) {
  const mode: JgAuthMode = options?.auth ?? "required";
  const hostSlotsPerServer = options?.slotsPerServer ?? 16;
  const feedWriteGate: FeedWriteGate = createFeedWriteGate(options?.allowedFeedActions ?? []);
  const registry = buildRuntimeRegistry(options?.runtimes);

  const joinServer = mutation({
    args: {
      gameId: v.string(),
      serverId: v.optional(v.id("jgGameServers")),
      mode: v.optional(v.string()),
      modeConfig: v.optional(v.any()),
      visibility: v.optional(v.union(v.literal("public"), v.literal("private"))),
      joinCode: v.optional(v.string()),
      externalId: v.optional(v.string()),
    },
    returns: v.object({
      serverId: v.id("jgGameServers"),
      isNew: v.boolean(),
    }),
    handler: async (ctx, args) => {
      const actorUserId = await resolveActor(ctx, args.externalId, mode);
      if (!actorUserId) {
        throw new ConvexError("Not authenticated");
      }

      const now = Date.now();
      const runtime = resolveRuntime(registry, args.gameId);
      const save = runtime.save as SaveConfig;
      const slotsPerServer = hostSlotsPerServer;

      let server =
        args.serverId !== undefined ? await ctx.db.get("jgGameServers", args.serverId) : null;

      if (args.serverId !== undefined && !server) {
        throw new ConvexError("Server not found");
      }

      if (server && server.gameId !== args.gameId) {
        throw new ConvexError("Server belongs to a different game");
      }

      if (!server) {
        const joinable = [];
        for (const status of ["running", "open"] as const) {
          const rows = await ctx.db
            .query("jgGameServers")
            .withIndex("by_game_and_status", (q) => q.eq("gameId", args.gameId).eq("status", status))
            .collect();
          joinable.push(...rows);
        }
        server =
          joinable.find((row) => {
            if (row.memberUserIds.includes(actorUserId)) return true;
            if (row.memberUserIds.length >= row.slotsPerServer) return false;
            return (row.visibility ?? "public") !== "private";
          }) ?? null;
      }

      if (!server) {
        const serverId = await ctx.db.insert("jgGameServers", {
          gameId: args.gameId,
          status: "running",
          mode: args.mode,
          modeConfig: args.modeConfig,
          visibility: args.visibility ?? "public",
          joinCode: args.joinCode,
          memberUserIds: [],
          slotsPerServer,
          save,
          serverState: defaultServerStateForGame(args.gameId),
          sessionPlayers: {},
          revision: 0,
          tickAnchorMs: now,
          createdAt: now,
          updatedAt: now,
        });
        server = await ctx.db.get("jgGameServers", serverId);
        if (!server) throw new ConvexError("Failed to create server");
      }

      if (
        server.memberUserIds.length >= server.slotsPerServer &&
        !server.memberUserIds.includes(actorUserId)
      ) {
        throw new ConvexError("Server is full");
      }

      if (
        (server.visibility ?? "public") === "private" &&
        !server.memberUserIds.includes(actorUserId) &&
        args.serverId === undefined
      ) {
        throw new ConvexError("Server is private");
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

      let snapshot = await loadServerSnapshot(ctx, refreshed, runtime);
      snapshot = runtime.joinPlayer(snapshot, actorUserId, isNew);
      await persistServerSnapshot(ctx, refreshed, clearDirtyFlags(snapshot), save);

      return { serverId: refreshed._id, isNew };
    },
  });

  const leaveServer = mutation({
    args: {
      serverId: v.id("jgGameServers"),
      externalId: v.optional(v.string()),
    },
    returns: v.null(),
    handler: async (ctx, args) => {
      const actorUserId = await resolveActor(ctx, args.externalId, mode);
      if (!actorUserId) {
        throw new ConvexError("Not authenticated");
      }

      const server = await ctx.db.get("jgGameServers", args.serverId);
      if (!server) return null;
      if (!server.memberUserIds.includes(actorUserId)) return null;

      const now = Date.now();
      const runtime = resolveRuntime(registry, server.gameId);
      const snapshot = await loadServerSnapshot(ctx, server, runtime);
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

      const pose = await ctx.db
        .query("jgPoses")
        .withIndex("by_server_and_user", (q) =>
          q.eq("serverId", args.serverId).eq("userId", actorUserId),
        )
        .unique();
      if (pose) await ctx.db.delete(pose._id);

      return null;
    },
  });

  const runCommand = mutation({
    args: {
      serverId: v.id("jgGameServers"),
      command: v.string(),
      input: v.any(),
      externalId: v.optional(v.string()),
    },
    returns: v.union(
      v.object({ ok: v.literal(true) }),
      v.object({ ok: v.literal(false), reason: v.string() }),
    ),
    handler: async (ctx, args) => {
      const actorUserId = await resolveActor(ctx, args.externalId, mode);
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

      const loadedRevision = server.revision;
      const runtime = resolveRuntime(registry, server.gameId);
      const snapshot = await loadServerSnapshot(ctx, server, runtime);
      const result = applyCommandWithOcc({
        loadedRevision,
        currentRevision: server.revision,
        snapshot,
        runtime,
        actorUserId,
        command: args.command,
        input: args.input,
      });
      if (!result.ok) {
        return result;
      }

      const latest = await ctx.db.get("jgGameServers", args.serverId);
      if (!latest) {
        return { ok: false as const, reason: "Server not found" };
      }
      const commit = commitIfRevisionMatch(loadedRevision, latest.revision);
      if (!commit.ok) {
        return commit;
      }

      await persistServerSnapshot(ctx, latest, result.snapshot, latest.save as SaveConfig);
      return { ok: true as const };
    },
  });

  const flushSave = mutation({
    args: {
      serverId: v.id("jgGameServers"),
      externalId: v.optional(v.string()),
    },
    returns: v.boolean(),
    handler: async (ctx, args) => {
      const actorUserId = await resolveActor(ctx, args.externalId, mode);
      if (!actorUserId) {
        throw new ConvexError("Not authenticated");
      }

      const server = await ctx.db.get("jgGameServers", args.serverId);
      if (!server) return false;
      if (!server.memberUserIds.includes(actorUserId)) return false;

      const runtime = resolveRuntime(registry, server.gameId);
      const snapshot = await loadServerSnapshot(ctx, server, runtime);
      await persistServerSnapshot(ctx, server, clearDirtyFlags(snapshot), server.save as SaveConfig);
      return true;
    },
  });

  const getServer = query({
    args: {
      serverId: v.id("jgGameServers"),
      externalId: v.optional(v.string()),
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
      const actorUserId = await resolveActor(ctx, args.externalId, mode);
      if (!actorUserId) return null;

      const server = await ctx.db.get("jgGameServers", args.serverId);
      if (!server) return null;
      if (!server.memberUserIds.includes(actorUserId)) return null;

      const sessionPlayers = server.sessionPlayers as Record<string, unknown>;
      const ownSession = sessionPlayers[actorUserId];

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
        sessionPlayers: ownSession === undefined ? {} : { [actorUserId]: ownSession },
        updatedAt: server.updatedAt,
      };
    },
  });

  const getPlayerProfile = query({
    args: {
      gameId: v.string(),
      externalId: v.optional(v.string()),
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
      const actorUserId = await resolveActor(ctx, args.externalId, mode);
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

  const getFeed = query({
    args: {
      serverId: v.id("jgGameServers"),
      action: v.string(),
      externalId: v.optional(v.string()),
    },
    returns: v.array(v.any()),
    handler: async (ctx, args) => {
      const actorUserId = await resolveActor(ctx, args.externalId, mode);
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

  const pushFeedEntry = mutation({
    args: {
      serverId: v.id("jgGameServers"),
      action: v.string(),
      entry: v.any(),
      externalId: v.optional(v.string()),
    },
    returns: v.null(),
    handler: async (ctx, args) => {
      const actorUserId = await resolveActor(ctx, args.externalId, mode);
      if (!actorUserId) {
        throw new ConvexError("Not authenticated");
      }

      const allowed = validateFeedWrite(feedWriteGate, args.action);
      if (!allowed.ok) {
        throw new ConvexError(allowed.reason);
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

  const listOpenServers = query({
    args: {
      gameId: v.string(),
      limit: v.optional(v.number()),
      externalId: v.optional(v.string()),
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

  const tickActiveServers = internalMutation({
    args: {},
    handler: async (ctx) => {
      const now = Date.now();
      const servers = await ctx.db.query("jgGameServers").collect();
      let ticked = 0;
      let saved = 0;

      for (const server of servers) {
        if (server.status !== "running") continue;
        if (server.memberUserIds.length === 0) continue;

        const elapsedMs = now - server.tickAnchorMs;
        if (elapsedMs < JG_RUNTIME_TICK_MS) continue;

        const runtime = resolveRuntime(registry, server.gameId);
        let snapshot = await loadServerSnapshot(ctx, server, runtime);
        snapshot = runtime.tick(snapshot, elapsedMs / 1_000);
        await persistServerSnapshot(ctx, server, snapshot, server.save as SaveConfig);
        await ctx.db.patch(server._id, { tickAnchorMs: now, updatedAt: now });
        ticked += 1;

        const refreshed = await ctx.db.get("jgGameServers", server._id);
        if (refreshed && (await flushServerIfDue(ctx, refreshed, now, runtime))) {
          saved += 1;
        }
      }

      return { ticked, saved };
    },
  });

  const flushDirtyServers = internalMutation({
    args: {},
    handler: async (ctx) => {
      const now = Date.now();
      const servers = await ctx.db.query("jgGameServers").collect();
      let saved = 0;

      for (const server of servers) {
        if (server.dirtyAt === undefined) continue;
        const runtime = resolveRuntime(registry, server.gameId);
        const snapshot = await loadServerSnapshot(ctx, server, runtime);
        await persistServerSnapshot(ctx, server, clearDirtyFlags(snapshot), server.save as SaveConfig);
        saved += 1;
        void now;
      }

      return { saved };
    },
  });

  return {
    joinServer,
    leaveServer,
    runCommand,
    flushSave,
    getServer,
    getPlayerProfile,
    getFeed,
    pushFeedEntry,
    listOpenServers,
    tickActiveServers,
    flushDirtyServers,
  };
}

const leaderboardScopeValidator = v.union(v.literal("global"), v.literal("server"), v.literal("profile"));
const MAX_LEADERBOARD_TOP_LIMIT = 100;

/** @internal */
export function createLeaderboardFunctions(options?: { auth?: JgAuthMode }) {
  void options;

  const getTop = query({
    args: {
      gameId: v.string(),
      stat: v.string(),
      scope: leaderboardScopeValidator,
      serverId: v.optional(v.id("jgGameServers")),
      limit: v.optional(v.number()),
      externalId: v.optional(v.string()),
    },
    returns: v.array(v.object({ userId: v.string(), value: v.number() })),
    handler: async (ctx, args) => {
      const limit = Math.min(Math.max(args.limit ?? MAX_LEADERBOARD_TOP_LIMIT, 1), MAX_LEADERBOARD_TOP_LIMIT);
      const ordered = ctx.db
        .query("jgLeaderboardRows")
        .withIndex("by_game_scope_stat_value", (q) =>
          q.eq("gameId", args.gameId).eq("scope", args.scope as LeaderboardScope).eq("stat", args.stat),
        )
        .order("desc");

      const rows =
        args.serverId !== undefined
          ? await ordered.filter((q) => q.eq(q.field("serverId"), args.serverId)).take(limit)
          : await ordered.take(limit);

      return rows.map((row) => ({ userId: row.userId, value: row.value }));
    },
  });

  const getProfile = query({
    args: {
      gameId: v.string(),
      userId: v.string(),
      externalId: v.optional(v.string()),
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

  const incrementMany = internalMutation({
    args: {
      gameId: v.string(),
      entries: v.array(
        v.object({
          userId: v.string(),
          stat: v.string(),
          scope: leaderboardScopeValidator,
          serverId: v.optional(v.id("jgGameServers")),
          by: v.number(),
        }),
      ),
    },
    returns: v.null(),
    handler: async (ctx, args) => {
      await applyLeaderboardIncrements(ctx, args.gameId, args.entries as LeaderboardIncrement[]);
      return null;
    },
  });

  return { getTop, getProfile, incrementMany };
}

/** @internal */
export function createPresenceFunctions(options?: {
  auth?: JgAuthMode;
  freshWindowMs?: number;
  poseRules?: PoseSyncRules;
}) {
  const mode: JgAuthMode = options?.auth ?? "required";
  const freshWindowMs = options?.freshWindowMs ?? 10_000;
  const poseRules = options?.poseRules ?? DEFAULT_CONVEX_POSE_RULES;

  const list = query({
    args: {
      serverId: v.string(),
      externalId: v.optional(v.string()),
    },
    returns: v.array(
      v.object({
        userId: v.string(),
        position: v.object({ x: v.number(), y: v.number(), z: v.number() }),
        rotationY: v.number(),
        rotationPitch: v.number(),
        lastSeenAt: v.number(),
      }),
    ),
    handler: async (ctx, args) => {
      const actorUserId = await resolveActor(ctx, args.externalId, mode);
      if (!actorUserId) return [];
      if ((await requireServerMember(ctx, args.serverId, actorUserId)) === null) return [];

      const threshold = Date.now() - freshWindowMs;
      const rows = await ctx.db
        .query("jgPoses")
        .withIndex("by_server", (q) => q.eq("serverId", args.serverId))
        .collect();

      return rows
        .filter((row) => row.updatedAt >= threshold)
        .map((row) => ({
          userId: row.userId,
          position: { x: row.x, y: row.y, z: row.z },
          rotationY: row.rotationY,
          rotationPitch: row.rotationPitch,
          lastSeenAt: row.updatedAt,
        }));
    },
  });

  const sync = mutation({
    args: {
      serverId: v.string(),
      pose: v.object({
        x: v.number(),
        y: v.number(),
        z: v.number(),
        rotationY: v.number(),
        rotationPitch: v.number(),
      }),
      externalId: v.optional(v.string()),
    },
    returns: v.null(),
    handler: async (ctx, args) => {
      const actorUserId = await resolveActor(ctx, args.externalId, mode);
      if (!actorUserId) return null;
      if ((await requireServerMember(ctx, args.serverId, actorUserId)) === null) return null;

      const now = Date.now();
      const existing = await ctx.db
        .query("jgPoses")
        .withIndex("by_server_and_user", (q) => q.eq("serverId", args.serverId).eq("userId", actorUserId))
        .unique();

      const current: PresencePoseState =
        existing === null
          ? spawnPresenceState(undefined, now, poseRules)
          : {
              position: { x: existing.x, y: existing.y, z: existing.z },
              rotationY: existing.rotationY,
              rotationPitch: existing.rotationPitch,
              lastSeenAtMs: existing.updatedAt,
            };

      const decision = decidePoseSync(
        current,
        {
          position: { x: args.pose.x, y: args.pose.y, z: args.pose.z },
          rotationY: args.pose.rotationY,
          rotationPitch: args.pose.rotationPitch,
        },
        poseRules,
        now,
      );

      const patch = {
        x: decision.position.x,
        y: decision.position.y,
        z: decision.position.z,
        rotationY: decision.rotationY,
        rotationPitch: decision.rotationPitch,
        updatedAt: now,
      };

      if (existing) {
        if (decision.changed || decision.refreshKeepAlive) {
          await ctx.db.patch(existing._id, patch);
        }
      } else {
        await ctx.db.insert("jgPoses", { serverId: args.serverId, userId: actorUserId, ...patch });
      }

      return null;
    },
  });

  const leave = mutation({
    args: {
      serverId: v.string(),
      externalId: v.optional(v.string()),
    },
    returns: v.null(),
    handler: async (ctx, args) => {
      const actorUserId = await resolveActor(ctx, args.externalId, mode);
      if (!actorUserId) return null;

      const existing = await ctx.db
        .query("jgPoses")
        .withIndex("by_server_and_user", (q) => q.eq("serverId", args.serverId).eq("userId", actorUserId))
        .unique();

      if (existing) await ctx.db.delete(existing._id);
      return null;
    },
  });

  return { list, sync, leave };
}

/** @internal */
export function createChatFunctions(options?: {
  auth?: JgAuthMode;
  historyLimit?: number;
  maxBodyLength?: number;
  minIntervalMs?: number;
}) {
  const mode: JgAuthMode = options?.auth ?? "required";
  const historyLimit = options?.historyLimit ?? 100;
  const maxBodyLength = options?.maxBodyLength ?? 500;
  const minIntervalMs = options?.minIntervalMs ?? 300;

  const messages = query({
    args: {
      serverId: v.string(),
      channelId: v.string(),
      externalId: v.optional(v.string()),
    },
    returns: v.array(
      v.object({
        id: v.string(),
        channelId: v.string(),
        fromUserId: v.string(),
        body: v.string(),
        at: v.number(),
      }),
    ),
    handler: async (ctx, args): Promise<ChatMessage[]> => {
      const actorUserId = await resolveActor(ctx, args.externalId, mode);
      if (!actorUserId) return [];
      if ((await requireServerMember(ctx, args.serverId, actorUserId)) === null) return [];

      const rows = await ctx.db
        .query("jgChatMessages")
        .withIndex("by_server_channel", (q) => q.eq("serverId", args.serverId).eq("channelId", args.channelId))
        .order("desc")
        .take(historyLimit);

      return rows
        .slice()
        .reverse()
        .map((row) => ({
          id: row._id,
          channelId: row.channelId,
          fromUserId: row.userId,
          body: row.body,
          at: row.at,
        }));
    },
  });

  const sendMessage = mutation({
    args: {
      serverId: v.string(),
      channelId: v.string(),
      body: v.string(),
      externalId: v.optional(v.string()),
    },
    returns: v.object({ ok: v.boolean(), reason: v.optional(v.string()) }),
    handler: async (ctx, args): Promise<ChatSendOutcome> => {
      const actorUserId = await resolveActor(ctx, args.externalId, mode);
      if (!actorUserId) return { ok: false, reason: "not signed in" };
      if ((await requireServerMember(ctx, args.serverId, actorUserId)) === null) {
        return { ok: false, reason: "not a member of this server" };
      }

      const body = args.body.trim();
      if (body.length === 0) return { ok: false, reason: "empty message" };
      if (body.length > maxBodyLength) return { ok: false, reason: "message too long" };

      const now = Date.now();
      const newestByActor = await ctx.db
        .query("jgChatMessages")
        .withIndex("by_server_channel", (q) => q.eq("serverId", args.serverId).eq("channelId", args.channelId))
        .order("desc")
        .filter((q) => q.eq(q.field("userId"), actorUserId))
        .first();

      if (newestByActor && now - newestByActor.at < minIntervalMs) {
        return { ok: false, reason: "sending too fast" };
      }

      await ctx.db.insert("jgChatMessages", {
        serverId: args.serverId,
        channelId: args.channelId,
        userId: actorUserId,
        body,
        at: now,
      });

      const recent = await ctx.db
        .query("jgChatMessages")
        .withIndex("by_server_channel", (q) => q.eq("serverId", args.serverId).eq("channelId", args.channelId))
        .order("desc")
        .take(historyLimit * 2 + 16);

      for (let i = historyLimit * 2; i < recent.length; i += 1) {
        await ctx.db.delete(recent[i]._id);
      }

      return { ok: true };
    },
  });

  return { messages, sendMessage };
}

export type JgCronSpec = {
  name: string;
  intervalSeconds: number;
  functionKey: "tickActiveServers" | "flushDirtyServers";
};

const JG_CRON_SPECS: readonly JgCronSpec[] = [
  { name: "jg tick", intervalSeconds: 1, functionKey: "tickActiveServers" },
  { name: "jg flush", intervalSeconds: 60, functionKey: "flushDirtyServers" },
];

/** @internal */
export function jgengineCronSpecs(): readonly JgCronSpec[] {
  return JG_CRON_SPECS;
}
