export { Behaviour, BehaviourModule, createBehaviourWorld, type BehaviourWorld } from "./behaviour/behaviour";
export { type LaneRule } from "./board/laneBoard";
export {
  createCardPile,
  createCardPileState,
  draw,
  moveCards,
  peek,
  pileRng,
  shuffleWithRng,
  type CardPile,
  type CardPileState,
} from "./cards/cardPile";
export { runPipeline } from "./cards/modifierPipeline";
export { type CropDef, type CropTileState } from "./crafting/crop";
export {
  advanceTransport,
  createProductionState,
  drainOutput,
  feedProduction,
  productionBuilding,
  resolvePowerGrid,
  tickProduction,
} from "./crafting/production";
export {
  canCraft,
  craft,
  craftSeconds,
  createRecipeGraph,
  stationSatisfied,
  type RecipeDef,
  type RecipeItem,
} from "./crafting/recipe";
export { createAuctionBook, type Auction, type AuctionSettlement } from "./economy/auctionBook";
export { createListingBook, type Listing } from "./economy/listingBook";
export { createPriceHistory, type PriceStats, type SaleRecord } from "./economy/priceHistory";
export {
  addScheduledRule,
  advanceLedger,
  annotate,
  balanceOf,
  cancelRule,
  capAmount,
  createResourceLedger,
  curveScale,
  pauseRule,
  redirect,
  rejectWhen,
  resumeRule,
  taxFraction,
  thresholdScale,
  type AdvanceOptions,
  type AdvanceResult,
  type AppliedTransaction,
  type CatchUpPolicy,
  type LedgerEvent,
  type LedgerEventKind,
  type PolicyContext,
  type PolicyRead,
  type Precision,
  type ResourceLedger,
  type ResourcePolicy,
  type ResourceTransaction,
  type RuleCursor,
  type ScheduledRule,
  type ThresholdBand,
} from "./economy/resourceLedger";
export { type TechNodeDef } from "./economy/techTree";
export { balance, charge, chargeAll, createEmptyWallet, grant, isOverdrawn } from "./economy/wallet";
export {
  createAchievementTracker,
  type AchievementDef,
  type AchievementSnapshot,
  type AchievementTracker,
  type AchievementTrackerOptions,
  type AchievementUnlock,
  type AchievementView,
} from "./game/achievements";
export {
  DEFAULT_CHAT_BODY_LENGTH,
  DEFAULT_CHAT_HISTORY_LIMIT,
  DEFAULT_CHAT_RATE_LIMIT,
  createChatRateLimiter,
  type Chat,
  type ChatMessage,
  type ChatRateLimit,
  type ChatSendResult,
} from "./game/chat";
export {
  createCodex,
  type Codex,
  type CodexEntryDef,
  type CodexEntryView,
  type CodexOptions,
  type CodexSnapshot,
} from "./game/codex";
export { playControlsActive } from "./game/controlGate";
export { createCosmetics } from "./game/cosmetics";
export {
  type GameDefinition,
  type GameDefinitionConfig,
  type GameLoop,
  type InventoryDeclaration,
  type LifecycleConfig,
  type PhysicsConfig,
} from "./game/defineGame";
export { defineSystem, type SystemDefinition, type SystemEventHandlers, type SystemTick } from "./game/defineSystem";
export { createGameDialogue, dialogueSlot } from "./game/dialogue";
export {
  createGameEvents,
  type CombatTelegraphEvent,
  type CombatVfxEvent,
  type EntityDiedEvent,
  type EntityFloatTextEvent,
  type GameEventMap,
  type GameEvents,
  type RetainedVfxKind,
  type StatLevelUpEvent,
  type VfxKind,
  type VfxRef,
} from "./game/events";
export {
  appendFeed,
  createGameFeed,
  pruneFeed,
  type FeedEntry,
  type FeedWindow,
  type TimedFeedEntry,
} from "./game/feed";
export { gamePhase, setGamePhase, type GamePhase } from "./game/gamePhase";
export { createKeyValueStore, type KeyValueStorage } from "./game/keyValueStore";
export { createLeaderboard, type LeaderboardRow, type LeaderboardScope } from "./game/leaderboard";
export { createLevelSequence, type LevelSequence } from "./game/levelSequence";
export { createLoadouts, type LoadoutDef } from "./game/loadout";
export { evaluateLootFilter, lootFilter, type LootFilterRule } from "./game/lootFilter";
export {
  createLootPipeline,
  defineLootPipeline,
  type LootDropProvenance,
  type LootModifier,
  type LootPipeline,
  type LootPipelineDef,
  type LootPipelineDeps,
  type LootPlanEntry,
  type LootResolution,
  type LootResolveContext,
  type LootRollPlan,
  type LootStage,
  type LootStageKind,
  type LootStageStatus,
  type LootStageTrace,
} from "./game/lootPipeline";
export { createLootRegistry, lootTable, type Drop, type LootTableDef } from "./game/lootTable";
export { resolveOneShotClip } from "./game/modelAnimation";
export { evaluateObjective } from "./game/objectives";
export {
  createLayerRegistry,
  diffParams,
  orderLayers,
  resolveParams,
  resolveSelection,
  validateLayers,
  type LayerConflict,
  type LayerOps,
  type LayerRegistry,
  type LayerSelection,
  type ParamContribution,
  type ParamDelta,
  type ParamLayer,
  type ParamOp,
  type ParamSnapshot,
} from "./game/paramLayers";
export {
  DEFAULT_PING_CATEGORIES,
  PING_FEED_ACTION,
  createPingSystem,
  type PingCategory,
  type PingSystem,
} from "./game/ping";
export {
  CAMERA_FRUSTUM_DEFAULTS,
  worldHealthBarAllowsRole,
  type BackdropConfig,
  type CameraKeyframe,
  type CameraRigKind,
  type ChaseCameraConfig,
  type CinematicCameraConfig,
  type DirectionalLightingConfig,
  type EntitySpriteConfig,
  type FirstPersonCameraConfig,
  type GameCameraConfig,
  type InspectionCameraConfig,
  type InspectionZoomAnchor,
  type LightingConfig,
  type LockOnCameraConfig,
  type ModelConfig,
  type ModelMaterialMaps,
  type ModelMaterialOverride,
  type ObjectStyle,
  type ObserverCameraConfig,
  type PlayableGame,
  type PointerConfig,
  type RtsCameraConfig,
  type ShoulderCameraConfig,
  type SideScrollCameraConfig,
  type TopDownCameraConfig,
  type WorldItemRenderConfig,
  type WorldOverlayProps,
} from "./game/playableGame";
export {
  curve,
  evalCurve,
  leveling,
  type Curve,
  type LevelProgress,
  type LevelingConfig,
  type LevelingTrack,
} from "./game/progression";
export {
  createQuestJournal,
  defaultObjectiveLabel,
  describeTrackedQuest,
  type QuestDef,
  type QuestInstance,
  type QuestRewards,
  type TrackedObjectiveView,
  type TrackedQuestView,
} from "./game/quest";
export {
  RaceState,
  createLapTimer,
  createRaceState,
  finishRaceSession,
  firstPastPost,
  idleRaceSession,
  lapDurations,
  parDelta,
  placementOf,
  raceOutcomeOf,
  racePlacements,
  raceTrack,
  splitSegments,
  startRaceCountdown,
  tickRaceSession,
} from "./game/race";
export { createRecordBook } from "./game/recordBook";
export {
  createRuleRegistry,
  rerollRules,
  selectRules,
  type RuleDef,
  type RuleRegistry,
  type RuleSelection,
  type RuleSelectionConfig,
} from "./game/ruleSelection";
export { createRunDraft, type RunDraft, type RunModifierOffer } from "./game/runDraft";
export {
  createSaveStore,
  localSaveBackend,
  memorySaveBackend,
  remoteSaveBackend,
  type SaveBackend,
  type SaveStatus,
  type SaveStore,
} from "./game/saveStore";
export {
  createSocial,
  type FriendEntry,
  type FriendRequestEntry,
  type Friends,
  type Party,
  type PartyInviteEntry,
  type PartyMemberEntry,
  type PresenceInfo,
  type Social,
  type SocialDeps,
  type WorldInvite,
  type WorldInviteTarget,
} from "./game/social";
export { createSpawnPoints } from "./game/spawnPoints";
export { composeGameLoop } from "./game/systemRuntime";
export {
  DEFAULT_FIXED_STAGES,
  DEFAULT_FRAME_STAGES,
  compileSystemSchedule,
  type CompiledSystemSchedule,
} from "./game/systemSchedule";
export { createTalentTree, type TalentNodeDef, type TalentTree } from "./game/talents";
export { appendToast, createToastQueue, pruneToasts, type Toast } from "./game/toasts";
export { createUnlockCatalog, createUnlocks, type UnlockDef } from "./game/unlocks";
export {
  createVfxInstanceStore,
  type CombatVfxInstanceEvent,
  type VfxInstancePatch,
  type VfxInstanceSpec,
  type VfxInstanceState,
  type VfxInstanceStopOptions,
  type VfxInstanceStore,
  type VfxInstanceStoreOptions,
} from "./game/vfxInstance";
export {
  DEFAULT_PICKUP_RADIUS,
  WORLD_ITEM_ENTITY_NAME,
  type RarityStyle,
  type WorldItemRecord,
} from "./game/worldItem";
export { type ActionCodes, type ActionCodesMap, type ActionStateTracker } from "./input/actionBindings";
export { NEUTRAL_AXIS, type AxisBindingMap, type AxisChannelConfig, type AxisInput } from "./input/axisInput";
export {
  applyBindingOverrides,
  clearBindingOverride,
  loadBindingOverrides,
  saveBindingOverride,
  type BindingOverrides,
} from "./input/bindingOverrides";
export { createGestureSurfaceTracker } from "./input/gestureSurface";
export { aimToPoint, type PointerHit, type PointerVec3 } from "./input/pointer";
export { normalizePointerToAxis, type PointerAxisState } from "./input/pointerAxis";
export { activeTouchControlsMode, setTouchControlsMode } from "./input/touchControlsMode";
export { createTouchGestureTracker } from "./input/touchGestures";
export {
  DEFAULT_TOUCH_STYLE,
  TOUCH_STYLES,
  TOUCH_STYLE_OPTIONS,
  deriveTouchScheme,
  touchButtonShape,
  touchCode,
  withTouchCodes,
  type TouchAnchor,
  type TouchButton,
  type TouchButtonShape,
  type TouchControlsConfig,
  type TouchControlsModeConfig,
  type TouchJoystick,
  type TouchScheme,
  type TouchStyle,
} from "./input/touchScheme";
export { type InventorySlot, type InventoryState } from "./inventory/inventoryModel";
export { type Cell, type Rotation } from "./inventory/shapedGrid";
export { type SlotGrid } from "./inventory/slotModel";
export {
  createDeliveryQueue,
  insureLost,
  partitionOnDeath,
  resolveConsolation,
  type DeliveryEntry,
  type DeliveryQueue,
  type ScheduledDelivery,
} from "./inventory/storageTier";
export { createAffixRoller, seededRng, type AffixPool } from "./item/affix";
export {
  applyWear,
  createDurability,
  createDurabilityTracker,
  durabilityFraction,
  isDisabled,
  repairQuote,
  wear,
  type DurabilitySpec,
  type DurabilityState,
} from "./item/durability";
export {
  activeSetBonuses,
  applySetBonuses,
  candidateViolatesForbid,
  captureProvenance,
  countSetMembers,
  identityOf,
  isIdentityValid,
  matchesQuery,
  validateIdentity,
  type CandidatePlacement,
  type CompatibilityRule,
  type ConstraintViolation,
  type ForbidRule,
  type IdentityQuery,
  type ItemIdentity,
  type ItemProvenance,
  type RequireRule,
  type SetBonus,
} from "./item/itemIdentity";
export { createItemInstanceRegistry, proceduralLootEntry } from "./item/itemInstanceRegistry";
export {
  generate,
  type GenChoiceRecord,
  type GenChoices,
  type GenDraft,
  type GenFieldRecord,
  type GenOption,
  type GenOutcome,
  type GenPool,
  type GenProvenance,
  type GenResult,
  type GenSchema,
  type GenStep,
  type GenTransform,
  type GenValidator,
  type GenerateOptions,
  type TransformApi,
} from "./item/itemgen";
export {
  computeEffectiveStats,
  createModularItem,
  install,
  isComplete,
  missingRequiredSlots,
  partInSlot,
  slotAccepts,
  uninstall,
  type InstalledPart,
  type ModularItemDef,
  type MountSlotDef,
  type PartDef,
} from "./item/modularItem";
export { createItemUse, type ItemUseHandler, type ItemUseInput } from "./item/use";
export {
  createUseBehaviorRegistry,
  type BehaviorConfig,
  type BehaviorState,
  type ComposedUse,
  type CompositionResult,
  type SerializedBehaviorState,
  type UseBehaviorContext,
  type UseBehaviorDef,
  type UseBehaviorOutcome,
  type UseBehaviorRef,
  type UseBehaviorRegistry,
  type UseBehaviorRejection,
} from "./item/useBehavior";
export { createWeaponStats } from "./item/weapon";
export {
  createStatGraph,
  statModifierContributions,
  type StatContribution,
  type StatContributionStep,
  type StatDeriveContext,
  type StatDerivedDef,
  type StatExplanation,
  type StatGraph,
  type StatGraphDef,
  type StatInputDef,
  type StatModEntry,
  type StatOp,
  type StatSheet,
  type StatSheetState,
} from "./progression/statGraph";
export { type CellGrid } from "./puzzle/cellGrid";
export { type ShapeTable } from "./puzzle/fallingPiece";
export { createNameGenerator } from "./random/nameGen";
export { pickUniform, pickWeighted } from "./random/pick";
export { seededStreams } from "./random/rng";
export {
  addValue,
  clampValue,
  createPairKeyCodec,
  driftValue,
  getValue,
  setValue,
  towardValue,
  type NumericBounds,
  type PairKeyCodec,
  type PairKeyOptions,
} from "./relation/keyedValues";
export {
  crossThresholds,
  tierAt,
  type CrossThresholdsOptions,
  type ThresholdBoundary,
  type ThresholdCrossing,
  type ThresholdDirection,
} from "./relation/thresholds";
export {
  evaluatePredicate,
  readPath,
  type Predicate,
  type PredicateFacts,
  type PredicatePath,
  type PredicateValue,
} from "./rules/predicate";
export { getRuleEffect, listRuleEffects, registerRuleEffect, type RuleEffectDefinition } from "./rules/ruleEffects";
export {
  createTriggeredRuleEngine,
  type ActiveEffect,
  type EffectRef,
  type FiringBlock,
  type RateLimit,
  type RuleEvent,
  type RuleFiring,
  type StackPolicy,
  type TargetRole,
  type TargetSelector,
  type TriggeredRule,
  type TriggeredRuleEngine,
  type TriggeredRuleState,
} from "./rules/triggeredRules";
export { createRing, ringSampleAt, type Ring, type RingConfig, type RingPhase } from "./session/ring";
export { type RoleSpec } from "./session/roles";
export { type RoundConfig, type RoundSnapshot } from "./session/roundState";
export {
  createDecayMeterSet,
  decayMeterMoodles,
  decayMeterSnapshot,
  decayMeterState,
  decayMeters,
  initDecayMeters,
  refillMeter,
  type DecayMeterSet,
  type DecayMeterValues,
  type DecayModifier,
} from "./survival/decayMeter";
export { createMoodleStack, stackMoodles, type Moodle, type MoodleStack } from "./survival/moodle";
export { createMultiRegionHealth, type MultiRegionHealth } from "./survival/regionHealth";
export { createCommitController } from "./turn/commit";
export { createIntentBoard } from "./turn/intent";
export { createTurnLoop, type TurnLoop } from "./turn/turnLoop";
export {
  activeJobs,
  cancelJob,
  createWorkQueue,
  enqueue,
  fifoOrdering,
  jobById,
  jobProgress,
  pauseJob,
  priorityOrdering,
  queueSize,
  queuedJobs,
  resumeJob,
  tick,
  type CancelResult,
  type EnqueueOptions,
  type EnqueueResult,
  type Job,
  type JobId,
  type JobOrdering,
  type JobStatus,
  type JobValidation,
  type TickResult,
  type WorkQueueConfig,
  type WorkQueueEvent,
  type WorkQueueState,
} from "./work/jobQueue";
export {
  unitTrainingConfig,
  type ResourceCost,
  type TrainableUnitDef,
  type UnitReservation,
  type UnitSpawnOrder,
  type UnitTrainingOptions,
  type UnitTrainingSpec,
} from "./work/unitTraining";
