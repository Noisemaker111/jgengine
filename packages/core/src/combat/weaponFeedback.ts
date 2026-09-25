import type { WeaponHandlingFrame, WeaponShot } from "./weaponHandling";

/**
 * Signals {@link createWeaponFeedbackSignals} reports each tick, named for `createFeedbackMixer` routes.
 * `shot`, `kick` and `impact` are pulses that read non-zero only on the tick they happened; the rest follow
 * the handling frame.
 */
export type WeaponFeedbackSignal = "shot" | "kick" | "impact" | "recoil" | "cameraKick" | "spread" | "ads";

/** Serializable pending pulses, so a snapshot taken between a shot and the next read loses nothing. */
export interface WeaponFeedbackState {
  shots: number;
  kick: number;
  impact: number;
}

/** Collects weapon events between presentation ticks and hands them to a feedback mixer as one signal record. */
export interface WeaponFeedbackSignals {
  /** Record a shot from `WeaponHandling.fire()`. Several shots before one `read` sum. */
  shot(shot: WeaponShot): void;
  /** Record a hit landing, in the game's own units (damage, `0..1` strength). Several impacts keep the largest. */
  impact(strength: number): void;
  /**
   * Return this tick's signals and clear the pulses. `frame` (from `WeaponHandling.tick`) fills `recoil`,
   * `cameraKick`, `spread` and `ads`; without it they read `0`. The record is reused between calls.
   */
  read(frame?: WeaponHandlingFrame): Readonly<Record<WeaponFeedbackSignal, number>>;
  snapshot(): WeaponFeedbackState;
  restore(state: WeaponFeedbackState): void;
  reset(): void;
}

/**
 * Creates {@link WeaponFeedbackSignals}: the bridge from shots, recoil kick and impacts to `createFeedbackMixer`
 * routes (camera shake, audio, rumble). Route `kick` with no smoothing into camera-shake trauma, `impact` with
 * a `release` into rumble, and `ads`/`spread` into continuous audio or FOV targets. Deterministic and
 * allocation-free per read.
 * @capability weapon-feedback turn weapon shots, recoil kick and impacts into per-tick feedback-mixer signals for camera shake, audio and rumble
 */
export function createWeaponFeedbackSignals(): WeaponFeedbackSignals {
  const pending: WeaponFeedbackState = { shots: 0, kick: 0, impact: 0 };
  const out: Record<WeaponFeedbackSignal, number> = { shot: 0, kick: 0, impact: 0, recoil: 0, cameraKick: 0, spread: 0, ads: 0 };

  return {
    shot(shot) {
      pending.shots += 1;
      pending.kick += Math.hypot(shot.kickPitch, shot.kickYaw);
    },
    impact(strength) {
      pending.impact = Math.max(pending.impact, strength);
    },
    read(frame) {
      out.shot = pending.shots;
      out.kick = pending.kick;
      out.impact = pending.impact;
      out.recoil = frame === undefined ? 0 : Math.hypot(frame.aimPitch, frame.aimYaw);
      out.cameraKick = frame === undefined ? 0 : Math.hypot(frame.cameraPitch, frame.cameraYaw);
      out.spread = frame?.spread ?? 0;
      out.ads = frame?.adsProgress ?? 0;
      pending.shots = 0;
      pending.kick = 0;
      pending.impact = 0;
      return out;
    },
    snapshot: () => ({ ...pending }),
    restore(state) {
      Object.assign(pending, state);
    },
    reset() {
      pending.shots = 0;
      pending.kick = 0;
      pending.impact = 0;
    },
  };
}
