import { v, type Infer } from "convex/values";
import { pickSpawnPoint } from "@llmville/game/datacenter/spawn";
import { hashStructuralSeed } from "@llmville/game/world/cityHash";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { internalMutation, mutation, query } from "../_generated/server";
import { getReadAccess, resolveActor } from "../permissions";
import { botActorExternalId, isBotActorExternalId, ownerFromBotActor } from "../botActor";
import { createWorldPresenceStore, type WorldPresenceRecord } from "@jgengine/convex/worldPresence";
import { worldServerRow } from "../jgengine/world";
import { worldChunkKeyAt, worldChunkNeighborhoodKeysOfKey } from "@llmville/game/datacenter/worldChunks";
import { claimsNearOrigin } from "../datacenter";
import {
  WORLD_POSE_RULES,
  preferredPresenceLabel,
  shouldPersistPresenceWorldSnapshot,
} from "@llmville/game/multiplayer/presencePolicy";

const HUMAN_PRESENCE_PREFIX = "human:";

export const communityProgress = query({
  args: {},
  returns: v.object({ launchedLabs: v.number(), totalLabs: v.number() }),
  handler: async (ctx) => {
    if (!(await ctx.auth.getUserIdentity())) return { launchedLabs: 0, totalLabs: 0 };
    const games = await ctx.db.query("games").collect();
    return {
      launchedLabs: new Set(games.filter((game) => game.tutorialStage === "complete").map((game) => game.createdBy)).size,
      totalLabs: new Set(games.map((game) => game.createdBy)).size,
    };
  },
});
const presenceStore = createWorldPresenceStore({ rules: WORLD_POSE_RULES, idleTimeoutMs: 4 * 60 * 1000 });

export type WorldPresenceKind = "human" | "bot";

function presenceKindForActor(actorExternalId: string): WorldPresenceKind {
  return isBotActorExternalId(actorExternalId) ? "bot" : "human";
}

function humanPresenceId(actorExternalId: string): string {
  return `${HUMAN_PRESENCE_PREFIX}${actorExternalId}`;
}

const presencePositionValidator = v.object({
  x: v.number(),
  y: v.number(),
  z: v.number(),
});

type PresencePositionWire = Infer<typeof presencePositionValidator>;

const worldPresenceValidator = v.object({
  presenceId: v.string(),
  kind: v.union(v.literal("human"), v.literal("bot")),
  actorExternalId: v.string(),
  gameId: v.id("games"),
  label: v.union(v.string(), v.null()),
  position: presencePositionValidator,
  rotationY: v.number(),
  rotationPitch: v.optional(v.number()),
  /** False for residents who are offline — frozen at their last known world position. */
  online: v.optional(v.boolean()),
});

type WorldPresenceRow = Infer<typeof worldPresenceValidator>;

async function spawnForGame(
  ctx: QueryCtx | MutationCtx,
  gameId: Id<"games">,
): Promise<PresencePositionWire> {
  const game = await ctx.db.get("games", gameId);
  const saved = game?.lastWorldPosition;
  if (saved) return { x: saved.x, y: 0, z: saved.z };
  const spawn = pickSpawnPoint(hashStructuralSeed(["spawn", gameId]), await claimsNearOrigin(ctx));
  return { x: spawn.x, y: 0, z: spawn.z };
}

export async function getActivePresenceByActor(ctx: QueryCtx | MutationCtx, actorExternalId: string) {
  const row = await presenceStore.active(ctx, actorExternalId);
  return row ? { ...row, gameId: row.homeGameId as Id<"games"> } : null;
}

async function persistGameWorldSnapshot(
  ctx: MutationCtx,
  gameId: Id<"games">,
  position: { x: number; z: number },
  now: number,
  force = false,
) {
  const game = await ctx.db.get("games", gameId);
  if (!game) return;
  if (!force && !shouldPersistPresenceWorldSnapshot(game.lastWorldPositionAt, now)) {
    return;
  }
  await ctx.db.patch(gameId, {
    lastWorldPosition: { x: position.x, z: position.z },
    lastWorldChunkKey: worldChunkKeyAt(position),
    lastWorldPositionAt: now,
  });
}

async function leaveHumanPresenceByActor(ctx: MutationCtx, actorExternalId: string) {
  const presence = await getActivePresenceByActor(ctx, actorExternalId);
  if (!presence) return { left: false };
  await presenceStore.revoke(ctx, presence, (row, now) =>
    persistGameWorldSnapshot(ctx, row.homeGameId as Id<"games">, row.position, now, true));
  return { left: true };
}

async function syncPresence(
  ctx: MutationCtx,
  presence: WorldPresenceRecord,
  position?: { x: number; z: number; y?: number },
  rotationY?: number,
  rotationPitch?: number,
) {
  const bot = presence.kind === "bot";
  return presenceStore.sync(ctx, presence, position ? { position, rotationY, rotationPitch } : undefined, {
    ...(bot ? { rules: { ...WORLD_POSE_RULES, maxSpeed: Number.MAX_VALUE, minIntervalMs: 100 } } : {}),
    ...(!bot ? { onSnapshot: (row: WorldPresenceRecord, now: number) =>
      persistGameWorldSnapshot(ctx, row.homeGameId as Id<"games">, row.position, now) } : {}),
  });
}

async function ensurePresenceForActor(
  ctx: MutationCtx, actorExternalId: string, gameId: Id<"games">, position: PresencePositionWire,
) {
  const server = await worldServerRow(ctx);
  if (!server) return null;
  const kind = presenceKindForActor(actorExternalId);
  const user = await ctx.db.query("users").withIndex("by_external_id", q => q.eq("externalId", actorExternalId)).unique();
  const row = await presenceStore.ensure(ctx, {
    serverId: server._id, actorExternalId, homeGameId: gameId, kind, position,
    ownerActorId: kind === "bot" ? ownerFromBotActor(actorExternalId) : undefined,
    presenceId: kind === "bot" ? actorExternalId : humanPresenceId(actorExternalId),
    label: preferredPresenceLabel(user) ?? undefined,
  });
  return { presenceId: row.presenceId, position: row.position, rotationY: row.rotationY };
}

export const syncPlayerPosition = mutation({
  args: {
    position: v.object({
      x: v.number(),
      z: v.number(),
      /** Vertical jump offset above ground (world units). */
      y: v.optional(v.number()),
    }),
    rotationY: v.optional(v.number()),
    rotationPitch: v.optional(v.number()),
    externalId: v.optional(v.string()),
  },
  returns: v.object({
    position: presencePositionValidator,
    rotationY: v.number(),
    rotationPitch: v.number(),
  }),
  handler: async (ctx, args) => {
    const actorExternalId = await resolveActor(ctx, args.externalId);
    if (!actorExternalId) {
      return { position: { x: 0, y: 0, z: 0 }, rotationY: 0, rotationPitch: 0 };
    }

    const presence = await getActivePresenceByActor(ctx, actorExternalId);
    if (!presence) {
      return { position: { x: 0, y: 0, z: 0 }, rotationY: 0, rotationPitch: 0 };
    }

    const next = await syncPresence(ctx, presence, args.position, args.rotationY ?? presence.rotationY, args.rotationPitch);
    return { position: next.position, rotationY: next.rotationY, rotationPitch: next.rotationPitch };
  },
});

export const ensureHumanPresence = mutation({
  args: {
    gameId: v.id("games"),
    externalId: v.optional(v.string()),
  },
  returns: v.union(
    v.object({
      presenceId: v.string(),
      position: presencePositionValidator,
      rotationY: v.number(),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const actorExternalId = await resolveActor(ctx, args.externalId);
    if (!actorExternalId) return null;
    if (!(await getReadAccess(ctx, args.gameId, actorExternalId))) return null;

    const spawn = await spawnForGame(ctx, args.gameId);
    await persistGameWorldSnapshot(ctx, args.gameId, spawn, Date.now(), true);
    return await ensurePresenceForActor(ctx, actorExternalId, args.gameId, spawn);
  },
});

export const leaveHumanPresence = mutation({
  args: {
    gameId: v.id("games"),
    externalId: v.optional(v.string()),
  },
  returns: v.object({ left: v.boolean() }),
  handler: async (ctx, args) => {
    const actorExternalId = await resolveActor(ctx, args.externalId);
    if (!actorExternalId) return { left: false };
    if (!(await getReadAccess(ctx, args.gameId, actorExternalId))) return { left: false };

    return await leaveHumanPresenceByActor(ctx, actorExternalId);
  },
});

function toWorldPresenceRow(presence: WorldPresenceRecord): WorldPresenceRow {
  return {
    presenceId: presence.presenceId,
    kind: presence.kind === "bot" ? "bot" : "human",
    actorExternalId: presence.actorExternalId,
    gameId: presence.homeGameId as Id<"games">,
    label: presence.label ?? null,
    position: presence.position,
    rotationY: presence.rotationY,
    rotationPitch: presence.rotationPitch,
    online: true,
  };
}

async function listOnlinePresenceRowsNear(
  ctx: QueryCtx | MutationCtx,
  viewerChunkKey: string | undefined,
): Promise<WorldPresenceRow[]> {
  const server = await worldServerRow(ctx);
  if (!server) return [];
  return (await presenceStore.nearby(ctx, server._id, viewerChunkKey)).map(toWorldPresenceRow);
}

const myPresenceLocationValidator = v.union(
  v.object({
    position: presencePositionValidator,
    rotationY: v.number(),
  }),
  v.null(),
);

/**
 * One reactive subscription for the live multiplayer read path: the caller's
 * own pose plus everyone online in the shared world. Reads only presence rows,
 * so it re-executes only when a presence row actually changes.
 */
export const snapshot = query({
  args: {
    homeGameId: v.id("games"),
    externalId: v.optional(v.string()),
    viewerChunkKey: v.optional(v.string()),
  },
  returns: v.object({
    myLocation: myPresenceLocationValidator,
    online: v.array(worldPresenceValidator),
  }),
  handler: async (ctx, args) => {
    const actorExternalId = await resolveActor(ctx, args.externalId);
    if (!actorExternalId) return { myLocation: null, online: [] };
    if (!(await getReadAccess(ctx, args.homeGameId, actorExternalId))) {
      return { myLocation: null, online: [] };
    }

    const presence = await getActivePresenceByActor(ctx, actorExternalId);
    const viewerChunkKey =
      args.viewerChunkKey ?? (presence ? worldChunkKeyAt(presence.position) : undefined);
    const online = presence
      ? (await presenceStore.nearby(ctx, presence.serverId, viewerChunkKey)).map(toWorldPresenceRow)
      : await listOnlinePresenceRowsNear(ctx, viewerChunkKey);
    const myLocation = presence
      ? {
          position: presence.position,
          rotationY: presence.rotationY,
        }
      : null;

    return { myLocation, online };
  },
});

const residentValidator = v.object({
  presenceId: v.string(),
  kind: v.union(v.literal("human"), v.literal("bot")),
  actorExternalId: v.string(),
  gameId: v.id("games"),
  label: v.union(v.string(), v.null()),
  position: presencePositionValidator,
  rotationY: v.number(),
  rotationPitch: v.optional(v.number()),
  online: v.optional(v.boolean()),
  ownerActorId: v.string(),
});

/**
 * Every world owner with a saved position, independent of who is online —
 * never reads presence rows, so pose ticks cannot invalidate it. Clients derive
 * the dormant set by subtracting the snapshot's online actors.
 */
export const cityResidents = query({
  args: { viewerChunkKey: v.optional(v.string()) },
  returns: v.array(residentValidator),
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    const games: Doc<"games">[] = [];
    for (const chunkKey of worldChunkNeighborhoodKeysOfKey(args.viewerChunkKey)) {
      const chunkGames = await ctx.db
        .query("games")
        .withIndex("by_last_world_chunk_key", (q) => q.eq("lastWorldChunkKey", chunkKey))
        .collect();
      games.push(...chunkGames);
    }

    const residents = [];
    for (const game of games) {
      const saved = game.lastWorldPosition;
      if (!saved) continue;
      const user = await ctx.db
        .query("users")
        .withIndex("by_external_id", (q) => q.eq("externalId", game.createdBy))
        .unique();
      residents.push({
        presenceId: `home:${game._id}`,
        kind: "human" as const,
        actorExternalId: game.createdBy,
        gameId: game._id,
        label: preferredPresenceLabel(user),
        position: { x: saved.x, y: 0, z: saved.z },
        rotationY: 0,
        rotationPitch: 0,
        online: false,
        ownerActorId: botActorExternalId(game.createdBy),
      });
    }
    return residents;
  },
});

/**
 * Human presence tick: pose upload and keep-alive in one call. Writes only
 * when the pose actually changed or lastSeenAt is stale, so idle players
 * generate no query invalidations.
 */
export const tick = mutation({
  args: {
    position: v.optional(
      v.object({
        x: v.number(),
        z: v.number(),
        y: v.optional(v.number()),
      }),
    ),
    rotationY: v.optional(v.number()),
    rotationPitch: v.optional(v.number()),
    externalId: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const actorExternalId = await resolveActor(ctx, args.externalId);
    if (!actorExternalId) return null;

    const presence = await getActivePresenceByActor(ctx, actorExternalId);
    if (!presence) return null;

    await syncPresence(ctx, presence, args.position, args.rotationY ?? presence.rotationY, args.rotationPitch);
    return null;
  },
});

export const listOnlinePresences = query({
  args: { viewerChunkKey: v.optional(v.string()) },
  returns: v.array(worldPresenceValidator),
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];
    return await listOnlinePresenceRowsNear(ctx, args.viewerChunkKey);
  },
});

export const reapIdlePresences = internalMutation({
  args: {},
  returns: v.object({ reaped: v.number(), deleted: v.number() }),
  handler: async (ctx) => presenceStore.reap(ctx, {
    onSnapshot: (row, now) => row.homeGameId ? persistGameWorldSnapshot(ctx, row.homeGameId as Id<"games">, row.position, now, true) : Promise.resolve(),
  }),
});
