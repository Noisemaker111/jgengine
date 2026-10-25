import { forEachOnlinePlayer } from "@jgengine/convex/server";
import { v } from "convex/values";
import { getBaseModelDefinition } from "@llmville/game/models/baseModels";
import { isBaseModelUnlockedForGame } from "@llmville/game/models/scraping";
import {
  DEFAULT_MODEL_PARAMS_B,
  computeModelVramFootprintGb,
} from "@llmville/game/models/quantization";
import {
  decideRenameModel,
  decideUnlockBaseModel,
} from "@llmville/game/models/modelsTransition";
import {
  computeModelSalePrice,
  decideLaunchLicensedBaseServe,
  rollTrainedModel,
} from "@llmville/game/models/trainingTransition";
import { START_TRAINING_COMMAND } from "@llmville/game/game/runtime/trainingCommands";
import {
  tickTraining,
  trainingRngUnits,
  trainingTickSeconds,
  type TrainingJob,
} from "@llmville/game/game/runtime/trainingQueue";
import { computeEffectiveFrontierBenchmark } from "@llmville/game/economy/frontier";
import { modelPrecisionValidator } from "./schema";

import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { internalMutation, mutation } from "./_generated/server";
import { canEdit, getEditorAccess, ownerExternalIdForActor, resolveActor } from "./permissions";
import { requireGameId } from "./world";
import { runWorldCommand } from "./jgengine/world";
import { loadGlobalFrontierOffset } from "./dailyMarket";
import { adjustCurrencyByDelta, currencyBalance, deductCurrency } from "./currency";
import { readTrainingStateForOwner, writeTrainingStateForOwner } from "./training";
import { grantUnlock, modelUnlockId, readModelCatalog } from "./unlocks";
import { gameModelIds, gameRacks, rackSnapshots } from "./jgengine/worldObjects";
import { computeRackHardwareStats, installedSupportsPrecision } from "@llmville/game/infrastructure/infrastructure";
import { getFounderMultipliersForGameDoc, getFounderMultipliersForGameId } from "./founderContext";
import { computeUpgradeEffects } from "@llmville/game/user/personalUpgrades";

const ERRORS = {
  unauthorized: "Unauthorized",
  gameNotFound: "Game not found",
  modelNotFound: "Model not found",
} as const;

/**
 * The queue lives in the runtime snapshot but a trained model is a `models` row, so the roll is
 * written here — in the same Convex transaction that persists the job leaving the queue.
 */
async function writeTrainedModel(ctx: MutationCtx, game: Doc<"games">, job: TrainingJob, now: number) {
  const [unresolvedEvents, user] = await Promise.all([
    ctx.db.query("events").withIndex("by_game_id", (queryBuilder) => queryBuilder.eq("gameId", game._id)).collect(),
    ctx.db.query("users").withIndex("by_external_id", (queryBuilder) => queryBuilder.eq("externalId", job.spec.startedBy)).unique(),
  ]);
  const founderMults = await getFounderMultipliersForGameDoc(ctx, game);
  const activeEvents = unresolvedEvents.filter((event) => !event.resolvedAt);
  const upgradeEffects = computeUpgradeEffects(user);
  const frontierOffset = await loadGlobalFrontierOffset(ctx);
  const frontierBenchmark = computeEffectiveFrontierBenchmark({
    nowMs: now,
    gameCreatedAtMs: game.createdAt,
    frontierOffset,
    gameOverride: game.frontierBenchmark,
  });

  const seed = `${job.id}:${job.spec.startedBy}:${job.spec.startedAt}`;
  const roll = rollTrainedModel({
    seed,
    baseModelId: job.spec.baseModelId,
    trainingType: job.spec.trainingType,
    tflopsUsed: job.spec.tflopsUsed,
    gameDataTokens: await currencyBalance(ctx, game, "data"),
    unresolvedEventCount: activeEvents.length,
    trainingEfficiencyBoost: upgradeEffects.trainingEfficiencyBoost,
    unresolvedEventPenaltyReduction: upgradeEffects.unresolvedEventPenaltyReduction,
    overtrainBracket: job.spec.overtrainBracket,
    founder: founderMults,
    frontierBenchmark,
    rngUnits: trainingRngUnits(seed),
    now,
  });

  await ctx.db.insert("models", { gameId: game._id, ...roll.model });

  if (roll.reputationGain > 0) {
    await ctx.db.patch(game._id, {
      reputation: (game.reputation ?? 0) + roll.reputationGain,
      updatedAt: now,
    });
  }
}

async function advanceTrainingQueue(ctx: MutationCtx, game: Doc<"games">, now: number) {
  const state = await readTrainingStateForOwner(ctx, game.createdBy, now);
  if (state.queue.jobs.length === 0 || now <= state.lastTickAtMs) return;

  const founderMults = await getFounderMultipliersForGameDoc(ctx, game);
  const result = tickTraining({
    state: state.queue,
    dtSeconds: trainingTickSeconds(state.lastTickAtMs, now),
    money: await currencyBalance(ctx, game, "money"),
    shopPriceMultiplier: founderMults.shopPriceMultiplier,
  });

  if (result.moneySpent > 0) {
    const paid = await deductCurrency(ctx, game._id, "money", result.moneySpent);
    if (!paid.success) return;
  }

  await writeTrainingStateForOwner(ctx, game.createdBy, {
    queue: result.state,
    lastTickAtMs: now,
  });

  for (const job of result.completed) {
    await writeTrainedModel(ctx, game, job, now);
  }
}

export async function unlockBaseModelInternal(
  ctx: MutationCtx,
  args: { gameId: Id<"games">; externalId?: string; baseModelId: string },
) {
    const owned = await getEditorAccess(ctx, args.gameId, args.externalId);
    const shopMult = (await getFounderMultipliersForGameId(ctx, args.gameId)).shopPriceMultiplier;
    const decision = decideUnlockBaseModel({
      baseModelId: args.baseModelId,
      modelCatalog: await readModelCatalog(ctx, owned.game),
      money: await currencyBalance(ctx, owned.game, "money"),
      dataTokens: await currencyBalance(ctx, owned.game, "data"),
      shopPriceMultiplier: shopMult,
    });
    if (!decision.unlocked) return decision;
    if (decision.alreadyUnlocked) return decision;

    if (decision.payment === "data_tokens") {
      const payment = await deductCurrency(ctx, owned.game._id, "data", decision.amount);
      if (!payment.success) return { unlocked: false, reason: payment.reason };
    } else if (decision.payment === "money") {
      const payment = await deductCurrency(ctx, owned.game._id, "money", decision.amount);
      if (!payment.success) return { unlocked: false, reason: payment.reason };
    }

    await grantUnlock(ctx, owned.game.createdBy, modelUnlockId(args.baseModelId));
    await ctx.db.patch(owned.game._id, { updatedAt: Date.now() });
    return { unlocked: true, alreadyUnlocked: false };
}

export const tickTrainingQueues = internalMutation({
  args: { cursor: v.optional(v.union(v.string(), v.null())), nowMs: v.optional(v.number()) },
  handler: async (ctx, args): Promise<{ scheduled: number; remaining: boolean }> => forEachOnlinePlayer(ctx, {
    batchSize: 25, groupBy: "homeGameId", handler: internal.models.tickTrainingQueuesBatch, continuation: internal.models.tickTrainingQueues, ...args,
  }),
});

export const tickTrainingQueuesBatch = internalMutation({
  args: { players: v.array(v.object({ serverId: v.string(), userId: v.string(), homeGameId: v.optional(v.string()) })), nowMs: v.number() },
  handler: async (ctx, args) => {
    const now = args.nowMs;
    for (const homeGameId of new Set(args.players.map(player => player.homeGameId))) {
      const gameId = homeGameId ? ctx.db.normalizeId("games", homeGameId) : null;
      if (!gameId) continue;
      const game = await ctx.db.get(gameId);
      if (!game) continue;
      await advanceTrainingQueue(ctx, game, now);
    }
  },
});

export const train = mutation({
  args: {
    gameId: v.id("games"),
    baseModelId: v.string(),
    overtrainBracket: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const owned = await getEditorAccess(ctx, args.gameId, undefined);

    const baseModel = getBaseModelDefinition(args.baseModelId);
    const [founderMults, liveModelIds, modelCatalog, actorUser] = await Promise.all([
      getFounderMultipliersForGameDoc(ctx, owned.game),
      gameModelIds(ctx, args.gameId),
      readModelCatalog(ctx, owned.game),
      ctx.db
        .query("users")
        .withIndex("by_external_id", (q) => q.eq("externalId", owned.game.createdBy))
        .unique(),
    ]);

    const upgradeEffects = computeUpgradeEffects(actorUser);
    const outcome = await runWorldCommand(
      ctx,
      ownerExternalIdForActor(owned.actorExternalId),
      START_TRAINING_COMMAND,
      {
        baseModelId: args.baseModelId,
        overtrainBracket: args.overtrainBracket ?? null,
        isUnlocked: baseModel ? isBaseModelUnlockedForGame(modelCatalog, baseModel) : false,
        trainingPowerFp16Multiplier: founderMults.trainingPowerFp16Multiplier,
        trainingDurationMultiplier: upgradeEffects.trainingDurationMultiplier,
        powerCapacityKw: upgradeEffects.powerCapacityKw,
        liveModelIds: [...liveModelIds],
        now: Date.now(),
      },
    );
    if (!outcome.ok) return { started: false, reason: outcome.reason };

    await ctx.db.patch(args.gameId, { updatedAt: Date.now() });
    return { started: true };
  },
});

export async function sellModelInternal(
  ctx: MutationCtx,
  args: { modelId: Id<"models">; externalId?: string },
) {
    const model = await ctx.db.get(args.modelId);
    if (!model) return { sold: false, reason: ERRORS.modelNotFound };

    const game = await ctx.db.get(requireGameId(model.gameId));
    const actor = await resolveActor(ctx, args.externalId);
    if (!game || !actor || !(await canEdit(ctx, game, actor))) return { sold: false, reason: !game ? ERRORS.gameNotFound : ERRORS.unauthorized };

    const salePrice = computeModelSalePrice(model);
    const payment = await adjustCurrencyByDelta(ctx, game._id, "money", salePrice);
    if (!payment.success) return { sold: false, reason: payment.reason };

    await ctx.db.delete(args.modelId);
    return { sold: true, salePrice, newBalance: payment.newBalance };
}

export const rename = mutation({
  args: { modelId: v.id("models"), newName: v.string(), externalId: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const model = await ctx.db.get(args.modelId);
    if (!model) return { renamed: false, reason: ERRORS.modelNotFound };

    const game = await ctx.db.get(requireGameId(model.gameId));
    const actor = await resolveActor(ctx, args.externalId);
    if (!game || !actor || !(await canEdit(ctx, game, actor))) return { renamed: false, reason: ERRORS.unauthorized };

    const decision = decideRenameModel(args.newName);
    if (!decision.renamed) return decision;

    await ctx.db.patch(model._id, { name: decision.name, updatedAt: Date.now() });
    return decision;
  },
});

export const quantize = mutation({
  args: { modelId: v.id("models"), precision: modelPrecisionValidator, externalId: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const model = await ctx.db.get(args.modelId);
    if (!model) return { quantized: false, reason: ERRORS.modelNotFound };

    const game = await ctx.db.get(requireGameId(model.gameId));
    const actor = await resolveActor(ctx, args.externalId);
    if (!game || !actor || !(await canEdit(ctx, game, actor))) return { quantized: false, reason: ERRORS.unauthorized };

    // Low-precision formats only run on capable silicon (e.g. FP4 needs Blackwell/MI350-class parts).
    if (args.precision !== "fp16") {
      const racks = await gameRacks(ctx, game);
      if (!installedSupportsPrecision(rackSnapshots(racks), args.precision)) {
        return { quantized: false, reason: `No installed hardware supports ${args.precision.toUpperCase()}` };
      }
    }

    await ctx.db.patch(model._id, { precision: args.precision, updatedAt: Date.now() });
    return {
      quantized: true,
      precision: args.precision,
      footprintGb: computeModelVramFootprintGb(model.paramsB ?? DEFAULT_MODEL_PARAMS_B, args.precision),
    };
  },
});

export const reveal = mutation({
  args: { modelId: v.id("models"), externalId: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const model = await ctx.db.get(args.modelId);
    if (!model || model.isRevealed) return { revealed: !!model?.isRevealed };

    const game = await ctx.db.get(requireGameId(model.gameId));
    const actor = await resolveActor(ctx, args.externalId);
    if (!game || !actor || !(await canEdit(ctx, game, actor))) return { revealed: false };

    await ctx.db.patch(model._id, { isRevealed: true, updatedAt: Date.now() });
    return { revealed: true };
  },
});

export const launch = mutation({
  args: { gameId: v.id("games"), baseModelId: v.string(), externalId: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const owned = await getEditorAccess(ctx, args.gameId, args.externalId);

    const existing = await ctx.db
      .query("models")
      .withIndex("by_game_id", (q) => q.eq("gameId", args.gameId))
      .filter((q) =>
        q.and(
          q.eq(q.field("baseModelId"), args.baseModelId),
          q.eq(q.field("isLicensedBaseServe"), true),
          q.eq(q.field("launchState"), "serving")
        )
      )
      .first();
    if (existing) {
      return { launched: true, alreadyServing: true, modelId: existing._id };
    }

    const racks = await gameRacks(ctx, owned.game);
    const decision = decideLaunchLicensedBaseServe({
      baseModelId: args.baseModelId,
      modelCatalog: await readModelCatalog(ctx, owned.game),
      totalVramGb: computeRackHardwareStats(rackSnapshots(racks)).totalVramGb,
      now: Date.now(),
    });
    if (!decision.launched) return { launched: false, reason: decision.reason };

    const modelId = await ctx.db.insert("models", { gameId: args.gameId, ...decision.model });
    return { launched: true, modelId };
  },
});
