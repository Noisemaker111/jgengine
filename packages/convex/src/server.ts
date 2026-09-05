import {
  defineSchema,
  defineTable,
  internalMutationGeneric,
  mutationGeneric,
  queryGeneric,
} from "convex/server";
import type {
  Auth,
  FunctionReference,
  DataModelFromSchemaDefinition,
  DocumentByName,
  GenericMutationCtx,
  GenericQueryCtx,
  MutationBuilder,
  QueryBuilder,
} from "convex/server";
import type { GenericId } from "convex/values";
import { ConvexError, v } from "convex/values";
import { validateChatMessage, type ChatMessage } from "@jgengine/core/game/chat";
import type { LeaderboardScope } from "@jgengine/core/game/leaderboard";
import type { ChatSendOutcome } from "@jgengine/core/multiplayer/chatContract";
import {
  createFeedWriteGate,
  validateFeedWrite,
  type FeedWriteGate,
} from "@jgengine/core/multiplayer/feedWriteGate";
import {
  DEFAULT_POSE_SYNC_RULES,
  decidePoseSync,
  isPresenceExpired,
  pickReusablePresence,
  resolveActivePresence,
  spawnPresenceState,
  type PoseSyncRules,
  type PresencePoseState,
} from "@jgengine/core/multiplayer/presenceModel";
import type { CommandDef, CommandScope } from "@jgengine/core/runtime/commandRunner";
import { commandScopeEscape, scopeWithActor } from "@jgengine/core/runtime/commandRunner";
import type { GameRuntime } from "@jgengine/core/runtime/gameRuntime";
import { createGameRuntime, initialPlayerState } from "@jgengine/core/runtime/gameRuntime";
import type { GameServerRecord, LeaderboardIncrement, PlayerProfileRecord } from "@jgengine/core/runtime/hostPersistence";
import {
  buildHydratePlayers,
  planServerPersist,
  shouldAutoSave,
  trimFeedEntries,
} from "@jgengine/core/runtime/hostPersistence";
import {
  JG_MAX_MEMBERS_PER_SERVER,
  isListablePublicly,
  isPrivateJoinBlocked,
  isServerFull,
  isServerMember,
  selectJoinTarget,
  statusAfterLeave,
  validateSlotsPerServer,
  withJoinedMember,
  withoutMember,
  type MatchmakingMode,
} from "@jgengine/core/runtime/hostPolicy";
import type { SaveConfig } from "@jgengine/core/runtime/save";
import type { GameRuntimeSnapshot, RuntimeChunkRow, RuntimePlayerRow, RuntimeServerRow } from "@jgengine/core/runtime/snapshot";
import { createEmptyServerRow } from "@jgengine/core/runtime/snapshot";
import { chunkKeyAt, parseChunkKey, chunkKeysAround, DEFAULT_CHUNK_SIZE } from "@jgengine/core/runtime/worldChunks";
import { applyCommandWithOcc, commitIfRevisionMatch } from "./occ";

/** @internal Re-export shared host-policy pure helpers so existing convex imports keep working. */
export {
  JG_MAX_MEMBERS_PER_SERVER,
  canJoinPrivateServer,
  isListablePublicly,
  validateSlotsPerServer,
  type MatchmakingMode,
} from "@jgengine/core/runtime/hostPolicy";

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
      topology: v.optional(v.union(v.literal("shared"), v.literal("rooms"))),
      memberCount: v.optional(v.number()),
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
    })
      .index("by_game_and_status", ["gameId", "status"])
      .index("by_status", ["status"])
      .index("by_game_status_tick", ["gameId", "status", "tickAnchorMs"])
      .index("by_dirty", ["dirtyAt"]),
    jgServerCapacity: defineTable({
      serverId: v.id("jgGameServers"),
      gameId: v.string(),
      status: v.union(v.literal("open"), v.literal("running"), v.literal("closed")),
      mode: v.optional(v.string()),
      memberCount: v.number(),
      slotsPerServer: v.number(),
    }).index("by_server", ["serverId"]),
    jgServerMembers: defineTable({
      serverId: v.id("jgGameServers"),
      userId: v.string(),
      joinedAt: v.number(),
    }).index("by_server", ["serverId"]).index("by_server_and_user", ["serverId", "userId"]),
    jgRateLimits: defineTable({
      key: v.string(), startedAt: v.number(), count: v.number(), expiresAt: v.number(),
    }).index("by_key", ["key"]).index("by_expires", ["expiresAt"]),
    jgClientErrors: defineTable({
      userId: v.string(), message: v.string(), details: v.optional(v.any()), createdAt: v.number(),
    }).index("by_created", ["createdAt"]),
    jgPlayerProfiles: defineTable({
      userId: v.string(),
      gameId: v.string(),
      playerState: v.any(),
      sessionState: v.optional(v.any()),
      sessionServerId: v.optional(v.id("jgGameServers")),
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
      homeGameId: v.optional(v.string()),
      ownerActorId: v.optional(v.string()),
      lastWorldSnapshotAt: v.optional(v.number()),
      chunkKey: v.optional(v.string()),
      userId: v.string(),
      /** One row per live session, so a second tab is a second row rather than a fight over one. */
      sessionId: v.optional(v.string()),
      /** Actor class, e.g. `"player"` / `"agent"`, which selects the pose rules applied to it. */
      kind: v.optional(v.string()),
      /** Display name carried on the row, so nameplates need no per-frame join against users. */
      label: v.optional(v.string()),
      x: v.number(),
      y: v.number(),
      z: v.number(),
      rotationY: v.number(),
      rotationPitch: v.number(),
      updatedAt: v.number(),
      /** Set when the session was displaced or left; the reaper deletes the row once it goes idle. */
      revokedAt: v.optional(v.number()),
    })
      .index("by_server", ["serverId"])
      .index("by_server_and_user", ["serverId", "userId"])
      .index("by_server_and_chunk", ["serverId", "chunkKey"])
      .index("by_server_user_revoked_updated", ["serverId", "userId", "revokedAt", "updatedAt"])
      .index("by_updated", ["updatedAt"])
      .index("by_user", ["userId"])
      .index("by_home_game", ["homeGameId"])
      .index("by_home_game_revoked_updated", ["homeGameId", "revokedAt", "updatedAt"])
      .index("by_revoked", ["revokedAt"])
      .index("by_revoked_updated", ["revokedAt", "updatedAt"]),
    jgChatMessages: defineTable({
      serverId: v.string(),
      channelId: v.string(),
      userId: v.string(),
      body: v.string(),
      authorName: v.optional(v.string()),
      at: v.number(),
    }).index("by_server_channel", ["serverId", "channelId", "at"]).index("by_at", ["at"]),
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
    })
      .index("by_game_and_server", ["gameId", "serverId"])
      .index("by_tick_anchor", ["tickAnchorMs"]),
  };
}

const schemaForTypes = defineSchema(jgengineTables());
/** Data model of the {@link jgengineTables} schema — the shape a host's own Convex ctx must satisfy to
 * call the exported persistence helpers. */
export type JGDataModel = DataModelFromSchemaDefinition<typeof schemaForTypes>;
/** Read-only context accepted by engine host queries. */
export type JGQueryCtx = GenericQueryCtx<JGDataModel>;
/** Mutation ctx accepted by {@link loadServerSnapshot} / {@link persistServerSnapshot}. */
export type JGMutationCtx = GenericMutationCtx<JGDataModel>;
const query = queryGeneric as QueryBuilder<JGDataModel, "public">;
const mutation = mutationGeneric as MutationBuilder<JGDataModel, "public">;
const internalMutation = internalMutationGeneric as MutationBuilder<JGDataModel, "internal">;

/** A `jgGameServers` row — the server handle the persistence helpers load from and write back to. */
export type ServerDoc = DocumentByName<JGDataModel, "jgGameServers">;

export type JgAuthMode = "anonymous" | "required";

export const DEFAULT_CONVEX_POSE_RULES: PoseSyncRules = DEFAULT_POSE_SYNC_RULES;

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

async function hasMember(ctx: JGQueryCtx | JGMutationCtx, server: ServerDoc, userId: string): Promise<boolean> {
  if (server.memberUserIds.includes(userId)) return true;
  if (server.topology !== "shared") return false;
  return (await ctx.db.query("jgServerMembers")
    .withIndex("by_server_and_user", q => q.eq("serverId", server._id).eq("userId", userId)).unique()) !== null;
}

async function requireServerMember(
  ctx: JGQueryCtx | JGMutationCtx,
  serverId: string,
  actorUserId: string,
): Promise<ServerDoc | null> {
  const server = await ctx.db.get("jgGameServers", serverId as GenericId<"jgGameServers">);
  if (!server) return null;
  if (!(await hasMember(ctx, server, actorUserId))) return null;
  return server;
}

/** Resolve the acting user for a mutation, throwing the standard error when unauthenticated.
 * @internal
 */
async function requireActor(
  ctx: { auth: Auth },
  externalId: string | undefined,
  mode: JgAuthMode,
): Promise<string> {
  const actorUserId = await resolveActor(ctx, externalId, mode);
  if (!actorUserId) throw new ConvexError("Not authenticated");
  return actorUserId;
}

/**
 * Resolve the actor and confirm server membership, invoking `fn` only when both hold and yielding
 * `deniedResult` for every denial (unauthenticated or non-member). The uniform-denial path shared by
 * the read handlers whose not-authenticated and not-member cases return the same value.
 * @internal
 */
async function withMember<T>(
  ctx: JGQueryCtx | JGMutationCtx,
  mode: JgAuthMode,
  args: { serverId: string; externalId?: string },
  deniedResult: T,
  fn: (server: ServerDoc, actorUserId: string) => Promise<T> | T,
): Promise<T> {
  const actorUserId = await resolveActor(ctx, args.externalId, mode);
  if (!actorUserId) return deniedResult;
  const server = await requireServerMember(ctx, args.serverId, actorUserId);
  if (server === null) return deniedResult;
  return fn(server, actorUserId);
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

async function serverCapacity(ctx: JGQueryCtx | JGMutationCtx, server: ServerDoc) {
  return server.topology === "shared"
    ? ctx.db.query("jgServerCapacity").withIndex("by_server", q => q.eq("serverId", server._id)).unique()
    : null;
}

async function ensureServerCapacity(ctx: JGMutationCtx, server: ServerDoc) {
  const existing = await serverCapacity(ctx, server);
  if (existing) return existing;
  const id = await ctx.db.insert("jgServerCapacity", {
    serverId: server._id, gameId: server.gameId, status: server.status, mode: server.mode,
    memberCount: server.memberCount ?? server.memberUserIds.length, slotsPerServer: server.slotsPerServer,
  });
  return (await ctx.db.get("jgServerCapacity", id))!;
}

/**
 * How much of a server to hydrate. Both fields default to "everything", which is a document read per
 * member plus one per chunk — the cost that makes a large shared world unaffordable per mutation.
 * Narrow them when the caller knows what it will touch: a command that only moves the actor's own
 * state needs `players: [actorUserId]`, and a spatial edit needs only the chunk keys it writes
 * (`chunkKeysInRadius` from `@jgengine/core/runtime/worldChunks`).
 *
 * Persisting a narrowed snapshot is safe: the plan merges session state over the stored map and
 * writes only dirty profiles and dirty chunks, so members and chunks left unhydrated are untouched.
 *
 * The registered `runCommand` mutation takes one, and a {@link CommandDef} can derive its own from
 * its input via `scope`, so a game gets bounded hydration without writing its own mutation.
 */
export type LoadSnapshotScope = CommandScope;

/**
 * Hydrate a server's `GameRuntimeSnapshot` from its row, its members' profiles, and its world chunks.
 * Reach for it when writing your own mutation that must read runtime state before touching host tables.
 * Pass a {@link LoadSnapshotScope} to bound the read instead of loading the whole world.
 * @capability convex-load-server-snapshot read a hosted server's runtime snapshot inside a host-written Convex mutation
 */
export async function loadServerSnapshot(
  ctx: JGMutationCtx,
  server: ServerDoc,
  runtime: GameRuntime,
  scope?: LoadSnapshotScope,
): Promise<GameRuntimeSnapshot> {
  const profiles: Record<string, PlayerProfileRecord | null> = {};
  const memberIds = new Set(server.memberUserIds);
  let hydrateUserIds: string[];
  if (server.topology === "shared") {
    const requested = scope?.players ?? (await ctx.db.query("jgServerMembers")
      .withIndex("by_server", q => q.eq("serverId", server._id)).collect()).map(row => row.userId);
    hydrateUserIds = [];
    for (const userId of new Set(requested)) if (await hasMember(ctx, server, userId)) hydrateUserIds.push(userId);
  } else {
    hydrateUserIds = scope?.players === undefined ? server.memberUserIds : scope.players.filter(userId => memberIds.has(userId));
  }
  const sessionPlayers: Record<string, RuntimePlayerRow> = {};

  for (const userId of hydrateUserIds) {
    const profile = await ctx.db
      .query("jgPlayerProfiles")
      .withIndex("by_user_and_game", (q) => q.eq("userId", userId).eq("gameId", server.gameId))
      .unique();

    if (server.topology === "shared" && profile) {
      sessionPlayers[userId] = { ...profile.playerState, ...(profile.sessionServerId === server._id ? { session: profile.sessionState ?? {} } : { session: {} }) };
    }
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

  const playersByUserId = buildHydratePlayers(server.topology === "shared" ? { ...serverDocToRecord(server), memberUserIds: hydrateUserIds, sessionPlayers } : serverDocToRecord(server), profiles, hydrateUserIds);

  const chunksByKey: Record<string, RuntimeChunkRow> = {};
  if (scope?.chunkKeys === undefined) {
    const chunks = await ctx.db
      .query("jgWorldChunks")
      .withIndex("by_server", (q) => q.eq("serverId", server._id))
      .collect();
    for (const chunk of chunks) chunksByKey[chunk.chunkKey] = chunk.snapshot as RuntimeChunkRow;
  } else {
    for (const chunkKey of new Set(scope.chunkKeys)) {
      const chunk = await ctx.db
        .query("jgWorldChunks")
        .withIndex("by_server_and_chunk", (q) => q.eq("serverId", server._id).eq("chunkKey", chunkKey))
        .unique();
      if (chunk) chunksByKey[chunk.chunkKey] = chunk.snapshot as RuntimeChunkRow;
    }
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

/**
 * Write a snapshot back: server row, dirty player profiles, dirty chunks, and drained leaderboard
 * increments, all under `save`. Pair it with your own table writes to keep both in one transaction.
 *
 * A persist that would change nothing writes nothing and returns `false`. That matters beyond write
 * cost: every subscriber of a query that read this row re-receives the whole result when the document
 * changes, so an unconditional write on a 1 Hz tick re-pushes the entire world to every client once a
 * second whether or not anything moved.
 * @capability convex-persist-server-snapshot write runtime state and host tables in one Convex transaction
 */
export async function persistServerSnapshot(
  ctx: JGMutationCtx,
  server: ServerDoc,
  snapshot: GameRuntimeSnapshot,
  save: SaveConfig,
): Promise<boolean> {
  const now = Date.now();
  const shared = server.topology === "shared";
  const record = serverDocToRecord(server);
  const plan = planServerPersist(shared ? { ...record, memberUserIds: Object.keys(snapshot.players), sessionPlayers: {} } : record, snapshot, save, now);
  if (!plan.changed.any) return false;

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
      ...(shared ? { sessionState: snapshot.players[profile.userId]?.session ?? {}, sessionServerId: server._id } : {}),
      revision: profile.revision,
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

  if (shared) {
    const persisted = new Set(plan.profiles.map(profile => profile.userId));
    for (const userId of snapshot.dirty.players) {
      if (persisted.has(userId)) continue;
      const player = snapshot.players[userId];
      if (!player) continue;
      const existing = await ctx.db.query("jgPlayerProfiles").withIndex("by_user_and_game", q => q.eq("userId", userId).eq("gameId", server!.gameId)).unique();
      const patch = { playerState: player, sessionState: player.session, sessionServerId: server._id, revision: snapshot.revision, updatedAt: now };
      if (existing) await ctx.db.patch(existing._id, patch);
      else await ctx.db.insert("jgPlayerProfiles", { userId, gameId: server.gameId, createdAt: now, ...patch });
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

  if (!shared || plan.changed.serverState) await ctx.db.patch(server._id, {
    ...(plan.changed.serverState ? { serverState: plan.server.serverState } : {}),
    ...(!shared && plan.changed.sessionPlayers ? { sessionPlayers: plan.server.sessionPlayers } : {}),
    revision: plan.server.revision,
    dirtyAt: plan.server.dirtyAt,
    updatedAt: plan.server.updatedAt,
    lastSavedAt: plan.server.lastSavedAt,
  });
  return true;
}

/** Autosave a server whose `save.auto` interval has elapsed, reusing an already-hydrated snapshot. */
async function flushServerIfDue(
  ctx: JGMutationCtx,
  server: ServerDoc,
  now: number,
  _runtime: GameRuntime,
  loaded?: GameRuntimeSnapshot,
): Promise<boolean> {
  if (!shouldAutoSave(server.save as SaveConfig, server.dirtyAt, server.lastSavedAt, now)) {
    return false;
  }

  if (loaded) await persistServerSnapshot(ctx, server, loaded, server.save as SaveConfig);
  await ctx.db.patch(server._id, { dirtyAt: undefined, lastSavedAt: now });
  return true;
}

export const JG_RUNTIME_TICK_MS = 1_000;

/** Outcome of a runtime command: applied, or refused with a reason (unknown server, non-member, validation, revision conflict). */
export type RunCommandOutcome = { ok: true } | { ok: false; reason: string };

/** Arguments of the `runCommand` mutation, and of the equivalent {@link GameServerHelpers.runCommand} helper. */
export type RunCommandArgs = {
  serverId: string;
  command: string;
  input: unknown;
  externalId?: string;
  /**
   * How much of the server to hydrate before applying the command. Overrides whatever the
   * {@link CommandDef} declares through its own `scope`; omit both to hydrate the whole world.
   */
  scope?: LoadSnapshotScope;
  /** Trusted host override after game-specific authorization; never forward a client-supplied actor. */
  actorUserId?: string;
  beforePersist?: (ctx: JGMutationCtx, loaded: LoadedServerSnapshot) => Promise<void>;
};

/** A server resolved for runtime work: its row, its registered runtime, and its hydrated snapshot. */
export type LoadedServerSnapshot = {
  server: ServerDoc;
  runtime: GameRuntime;
  snapshot: GameRuntimeSnapshot;
};

/**
 * The plain-function half of {@link createGameServerFunctions}, bound to the same runtime registry and
 * auth mode as its mutations. Reach for it when a host mutation must pair snapshot work with its own
 * table writes in one transaction, which a pre-registered mutation cannot do.
 */
export type GameServerHelpers = {
  ensureServer: (ctx: JGMutationCtx, gameId: string) => Promise<ServerDoc>;
  loadSnapshot: (
    ctx: JGMutationCtx,
    serverId: string,
    scope?: LoadSnapshotScope,
  ) => Promise<LoadedServerSnapshot | null>;
  applyCommand: (args: {
    gameId: string;
    loadedRevision: number;
    currentRevision: number;
    snapshot: GameRuntimeSnapshot;
    actorUserId: string;
    command: string;
    input: unknown;
  }) => { ok: true; snapshot: GameRuntimeSnapshot } | { ok: false; reason: string };
  persistSnapshot: (
    ctx: JGMutationCtx,
    server: ServerDoc,
    snapshot: GameRuntimeSnapshot,
    save?: SaveConfig,
  ) => Promise<boolean>;
  runCommand: (ctx: JGMutationCtx, args: RunCommandArgs) => Promise<RunCommandOutcome>;
  resetPlayerProfile: (ctx: JGMutationCtx, serverId: string, userId: string) => Promise<RuntimePlayerRow>;
};

/** How many running servers one `tickActiveServers` transaction may hydrate, tick, and persist. */
export const DEFAULT_MAX_SERVERS_PER_TICK = 32;

/** How many chunk rows one `getChunks` call may return. */
export const MAX_CHUNKS_PER_QUERY = 64;

/**
 * Build the hosted-server Convex functions for a set of game runtimes.
 *
 * Room topology keeps its roster and session map in the server document and caps capacity at
 * {@link JG_MAX_MEMBERS_PER_SERVER}. Shared topology stores membership, capacity, and per-player
 * session state separately; player-only commands and roster changes do not rewrite the world row.
 * World geometry that outgrows one row belongs in `jgWorldChunks`, hydrated by key
 * ({@link LoadSnapshotScope}) and read by clients through `getChunks` — not in `serverState`.
 *
 * `matchmaking: "singleton"` makes auto-match target one shared world per game: a join past capacity
 * fails loudly instead of quietly starting a second world the player would be alone in.
 * @internal
 */
export function createGameServerFunctions(options?: {
  runtimes?: GameRuntime[];
  auth?: JgAuthMode;
  slotsPerServer?: number;
  topology?: "shared" | "rooms";
  matchmaking?: MatchmakingMode;
  maxServersPerTick?: number;
  allowedFeedActions?: readonly string[];
}) {
  const mode: JgAuthMode = options?.auth ?? "required";
  const shared = options?.topology === "shared" || (options?.topology === undefined && (options?.runtimes?.some(runtime => runtime.topology === "shared") ?? false));
  const hostSlotsPerServer = shared ? Number.MAX_SAFE_INTEGER : options?.slotsPerServer ?? 16;
  const slotsCheck = validateSlotsPerServer(hostSlotsPerServer, shared ? "shared" : "rooms");
  if (!slotsCheck.ok) throw new Error(slotsCheck.reason);
  const matchmaking: MatchmakingMode = options?.matchmaking ?? (shared ? "singleton" : "auto");
  const maxServersPerTick = Math.max(1, options?.maxServersPerTick ?? DEFAULT_MAX_SERVERS_PER_TICK);
  const feedWriteGate: FeedWriteGate = createFeedWriteGate(options?.allowedFeedActions ?? []);
  const registry = buildRuntimeRegistry(options?.runtimes);
  const tickableGameIds = (options?.runtimes ?? [])
    .filter((runtime) => runtime.hasTick)
    .map((runtime) => runtime.gameId);

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
    returns: v.union(v.object({ ok: v.literal(true), serverId: v.id("jgGameServers"), isNew: v.boolean() }), v.object({ ok: v.literal(false), reason: v.union(v.literal("full"), v.literal("closed"), v.literal("unauthorized")) })),
    handler: async (ctx, args) => {
      const actorUserId = await resolveActor(ctx, args.externalId, mode);
      if (!actorUserId) return { ok: false as const, reason: "unauthorized" as const };

      const now = Date.now();
      const runtime = resolveRuntime(registry, args.gameId);
      const save = runtime.save as SaveConfig;
      const slotsPerServer = hostSlotsPerServer;

      let server =
        args.serverId !== undefined ? await ctx.db.get("jgGameServers", args.serverId) : null;

      if (args.serverId !== undefined && !server) {
        return { ok: false as const, reason: "closed" as const };
      }

      if (server && server.gameId !== args.gameId) {
        return { ok: false as const, reason: "unauthorized" as const };
      }

      if (server?.status === "closed") return { ok: false as const, reason: "closed" as const };
      let mayCreate = true;
      if (!server) {
        const joinable = [];
        for (const status of ["running", "open"] as const) {
          const rows = await ctx.db
            .query("jgGameServers")
            .withIndex("by_game_and_status", (q) => q.eq("gameId", args.gameId).eq("status", status))
            .take(100);
          joinable.push(...rows);
        }
        // Two concurrent first-joins can both see an empty list here and both insert. Convex's OCC
        // resolves it — the loser's read set is invalidated and its mutation retries against the
        // winner's row — so the engine adds no lock. A `HostPersistence` backend without
        // serializable-snapshot retry must supply that guarantee itself.
        const target = selectJoinTarget(joinable, {
          userId: actorUserId,
          mode: matchmaking,
          slotsPerServer,
        });
        if (target.kind === "refuse") return { ok: false as const, reason: "full" as const };
        server = target.kind === "join" ? target.row : null;
        mayCreate = target.kind === "create";
      }

      if (!server && mayCreate) {
        const serverId = await ctx.db.insert("jgGameServers", {
          gameId: args.gameId,
          status: "running",
          mode: args.mode,
          modeConfig: args.modeConfig,
          visibility: args.visibility ?? "public",
          joinCode: args.joinCode,
          topology: shared ? "shared" : "rooms",
          memberCount: 0,
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

      if (!server) throw new ConvexError("No joinable server");

      // Capacity and save policy live in host options, not in the row. Without this a long-lived
      // world keeps whatever it was created with and raising the host option silently does nothing.
      if (server.slotsPerServer !== slotsPerServer || JSON.stringify(server.save) !== JSON.stringify(save)) {
        await ctx.db.patch(server._id, { slotsPerServer, save, updatedAt: now });
        const reconciled = await ctx.db.get("jgGameServers", server._id);
        if (!reconciled) throw new ConvexError("Server missing after reconcile");
        server = reconciled;
      }

      if (!shared && isServerFull(server.memberUserIds, server.slotsPerServer, actorUserId)) {
        return { ok: false as const, reason: "full" as const };
      }

      if (
        isPrivateJoinBlocked({
          visibility: server.visibility,
          memberUserIds: await hasMember(ctx, server, actorUserId) ? [actorUserId] : [],
          userId: actorUserId,
          joinCode: server.joinCode,
          suppliedCode: args.joinCode,
        })
      ) {
        return { ok: false as const, reason: "unauthorized" as const };
      }

      let profile = await ctx.db
        .query("jgPlayerProfiles")
        .withIndex("by_user_and_game", (q) => q.eq("userId", actorUserId).eq("gameId", args.gameId))
        .unique();

      if (shared && server.topology !== "shared") {
        for (const userId of server.memberUserIds) {
          const member = await ctx.db.query("jgServerMembers").withIndex("by_server_and_user", q => q.eq("serverId", server!._id).eq("userId", userId)).unique();
          if (!member) await ctx.db.insert("jgServerMembers", { serverId: server._id, userId, joinedAt: now });
          const state = (server.sessionPlayers as Record<string, RuntimePlayerRow>)[userId];
          if (!state) continue;
          const stored = await ctx.db.query("jgPlayerProfiles").withIndex("by_user_and_game", q => q.eq("userId", userId).eq("gameId", server!.gameId)).unique();
          const patch = { sessionState: state.session ?? {}, sessionServerId: server._id };
          if (stored) await ctx.db.patch(stored._id, patch);
          else await ctx.db.insert("jgPlayerProfiles", { userId, gameId: server.gameId, playerState: state, revision: server.revision, createdAt: now, updatedAt: now, ...patch });
        }
        await ctx.db.patch(server._id, { topology: "shared", memberCount: server.memberUserIds.length, memberUserIds: [], sessionPlayers: {} });
        server = (await ctx.db.get("jgGameServers", server._id))!;
        profile = await ctx.db.query("jgPlayerProfiles").withIndex("by_user_and_game", q => q.eq("userId", actorUserId).eq("gameId", args.gameId)).unique();
      }
      const isNew = profile === null;
      const memberUserIds = withJoinedMember(server.memberUserIds, actorUserId);

      if (shared) {
        const capacity = await ensureServerCapacity(ctx, server);
        const isMember = await hasMember(ctx, server, actorUserId);
        await ctx.db.patch(capacity._id, {
          memberCount: capacity.memberCount + (isMember ? 0 : 1), status: "running", slotsPerServer,
        });
        if (!isMember) await ctx.db.insert("jgServerMembers", { serverId: server._id, userId: actorUserId, joinedAt: now });
        if (server.status !== "running") await ctx.db.patch(server._id, { status: "running" });
      } else {
        await ctx.db.patch(server._id, { memberUserIds, status: "running", updatedAt: now });
      }

      const refreshed = await ctx.db.get("jgGameServers", server._id);
      if (!refreshed) throw new ConvexError("Server missing after join");

      let snapshot = await loadServerSnapshot(
        ctx,
        refreshed,
        runtime,
        scopeWithActor(runtime.joinScope(actorUserId, isNew), actorUserId),
      );
      snapshot = runtime.joinPlayer(snapshot, actorUserId, isNew, now);
      await persistServerSnapshot(ctx, refreshed, snapshot, save);

      return { ok: true as const, serverId: refreshed._id, isNew };
    },
  });

  const leaveServer = mutation({
    args: {
      serverId: v.id("jgGameServers"),
      externalId: v.optional(v.string()),
    },
    returns: v.null(),
    handler: async (ctx, args) => {
      const actorUserId = await requireActor(ctx, args.externalId, mode);

      const server = await requireServerMember(ctx, args.serverId, actorUserId);
      if (server === null) return null;

      const now = Date.now();
      const runtime = resolveRuntime(registry, server.gameId);
      // Flushes the leaver's own state before the roster drops them; nobody else's rows are touched.
      const snapshot = await loadServerSnapshot(ctx, server, runtime, {
        players: [actorUserId],
        chunkKeys: [],
      });
      await persistServerSnapshot(ctx, server, snapshot, server.save as SaveConfig);

      const memberUserIds = withoutMember(server.memberUserIds, actorUserId);
      const sessionPlayers = { ...(server.sessionPlayers as Record<string, unknown>) };
      delete sessionPlayers[actorUserId];

      if (server.topology === "shared") {
        const member = await ctx.db.query("jgServerMembers").withIndex("by_server_and_user", q => q.eq("serverId", server._id).eq("userId", actorUserId)).unique();
        if (member) {
          const capacity = await ensureServerCapacity(ctx, server);
          await ctx.db.delete(member._id);
          await ctx.db.patch(capacity._id, { memberCount: Math.max(0, capacity.memberCount - 1) });
          const profile = await ctx.db.query("jgPlayerProfiles").withIndex("by_user_and_game", q => q.eq("userId", actorUserId).eq("gameId", server.gameId)).unique();
          if (profile?.sessionServerId === server._id) await ctx.db.patch(profile._id, { sessionState: {}, sessionServerId: undefined });
        }
      } else {
        await ctx.db.patch(server._id, { memberUserIds, sessionPlayers, updatedAt: now, status: statusAfterLeave(memberUserIds.length, server.status) });
      }

      const poses = await ctx.db
        .query("jgPoses")
        .withIndex("by_server_and_user", (q) =>
          q.eq("serverId", args.serverId).eq("userId", actorUserId),
        )
        .collect();
      for (const pose of poses) await ctx.db.delete(pose._id);

      return null;
    },
  });

  const helpers: GameServerHelpers = {
    async ensureServer(ctx, gameId) {
      if (!shared || matchmaking !== "singleton") throw new Error("ensureServer requires a shared singleton host");
      for (const status of ["running", "open"] as const) {
        const existing = await ctx.db.query("jgGameServers").withIndex("by_game_and_status", q => q.eq("gameId", gameId).eq("status", status)).first();
        if (existing) return existing;
      }
      const runtime = resolveRuntime(registry, gameId);
      const now = Date.now();
      const id = await ctx.db.insert("jgGameServers", {
        gameId, topology: "shared", status: "running", memberUserIds: [], slotsPerServer: hostSlotsPerServer,
        save: runtime.save, serverState: defaultServerStateForGame(gameId), sessionPlayers: {}, revision: 0,
        tickAnchorMs: now, createdAt: now, updatedAt: now,
      });
      const server = (await ctx.db.get("jgGameServers", id))!;
      await ensureServerCapacity(ctx, server);
      return server;
    },
    async resetPlayerProfile(ctx, serverId, userId) {
      const server = await requireServerMember(ctx, serverId, userId);
      if (!server) throw new ConvexError("Not a member of this server");
      const state = initialPlayerState(resolveRuntime(registry, server.gameId), userId);
      const profile = await ctx.db.query("jgPlayerProfiles").withIndex("by_user_and_game", q => q.eq("userId", userId).eq("gameId", server!.gameId)).unique();
      const now = Date.now();
      const patch = { playerState: state, sessionState: state.session, sessionServerId: server._id, revision: (profile?.revision ?? 0) + 1, updatedAt: now };
      if (profile) await ctx.db.patch(profile._id, patch);
      else await ctx.db.insert("jgPlayerProfiles", { userId, gameId: server.gameId, createdAt: now, ...patch });
      if (server.topology !== "shared") await ctx.db.patch(server._id, { sessionPlayers: { ...server.sessionPlayers, [userId]: state } });
      return state;
    },
    async loadSnapshot(ctx, serverId, scope) {
      const server = await ctx.db.get("jgGameServers", serverId as GenericId<"jgGameServers">);
      if (!server) return null;
      const runtime = resolveRuntime(registry, server.gameId);
      return { server, runtime, snapshot: await loadServerSnapshot(ctx, server, runtime, scope) };
    },
    applyCommand(args) {
      return applyCommandWithOcc({ ...args, runtime: resolveRuntime(registry, args.gameId) });
    },
    persistSnapshot(ctx, server, snapshot, save) {
      return persistServerSnapshot(ctx, server, snapshot, save ?? (server.save as SaveConfig));
    },
    async runCommand(ctx, args): Promise<RunCommandOutcome> {
      const actorUserId = args.actorUserId ?? await requireActor(ctx, args.externalId, mode);

      const serverId = args.serverId as GenericId<"jgGameServers">;
      const server = await ctx.db.get("jgGameServers", serverId);
      if (!server) {
        return { ok: false as const, reason: "Server not found" };
      }
      if (!(await hasMember(ctx, server, actorUserId))) {
        return { ok: false as const, reason: "Not a member of this server" };
      }

      const loadedRevision = server.revision;
      const runtime = resolveRuntime(registry, server.gameId);
      const scope = scopeWithActor(
        args.scope ?? runtime.commandScope(args.command, args.input, actorUserId),
        actorUserId,
      );
      const snapshot = await loadServerSnapshot(ctx, server, runtime, scope);
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

      const escape = commandScopeEscape(scope, result.snapshot.dirty, args.command);
      if (escape !== null) {
        return { ok: false as const, reason: escape };
      }

      const latest = await ctx.db.get("jgGameServers", serverId);
      if (!latest) {
        return { ok: false as const, reason: "Server not found" };
      }
      const commit = commitIfRevisionMatch(loadedRevision, latest.revision);
      if (!commit.ok) {
        return commit;
      }

      await args.beforePersist?.(ctx, { server: latest, runtime, snapshot: result.snapshot });
      const callbackEscape = commandScopeEscape(scope, result.snapshot.dirty, args.command);
      if (callbackEscape !== null) throw new ConvexError(callbackEscape);
      await persistServerSnapshot(ctx, latest, result.snapshot, latest.save as SaveConfig);
      return { ok: true as const };
    },
  };

  const runCommand = mutation({
    args: {
      serverId: v.id("jgGameServers"),
      command: v.string(),
      input: v.any(),
      externalId: v.optional(v.string()),
      scope: v.optional(
        v.object({
          players: v.optional(v.array(v.string())),
          chunkKeys: v.optional(v.array(v.string())),
        }),
      ),
    },
    returns: v.union(
      v.object({ ok: v.literal(true) }),
      v.object({ ok: v.literal(false), reason: v.string() }),
    ),
    handler: (ctx, args) => helpers.runCommand(ctx, { serverId: args.serverId, command: args.command, input: args.input, externalId: args.externalId }),
  });

  const flushSave = mutation({
    args: {
      serverId: v.id("jgGameServers"),
      externalId: v.optional(v.string()),
    },
    returns: v.boolean(),
    handler: async (ctx, args) => {
      const actorUserId = await requireActor(ctx, args.externalId, mode);

      const server = await requireServerMember(ctx, args.serverId, actorUserId);
      if (server === null) return false;

      await ctx.db.patch(server._id, { dirtyAt: undefined, lastSavedAt: Date.now() });
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
    handler: (ctx, args) =>
      withMember(ctx, mode, args, null, (server, actorUserId) => {
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
      }),
  });

  /**
   * Lobby-scale view of a server: status, capacity, revision — no world state. Subscribe a menu,
   * roster, or "is it up" indicator to this instead of `getServer`, whose payload is the whole world.
   */
  const getServerMeta = query({
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
        memberCount: v.number(),
        slotsPerServer: v.number(),
      }),
      v.null(),
    ),
    handler: (ctx, args) =>
      withMember(ctx, mode, args, null, async (server) => ({
        _id: server._id,
        gameId: server.gameId,
        status: server.status,
        mode: server.mode,
        memberCount: (await serverCapacity(ctx, server))?.memberCount ?? server.memberCount ?? server.memberUserIds.length,
        slotsPerServer: server.slotsPerServer,
      })),
  });

  const getServerCapacity = query({
    args: { serverId: v.id("jgGameServers"), externalId: v.optional(v.string()) },
    returns: v.union(v.object({
      _id: v.id("jgGameServers"), gameId: v.string(),
      status: v.union(v.literal("open"), v.literal("running"), v.literal("closed")),
      mode: v.optional(v.string()), memberCount: v.number(), slotsPerServer: v.number(),
    }), v.null()),
    handler: async (ctx, args) => {
      const actor = await resolveActor(ctx, args.externalId, mode);
      if (!actor) return null;
      const capacity = await ctx.db.query("jgServerCapacity").withIndex("by_server", q => q.eq("serverId", args.serverId)).unique();
      if (capacity) {
        const member = await ctx.db.query("jgServerMembers").withIndex("by_server_and_user", q => q.eq("serverId", args.serverId).eq("userId", actor)).unique();
        if (!member) return null;
        return { _id: capacity.serverId, gameId: capacity.gameId, status: capacity.status, mode: capacity.mode, memberCount: capacity.memberCount, slotsPerServer: capacity.slotsPerServer };
      }
      const server = await requireServerMember(ctx, args.serverId, actor);
      return server ? { _id: server._id, gameId: server.gameId, status: server.status, mode: server.mode, memberCount: server.memberUserIds.length, slotsPerServer: server.slotsPerServer } : null;
    },
  });

  /**
   * Read world chunks by key — the client half of the chunk escape hatch. Without it a game that moved
   * geometry out of `serverState` had no way to show it, because `getServer` returns only the row.
   * Bounded to {@link MAX_CHUNKS_PER_QUERY} keys; ask for the cells around the viewer
   * (`chunkKeysInRadius`), not the world.
   */
  const getChunks = query({
    args: {
      serverId: v.id("jgGameServers"),
      chunkKeys: v.array(v.string()),
      externalId: v.optional(v.string()),
    },
    returns: v.array(v.object({ chunkKey: v.string(), snapshot: v.any(), updatedAt: v.number() })),
    handler: (ctx, args) =>
      withMember(
        ctx,
        mode,
        args,
        [] as { chunkKey: string; snapshot: unknown; updatedAt: number }[],
        async (server) => {
          const keys = [...new Set(args.chunkKeys)].slice(0, MAX_CHUNKS_PER_QUERY);
          const out: { chunkKey: string; snapshot: unknown; updatedAt: number }[] = [];
          for (const chunkKey of keys) {
            const row = await ctx.db
              .query("jgWorldChunks")
              .withIndex("by_server_and_chunk", (q) =>
                q.eq("serverId", server._id).eq("chunkKey", chunkKey),
              )
              .unique();
            if (row) out.push({ chunkKey: row.chunkKey, snapshot: row.snapshot, updatedAt: row.updatedAt });
          }
          return out;
        },
      ),
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
      return withMember(ctx, mode, args, [] as unknown[], async () => {
        const row = await ctx.db
          .query("jgFeedBuffers")
          .withIndex("by_server_and_action", (q) => q.eq("serverId", args.serverId).eq("action", args.action))
          .unique();

        return row?.entries ?? [];
      });
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
      const actorUserId = await requireActor(ctx, args.externalId, mode);

      const allowed = validateFeedWrite(feedWriteGate, args.action);
      if (!allowed.ok) {
        throw new ConvexError(allowed.reason);
      }

      const server = await ctx.db.get("jgGameServers", args.serverId);
      if (!server || !isServerMember(server.memberUserIds, actorUserId)) {
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
      const limit = args.limit ?? 20;
      const rows = await ctx.db
        .query("jgGameServers")
        .withIndex("by_game_and_status", (q) => q.eq("gameId", args.gameId).eq("status", "running"))
        .take(Math.min(limit * 4, 200));

      return Promise.all(rows
        .filter((row) => isListablePublicly(row.visibility))
        .slice(0, limit)
        .map(async (row) => ({
          _id: row._id,
          status: row.status,
          memberCount: (await serverCapacity(ctx, row))?.memberCount ?? row.memberCount ?? row.memberUserIds.length,
          slotsPerServer: row.slotsPerServer,
          mode: row.mode,
          updatedAt: row.updatedAt,
        })));
    },
  });

  // Only games that declare `loop.onTick` are swept, and only `maxServersPerTick` of their servers per
  // transaction, oldest anchor first. A game with no tick hook used to pay a full hydrate + persist per
  // running server per second to hand `runtime.tick` a snapshot it returned unchanged; now it pays
  // nothing, and no single transaction can fan out across every world of every game.
  const tickActiveServers = internalMutation({
    args: {},
    handler: async (ctx) => {
      const now = Date.now();
      let ticked = 0;
      let saved = 0;
      let budget = maxServersPerTick;

      for (const gameId of tickableGameIds) {
        if (budget <= 0) break;
        const servers = await ctx.db
          .query("jgGameServers")
          .withIndex("by_game_status_tick", (q) => q.eq("gameId", gameId).eq("status", "running"))
          .take(budget);

        for (const server of servers) {
          if (((await serverCapacity(ctx, server))?.memberCount ?? server.memberCount ?? server.memberUserIds.length) === 0) continue;

          const elapsedMs = now - server.tickAnchorMs;
          if (elapsedMs < JG_RUNTIME_TICK_MS) continue;

          budget -= 1;
          const runtime = resolveRuntime(registry, server.gameId);
          // Unscoped on purpose: onTick is handed the whole world and may touch any of it.
          const loaded = await loadServerSnapshot(ctx, server, runtime);
          const snapshot = runtime.tick(loaded, elapsedMs / 1_000, now);
          await persistServerSnapshot(ctx, server, snapshot, server.save as SaveConfig);
          await ctx.db.patch(server._id, { tickAnchorMs: now });
          ticked += 1;

          const refreshed = await ctx.db.get("jgGameServers", server._id);
          if (refreshed && (await flushServerIfDue(ctx, refreshed, now, runtime, snapshot))) {
            saved += 1;
          }
        }
      }

      return { ticked, saved };
    },
  });

  const flushDirtyServers = internalMutation({
    args: {},
    handler: async (ctx) => {
      const servers = await ctx.db
        .query("jgGameServers")
        .withIndex("by_dirty", (q) => q.gt("dirtyAt", 0))
        .take(maxServersPerTick);
      let saved = 0;

      for (const server of servers) {
        await ctx.db.patch(server._id, { dirtyAt: undefined, lastSavedAt: Date.now() });
        saved += 1;
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
    getServerMeta,
    getServerCapacity,
    getChunks,
    getPlayerProfile,
    getFeed,
    pushFeedEntry,
    listOpenServers,
    tickActiveServers,
    flushDirtyServers,
    helpers,
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

/** One member's pose as `list` reports it. */
export type PresenceListRow = {
  userId: string;
  sessionId?: string;
  kind?: string;
  label?: string;
  position: { x: number; y: number; z: number };
  rotationY: number;
  rotationPitch: number;
  lastSeenAt: number;
};

/** What `sync` hands back: the pose the server holds after clamping, and whether this session had been displaced. */
export type PresenceSyncResult = {
  pose: { x: number; y: number; z: number; rotationY: number; rotationPitch: number };
  lastSeenAt: number;
  displaced: boolean;
};

/**
 * The pose lane of a hosted server: the backend behind `PresenceSync`, which replicates where each
 * member of one `jgGameServers` server is standing. It is not the backend for `PresenceTransport` —
 * that contract (`ConvexPresenceFunctions` in `./convexPresenceTransport`) is a game-owned world's
 * own presence, keyed by the game's own ids, with its own notion of who counts as a resident. A game
 * on `createConvexPresenceTransport` supplies those functions itself; these do not substitute for them.
 * @internal
 */
export function createPresenceFunctions(options?: {
  auth?: JgAuthMode;
  /** How recently a row must have been written to appear in `list`. */
  freshWindowMs?: number;
  /** How long a row may go unwritten before `reapIdlePresence` deletes it. */
  idleCutoffMs?: number;
  /** Rows deleted per reaper run, so one sweep is a bounded transaction. */
  maxReapPerRun?: number;
  /** Movement clamping, optionally per actor `kind` — an agent need not obey a human's speed cap. */
  poseRules?: PoseSyncRules | ((kind: string | undefined) => PoseSyncRules);
  /** Where a session with no row starts. Async and ctx-bearing, so a spawn can read the world. */
  resolveSpawn?: (
    ctx: JGMutationCtx,
    args: { serverId: string; userId: string; kind?: string },
  ) => Promise<{ x: number; y: number; z: number } | null> | { x: number; y: number; z: number } | null;
}) {
  const mode: JgAuthMode = options?.auth ?? "required";
  const freshWindowMs = options?.freshWindowMs ?? 10_000;
  const idleCutoffMs = options?.idleCutoffMs ?? 60_000;
  const maxReapPerRun = options?.maxReapPerRun ?? 256;
  const rulesOption = options?.poseRules ?? DEFAULT_CONVEX_POSE_RULES;
  const rulesFor = (kind: string | undefined): PoseSyncRules =>
    typeof rulesOption === "function" ? rulesOption(kind) : rulesOption;

  const poseValidator = v.object({
    x: v.number(),
    y: v.number(),
    z: v.number(),
    rotationY: v.number(),
    rotationPitch: v.number(),
  });

  const list = query({
    args: {
      serverId: v.string(),
      viewerChunkKey: v.optional(v.string()),
      externalId: v.optional(v.string()),
    },
    returns: v.array(
      v.object({
        userId: v.string(),
        sessionId: v.optional(v.string()),
        kind: v.optional(v.string()),
        label: v.optional(v.string()),
        position: v.object({ x: v.number(), y: v.number(), z: v.number() }),
        rotationY: v.number(),
        rotationPitch: v.number(),
        lastSeenAt: v.number(),
      }),
    ),
    handler: async (ctx, args) => {
      return withMember(ctx, mode, args, [] as PresenceListRow[], async (_server, actorUserId) => {
        const threshold = Date.now() - freshWindowMs;
        const own = args.viewerChunkKey === undefined ? await ctx.db.query("jgPoses")
          .withIndex("by_server_and_user", q => q.eq("serverId", args.serverId).eq("userId", actorUserId)).first() : null;
        const center = parseChunkKey(args.viewerChunkKey ?? (own ? chunkKeyAt([own.x, own.y, own.z]) : "0,0"));
        if (!center) return [];
        const rows = [];
        for (const chunkKey of chunkKeysAround([center.cx * DEFAULT_CHUNK_SIZE, 0, center.cz * DEFAULT_CHUNK_SIZE], 1)) {
          rows.push(...await ctx.db.query("jgPoses").withIndex("by_server_and_chunk", q => q.eq("serverId", args.serverId).eq("chunkKey", chunkKey)).take(256));
        }

        return rows
          .filter((row) => row.revokedAt === undefined && row.updatedAt >= threshold)
          .map((row) => ({
            userId: row.userId,
            sessionId: row.sessionId,
            kind: row.kind,
            label: row.label,
            position: { x: row.x, y: row.y, z: row.z },
            rotationY: row.rotationY,
            rotationPitch: row.rotationPitch,
            lastSeenAt: row.updatedAt,
          }));
      });
    },
  });

  /**
   * Upload a pose, or keep the session alive without one. Returns the pose the server actually holds
   * after clamping, so a corrected client can reconcile, plus whether this session had been revoked
   * by another of the same user's sessions since its last sync.
   */
  const sync = mutation({
    args: {
      serverId: v.string(),
      pose: v.optional(poseValidator),
      sessionId: v.optional(v.string()),
      kind: v.optional(v.string()),
      label: v.optional(v.string()),
      externalId: v.optional(v.string()),
    },
    returns: v.union(
      v.null(),
      v.object({
        pose: poseValidator,
        lastSeenAt: v.number(),
        displaced: v.boolean(),
      }),
    ),
    handler: (ctx, args) =>
      withMember(ctx, mode, args, null as PresenceSyncResult | null, async (_server, actorUserId) => {
        const now = Date.now();
        const rows = await ctx.db
          .query("jgPoses")
          .withIndex("by_server_and_user", (q) => q.eq("serverId", args.serverId).eq("userId", actorUserId))
          .collect();
        const resolvable = rows.map((row) => ({
          row,
          revokedAt: row.revokedAt,
          lastSeenAt: row.updatedAt,
        }));

        const existing =
          args.sessionId === undefined
            ? (resolveActivePresence(resolvable).active ?? pickReusablePresence(resolvable))?.row
            : rows.find((row) => row.sessionId === args.sessionId);

        const rules = rulesFor(args.kind ?? existing?.kind);
        if (existing && now - existing.updatedAt < (rules.minIntervalMs ?? 100)) {
          return { pose: { x: existing.x, y: existing.y, z: existing.z, rotationY: existing.rotationY, rotationPitch: existing.rotationPitch }, lastSeenAt: existing.updatedAt, displaced: existing.revokedAt !== undefined };
        }
        const current: PresencePoseState =
          existing === undefined
            ? spawnPresenceState(
                (await options?.resolveSpawn?.(ctx, {
                  serverId: args.serverId,
                  userId: actorUserId,
                  kind: args.kind,
                })) ?? undefined,
                now,
                rules,
              )
            : {
                position: { x: existing.x, y: existing.y, z: existing.z },
                rotationY: existing.rotationY,
                rotationPitch: existing.rotationPitch,
                lastSeenAtMs: existing.updatedAt,
              };

        // A pose-less call is a keep-alive: hold the stored pose and only move the stamp forward.
        const decision = decidePoseSync(
          current,
          args.pose === undefined
            ? { position: current.position, rotationY: current.rotationY, rotationPitch: current.rotationPitch }
            : {
                position: { x: args.pose.x, y: args.pose.y, z: args.pose.z },
                rotationY: args.pose.rotationY,
                rotationPitch: args.pose.rotationPitch,
              },
          rules,
          now,
        );

        const pose = {
          x: decision.position.x,
          y: decision.position.y,
          z: decision.position.z,
          rotationY: decision.rotationY,
          rotationPitch: decision.rotationPitch,
        };
        const identity = {
          ...(args.sessionId === undefined ? {} : { sessionId: args.sessionId }),
          ...(args.kind === undefined ? {} : { kind: args.kind }),
          ...(args.label === undefined ? {} : { label: args.label }),
        };

        const displaced = existing?.revokedAt !== undefined;
        if (existing) {
          if (decision.changed || decision.refreshKeepAlive || displaced || Object.keys(identity).length > 0) {
            await ctx.db.patch(existing._id, { ...pose, ...identity, chunkKey: chunkKeyAt([pose.x, pose.y, pose.z]), updatedAt: now, revokedAt: undefined });
          }
        } else {
          await ctx.db.insert("jgPoses", {
            serverId: args.serverId,
            userId: actorUserId,
            ...pose,
            chunkKey: chunkKeyAt([pose.x, pose.y, pose.z]),
            ...identity,
            updatedAt: now,
          });
        }

        // This session is the live one; any other session of the same user is revoked, not deleted,
        // so it learns it was displaced on its next sync instead of silently reappearing.
        for (const row of rows) {
          if (row._id === existing?._id || row.revokedAt !== undefined) continue;
          await ctx.db.patch(row._id, { revokedAt: now });
        }

        return { pose, lastSeenAt: now, displaced };
      }),
  });

  const leave = mutation({
    args: {
      serverId: v.string(),
      sessionId: v.optional(v.string()),
      externalId: v.optional(v.string()),
    },
    returns: v.null(),
    handler: async (ctx, args) => {
      const actorUserId = await resolveActor(ctx, args.externalId, mode);
      if (!actorUserId) return null;

      const now = Date.now();
      const rows = await ctx.db
        .query("jgPoses")
        .withIndex("by_server_and_user", (q) => q.eq("serverId", args.serverId).eq("userId", actorUserId))
        .collect();

      for (const row of rows) {
        if (args.sessionId !== undefined && row.sessionId !== args.sessionId) continue;
        if (row.revokedAt === undefined) await ctx.db.patch(row._id, { revokedAt: now });
      }
      return null;
    },
  });

  /**
   * Delete rows nobody has written for `idleCutoffMs`. `list` filters stale rows at read time but
   * nothing removed them, so a player who closed the tab left a row behind forever. Register it on a
   * cron — {@link jgengineCronSpecs} carries the interval.
   */
  const reapIdlePresence = internalMutation({
    args: {},
    returns: v.object({ reaped: v.number() }),
    handler: async (ctx) => {
      const now = Date.now();
      const stale = await ctx.db
        .query("jgPoses")
        .withIndex("by_updated", (q) => q.lt("updatedAt", now - idleCutoffMs))
        .take(maxReapPerRun);

      let reaped = 0;
      for (const row of stale) {
        if (!isPresenceExpired(row.updatedAt, now, idleCutoffMs)) continue;
        await ctx.db.delete(row._id);
        reaped += 1;
      }
      return { reaped };
    },
  });

  return { list, sync, leave, reapIdlePresence };
}

/** One active player delivered to an online-system batch. */
export type OnlinePlayer = { serverId: string; userId: string; homeGameId?: string };

/**
 * Scan one bounded presence page and schedule its handler and continuation in separate transactions.
 * @capability online-player-batches Schedule bounded active-player or home-game work in separate transactions.
 */
export async function forEachOnlinePlayer(ctx: JGMutationCtx, options: {
  batchSize?: number;
  handler: FunctionReference<"mutation", "internal", { players: OnlinePlayer[]; nowMs: number }>;
  continuation: FunctionReference<"mutation", "internal", { cursor?: string | null; nowMs?: number }>;
  cursor?: string | null;
  nowMs?: number;
  freshWindowMs?: number;
  /** Deliver one representative per home game when several agents share a simulation. */
  groupBy?: "userId" | "homeGameId";
}): Promise<{ scheduled: number; remaining: boolean }> {
  const batchSize = options.batchSize ?? 25;
  if (!Number.isSafeInteger(batchSize) || batchSize < 1 || batchSize > 256) throw new Error("batchSize must be between 1 and 256");
  const nowMs = options.nowMs ?? Date.now();
  const freshWindowMs = options.freshWindowMs ?? 60_000;
  if (!Number.isFinite(nowMs) || !Number.isFinite(freshWindowMs) || freshWindowMs <= 0 || !Number.isFinite(nowMs - freshWindowMs)) throw new Error("Invalid online-player time window");
  const page = await ctx.db.query("jgPoses").withIndex("by_updated", q => q.gte("updatedAt", nowMs - freshWindowMs))
    .paginate({ numItems: batchSize, cursor: options.cursor ?? null });
  const players: OnlinePlayer[] = [];
  for (const row of page.page) {
    if (row.revokedAt !== undefined) continue;
    const canonical = options.groupBy === "homeGameId" && row.homeGameId
      ? await ctx.db.query("jgPoses").withIndex("by_home_game_revoked_updated", q => q.eq("homeGameId", row.homeGameId).eq("revokedAt", undefined)).order("desc").first()
      : await ctx.db.query("jgPoses").withIndex("by_server_user_revoked_updated", q => q.eq("serverId", row.serverId).eq("userId", row.userId).eq("revokedAt", undefined)).order("desc").first();
    if (canonical?._id === row._id) players.push({ serverId: row.serverId, userId: row.userId, ...(row.homeGameId ? { homeGameId: row.homeGameId } : {}) });
  }
  if (players.length) await ctx.scheduler.runAfter(0, options.handler, { players, nowMs });
  if (!page.isDone) await ctx.scheduler.runAfter(0, options.continuation, { cursor: page.continueCursor, nowMs });
  return { scheduled: players.length, remaining: !page.isDone };
}

/**
 * Consume one request in a fixed rate window; concurrent callers serialize on the indexed key.
 * @capability host-rate-limit Enforce indexed per-key request windows inside authoritative mutations.
 */
export async function rateLimit(ctx: JGMutationCtx, args: { key: string; windowMs: number; max: number; nowMs?: number }): Promise<{ ok: boolean; retryAfterMs: number }> {
  const now = args.nowMs ?? Date.now();
  if (!args.key || args.key.length > 512 || !Number.isFinite(now) || !Number.isFinite(args.windowMs) || args.windowMs <= 0 || !Number.isFinite(now + args.windowMs) || !Number.isSafeInteger(args.max) || args.max < 1) throw new Error("Invalid rate limit policy");
  const row = await ctx.db.query("jgRateLimits").withIndex("by_key", q => q.eq("key", args.key)).unique();
  if (row && now < row.expiresAt && row.count >= args.max) return { ok: false, retryAfterMs: row.expiresAt - now };
  const patch = !row || now >= row.expiresAt ? { startedAt: now, expiresAt: now + args.windowMs, count: 1 } : { startedAt: row.startedAt, expiresAt: row.expiresAt, count: row.count + 1 };
  if (row) await ctx.db.patch(row._id, patch);
  else await ctx.db.insert("jgRateLimits", { key: args.key, ...patch });
  return { ok: true, retryAfterMs: 0 };
}

/**
 * Write validated chat in a host transaction after the caller resolves its actor and world.
 * @capability host-chat-send Validate, rate-limit and persist chat inside an authorized host mutation.
 */
export async function sendChatMessage(ctx: JGMutationCtx, args: { serverId: string; userId: string; body: string; channelId?: string; authorName?: string; maxBodyLength?: number; minIntervalMs?: number }): Promise<ChatSendOutcome> {
  const maxBodyLength = args.maxBodyLength ?? 240;
  if (!Number.isSafeInteger(maxBodyLength) || maxBodyLength < 1 || maxBodyLength > 4096) throw new Error("Invalid chat body limit");
  if (!(args.channelId ?? "global").trim() || (args.channelId?.length ?? 0) > 256 || (args.authorName?.length ?? 0) > 160) return { ok: false, reason: "invalid_channel_or_author" };
  const validation = validateChatMessage(args.body, { maxLength: args.maxBodyLength ?? 240 });
  if (!validation.ok) return validation;
  const gate = await rateLimit(ctx, { key: JSON.stringify(["chat", args.serverId, args.userId]), windowMs: args.minIntervalMs ?? 2000, max: 1 });
  if (!gate.ok) return { ok: false, reason: "rate_limited" };
  await ctx.db.insert("jgChatMessages", { serverId: args.serverId, channelId: args.channelId ?? "global", userId: args.userId, body: validation.text, authorName: args.authorName, at: Date.now() });
  return { ok: true };
}

/**
 * Bounded recent chat for a resolved server; authorization belongs to the calling query.
 * @capability host-chat-history Read bounded channel history inside an authorized host query.
 */
export async function recentChatMessages(ctx: { db: Pick<JGQueryCtx["db"], "query"> }, args: { serverId: string; channelId?: string; limit?: number }) {
  const limit = args.limit ?? 50;
  if (!Number.isFinite(limit)) throw new Error("Invalid chat limit");
  return ctx.db.query("jgChatMessages").withIndex("by_server_channel", q => q.eq("serverId", args.serverId).eq("channelId", args.channelId ?? "global"))
    .order("desc").take(Math.min(100, Math.max(1, Math.floor(limit))));
}

/**
 * Authenticated, bounded client diagnostics and bounded retention sweeps.
 * @capability client-error-reporting Accept authenticated bounded diagnostics with cooldown and retention sweeps.
 */
export function createClientErrorFunctions() {
  const reportClientError = mutation({
    args: { message: v.string(), kind: v.optional(v.string()), stack: v.optional(v.string()), componentStack: v.optional(v.string()), url: v.optional(v.string()), pathname: v.optional(v.string()), userAgent: v.optional(v.string()), agentPrompt: v.optional(v.string()) },
    returns: v.object({ ok: v.boolean(), reason: v.optional(v.string()) }),
    handler: async (ctx, args) => {
      const actor = await resolveActor(ctx, undefined, "required");
      if (!actor) return { ok: false, reason: "unauthorized" };
      const message = JSON.stringify(args);
    if (new TextEncoder().encode(message).length > 4096) return { ok: false, reason: "too_long" };
      const gate = await rateLimit(ctx, { key: `client-error:${actor}`, windowMs: 10_000, max: 1 });
      if (!gate.ok) return { ok: false, reason: "rate_limited" };
      await ctx.db.insert("jgClientErrors", { userId: actor, message, createdAt: Date.now() });
      return { ok: true };
    },
  });
  const pruneClientErrors = internalMutation({ args: {}, handler: async ctx => {
    const rows = await ctx.db.query("jgClientErrors").withIndex("by_created", q => q.lt("createdAt", Date.now() - 7 * 86_400_000)).take(256);
    for (const row of rows) await ctx.db.delete(row._id);
    return { deleted: rows.length, remaining: rows.length === 256 };
  } });
  const pruneRateLimits = internalMutation({ args: {}, handler: async ctx => {
    const rows = await ctx.db.query("jgRateLimits").withIndex("by_expires", q => q.lte("expiresAt", Date.now())).take(256);
    for (const row of rows) await ctx.db.delete(row._id);
    return { deleted: rows.length, remaining: rows.length === 256 };
  } });
  return { reportClientError, pruneClientErrors, pruneRateLimits };
}

/** @internal */
export function createChatFunctions(options?: {
  auth?: JgAuthMode;
  historyLimit?: number;
  maxBodyLength?: number;
  minIntervalMs?: number;
}) {
  const mode: JgAuthMode = options?.auth ?? "required";
  if (options?.historyLimit !== undefined && (!Number.isSafeInteger(options.historyLimit) || options.historyLimit < 1)) throw new Error("Invalid chat history limit");
  const historyLimit = Math.min(100, options?.historyLimit ?? 50);
  const maxBodyLength = options?.maxBodyLength ?? 240;
  const minIntervalMs = options?.minIntervalMs ?? 2_000;
  if (!Number.isSafeInteger(maxBodyLength) || maxBodyLength < 1 || maxBodyLength > 4096 || !Number.isFinite(minIntervalMs) || minIntervalMs <= 0) throw new Error("Invalid chat policy");

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
    handler: (ctx, args): Promise<ChatMessage[]> =>
      withMember(ctx, mode, args, [] as ChatMessage[], async () => {
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
      }),
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

      const outcome = await sendChatMessage(ctx, { serverId: args.serverId, userId: actorUserId, channelId: args.channelId, body: args.body, maxBodyLength, minIntervalMs });
      if (!outcome.ok) return outcome.reason === "rate_limited" ? { ok: false, reason: "sending too fast" } : outcome;

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

  const pruneChatMessages = internalMutation({ args: {}, handler: async ctx => {
    const rows = await ctx.db.query("jgChatMessages").withIndex("by_at", q => q.lt("at", Date.now() - 86_400_000)).take(256);
    for (const row of rows) await ctx.db.delete(row._id);
    return { deleted: rows.length, remaining: rows.length === 256 };
  } });
  return { messages, recent: messages, sendMessage, pruneChatMessages };
}

export type JgCronSpec = {
  name: string;
  intervalSeconds: number;
  functionKey: "tickActiveServers" | "flushDirtyServers" | "reapIdlePresence" | "pruneChatMessages" | "pruneClientErrors" | "pruneRateLimits";
  /** Which factory's exports the function lives in, i.e. which `convex/*.ts` file to reach it through. */
  module: "runtime" | "presence" | "chat" | "clientErrors";
};

const JG_CRON_SPECS: readonly JgCronSpec[] = [
  { name: "jg tick", intervalSeconds: 1, functionKey: "tickActiveServers", module: "runtime" },
  { name: "jg flush", intervalSeconds: 60, functionKey: "flushDirtyServers", module: "runtime" },
  { name: "jg presence reap", intervalSeconds: 60, functionKey: "reapIdlePresence", module: "presence" },
];

/** @internal */
export function jgengineCronSpecs(options: {
  runtimes?: readonly Pick<GameRuntime, "hasTick">[];
  intervalSeconds?: Partial<Record<JgCronSpec["functionKey"], number>>;
  chat?: boolean;
  clientErrors?: boolean;
} = {}): readonly JgCronSpec[] {
  const specs = JG_CRON_SPECS.filter(spec => spec.functionKey !== "tickActiveServers" || options.runtimes?.some(runtime => runtime.hasTick));
  if (options.chat) specs.push({ name: "jg chat prune", intervalSeconds: 3600, functionKey: "pruneChatMessages", module: "chat" });
  if (options.clientErrors) {
    specs.push({ name: "jg error prune", intervalSeconds: 3600, functionKey: "pruneClientErrors", module: "clientErrors" });
    specs.push({ name: "jg rate limit prune", intervalSeconds: 3600, functionKey: "pruneRateLimits", module: "clientErrors" });
  }
  return specs.map(spec => {
    const intervalSeconds = options.intervalSeconds?.[spec.functionKey] ?? spec.intervalSeconds;
    if (!Number.isFinite(intervalSeconds) || intervalSeconds <= 0) throw new Error("Cron intervalSeconds must be positive");
    return { ...spec, intervalSeconds };
  });
}
