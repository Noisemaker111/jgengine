/**
 * Per-entity render cues: the motion/animation signal a custom `renderEntity`
 * or first-person viewmodel component needs to drive gait, muzzle flash,
 * reload poses, and hit reactions — without diffing the parent group's
 * position itself or reading a game-side module map for attack timing.
 */
export interface EntityRenderCues {
  /** Horizontal ground speed in world units/sec (e.g. `groundSpeed(entity)`). */
  speed: number;
  /** 0..1 walk-cycle phase, advancing with `speed`; wraps every full stride. */
  bobPhase: number;
  /** True for a short pulse after a `"fire"` `entity.animation` event. */
  firing: boolean;
  /** True from a `"reload"` `entity.animation` event until `"reloadEnd"`. */
  reloading: boolean;
  /** 0..1 recoil kick, set to 1 on `"fire"` and decaying over time. */
  recoil: number;
  /** True for a short pulse after a `combat.hitReaction` event. */
  hit: boolean;
  /** True once `entity.died` fires for this instance; stays true. */
  dead: boolean;
}

/** Neutral starting cue set: idle, unarmed, undamaged. */
export const DEFAULT_RENDER_CUES: Readonly<EntityRenderCues> = Object.freeze({
  speed: 0,
  bobPhase: 0,
  firing: false,
  reloading: false,
  recoil: 0,
  hit: false,
  dead: false,
});

/** Tuning knobs for `advanceMotionCues` / `useEntityRenderCues`; every field has a default, override only what a weapon/rig's feel needs to differ. */
export interface RenderCueTuning {
  /** Bob-cycle phase advanced per world unit of travel. Default 0.6. */
  cyclesPerUnit?: number;
  /** Recoil decay toward 0, per second. Default 6. */
  recoilDecayPerSecond?: number;
  /** Seconds `firing` stays true after a `"fire"` event. Default 0.12. */
  firePulseSeconds?: number;
  /** Seconds `hit` stays true after a `combat.hitReaction` event. Default 0.2. */
  hitPulseSeconds?: number;
}

/** Default `RenderCueTuning.cyclesPerUnit`. */
export const DEFAULT_CYCLES_PER_UNIT = 0.6;
/** Default `RenderCueTuning.recoilDecayPerSecond`. */
export const DEFAULT_RECOIL_DECAY_PER_SECOND = 6;
/** Default `RenderCueTuning.firePulseSeconds`. */
export const DEFAULT_FIRE_PULSE_SECONDS = 0.12;
/** Default `RenderCueTuning.hitPulseSeconds`. */
export const DEFAULT_HIT_PULSE_SECONDS = 0.2;

/** Advances `bobPhase` and decays `recoil` from a live `speed` sample (e.g. `groundSpeed(entity)`); leaves event-driven fields untouched. */
export function advanceMotionCues(
  cues: EntityRenderCues,
  speed: number,
  dt: number,
  tuning?: RenderCueTuning,
): EntityRenderCues {
  const cyclesPerUnit = tuning?.cyclesPerUnit ?? DEFAULT_CYCLES_PER_UNIT;
  const recoilDecayPerSecond = tuning?.recoilDecayPerSecond ?? DEFAULT_RECOIL_DECAY_PER_SECOND;
  const bobPhase = speed > 0.05 ? (cues.bobPhase + speed * cyclesPerUnit * dt) % 1 : cues.bobPhase;
  const recoil = Math.max(0, cues.recoil - recoilDecayPerSecond * dt);
  return { ...cues, speed, bobPhase, recoil };
}

/** Applies a `entity.animation` event (`"fire"` / `"reload"` / `"reloadEnd"`, or any game-defined name) to the cue set. Unknown event names are a no-op. */
export function applyRenderAnimationEvent(cues: EntityRenderCues, event: string): EntityRenderCues {
  if (event === "fire") return { ...cues, firing: true, recoil: 1 };
  if (event === "reload") return { ...cues, reloading: true };
  if (event === "reloadEnd") return { ...cues, reloading: false };
  return cues;
}

/** Marks a `combat.hitReaction` pulse; the caller clears `hit` again after its own pulse window. */
export function applyRenderHitEvent(cues: EntityRenderCues): EntityRenderCues {
  return { ...cues, hit: true };
}

/** Marks the cue set dead after `entity.died`; sticky for the lifetime of the render component. */
export function applyRenderDeathEvent(cues: EntityRenderCues): EntityRenderCues {
  return { ...cues, dead: true };
}
