import { defineSchema, defineTable } from "convex/server";
import { jgengineTables } from "@jgengine/convex/server";
import { v, type Validator, type VFloat64, type VLiteral, type VOptional } from "convex/values";
import { BUILD_ITEM_ID_VALUES } from "@llmville/game/build/catalog";
import { MODEL_LAUNCH_STATE_VALUES, SERVING_MODE_VALUES } from "@llmville/game/models/servingMode";
import { MODEL_QUALITY_TIER_VALUES } from "@llmville/game/models/modelQuality";
import { COMPUTE_LANE_VALUES } from "@llmville/game/infrastructure/infrastructure";
import { SCRAPE_TIER_VALUES } from "@llmville/game/models/scrapingTiers";
import { TRAINING_TYPE_VALUES } from "@llmville/game/models/trainingEconomy";
import { BILL_CATEGORY_VALUES, BILL_TYPE_VALUES } from "@llmville/game/economy/events";
import { TUTORIAL_STAGE_VALUES } from "@llmville/game/tutorial/tutorialStages";
import { CANONICAL_AVATAR_IDS } from "@llmville/game/user/founder";
import { COMPUTE_PRECISION_VALUES, HARDWARE_MODEL_ID_VALUES } from "@llmville/game/infrastructure/catalog";
import { RACK_COOLING_UNIT_ID_VALUES } from "@llmville/game/infrastructure/catalog";


type LiteralUnionMembers<T extends readonly [string, ...string[]]> = {
  -readonly [K in keyof T]: VLiteral<T[K]>;
};

type OptionalNumberFieldMap<T extends readonly string[]> = Record<
  T[number],
  VOptional<VFloat64<number>>
>;

export const buildLiteralUnion = <const T extends readonly [string, ...string[]]>(
  values: T,
): Validator<T[number], "required", never> =>
  (values.length === 1
    ? v.literal(values[0])
    : v.union(...(values.map((value) => v.literal(value)) as LiteralUnionMembers<T>))) as Validator<
    T[number],
    "required",
    never
  >;

const buildOptionalNumberFields = <const T extends readonly string[]>(keys: T) =>
  Object.fromEntries(keys.map((key) => [key, v.optional(v.number())])) as OptionalNumberFieldMap<T>;

export const hardwareModelIdValidator = buildLiteralUnion(HARDWARE_MODEL_ID_VALUES);

export const hardwareInventoryValidator = v.object(buildOptionalNumberFields(HARDWARE_MODEL_ID_VALUES));

export const coolingUnitIdValidator = buildLiteralUnion(RACK_COOLING_UNIT_ID_VALUES);

export const coolingInventoryValidator = v.object(buildOptionalNumberFields(RACK_COOLING_UNIT_ID_VALUES));

export const computeLaneValidator = buildLiteralUnion(COMPUTE_LANE_VALUES);
export const scrapeTierValidator = buildLiteralUnion(SCRAPE_TIER_VALUES);

export const modelPrecisionValidator = buildLiteralUnion(COMPUTE_PRECISION_VALUES);

export const servingModeValidator = buildLiteralUnion(SERVING_MODE_VALUES);

export const buildInventoryValidator = v.object(buildOptionalNumberFields(BUILD_ITEM_ID_VALUES));

export const TUTORIAL_STAGE_VALIDATOR = buildLiteralUnion(TUTORIAL_STAGE_VALUES);

export default defineSchema({
  users: defineTable({
    externalId: v.string(),
    displayName: v.string(),
    username: v.optional(v.string()),
    avatarId: buildLiteralUnion(CANONICAL_AVATAR_IDS),
    ownedUpgrades: v.optional(v.record(v.string(), v.number())),
    /** Set when a world is liquidated for unpaid bills; cleared when a new world starts. */
    bankruptAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_external_id", ["externalId"])
    .index("by_username", ["username"]),
  games: defineTable({
    name: v.string(),
    lastIncomeTickAt: v.number(),
    lastServingTickAt: v.optional(v.number()),
    lastEventSpawnAt: v.number(),
    gameTimeScale: v.optional(v.number()),
    tutorialStage: v.optional(TUTORIAL_STAGE_VALIDATOR),
    tutorialWords: v.optional(v.number()),
    /** Game day (per computeGameDay) of the last time we spawned the 24-game-hour cycle bills. */
    lastBilledGameDay: v.optional(v.number()),
    /** Which scraping job the scraping-lane cards run. */
    activeScrapeTier: v.optional(scrapeTierValidator),
    /** Anchor for tiered-scraping token accrual. */
    lastScrapingTickAt: v.optional(v.number()),
    servingMode: v.optional(servingModeValidator),
    /** Optional override; when absent the global frontier is computed from real time. */
    frontierBenchmark: v.optional(v.number()),
    /** Light prestige score for Phase 4 marketplace / hosting prep. */
    reputation: v.optional(v.number()),
    /** Last open-world avatar position — restored on return; shown for offline neighbors. */
    lastWorldPosition: v.optional(v.object({ x: v.number(), z: v.number() })),
    lastWorldChunkKey: v.optional(v.string()),
    lastWorldPositionAt: v.optional(v.number()),
    /** Owner external ids barred from visiting this plot (blocks their bot too). */
    bannedExternalIds: v.array(v.string()),
    createdBy: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_created_by", ["createdBy"])
    .index("by_last_world_chunk_key", ["lastWorldChunkKey"]),
  bots: defineTable({
    ownerExternalId: v.string(),
    gameId: v.id("games"),
    name: v.string(),
    tokenHash: v.string(),
    tokenNonce: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
    lastSeenAt: v.optional(v.number()),
  })
    .index("by_owner_external_id", ["ownerExternalId"])
    .index("by_token_hash", ["tokenHash"]),
  worldChatMessages: defineTable({
    authorExternalId: v.string(),
    authorName: v.string(),
    gameId: v.id("games"),
    text: v.string(),
    createdAt: v.number(),
  })
    .index("by_created_at", ["createdAt"])
    .index("by_author_and_created_at", ["authorExternalId", "createdAt"]),
  datacenterClaims: defineTable({
    cx: v.number(),
    cz: v.number(),
    chunkKey: v.string(),
    gameId: v.id("games"),
    ownerExternalId: v.string(),
    ownerName: v.string(),
    claimedAt: v.number(),
    costPaid: v.number(),
  })
    .index("by_cell", ["cx", "cz"])
    .index("by_chunk_key", ["chunkKey"])
    .index("by_owner_external_id", ["ownerExternalId"])
    .index("by_game_id", ["gameId"]),
  models: defineTable({
    gameId: v.id("games"),
    name: v.string(),
    qualityTier: buildLiteralUnion(MODEL_QUALITY_TIER_VALUES),
    moneyPerToken: v.number(),
    tokensPerSecond: v.number(),
    tokensPerToken: v.number(),
    /** Model size (billions of params) and current quantization; drive VRAM footprint + serving stats. */
    paramsB: v.optional(v.number()),
    precision: v.optional(modelPrecisionValidator),
    /** Benchmark score (~0–100) driving serving demand / $/token premium. */
    benchmarkScore: v.optional(v.number()),
    notes: v.optional(v.array(v.string())),
    launchState: buildLiteralUnion(MODEL_LAUNCH_STATE_VALUES),
    baseModelId: v.optional(v.string()),
    /** Marks a direct serve of a licensed open-source base (no owned weights). Yields data tokens (leak), minimal money. */
    isLicensedBaseServe: v.optional(v.boolean()),
    trainingDataTokens: v.optional(v.number()),
    tflopsUsed: v.optional(v.number()),
    trainingType: v.optional(buildLiteralUnion(TRAINING_TYPE_VALUES)),
    isRevealed: v.optional(v.boolean()),
    noveltyScore: v.optional(v.number()),
    qualityScore: v.optional(v.number()),
    stabilityScore: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_game_id", ["gameId"])
    .index("by_launch_state", ["launchState"]),
  events: defineTable({
    gameId: v.id("games"),
    eventType: v.string(),
    description: v.string(),
    rewardMoney: v.number(),
    createdAt: v.number(),
    resolvedAt: v.optional(v.number()),
  })
    .index("by_game_id", ["gameId"])
    .index("by_game_id_and_resolved_at", ["gameId", "resolvedAt"]),
  bills: defineTable({
    gameId: v.id("games"),
    billType: buildLiteralUnion(BILL_TYPE_VALUES),
    billCategory: buildLiteralUnion(BILL_CATEGORY_VALUES),
    description: v.string(),
    amount: v.number(),
    dueAt: v.number(),
    gracePeriodDays: v.number(),
    aprRate: v.number(),
    lateFeeAccrued: v.number(),
    lastLateFeeAt: v.optional(v.number()),
    isOverdue: v.boolean(),
    billingPeriod: v.string(),
    paidAt: v.optional(v.number()),
    createdAt: v.number(),
  }).index("by_game_id", ["gameId"]),
  hostedModels: defineTable({
    gameId: v.id("games"),
    revenueShareHost: v.number(),
    vendorModelId: v.optional(v.string()),
    active: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_game_id", ["gameId"])
    .index("by_game_id_and_active", ["gameId", "active"]),
  serverTickState: defineTable({
    /** Last-run timestamp per server-tick system id (see tick.ts). */
    anchors: v.record(v.string(), v.number()),
    updatedAt: v.number(),
  }),
  globalEconomy: defineTable({
    frontierOffset: v.number(),
    lastFrontierReleaseDate: v.optional(v.string()),
    updatedAt: v.number(),
  }),
  clientErrorReports: defineTable({
    message: v.string(),
    kind: v.optional(v.string()),
    stack: v.optional(v.string()),
    componentStack: v.optional(v.string()),
    url: v.optional(v.string()),
    pathname: v.optional(v.string()),
    userAgent: v.optional(v.string()),
    agentPrompt: v.optional(v.string()),
    userId: v.optional(v.id("users")),
    createdAt: v.number(),
  })
    .index("by_created_at", ["createdAt"])
    .index("by_user_id_and_created_at", ["userId", "createdAt"]),
  ...jgengineTables(),
}, {
  // Pre-release: schema documents canonical shape + TS types only.
  // Runtime validation blocks dev deploys whenever old self-test rows linger in Convex.
  schemaValidation: false,
});
