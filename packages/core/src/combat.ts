export {
  createAbilityKit,
  type AbilityKit,
  type AbilitySlotSnapshot,
  type AbilitySlotState,
} from "./combat/abilityKit";
export { type AnimationClip, type FrameRange } from "./combat/animationState";
export { attackMeta, counters, isBlockable, isDodgeable, isParryable } from "./combat/attackTags";
export { createBuildupMeter, createStaggerMeter, type BuildupProc } from "./combat/breakMeters";
export { createCastRunner } from "./combat/castRunner";
export { createComboPoints } from "./combat/comboPoints";
export { advanceCombo, createComboRunner, type ComboStep } from "./combat/comboString";
export {
  MAX_INTERCEPT_STEPS,
  createAntiOneShotPolicy,
  createDamageClamp,
  createDamagePipeline,
  createImmunityWindow,
  resolveDamage,
  type AntiOneShotConfig,
  type AntiOneShotPolicy,
  type DamageClampConfig,
  type DamageInterceptor,
  type DamagePipeline,
  type DamageResolution,
  type ImmunityWindow,
  type InterceptContext,
  type InterceptDecision,
  type InterceptRecord,
  type PendingDamage,
} from "./combat/damageInterceptors";
export {
  resolveMatchup,
  type DamageChannelId,
  type DamageMatchup,
  type MatchupOutputs,
  type ResolvedMatchup,
  type TargetTraitId,
} from "./combat/damageMatchup";
export { resolveDamageHit, type DamageHitInput, type DamageHitResolution } from "./combat/damageResolution";
export { createDeathSystem, type OnDeathSpec } from "./combat/death";
export { type DeathReason } from "./combat/deathReason";
export { createDefensiveWindow, resolveDefense } from "./combat/defensiveWindow";
export { createDotField } from "./combat/dotField";
export { createDownedState } from "./combat/downed";
export { createEffectSystem, type ReceiveMap } from "./combat/effects";
export {
  BUILTIN_COMPLETION_PREDICATES,
  BUILTIN_SPAWN_PROVIDERS,
  activePhaseId,
  createEncounterState,
  encounterProgress,
  forceCompletePhase,
  injectPhase,
  phaseStatus,
  startEncounter,
  updateEncounter,
  type CompletionPredicate,
  type EncounterConfig,
  type EncounterContext,
  type EncounterEvent,
  type EncounterPhase,
  type EncounterSignals,
  type EncounterSpawnRequest,
  type EncounterState,
  type EncounterStep,
  type PhaseCompletionRef,
  type PhaseInjectAt,
  type PhaseRuntime,
  type PhaseSpawnRef,
  type PhaseStatus,
  type PredicateContext,
  type SpawnProvider,
  type SpawnProviderContext,
} from "./combat/encounterSequence";
export { impactPresets, resolveHitReaction, type HitReactionConfig } from "./combat/hitReaction";
export { createMagazine, type Magazine, type MagazineReserve } from "./combat/magazine";
export {
  createProjectileSystem,
  type ObjectRaycastHit,
  type ProjectileSystemDeps,
  type RaycastHit,
} from "./combat/projectiles";
export {
  resolveReceivedDamage,
  type DamageContext,
  type DamagePredicate,
  type ReceivedDamageResult,
  type ReceivedModifier,
  type ReceivedPolicy,
} from "./combat/receivedDamage";
export { createRegenShield } from "./combat/regenShield";
export {
  DEFAULT_FIRE_PULSE_SECONDS,
  DEFAULT_HIT_PULSE_SECONDS,
  DEFAULT_RENDER_CUES,
  advanceMotionCues,
  applyRenderAnimationEvent,
  applyRenderDeathEvent,
  applyRenderHitEvent,
  type EntityRenderCues,
  type RenderCueTuning,
} from "./combat/renderCues";
export { resistanceScale, resolveResistance } from "./combat/resistance";
export { createResourcePool, type ResourcePool } from "./combat/resourcePool";
export {
  allocateRewards,
  filterOutcomeFor,
  resolveClaim,
  type AllocationOutcome,
  type AllocationRequest,
  type ClaimOutcome,
  type ClaimablePool,
  type RewardClaimSpec,
  type RewardGrant,
  type RewardPolicyKind,
  type RewardRecipient,
  type RewardResult,
  type RewardShare,
} from "./combat/rewardAllocation";
export {
  DEFAULT_EYE_HEIGHT,
  convergeShot,
  eyeHeightFromColliders,
  resolveShot,
  type ShotOriginPolicy,
} from "./combat/shotOrigin";
export {
  resolveStatusApplication,
  type StatusApplicationOutcome,
  type StatusApplicationSpec,
  type StatusImmunity,
  type StatusInstance,
  type StatusStackPolicy,
} from "./combat/statusApplication";
export { type TelegraphConfig, type TelegraphShape } from "./combat/telegraph";
export {
  createThresholdTracker,
  type CrossingDirection,
  type CrossingPolicy,
  type CrossingTrigger,
  type ThresholdCrossing,
  type ThresholdCrossingConfig,
  type ThresholdMark,
  type ThresholdTracker,
  type ThresholdTrackerSnapshot,
} from "./combat/thresholdCrossings";
export { createAccumulatorMeter, tierAt, type MeterAddResult } from "./stats/accumulatorMeter";
export { createEventMeter, type EventMeter, type EventMeterFeedResult } from "./stats/eventMeter";
export { rollCheck, type CheckAdvantage, type CheckResult } from "./stats/rollCheck";
export { createStats, type Stats } from "./stats/statModifiers";
export {
  applyStatPoolDelta,
  changeStatPool,
  createStatPool,
  patchStatPool,
  type StatPool,
  type StatPoolAccess,
  type StatPoolAccessResult,
  type StatPoolChange,
  type StatPoolInput,
  type StatPoolPatch,
} from "./stats/statPool";
