import { forEachOnlinePlayer } from "@jgengine/convex/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { getFounderMultipliers } from "@llmville/game/user/founder";
import { internal } from "./_generated/api";
import { internalMutation, mutation, query } from "./_generated/server";
import {
  canEdit,
  getEditorAccess,
  getReadAccess,
  resolveActor,
} from "./permissions";
import { requireGameId } from "./world";
import { addCurrency } from "./currency";
import { getEffectiveFrontierForGame } from "./dailyMarket";
import { loadActiveHostedModels } from "./market";
import { trainingJobsForGame } from "./training";
import { readModelCatalog } from "./unlocks";
import { bestScrapingTokensPerToken } from "@llmville/game/models/scraping";

import { computeRackHardwareStats } from "@llmville/game/infrastructure/infrastructure";
import { computeUpgradeEffects } from "@llmville/game/user/personalUpgrades";
import { servingIncomePerHour } from "@llmville/game/economy/hourlyRates";

import {
  buildServingSnapshotFromRows,
  decideServeModel,
  decideServingIncomeTick,
  hasServingActivity,
  installedGpuCount,
  servingTickTimingFromGame,
  shapeServingStats,
} from "@llmville/game/economy/servingAdapter";
import {
  decideScrapingTick,
  scrapeLaneTflops,
  nextServingTickAnchor,
  scrapingTickCanBeSkipped,
  type HostedModelSnapshot,
  type ServingModelSnapshot,
  type ServingSnapshot,
  type ServingTickTiming,
} from "@llmville/game/economy/servingTick";
import { assignmentsOf, gameModelIds, gameRacks, modelIdSet, rackSnapshots, type PlacedRackObject } from "./jgengine/worldObjects";
import { servingModeValidator } from "./schema";

const NOT_APPLIED_TICK_RESULT = {
  applied: false,
  gain: 0,
  servingGainPerSecond: 0,
};

const ZERO_GAIN_TICK_RESULT = {
  applied: true,
  gain: 0,
  servingGainPerSecond: 0,
};

type ServingDataCtx = MutationCtx | QueryCtx;

type LoadedServingData = {
  game: Doc<"games"> | null;
  racks: PlacedRackObject[];
  models: Doc<"models">[];
  hostedModels: Doc<"hostedModels">[];
  hasRunningTrainingJobs: boolean;
  frontierBenchmark: number;
};

function modelSnapshots(models: Doc<"models">[]): ServingModelSnapshot[] {
  return models.map((model) => ({
    modelId: model._id as string,
    tokensPerSecond: model.tokensPerSecond,
    moneyPerToken: model.moneyPerToken,
    tokensPerToken: model.tokensPerToken,
    paramsB: model.paramsB,
    precision: model.precision,
    benchmarkScore: model.benchmarkScore,
    trainedAt: model.createdAt,
    baseModelId: model.baseModelId,
  }));
}

function hostedModelSnapshots(hostedModels: Doc<"hostedModels">[]): HostedModelSnapshot[] {
  return hostedModels.map((hosted) => ({
    vendorModelId: hosted.vendorModelId,
    revenueShareHost: hosted.revenueShareHost,
  }));
}

function getServingModels(models: Doc<"models">[]) {
  return models.filter(model => model.launchState === "serving");
}

function getServingTickTiming(game: Doc<"games">, now = Date.now()): ServingTickTiming {
  return servingTickTimingFromGame(game, now);
}

function buildServingSnapshot(
  game: Doc<"games">,
  racks: PlacedRackObject[],
  liveModelIds: ReadonlySet<string>,
  servingModels: Doc<"models">[],
  hostedModels: Doc<"hostedModels">[],
  hasRunningTrainingJobs: boolean,
  ownerUser: Doc<"users"> | null,
  frontierBenchmark: number,
): ServingSnapshot {
  const upgradeEffects = computeUpgradeEffects(ownerUser);
  return buildServingSnapshotFromRows({
    game,
    racks: rackSnapshots(racks),
    computeAssignments: assignmentsOf(racks, liveModelIds),
    servingModels: modelSnapshots(servingModels),
    hostedModels: hostedModelSnapshots(hostedModels),
    hasRunningTrainingJobs,
    servingStabilityBonus: upgradeEffects.servingStabilityBonus,
    ownerAvatarId: ownerUser?.avatarId,
    frontierBenchmark,
    powerCapacityKw: upgradeEffects.powerCapacityKw,
  });
}

async function loadServingData(
  ctx: ServingDataCtx,
  gameId: Id<"games">,
): Promise<LoadedServingData> {
  const game = await ctx.db.get(gameId);
  const [racks, models, hostedModels, trainingJobs] = await Promise.all([
    game === null ? Promise.resolve([]) : gameRacks(ctx, game),
    ctx.db
      .query("models")
      .withIndex("by_game_id", query => query.eq("gameId", gameId))
      .collect(),
    loadActiveHostedModels(ctx, gameId),
    game === null ? Promise.resolve([]) : trainingJobsForGame(ctx, game, Date.now()),
  ]);
  const frontierBenchmark = await getEffectiveFrontierForGame(ctx, game);

  return { game, racks, models, hostedModels, hasRunningTrainingJobs: trainingJobs.length > 0, frontierBenchmark };
}

async function loadGameOwnerUser(
  ctx: MutationCtx | QueryCtx,
  createdBy?: string | null,
) {
  if (!createdBy) {
    return null;
  }

  return ctx.db
    .query("users")
    .withIndex("by_external_id", query => query.eq("externalId", createdBy))
    .unique();
}

async function persistZeroGainServingTick(
  ctx: MutationCtx,
  game: Doc<"games">,
  timing: ServingTickTiming,
  hasServingModels: boolean,
) {
  if (timing.elapsedSeconds > 0) {
    await ctx.db.patch(game._id, {
      lastServingTickAt: hasServingModels ? nextServingTickAnchor(timing) : timing.now,
    });
  }

  return ZERO_GAIN_TICK_RESULT;
}

async function persistServingIncomeTick(
  ctx: MutationCtx,
  game: Doc<"games">,
  timing: ServingTickTiming,
  servingSnapshot: ServingSnapshot,
) {
  const decision = decideServingIncomeTick({ timing, servingSnapshot });

  if (decision.gain > 0) {
    await addCurrency(ctx, game._id, "money", decision.gain);
    await ctx.db.patch(game._id, {
      lastServingTickAt: decision.lastServingTickAt,
      updatedAt: Date.now(),
    });
  }

  return {
    applied: decision.applied,
    gain: decision.gain,
    servingGainPerSecond: decision.servingGainPerSecond,
    effectiveTps: "effectiveTps" in decision ? decision.effectiveTps : undefined,
    capacityTps: "capacityTps" in decision ? decision.capacityTps : undefined,
  };
}

async function applyServingIncomeTick(ctx: MutationCtx, gameId: Id<"games">, now = Date.now()) {
  const servingData = await loadServingData(ctx, gameId);

  if (!servingData.game) {
    return NOT_APPLIED_TICK_RESULT;
  }

  if (now <= (servingData.game.lastServingTickAt ?? servingData.game.lastIncomeTickAt)) return NOT_APPLIED_TICK_RESULT;
  const timing = getServingTickTiming(servingData.game, now);
  const servingModels = getServingModels(servingData.models);
  const servingActive = hasServingActivity(
    servingModels.length,
    servingData.hostedModels.length,
    installedGpuCount(rackSnapshots(servingData.racks)),
  );

  if (!servingActive || timing.elapsedSeconds <= 0) {
    return persistZeroGainServingTick(
      ctx,
      servingData.game,
      timing,
      servingModels.length > 0 || servingData.hostedModels.length > 0,
    );
  }

  const ownerUser = await loadGameOwnerUser(ctx, servingData.game.createdBy);
  const servingSnapshot = buildServingSnapshot(
    servingData.game,
    servingData.racks,
    modelIdSet(servingData.models),
    servingModels,
    servingData.hostedModels,
    servingData.hasRunningTrainingJobs,
    ownerUser,
    servingData.frontierBenchmark,
  );

  return persistServingIncomeTick(
    ctx,
    servingData.game,
    timing,
    servingSnapshot,
  );
}

async function applyScrapingTick(
  ctx: MutationCtx,
  game: Doc<"games">,
  now = Date.now(),
): Promise<{ applied: boolean; tokens: number }> {
  if (scrapingTickCanBeSkipped({ lastScrapingTickAt: game.lastScrapingTickAt, now })) {
    return { applied: false, tokens: 0 };
  }
  const racks = await gameRacks(ctx, game);
  const computeAssignments = assignmentsOf(racks, await gameModelIds(ctx, game._id));
  const ownerUser = await loadGameOwnerUser(ctx, game.createdBy);
  const founderMultipliers = getFounderMultipliers(ownerUser?.avatarId);
  const [modelCatalog, ownedModels] = await Promise.all([
    readModelCatalog(ctx, game),
    ctx.db.query("models").withIndex("by_game_id", (q) => q.eq("gameId", game._id)).collect(),
  ]);
  const decision = decideScrapingTick({
    racks: rackSnapshots(racks),
    computeAssignments,
    activeScrapeTier: game.activeScrapeTier,
    sourceTokensPerToken: bestScrapingTokensPerToken(modelCatalog, ownedModels),
    lastScrapingTickAt: game.lastScrapingTickAt,
    trainingPowerFp16Multiplier: founderMultipliers.trainingPowerFp16Multiplier,
    now,
  });

  if (decision.kind === "reset_anchor") {
    await ctx.db.patch(game._id, { lastScrapingTickAt: now });
    return { applied: false, tokens: 0 };
  }
  if (decision.kind === "skip") {
    return { applied: false, tokens: 0 };
  }

  const accrued = await addCurrency(ctx, game._id, "data", decision.tokens);
  if (!accrued.success) {
    return { applied: false, tokens: 0 };
  }
  await ctx.db.patch(game._id, {
    lastScrapingTickAt: decision.nextAnchorAt,
    updatedAt: now,
  });
  return { applied: true, tokens: decision.tokens };
}

export const tickAllScraping = internalMutation({
  args: { cursor: v.optional(v.union(v.string(), v.null())), nowMs: v.optional(v.number()) },
  handler: async (ctx, args): Promise<{ scheduled: number; remaining: boolean }> => forEachOnlinePlayer(ctx, {
    batchSize: 25, groupBy: "homeGameId", handler: internal.serving.tickScrapingBatch, continuation: internal.serving.tickAllScraping, ...args,
  }),
});

export const tickScrapingBatch = internalMutation({
  args: { players: v.array(v.object({ serverId: v.string(), userId: v.string(), homeGameId: v.optional(v.string()) })), nowMs: v.number() },
  handler: async (ctx, args) => {
    let gamesProcessed = 0;
    let totalTokens = 0;
    for (const homeGameId of new Set(args.players.map(player => player.homeGameId))) {
      const gameId = homeGameId ? ctx.db.normalizeId("games", homeGameId) : null;
      if (!gameId) continue;
      const game = await ctx.db.get(gameId);
      if (!game) continue;
      const result = await applyScrapingTick(ctx, game, args.nowMs);
      if (result.applied) {
        gamesProcessed += 1;
        totalTokens += result.tokens;
      }
    }
    return { gamesProcessed, totalTokens };
  },
});

export const tickAllServingIncome = internalMutation({
  args: { cursor: v.optional(v.union(v.string(), v.null())), nowMs: v.optional(v.number()) },
  handler: async (ctx, args): Promise<{ scheduled: number; remaining: boolean }> => forEachOnlinePlayer(ctx, {
    batchSize: 25, groupBy: "homeGameId", handler: internal.serving.tickServingIncomeBatch, continuation: internal.serving.tickAllServingIncome, ...args,
  }),
});

export const tickServingIncomeBatch = internalMutation({
  args: { players: v.array(v.object({ serverId: v.string(), userId: v.string(), homeGameId: v.optional(v.string()) })), nowMs: v.number() },
  handler: async (ctx, args) => {
    let gamesProcessed = 0;
    let totalGain = 0;

    for (const homeGameId of new Set(args.players.map(player => player.homeGameId))) {
      const gameId = homeGameId ? ctx.db.normalizeId("games", homeGameId) : null;
      if (!gameId) continue;
      const tickResult = await applyServingIncomeTick(ctx, gameId, args.nowMs);
      if (!tickResult.applied) {
        continue;
      }

      gamesProcessed += 1;
      totalGain += tickResult.gain;
    }

    return { gamesProcessed, totalGain };
  },
});

/** Gross serving income per hour for a game — the yardstick cozy-event rewards scale against. */
export async function scrapeLaneTflopsForGame(ctx: MutationCtx, game: Doc<"games">): Promise<number> {
  const racks = await gameRacks(ctx, game);
  const computeAssignments = assignmentsOf(racks, await gameModelIds(ctx, game._id));
  const ownerUser = await loadGameOwnerUser(ctx, game.createdBy);
  return scrapeLaneTflops({
    racks: rackSnapshots(racks),
    computeAssignments,
    trainingPowerFp16Multiplier: getFounderMultipliers(ownerUser?.avatarId).trainingPowerFp16Multiplier,
  });
}

export async function servingIncomePerHourForGame(
  ctx: ServingDataCtx,
  gameId: Id<"games">,
): Promise<number> {
  const servingData = await loadServingData(ctx, gameId);
  if (!servingData.game) return 0;

  const servingModels = getServingModels(servingData.models);
  if (servingModels.length === 0 && servingData.hostedModels.length === 0) return 0;

  const ownerUser = await loadGameOwnerUser(ctx, servingData.game.createdBy);
  const snapshot = buildServingSnapshot(
    servingData.game,
    servingData.racks,
    modelIdSet(servingData.models),
    servingModels,
    servingData.hostedModels,
    servingData.hasRunningTrainingJobs,
    ownerUser,
    servingData.frontierBenchmark,
  );
  return servingIncomePerHour(snapshot.servingGainPerSecond);
}

export const stats = query({
  args: { gameId: v.id("games") },
  handler: async (ctx, args) => {
    const hasReadAccess = await getReadAccess(ctx, args.gameId, undefined);

    if (!hasReadAccess) {
      return null;
    }

    const servingData = await loadServingData(ctx, args.gameId);

    if (!servingData.game) {
      return null;
    }

    const servingModels = getServingModels(servingData.models);
    const hasHostedModels = servingData.hostedModels.length > 0;
    const ownerUser = await loadGameOwnerUser(ctx, servingData.game.createdBy);

    if (!servingModels.length && !hasHostedModels) {
      const idleSnapshot = buildServingSnapshot(
        servingData.game,
        servingData.racks,
        modelIdSet(servingData.models),
        [],
        [],
        servingData.hasRunningTrainingJobs,
        ownerUser,
        servingData.frontierBenchmark,
      );
      return shapeServingStats(idleSnapshot);
    }

    const servingSnapshot = buildServingSnapshot(
      servingData.game,
      servingData.racks,
      modelIdSet(servingData.models),
      servingModels,
      servingData.hostedModels,
      servingData.hasRunningTrainingJobs,
      ownerUser,
      servingData.frontierBenchmark,
    );
    return shapeServingStats(servingSnapshot);
  },
});

export const mode = mutation({
  args: { gameId: v.id("games"), mode: servingModeValidator, externalId: v.optional(v.string()) },
  handler: async (ctx, args) => {
    await getEditorAccess(ctx, args.gameId, args.externalId);
    await ctx.db.patch(args.gameId, { servingMode: args.mode, updatedAt: Date.now() });
    return { updated: true };
  },
});

export const serve = mutation({
  args: { modelId: v.id("models"), externalId: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const model = await ctx.db.get(args.modelId);

    if (!model) {
      return { served: false };
    }

    if (model.launchState === "serving") {
      return { served: true };
    }

    const gameId = requireGameId(model.gameId);
    const game = await ctx.db.get(gameId);
    const actor = await resolveActor(ctx, args.externalId);

    if (!game || !actor || !(await canEdit(ctx, game, actor))) {
      return { served: false };
    }

    const racks = await gameRacks(ctx, game);
    const decision = decideServeModel({
      paramsB: model.paramsB,
      precision: model.precision,
      totalVramGb: computeRackHardwareStats(rackSnapshots(racks)).totalVramGb,
    });
    if (!decision.served) {
      return decision;
    }

    await ctx.db.patch(model._id, {
      launchState: "serving",
      updatedAt: Date.now(),
    });

    return { served: true };
  },
});
