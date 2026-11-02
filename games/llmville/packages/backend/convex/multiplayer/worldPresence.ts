import { v, type Infer } from "convex/values";
import { cameraYawToAvatarBodyYaw } from "@jgengine/core/movement/movementModel";
import type { Doc } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { internalMutation, mutation, query } from "../_generated/server";
import { getReadAccess, resolveActor } from "../permissions";
import { botActorExternalId, isBotActorExternalId, ownerFromBotActor } from "../botActor";
import { createWorldPresenceStore, type WorldPresenceRecord } from "@jgengine/convex/worldPresence";
import { helpers } from "../runtime";
import { LLMVILLE_GAME_ID } from "@llmville/game/game/runtime/definition";
import { worldChunkNeighborhoodKeysOfKey } from "@llmville/game/datacenter/worldChunks";
import { WORLD_POSE_RULES, preferredPresenceLabel } from "@llmville/game/multiplayer/presencePolicy";
import { PRESENCE_IDLE_TIMEOUT_MS, persistGameWorldSnapshot, spawnForGame } from "../presence";

/**
 * Who stands where in the shared datacenter. People play through the shell's presence lane
 * (`presence.ts`); this module is the session entry that stamps a lab, a name and a spawn on a row,
 * the public bot API (`convexApiCatalog`), the offline residents and the reaper.
 *
 * Rows store body yaw, the shell's convention (+Z forward at 0). The bot API speaks camera yaw
 * (-Z forward at 0), so it converts on the way in and out.
 */

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

const presenceStore = createWorldPresenceStore({ rules: WORLD_POSE_RULES, idleTimeoutMs: PRESENCE_IDLE_TIMEOUT_MS });

const presencePositionValidator = v.object({ x: v.number(), y: v.number(), z: v.number() });

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

function bodyYawToCameraYaw(bodyYaw: number): number {
  return bodyYaw - Math.PI;
}

function snapshotWriter(ctx: MutationCtx, force: boolean) {
  return (row: WorldPresenceRecord, now: number) => {
    const gameId = ctx.db.normalizeId("games", row.homeGameId);
    return gameId === null ? Promise.resolve() : persistGameWorldSnapshot(ctx, gameId, row.position, now, force);
  };
}

/**
 * Starts (or resumes) the actor's row in the shared world at its lab's spawn and returns where that is.
 * A human calls it once on entering; a bot calls it before roaming.
 */
export const ensureHumanPresence = mutation({
  args: { gameId: v.id("games"), externalId: v.optional(v.string()) },
  returns: v.union(v.object({ presenceId: v.string(), position: presencePositionValidator, rotationY: v.number() }), v.null()),
  handler: async (ctx, args) => {
    const actorExternalId = await resolveActor(ctx, args.externalId);
    if (!actorExternalId) return null;
    if (!(await getReadAccess(ctx, args.gameId, actorExternalId))) return null;

    const spawn = await spawnForGame(ctx, args.gameId);
    await persistGameWorldSnapshot(ctx, args.gameId, spawn, Date.now(), true);
    const server = await helpers.ensureServer(ctx, LLMVILLE_GAME_ID);
    const bot = isBotActorExternalId(actorExternalId);
    const user = await ctx.db.query("users").withIndex("by_external_id", (q) => q.eq("externalId", actorExternalId)).unique();
    const label = preferredPresenceLabel(user);
    const ownerActorId = bot ? ownerFromBotActor(actorExternalId) : undefined;
    const row = await presenceStore.ensure(ctx, {
      serverId: server._id,
      actorExternalId,
      homeGameId: args.gameId,
      kind: bot ? "bot" : "human",
      position: spawn,
      presenceId: bot ? actorExternalId : `human:${actorExternalId}`,
      ...(ownerActorId === undefined ? {} : { ownerActorId }),
      ...(label === null ? {} : { label }),
    });
    return { presenceId: row.presenceId, position: row.position, rotationY: row.rotationY };
  },
});

/** Bot API: move the caller's avatar, clamped to the world's pose rules. */
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
  returns: v.object({ position: presencePositionValidator, rotationY: v.number(), rotationPitch: v.number() }),
  handler: async (ctx, args) => {
    const actorExternalId = await resolveActor(ctx, args.externalId);
    const presence = actorExternalId === null ? null : await presenceStore.active(ctx, actorExternalId);
    if (!presence) return { position: { x: 0, y: 0, z: 0 }, rotationY: 0, rotationPitch: 0 };
    const bot = presence.kind === "bot";
    const next = await presenceStore.sync(ctx, presence, {
      position: args.position,
      rotationY: args.rotationY === undefined ? presence.rotationY : cameraYawToAvatarBodyYaw(args.rotationY),
      ...(args.rotationPitch === undefined ? {} : { rotationPitch: args.rotationPitch }),
    }, {
      // A bot shares its owner's lab, so only a person's own pose becomes the lab's saved position.
      ...(bot ? { rules: { ...WORLD_POSE_RULES, maxSpeed: Number.MAX_VALUE, minIntervalMs: 100 } } : { onSnapshot: snapshotWriter(ctx, false) }),
    });
    return { position: next.position, rotationY: bodyYawToCameraYaw(next.rotationY), rotationPitch: next.rotationPitch };
  },
});

function toWorldPresenceRow(ctx: QueryCtx, presence: WorldPresenceRecord): WorldPresenceRow | null {
  const gameId = ctx.db.normalizeId("games", presence.homeGameId);
  if (gameId === null) return null;
  return {
    presenceId: presence.presenceId,
    kind: presence.kind === "bot" ? "bot" : "human",
    actorExternalId: presence.actorExternalId,
    gameId,
    label: presence.label ?? null,
    position: presence.position,
    rotationY: bodyYawToCameraYaw(presence.rotationY),
    rotationPitch: presence.rotationPitch,
    online: true,
  };
}

/** Bot API: players and bots in the chunks around a viewer chunk key. */
export const listOnlinePresences = query({
  args: { viewerChunkKey: v.optional(v.string()) },
  returns: v.array(worldPresenceValidator),
  handler: async (ctx, args) => {
    if (!(await ctx.auth.getUserIdentity())) return [];
    const server = await helpers.findServer(ctx, LLMVILLE_GAME_ID);
    if (!server) return [];
    const rows: WorldPresenceRow[] = [];
    for (const presence of await presenceStore.nearby(ctx, server._id, args.viewerChunkKey)) {
      const row = toWorldPresenceRow(ctx, presence);
      if (row !== null) rows.push(row);
    }
    return rows;
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
 * Every lab owner with a saved position near a chunk, independent of who is online — never reads
 * presence rows, so pose writes cannot invalidate it. Clients drop the residents who are online.
 */
export const cityResidents = query({
  args: { viewerChunkKey: v.optional(v.string()) },
  returns: v.array(residentValidator),
  handler: async (ctx, args) => {
    if (!(await ctx.auth.getUserIdentity())) return [];
    const games: Doc<"games">[] = [];
    for (const chunkKey of worldChunkNeighborhoodKeysOfKey(args.viewerChunkKey)) {
      games.push(...await ctx.db.query("games").withIndex("by_last_world_chunk_key", (q) => q.eq("lastWorldChunkKey", chunkKey)).collect());
    }
    const residents = [];
    for (const game of games) {
      const saved = game.lastWorldPosition;
      if (!saved) continue;
      const user = await ctx.db.query("users").withIndex("by_external_id", (q) => q.eq("externalId", game.createdBy)).unique();
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

export const reapIdlePresences = internalMutation({
  args: {},
  returns: v.object({ reaped: v.number(), deleted: v.number() }),
  handler: async (ctx) => presenceStore.reap(ctx, { onSnapshot: snapshotWriter(ctx, true) }),
});
