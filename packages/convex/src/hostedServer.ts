import {
  defineSchema,
  internalMutationGeneric,
  mutationGeneric,
  queryGeneric,
} from "convex/server";
import type {
  DataModelFromSchemaDefinition,
  DocumentByName,
  GenericMutationCtx,
  GenericQueryCtx,
  MutationBuilder,
  QueryBuilder,
} from "convex/server";
import { ConvexError, v } from "convex/values";
import type { GameDefinition } from "@jgengine/core/game/defineGame";
import type { GameContextContent } from "@jgengine/core/runtime/gameContext";
import { INPUT_COMMAND, type InputFrame } from "@jgengine/core/runtime/hostedGameRunner";
import {
  createHostedWorldSession,
  type HostedWorldRecord,
  type HostedWorldSession,
  type HostedWorldStore,
} from "@jgengine/core/runtime/hostedWorldSession";
import type { WorldSnapshot } from "@jgengine/core/runtime/worldSnapshot";
import type { ModelAssetRef } from "@jgengine/core/scene/assetCatalog";
import { commitIfRevisionMatch } from "./occ";
import { jgengineHostedTables, resolveActor, type JgAuthMode } from "./server";

/** One game the hosted path can serve, bound per `gameId`: its definition plus content lookup. */
export interface HostedGameConfig {
  definition: GameDefinition<ModelAssetRef, unknown>;
  content: GameContextContent;
}

/**
 * Everything one stateless invocation reconstructs a hosted world from: the persisted record via `store`,
 * plus the member roster and held inputs the snapshot doesn't carry, and the op to apply to the fresh session.
 */
export interface HostedWorldInvocation<T> {
  game: HostedGameConfig;
  store: HostedWorldStore;
  members?: readonly string[];
  inputs?: Readonly<Record<string, InputFrame>>;
  now?: () => number;
  op: (session: HostedWorldSession) => T;
}

/** What one stateless invocation produced: the op's value, the resulting revision, whether the world changed (and was saved back), and the post-op roster. */
export interface HostedWorldOutcome<T> {
  value: T;
  revision: number;
  changed: boolean;
  members: readonly string[];
}

/**
 * The reconstruct → op → save core of the stateless hosted path, Convex-agnostic so it unit-tests against
 * `memoryWorldStore`: build a fresh {@link createHostedWorldSession} from `store.load()`, resume persisted
 * members and replay held inputs, run the op, then persist the snapshot at `revision + 1` iff the world changed.
  * @internal
  */
export function invokeHostedWorld<T>(invocation: HostedWorldInvocation<T>): HostedWorldOutcome<T> {
  const { game, store, members = [], inputs = {}, now, op } = invocation;
  const loaded = store.load();
  const loadedJson = loaded === null ? null : JSON.stringify(loaded.snapshot);
  const session = createHostedWorldSession({
    definition: game.definition,
    content: game.content,
    store: { load: () => loaded, save: () => {} },
    ...(now === undefined ? {} : { now }),
  });
  for (const userId of members) session.runner().resume(userId);
  for (const [userId, frame] of Object.entries(inputs)) session.input(userId, frame);
  const value = op(session);
  const snapshot = session.runner().snapshot();
  const baseRevision = loaded?.revision ?? 0;
  if (loadedJson !== null && JSON.stringify(snapshot) === loadedJson) {
    return { value, revision: baseRevision, changed: false, members: session.members() };
  }
  const record: HostedWorldRecord = { snapshot, revision: baseRevision + 1 };
  store.save(record);
  return { value, revision: record.revision, changed: true, members: session.members() };
}

const hostedSchemaForTypes = defineSchema(jgengineHostedTables());
type HostedDataModel = DataModelFromSchemaDefinition<typeof hostedSchemaForTypes>;
type HostedQueryCtx = GenericQueryCtx<HostedDataModel>;
type HostedMutationCtx = GenericMutationCtx<HostedDataModel>;
const query = queryGeneric as QueryBuilder<HostedDataModel, "public">;
const mutation = mutationGeneric as MutationBuilder<HostedDataModel, "public">;
const internalMutation = internalMutationGeneric as MutationBuilder<HostedDataModel, "internal">;

type HostedWorldDoc = DocumentByName<HostedDataModel, "jgHostedWorlds">;

/** Default minimum elapsed ms before `tickHostedWorlds` advances a world — override via the factory's `tickMs`. */
export const JG_HOSTED_TICK_MS = 1_000;

async function getWorldRow(
  ctx: HostedQueryCtx | HostedMutationCtx,
  gameId: string,
  serverId: string,
): Promise<HostedWorldDoc | null> {
  return await ctx.db
    .query("jgHostedWorlds")
    .withIndex("by_game_and_server", (q) => q.eq("gameId", gameId).eq("serverId", serverId))
    .unique();
}

function heldInputsOf(row: HostedWorldDoc | null): Record<string, InputFrame> {
  return (row?.inputs ?? {}) as Record<string, InputFrame>;
}

function worldStoreForRow(row: HostedWorldDoc | null): {
  store: HostedWorldStore;
  captured: () => HostedWorldRecord | null;
} {
  const loaded: HostedWorldRecord | null =
    row === null ? null : { snapshot: row.snapshot as WorldSnapshot, revision: row.revision };
  let captured: HostedWorldRecord | null = null;
  return {
    store: {
      load: () => loaded,
      save(record) {
        captured = record;
      },
    },
    captured: () => captured,
  };
}

async function persistWorldRow(
  ctx: HostedMutationCtx,
  args: {
    gameId: string;
    serverId: string;
    row: HostedWorldDoc | null;
    record: HostedWorldRecord | null;
    memberUserIds: readonly string[];
    inputs: Record<string, InputFrame>;
    tickAnchorMs?: number;
  },
): Promise<void> {
  const nowMs = Date.now();
  if (args.row === null) {
    if (args.record === null) return;
    await ctx.db.insert("jgHostedWorlds", {
      gameId: args.gameId,
      serverId: args.serverId,
      snapshot: args.record.snapshot,
      revision: args.record.revision,
      memberUserIds: [...args.memberUserIds],
      inputs: args.inputs,
      tickAnchorMs: args.tickAnchorMs ?? nowMs,
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    return;
  }
  await ctx.db.patch(args.row._id, {
    ...(args.record === null
      ? {}
      : { snapshot: args.record.snapshot, revision: args.record.revision }),
    memberUserIds: [...args.memberUserIds],
    inputs: args.inputs,
    ...(args.tickAnchorMs === undefined ? {} : { tickAnchorMs: args.tickAnchorMs }),
    updatedAt: nowMs,
  });
}

/**
 * The Convex counterpart of ws's `createWorldGameHost`: serves GameContext worlds statelessly by
 * reconstructing a hosted session from the persisted `jgHostedWorlds` row on every invocation via
 * {@link invokeHostedWorld}. Destructure + re-export the returned functions from a `convex/` module and
 * drive `tickHostedWorlds` from a cron. Requires {@link jgengineHostedTables} in the deployment schema.
  * @internal
  */
export function createHostedGameServerFunctions(options: {
  games: Record<string, HostedGameConfig>;
  auth?: JgAuthMode;
  tickMs?: number;
}) {
  const mode: JgAuthMode = options.auth ?? "anonymous";
  const tickMs = options.tickMs ?? JG_HOSTED_TICK_MS;

  function resolveGame(gameId: string): HostedGameConfig {
    const game = options.games[gameId];
    if (game === undefined) throw new ConvexError(`Unknown hosted game "${gameId}"`);
    return game;
  }

  const getHostedServer = query({
    args: {
      gameId: v.string(),
      serverId: v.optional(v.string()),
      externalId: v.optional(v.string()),
    },
    returns: v.union(
      v.object({
        serverId: v.string(),
        gameId: v.string(),
        revision: v.number(),
        serverState: v.any(),
        memberUserIds: v.array(v.string()),
      }),
      v.null(),
    ),
    handler: async (ctx, args) => {
      const actorUserId = await resolveActor(ctx, args.externalId, mode);
      if (!actorUserId) return null;

      const row = await getWorldRow(ctx, args.gameId, args.serverId ?? args.gameId);
      if (!row) return null;
      if (!row.memberUserIds.includes(actorUserId)) return null;

      return {
        serverId: row.serverId,
        gameId: row.gameId,
        revision: row.revision,
        serverState: row.snapshot,
        memberUserIds: row.memberUserIds,
      };
    },
  });

  const joinHostedServer = mutation({
    args: {
      gameId: v.string(),
      serverId: v.optional(v.string()),
      externalId: v.optional(v.string()),
    },
    returns: v.object({ serverId: v.string(), isNew: v.boolean() }),
    handler: async (ctx, args) => {
      const actorUserId = await resolveActor(ctx, args.externalId, mode);
      if (!actorUserId) {
        throw new ConvexError("Not authenticated");
      }

      const game = resolveGame(args.gameId);
      const serverId = args.serverId ?? args.gameId;
      const row = await getWorldRow(ctx, args.gameId, serverId);
      const isNew = !(row?.memberUserIds ?? []).includes(actorUserId);

      const { store, captured } = worldStoreForRow(row);
      const outcome = invokeHostedWorld({
        game,
        store,
        members: row?.memberUserIds ?? [],
        inputs: heldInputsOf(row),
        op: (session) => session.join(actorUserId, isNew),
      });

      await persistWorldRow(ctx, {
        gameId: args.gameId,
        serverId,
        row,
        record: captured(),
        memberUserIds: outcome.members,
        inputs: heldInputsOf(row),
      });

      return { serverId, isNew };
    },
  });

  const leaveHostedServer = mutation({
    args: {
      gameId: v.string(),
      serverId: v.optional(v.string()),
      externalId: v.optional(v.string()),
    },
    returns: v.null(),
    handler: async (ctx, args) => {
      const actorUserId = await resolveActor(ctx, args.externalId, mode);
      if (!actorUserId) {
        throw new ConvexError("Not authenticated");
      }

      const serverId = args.serverId ?? args.gameId;
      const row = await getWorldRow(ctx, args.gameId, serverId);
      if (!row) return null;
      if (!row.memberUserIds.includes(actorUserId)) return null;

      const game = resolveGame(args.gameId);
      const { store, captured } = worldStoreForRow(row);
      const outcome = invokeHostedWorld({
        game,
        store,
        members: row.memberUserIds,
        inputs: heldInputsOf(row),
        op: (session) => session.leave(actorUserId),
      });

      const inputs = heldInputsOf(row);
      delete inputs[actorUserId];

      await persistWorldRow(ctx, {
        gameId: args.gameId,
        serverId,
        row,
        record: captured(),
        memberUserIds: outcome.members,
        inputs,
      });

      return null;
    },
  });

  const runHostedCommand = mutation({
    args: {
      gameId: v.string(),
      serverId: v.optional(v.string()),
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

      const serverId = args.serverId ?? args.gameId;
      const row = await getWorldRow(ctx, args.gameId, serverId);
      if (!row) {
        return { ok: false as const, reason: "Server not found" };
      }
      if (!row.memberUserIds.includes(actorUserId)) {
        return { ok: false as const, reason: "Not a member of this server" };
      }

      if (args.command === INPUT_COMMAND) {
        await ctx.db.patch(row._id, {
          inputs: { ...heldInputsOf(row), [actorUserId]: args.input as InputFrame },
          updatedAt: Date.now(),
        });
        return { ok: true as const };
      }

      const game = resolveGame(args.gameId);
      const loadedRevision = row.revision;
      const { store, captured } = worldStoreForRow(row);
      const outcome = invokeHostedWorld({
        game,
        store,
        members: row.memberUserIds,
        inputs: heldInputsOf(row),
        op: (session) => session.command(actorUserId, args.command, args.input),
      });

      if (outcome.value.status === "rejected") {
        return { ok: false as const, reason: outcome.value.reason };
      }
      if (outcome.value.status === "unknown-command") {
        return { ok: false as const, reason: "unknown-command" };
      }

      const latest = await getWorldRow(ctx, args.gameId, serverId);
      if (!latest) {
        return { ok: false as const, reason: "Server not found" };
      }
      const commit = commitIfRevisionMatch(loadedRevision, latest.revision);
      if (!commit.ok) {
        return commit;
      }

      await persistWorldRow(ctx, {
        gameId: args.gameId,
        serverId,
        row: latest,
        record: captured(),
        memberUserIds: outcome.members,
        inputs: heldInputsOf(latest),
      });

      return { ok: true as const };
    },
  });

  const submitHostedInput = mutation({
    args: {
      gameId: v.string(),
      serverId: v.optional(v.string()),
      frame: v.any(),
      externalId: v.optional(v.string()),
    },
    returns: v.null(),
    handler: async (ctx, args) => {
      const actorUserId = await resolveActor(ctx, args.externalId, mode);
      if (!actorUserId) {
        throw new ConvexError("Not authenticated");
      }

      const row = await getWorldRow(ctx, args.gameId, args.serverId ?? args.gameId);
      if (!row || !row.memberUserIds.includes(actorUserId)) {
        throw new ConvexError("Not a member of this server");
      }

      await ctx.db.patch(row._id, {
        inputs: { ...heldInputsOf(row), [actorUserId]: args.frame as InputFrame },
        updatedAt: Date.now(),
      });

      return null;
    },
  });

  const tickHostedWorlds = internalMutation({
    args: {},
    handler: async (ctx) => {
      const nowMs = Date.now();
      const rows = await ctx.db.query("jgHostedWorlds").collect();
      let ticked = 0;
      let saved = 0;

      for (const row of rows) {
        const game = options.games[row.gameId];
        if (game === undefined) continue;
        if (row.memberUserIds.length === 0) continue;

        const elapsedMs = nowMs - row.tickAnchorMs;
        if (elapsedMs < tickMs) continue;

        const { store, captured } = worldStoreForRow(row);
        const outcome = invokeHostedWorld({
          game,
          store,
          members: row.memberUserIds,
          inputs: heldInputsOf(row),
          op: (session) => session.tick(elapsedMs / 1_000),
        });
        ticked += 1;

        const record = captured();
        if (record !== null) saved += 1;
        await persistWorldRow(ctx, {
          gameId: row.gameId,
          serverId: row.serverId,
          row,
          record,
          memberUserIds: outcome.members,
          inputs: heldInputsOf(row),
          tickAnchorMs: nowMs,
        });
      }

      return { ticked, saved };
    },
  });

  return {
    getHostedServer,
    joinHostedServer,
    leaveHostedServer,
    runHostedCommand,
    submitHostedInput,
    tickHostedWorlds,
  };
}
