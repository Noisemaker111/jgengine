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
export { createAccumulatorMeter, tierAt, type MeterAddResult } from "./stats/accumulatorMeter";
export { createEventMeter, type EventMeter, type EventMeterFeedResult } from "./stats/eventMeter";
export { rollCheck, type CheckAdvantage, type CheckResult } from "./stats/rollCheck";
export { createStats, type Stats } from "./stats/statModifiers";
