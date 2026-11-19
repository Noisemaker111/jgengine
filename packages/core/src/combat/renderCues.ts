export interface EntityRenderCues {
  /** Horizontal ground speed in world units/sec (e.g. `groundSpeed(entity)`). */
  speed: number;
  /** 0..1 walk-cycle phase, advancing with `speed`; wraps every full stride. */
  bobPhase: number;
  firing: boolean;
  reloading: boolean;
  /** 0..1 recoil kick, set to 1 on `"fire"` and decaying over time. */
  recoil: number;
  hit: boolean;
  dead: boolean;
}

export const DEFAULT_RENDER_CUES: Readonly<EntityRenderCues> = Object.freeze({
  speed: 0,
  bobPhase: 0,
  firing: false,
  reloading: false,
  recoil: 0,
  hit: false,
  dead: false,
});

export interface RenderCueTuning {
  cyclesPerUnit?: number;
  /** Recoil decay toward 0, per second. Default 6. */
  recoilDecayPerSecond?: number;
  /** Seconds `firing` stays true after a `"fire"` event. Default 0.12. */
  firePulseSeconds?: number;
  /** Seconds `hit` stays true after a `combat.hitReaction` event. Default 0.2. */
  hitPulseSeconds?: number;
}

export const DEFAULT_CYCLES_PER_UNIT = 0.6;
export const DEFAULT_RECOIL_DECAY_PER_SECOND = 6;
export const DEFAULT_FIRE_PULSE_SECONDS = 0.12;
export const DEFAULT_HIT_PULSE_SECONDS = 0.2;

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

export function applyRenderAnimationEvent(cues: EntityRenderCues, event: string): EntityRenderCues {
  if (event === "fire") return { ...cues, firing: true, recoil: 1 };
  if (event === "reload") return { ...cues, reloading: true };
  if (event === "reloadEnd") return { ...cues, reloading: false };
  return cues;
}

export function applyRenderHitEvent(cues: EntityRenderCues): EntityRenderCues {
  return { ...cues, hit: true };
}

export function applyRenderDeathEvent(cues: EntityRenderCues): EntityRenderCues {
  return { ...cues, dead: true };
}
