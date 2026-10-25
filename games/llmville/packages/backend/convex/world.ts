import { forEachOnlinePlayer } from "@jgengine/convex/server";
import { v } from "convex/values";
import { normalizeBuildInventory } from "@llmville/game/build/catalog";
import { DEFAULT_TIME_SCALE } from "@jgengine/core/time/gameClock";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { internalMutation, mutation, query } from "./_generated/server";
import { TUTORIAL_STAGE_VALIDATOR } from "./schema";
import { DEFAULT_HARDWARE_INVENTORY, normalizeHardwareInventory } from "@llmville/game/infrastructure/infrastructure";
import { normalizeRackCoolingInventory } from "@llmville/game/infrastructure/catalog";
import { createDefaultResearchUnlocks } from "@llmville/game/research/researchUnlocks";
import { canEdit, isOwner, getEditorAccess, getReadAccess, ownerExternalIdForActor, resolveActor } from "./permissions";
import { ensureUserRecord } from "./user";
import { adjustCurrencyByDelta, currencyBalance, currencyBalances, seedOwnerEconomy } from "./currency";
import { seedOwnerStock, STOCK_ID } from "./inventory";
import { readModelCatalog, seedOwnerUnlocks } from "./unlocks";
import { readPlayerState, slotsToCounts } from "./playerProfile";
import { helpers } from "./jgengine/runtime";
import { worldServerRow } from "./jgengine/world";
import {
  DEFAULT_STARTING_DATA_TOKENS,
  DEFAULT_STARTING_MONEY,
  DEFAULT_WORLD_NAME,
  decideWorldBootstrap,
} from "@llmville/game/world/worldBootstrap";
import { decideCozyEventSpawn } from "@llmville/game/world/worldEvents";
import { pickStarterClaimBlock } from "@llmville/game/datacenter/starterClaim";
import { SPAWN_SEARCH_RADIUS_CELLS } from "@llmville/game/datacenter/spawn";
import { hashStructuralSeed } from "@llmville/game/world/cityHash";
import { servingIncomePerHourForGame } from "./serving";
import { unitFromUint32 } from "@llmville/game/models/trainingTransition";
import { claimsInCellSquare, releaseClaimsForGame } from "./datacenter";
import {
  assignmentsOf,
  deleteGameObjects,
  gameModelIds,
  gameObjects,
  selectDecor,
  selectRacks,
  toSceneBuildItem,
  toSceneRack,
} from "./jgengine/worldObjects";
import {
  MAX_WORLD_CHUNK_QUERY_RADIUS,
  clampWorldChunkQueryRadius,
  worldChunkKeyAt,
} from "@llmville/game/datacenter/worldChunks";
import { placedObjectsNear } from "./jgengine/worldObjects";
import { activeTrainingSessionsForGame } from "./training";


export const requireGameId = (val?: Id<"games">): Id<"games"> => {
  if (!val) throw new Error("Missing gameId on migrated record");
  return val;
};

// --- World lifecycle (game session create/delete/bootstrap) ---
// Bootstrap: 0 data tokens + enough money for 2-slot rack + 2 cheapest GPUs + license for scraper model.
// Allocate to scraping with the licensed cheap model → farm data tokens (uses TFLOPs + power).
// Use tokens to serve your own closed/owned models → earn money.
// Use servingMode (batch for data farm / realtime for revenue) as the "open vs own" lever.
// Prefer improving your existing model via repeated training/RL over spamming new ones.
const ERRORS = { unauthorized: "Unauthorized" } as const;
const STARTER_CLAIM_MAX_RINGS = 4;
const STARTER_CLAIM_MARGIN_CELLS = 8;
type WorldCtx = MutationCtx | QueryCtx;

async function getUserGamesNewestFirst(ctx: WorldCtx, externalId: string) {
  const worlds = await ctx.db.query("games").withIndex("by_created_by", (q) => q.eq("createdBy", externalId)).collect();
  return [...worlds].sort((a, b) => b.updatedAt - a.updatedAt || b.createdAt - a.createdAt);
}

async function clearBankruptcyForUser(ctx: MutationCtx, externalId: string) {
  const user = await ctx.db
    .query("users")
    .withIndex("by_external_id", (q) => q.eq("externalId", externalId))
    .first();
  if (user?.bankruptAt !== undefined) {
    await ctx.db.patch(user._id, { bankruptAt: undefined, updatedAt: Date.now() });
  }
}

async function chooseStartingPosition(ctx: MutationCtx, gameId: Id<"games">, now: number) {
  const seed = hashStructuralSeed(["spawn", gameId]);
  let block = pickStarterClaimBlock(seed, []);
  for (let ring = 1; ring <= STARTER_CLAIM_MAX_RINGS; ring++) {
    const halfSize = SPAWN_SEARCH_RADIUS_CELLS * ring;
    block = pickStarterClaimBlock(seed, await claimsInCellSquare(ctx, halfSize));
    const reach = Math.max(Math.abs(block.center.cx), Math.abs(block.center.cz)) + STARTER_CLAIM_MARGIN_CELLS;
    if (reach <= halfSize) break;
  }
  await ctx.db.patch(gameId, {
    lastWorldPosition: { x: block.spawn.x, z: block.spawn.z },
    lastWorldChunkKey: worldChunkKeyAt(block.spawn),
    lastWorldPositionAt: now,
  });
}

async function seedStarterInventory(ctx: MutationCtx, externalId: string) {
  await seedOwnerEconomy(ctx, externalId, {
    money: DEFAULT_STARTING_MONEY,
    data: DEFAULT_STARTING_DATA_TOKENS,
  });
  await seedOwnerUnlocks(ctx, externalId, createDefaultResearchUnlocks());
  await seedOwnerStock(ctx, externalId, {
    build: normalizeBuildInventory(),
    hardware: DEFAULT_HARDWARE_INVENTORY,
    cooling: normalizeRackCoolingInventory(),
  });
}

async function createWorld(ctx: MutationCtx, externalId: string): Promise<Id<"games">> {
  const now = Date.now();
  await clearBankruptcyForUser(ctx, externalId);
  const gameId = await ctx.db.insert("games", {
    name: DEFAULT_WORLD_NAME,
    lastIncomeTickAt: now,
    lastServingTickAt: now,
    lastEventSpawnAt: now,
    gameTimeScale: DEFAULT_TIME_SCALE,
    tutorialStage: "open_tablet",
    tutorialWords: 0,
    lastBilledGameDay: 0,
    bannedExternalIds: [],
    createdBy: externalId,
    createdAt: now,
    updatedAt: now,
  });
  await seedStarterInventory(ctx, externalId);
  await chooseStartingPosition(ctx, gameId, now);
  return gameId;
}

/** Child rows per game; order does not matter for deletion. */
const WORLD_GRAPH_TABLES = [
  "datacenterClaims",
  "models",
  "events",
  "bills",
  "hostedModels",
] as const;

/** Pre-release: clear all gameplay rows (dev/prod resets). */
export const wipeAllGameplayData = internalMutation({
  args: {},
  returns: v.object({ gamesDeleted: v.number() }),
  handler: async (ctx) => {
    const games = await ctx.db.query("games").collect();
    for (const game of games) {
      await deleteGameObjects(ctx, game._id, game.createdBy);
      await releaseClaimsForGame(ctx, game._id);
      const poses = await ctx.db.query("jgPoses").withIndex("by_home_game", q => q.eq("homeGameId", game._id)).collect();
      for (const pose of poses) await ctx.db.delete(pose._id);
      for (const tableName of WORLD_GRAPH_TABLES) {
        const rows = await ctx.db
          .query(tableName)
          .withIndex("by_game_id", (q) => q.eq("gameId", game._id))
          .collect();
        for (const row of rows) {
          await ctx.db.delete(row._id);
        }
      }
      await ctx.db.delete(game._id);
    }
    return { gamesDeleted: games.length };
  },
});

const DELETE_WORLD_BATCH = 350;

const bootstrapContinuationValidator = v.object({
  kind: v.literal("bootstrap"),
  displayName: v.string(),
  avatarId: v.string(),
});

/**
 * Deletes one world's related rows in bounded batches (avoids Convex's per-mutation read limit).
 * Chains to further worlds via `queuedGameIds`, then optionally runs bootstrap create.
 */
export const deleteWorldGraphChunk = internalMutation({
  args: {
    gameId: v.id("games"),
    externalId: v.string(),
    tableIndex: v.number(),
    queuedGameIds: v.array(v.id("games")),
    continuation: v.optional(bootstrapContinuationValidator),
  },
  handler: async (ctx, args) => {
    const scheduleNextWorld = async (nextArgs: {
      gameId: Id<"games">;
      queuedGameIds: Id<"games">[];
    }) => {
      await ctx.scheduler.runAfter(0, internal.world.deleteWorldGraphChunk, {
        gameId: nextArgs.gameId,
        externalId: args.externalId,
        tableIndex: 0,
        queuedGameIds: nextArgs.queuedGameIds,
        continuation: args.continuation,
      });
    };

    const finishQueueOrBootstrap = async () => {
      if (args.queuedGameIds.length > 0) {
        const [next, ...rest] = args.queuedGameIds;
        await scheduleNextWorld({ gameId: next, queuedGameIds: rest });
        return;
      }
      if (args.continuation?.kind === "bootstrap") {
        await ensureUserRecord(ctx, args.externalId, args.continuation.displayName, args.continuation.avatarId);
        await createWorld(ctx, args.externalId);
      }
    };

    // The game row may already be gone — `deleteWorld` removes it synchronously
    // so the menu reflects the deletion immediately — but we still need to purge
    // the (now orphaned) child rows. Only enforce ownership when the row exists.
    const game = await ctx.db.get(args.gameId);
    if (game && game.createdBy !== args.externalId) throw new Error(ERRORS.unauthorized);

    if (args.tableIndex >= WORLD_GRAPH_TABLES.length) {
      if (game) await ctx.db.delete(args.gameId);
      await finishQueueOrBootstrap();
      return;
    }

    if (args.tableIndex === 0) {
      await deleteGameObjects(ctx, args.gameId, args.externalId);
      if (game) await releaseClaimsForGame(ctx, args.gameId);
      const poses = await ctx.db.query("jgPoses").withIndex("by_home_game", q => q.eq("homeGameId", args.gameId)).take(DELETE_WORLD_BATCH);
      for (const pose of poses) await ctx.db.delete(pose._id);
    }

    const tableName = WORLD_GRAPH_TABLES[args.tableIndex];
    const docs = await ctx.db
      .query(tableName)
      .withIndex("by_game_id", (q) => q.eq("gameId", args.gameId))
      .take(DELETE_WORLD_BATCH);

    if (docs.length === 0) {
      await ctx.scheduler.runAfter(0, internal.world.deleteWorldGraphChunk, {
        gameId: args.gameId,
        externalId: args.externalId,
        tableIndex: args.tableIndex + 1,
        queuedGameIds: args.queuedGameIds,
        continuation: args.continuation,
      });
      return;
    }

    for (const doc of docs) {
      await ctx.db.delete(doc._id);
    }

    const chunkArgs = {
      gameId: args.gameId,
      externalId: args.externalId,
      queuedGameIds: args.queuedGameIds,
      continuation: args.continuation,
    };

    if (docs.length === DELETE_WORLD_BATCH) {
      await ctx.scheduler.runAfter(0, internal.world.deleteWorldGraphChunk, {
        ...chunkArgs,
        tableIndex: args.tableIndex,
      });
      return;
    }

    await ctx.scheduler.runAfter(0, internal.world.deleteWorldGraphChunk, {
      ...chunkArgs,
      tableIndex: args.tableIndex + 1,
    });
  },
});

function enqueueWorldGraphDelete(
  ctx: MutationCtx,
  externalId: string,
  gameIds: Id<"games">[],
  continuation?: { displayName: string; avatarId: string },
) {
  if (gameIds.length === 0) return;
  const [first, ...rest] = gameIds;
  void ctx.scheduler.runAfter(0, internal.world.deleteWorldGraphChunk, {
    gameId: first,
    externalId,
    tableIndex: 0,
    queuedGameIds: rest,
    continuation: continuation ? { kind: "bootstrap" as const, ...continuation } : undefined,
  });
}

/** Child rows a reset world starts without; the game row itself survives so the player keeps their lab id. */
const INSOLVENCY_RESET_TABLES = ["models", "events", "bills", "hostedModels"] as const;

/**
 * Insolvency of last resort: everything the lab built is sold off and the world restarts from the
 * bootstrap state on the same game id.
 */
export async function resetWorldForInsolvency(ctx: MutationCtx, gameId: Id<"games">): Promise<boolean> {
  const game = await ctx.db.get(gameId);
  if (!game?.createdBy) return false;

  const externalId = game.createdBy;
  const now = Date.now();

  const user = await ctx.db
    .query("users")
    .withIndex("by_external_id", (q) => q.eq("externalId", externalId))
    .first();
  if (user) await ctx.db.patch(user._id, { bankruptAt: now, updatedAt: now });

  await deleteGameObjects(ctx, gameId, externalId);
  for (const tableName of INSOLVENCY_RESET_TABLES) {
    const rows = await ctx.db.query(tableName).withIndex("by_game_id", (q) => q.eq("gameId", gameId)).collect();
    await Promise.all(rows.map((row) => ctx.db.delete(row._id)));
  }
  await releaseClaimsForGame(ctx, gameId);
  const server = await worldServerRow(ctx);
  if (server) await helpers.resetPlayerProfile(ctx, server._id, externalId);
  await seedStarterInventory(ctx, externalId);
  await ctx.db.patch(gameId, {
    lastIncomeTickAt: now,
    lastServingTickAt: now,
    lastEventSpawnAt: now,
    lastBilledGameDay: 0,
    reputation: 0,
    updatedAt: now,
  });
  await chooseStartingPosition(ctx, gameId, now);
  return true;
}

async function bootstrapUserWorld(
  ctx: MutationCtx,
  externalId: string,
  forceNew: boolean,
  profile: { displayName: string; avatarId: string } | null,
) {
  const worlds = await getUserGamesNewestFirst(ctx, externalId);
  const decision = decideWorldBootstrap({ forceNew, worlds });
  switch (decision.action) {
    case "create":
      return { gameId: await createWorld(ctx, externalId), created: true as const };
    case "delete_all_and_pending":
      enqueueWorldGraphDelete(ctx, externalId, decision.gameIds, profile ?? undefined);
      return { gameId: null, created: true as const, pending: true as const };
    case "use_existing":
      if (decision.staleGameIds.length > 0) {
        enqueueWorldGraphDelete(ctx, externalId, decision.staleGameIds);
      }
      return { gameId: decision.gameId, created: false as const };
  }
}

export const bootstrapWorld = mutation({
  args: { displayName: v.string(), avatarId: v.string(), forceNew: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error(ERRORS.unauthorized);
    await ensureUserRecord(ctx, identity.subject, args.displayName, args.avatarId);
    const forceNew = args.forceNew === true;
    return await bootstrapUserWorld(
      ctx,
      identity.subject,
      forceNew,
      forceNew ? { displayName: args.displayName, avatarId: args.avatarId } : null,
    );
  },
});

export const startOverWorld = mutation({
  args: { displayName: v.string(), avatarId: v.string() },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error(ERRORS.unauthorized);
    await ensureUserRecord(ctx, identity.subject, args.displayName, args.avatarId);
    return await bootstrapUserWorld(ctx, identity.subject, true, {
      displayName: args.displayName,
      avatarId: args.avatarId,
    });
  },
});

export const deleteWorld = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error(ERRORS.unauthorized);
    const worlds = await getUserGamesNewestFirst(ctx, identity.subject);
    if (worlds.length === 0) return { deletedCount: 0 };
    const gameIds = worlds.map((world) => world._id);
    // Remove the game rows up front so getUserWorld reports the deletion right
    // away (and a reload can't resurrect a half-deleted world); the heavier
    // child-graph cleanup then runs asynchronously in bounded batches.
    for (const gameId of gameIds) {
      await deleteGameObjects(ctx, gameId, identity.subject);
      await releaseClaimsForGame(ctx, gameId);
      await ctx.db.delete(gameId);
    }
    enqueueWorldGraphDelete(ctx, identity.subject, gameIds);
    return { deletedCount: worlds.length };
  },
});

export const getUserWorld = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    const world = (await getUserGamesNewestFirst(ctx, identity.subject))[0];
    if (!world) return null;
    return { _id: world._id, name: world.name, money: await currencyBalance(ctx, world, "money"), createdAt: world.createdAt, updatedAt: world.updatedAt };
  },
});

export const setTutorialProgress = mutation({
  args: {
    gameId: v.id("games"),
    tutorialStage: TUTORIAL_STAGE_VALIDATOR,
    tutorialWords: v.number(),
  },
  handler: async (ctx, args) => {
    const owned = await getEditorAccess(ctx, args.gameId, undefined);
    await ctx.db.patch(owned.game._id, {
      tutorialStage: args.tutorialStage,
      tutorialWords: Math.max(0, Math.floor(args.tutorialWords)),
      updatedAt: Date.now(),
    });
    return { updated: true };
  },
});

// --- Events (mirroring real AI/LLM discourse) ---
async function trySpawnCozyEventForWorld(ctx: MutationCtx, gameId: Id<"games">) {
  const game = await ctx.db.get(gameId);
  if (!game) return null;
  const now = Date.now();
  const hasUnresolvedEvent = await ctx.db
    .query("events")
    .withIndex("by_game_id_and_resolved_at", (q) => q.eq("gameId", gameId).eq("resolvedAt", undefined))
    .first();

  const rngBuf = new Uint32Array(1);
  crypto.getRandomValues(rngBuf);
  const decision = decideCozyEventSpawn({
    hasUnresolvedEvent: hasUnresolvedEvent !== null,
    lastEventSpawnAt: game.lastEventSpawnAt,
    now,
    rngUnit: unitFromUint32(rngBuf[0]!),
    servingIncomePerHour: await servingIncomePerHourForGame(ctx, gameId),
  });
  if (decision.kind === "skip") return null;

  const eventId = await ctx.db.insert("events", {
    gameId,
    eventType: decision.event.type,
    description: decision.event.description,
    rewardMoney: decision.rewardMoney,
    createdAt: now,
  });
  await ctx.db.patch(game._id, { lastEventSpawnAt: now, updatedAt: now });
  return eventId;
}

export const spawnCozyEvent = mutation({
  args: { gameId: v.id("games"), externalId: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const game = await ctx.db.get(args.gameId);
    const actorExternalId = await resolveActor(ctx, args.externalId);
    if (!game || !actorExternalId || !(await canEdit(ctx, game, actorExternalId))) return { spawned: false };
    const eventId = await trySpawnCozyEventForWorld(ctx, args.gameId);
    return eventId ? { spawned: true, eventId } : { spawned: false };
  },
});

export const spawnEventsForAllWorlds = internalMutation({
  args: { cursor: v.optional(v.union(v.string(), v.null())), nowMs: v.optional(v.number()) },
  handler: async (ctx, args): Promise<{ scheduled: number; remaining: boolean }> => forEachOnlinePlayer(ctx, {
    batchSize: 25, groupBy: "homeGameId", handler: internal.world.spawnEventsBatch, continuation: internal.world.spawnEventsForAllWorlds, ...args,
  }),
});

export const spawnEventsBatch = internalMutation({
  args: { players: v.array(v.object({ serverId: v.string(), userId: v.string(), homeGameId: v.optional(v.string()) })), nowMs: v.number() },
  handler: async (ctx, args) => {
    let spawnedCount = 0;
    for (const homeGameId of new Set(args.players.map(player => player.homeGameId))) {
      const gameId = homeGameId ? ctx.db.normalizeId("games", homeGameId) : null;
      if (!gameId) continue;
      if (await trySpawnCozyEventForWorld(ctx, gameId)) spawnedCount++;
    }
    return { spawnedCount };
  },
});

export const resolveEvent = mutation({
  args: { eventId: v.id("events"), externalId: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const event = await ctx.db.get(args.eventId);
    if (!event) return { resolved: false };
    if (event.resolvedAt) return { resolved: true };
    const game = await ctx.db.get(requireGameId(event.gameId));
    const actorExternalId = await resolveActor(ctx, args.externalId);
    if (!game || !actorExternalId || !(await canEdit(ctx, game, actorExternalId))) return { resolved: false };
    const res = await adjustCurrencyByDelta(ctx, event.gameId as Id<"games">, "money", event.rewardMoney);
    if (!res.success) return { resolved: false };
    await ctx.db.patch(event._id, { resolvedAt: Date.now() });
    return { resolved: true, rewardMoney: event.rewardMoney };
  },
});

// --- Read-model (world state queries) ---
export const state = query({
  args: { gameId: v.id("games") },
  handler: async (ctx, args) => {
    const access = await getReadAccess(ctx, args.gameId, undefined);
    const game = await ctx.db.get(args.gameId);
    const serverNow = Date.now();
    if (!access || !game) return { access: { canView: false, canEdit: false, isOwner: false }, game: null };
    const ownerUser = game.createdBy
      ? await ctx.db
          .query("users")
          .withIndex("by_external_id", (q) => q.eq("externalId", game.createdBy))
          .unique()
      : null;
    const balances = await currencyBalances(ctx, game);
    // Inventories are the owner's private stock — only expose them to actors
    // with edit access; visitors get empty bags.
    const stock = access.canEdit ? await readPlayerState(ctx, game.createdBy) : null;
    return {
      access: {
        canView: true,
        canEdit: access.canEdit,
        isOwner: isOwner(game, access.actorExternalId),
      },
      game: {
        _id: game._id,
        money: balances.money,
        dataTokens: balances.data,
        buildInventory: normalizeBuildInventory(stock ? slotsToCounts(stock.inventories[STOCK_ID.build]) : {}),
        hardwareInventory: normalizeHardwareInventory(stock ? slotsToCounts(stock.inventories[STOCK_ID.hardware]) : {}),
        coolingInventory: normalizeRackCoolingInventory(stock ? slotsToCounts(stock.inventories[STOCK_ID.cooling]) : {}),
        createdAt: game.createdAt,
        gameTimeScale: game.gameTimeScale,
        serverNow,
        tutorialStage: game.tutorialStage,
        tutorialWords: game.tutorialWords,
        modelCatalog: await readModelCatalog(ctx, game),
        computeAssignments: assignmentsOf(
          selectRacks(await gameObjects(ctx, game)),
          await gameModelIds(ctx, game._id),
        ),
        activeScrapeTier: game.activeScrapeTier,
        servingMode: game.servingMode,
        ownerAvatarId: ownerUser?.avatarId ?? null,
      },
    };
  },
});

async function loadGameScene(ctx: QueryCtx, gameId: Id<"games">) {
  const game = await ctx.db.get(gameId);
  const now = Date.now();
  const [objects, models, activeTrainingSessions, unresolvedEvents] = await Promise.all([
    game === null ? Promise.resolve([]) : gameObjects(ctx, game),
    ctx.db.query("models").withIndex("by_game_id", (q) => q.eq("gameId", gameId)).collect(),
    game === null ? Promise.resolve([]) : activeTrainingSessionsForGame(ctx, game, now),
    ctx.db.query("events").withIndex("by_game_id_and_resolved_at", (q) => q.eq("gameId", gameId).eq("resolvedAt", undefined)).collect(),
  ]);
  return {
    racks: selectRacks(objects).map(toSceneRack),
    placedBuildItems: selectDecor(objects).map(toSceneBuildItem),
    models,
    activeTrainingSessions,
    unresolvedEvents: unresolvedEvents.map((event) => ({ _id: event._id })),
  };
}

const EMPTY_GAME_SCENE = {
  racks: [],
  placedBuildItems: [],
  models: [],
  activeTrainingSessions: [],
  unresolvedEvents: [],
} as const;

export const scene = query({
  args: { gameId: v.id("games") },
  handler: async (ctx, args) => {
    if (!(await getReadAccess(ctx, args.gameId, undefined))) return EMPTY_GAME_SCENE;
    return loadGameScene(ctx, args.gameId);
  },
});

/** Every rack and placed build item in the chunks around the viewer, with its owning player. */
export const worldScene = query({
  args: { x: v.number(), z: v.number(), radius: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return { racks: [], placedBuildItems: [] };
    const objects = await placedObjectsNear(
      ctx,
      { x: args.x, z: args.z },
      clampWorldChunkQueryRadius(args.radius ?? MAX_WORLD_CHUNK_QUERY_RADIUS),
    );
    return {
      racks: selectRacks(objects).map(toSceneRack),
      placedBuildItems: selectDecor(objects).map(toSceneBuildItem),
    };
  },
});

export const getWorldSceneStates = query({
  args: { gameIds: v.array(v.id("games")) },
  handler: async (ctx, args) => {
    const uniqueIds = Array.from(new Set(args.gameIds));
    return Promise.all(
      uniqueIds.map(async (gameId) => {
        const allowed = await getReadAccess(ctx, gameId, undefined);
        if (!allowed) return { gameId, ...EMPTY_GAME_SCENE };
        return { gameId, ...(await loadGameScene(ctx, gameId)) };
      }),
    );
  },
});

function normalizeUsername(raw: string): string {
  return raw.toLowerCase().trim().replace(/^@/, "");
}

async function callerOwnGame(ctx: MutationCtx | QueryCtx, externalId: string): Promise<Doc<"games"> | null> {
  return (await getUserGamesNewestFirst(ctx, externalId))[0] ?? null;
}

export const banVisitor = mutation({
  args: { username: v.optional(v.string()), externalId: v.optional(v.string()) },
  returns: v.object({ banned: v.boolean(), reason: v.optional(v.string()) }),
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return { banned: false, reason: "Not authenticated" };
    const ownerExternalId = identity.subject;
    const game = await callerOwnGame(ctx, ownerExternalId);
    if (!game) return { banned: false, reason: "No world to manage" };

    let targetExternalId: string | null = null;
    if (args.username && args.username.trim().length > 0) {
      const user = await ctx.db
        .query("users")
        .withIndex("by_username", (q) => q.eq("username", normalizeUsername(args.username!)))
        .first();
      if (!user) return { banned: false, reason: "No player with that username" };
      targetExternalId = user.externalId;
    } else if (args.externalId && args.externalId.trim().length > 0) {
      targetExternalId = ownerExternalIdForActor(args.externalId.trim());
    }
    if (!targetExternalId) return { banned: false, reason: "Provide a username" };
    if (targetExternalId === ownerExternalId) return { banned: false, reason: "You can't ban yourself" };

    const bannedExternalIds = game.bannedExternalIds ?? [];
    if (!bannedExternalIds.includes(targetExternalId)) {
      await ctx.db.patch(game._id, {
        bannedExternalIds: [...bannedExternalIds, targetExternalId],
        updatedAt: Date.now(),
      });
    }
    return { banned: true };
  },
});

export const unbanVisitor = mutation({
  args: { externalId: v.string() },
  returns: v.object({ unbanned: v.boolean() }),
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return { unbanned: false };
    const game = await callerOwnGame(ctx, identity.subject);
    if (!game) return { unbanned: false };
    const target = ownerExternalIdForActor(args.externalId.trim());
    const bannedExternalIds = game.bannedExternalIds ?? [];
    if (!bannedExternalIds.includes(target)) return { unbanned: false };
    await ctx.db.patch(game._id, {
      bannedExternalIds: bannedExternalIds.filter((id) => id !== target),
      updatedAt: Date.now(),
    });
    return { unbanned: true };
  },
});

export const listPlotBans = query({
  args: {},
  returns: v.array(
    v.object({
      externalId: v.string(),
      username: v.union(v.string(), v.null()),
      displayName: v.union(v.string(), v.null()),
    }),
  ),
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];
    const game = await callerOwnGame(ctx, identity.subject);
    if (!game) return [];
    return await Promise.all(
      (game.bannedExternalIds ?? []).map(async (externalId) => {
        const user = await ctx.db
          .query("users")
          .withIndex("by_external_id", (q) => q.eq("externalId", externalId))
          .first();
        return {
          externalId,
          username: user?.username ?? null,
          displayName: user?.displayName ?? null,
        };
      }),
    );
  },
});
