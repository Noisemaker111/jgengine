/** Recoil per shot, in radians of aim. `pitch > 0` climbs the muzzle, `yaw > 0` pulls right. */
export interface WeaponRecoilTuning {
  /**
   * Fixed kick per shot index as `[pitch, yaw]` rad — the learnable part of a spray pattern. Past its end the
   * last entry repeats. Omit for a flat `pitch` kick every shot.
   */
  pattern?: readonly (readonly [number, number])[];
  /** Kick per shot when there is no `pattern`, rad (default `0`). */
  pitch?: number;
  /** Random extra kick, rad, drawn per shot from the injected `random` within ±this cone (default `0`). */
  randomCone?: number;
  /** Share of each kick that moves the camera rather than the aim, `0..1` (default `0`: all aim). */
  cameraShare?: number;
  /** Rate the accumulated kick recovers toward centre, rad/s (default `0`: none). */
  recoverRate?: number;
  /** Seconds after a shot before recovery starts (default `0.1`). */
  recoverDelay?: number;
  /** Aim kick multiplier while aiming down sights (default `1`). */
  adsScale?: number;
}

/** Cone of fire, as a half-angle in radians. */
export interface WeaponSpreadTuning {
  /** Resting spread, rad. */
  base: number;
  /** Spread added per shot (bloom), rad (default `0`). */
  perShot?: number;
  /** Largest bloom, rad (default `base + 10 · perShot`). */
  max?: number;
  /** Rate bloom recovers toward `base`, rad/s (default `0`). */
  recoverRate?: number;
  /** Seconds after a shot before bloom recovers (default `0.1`). */
  recoverDelay?: number;
  /** Multipliers on the final spread for stance and aim; each defaults to `1`. */
  ads?: number;
  crouching?: number;
  moving?: number;
  airborne?: number;
}

/**
 * Tuning for {@link createWeaponHandling}. Every number is an angle in radians or a time in seconds, so two
 * weapons differ by numbers a person can reason about: a controllable rifle climbs a little and recovers
 * fast; a shotgun kicks hard and blooms wide.
 */
export interface WeaponHandlingTuning {
  recoil?: WeaponRecoilTuning;
  spread: WeaponSpreadTuning;
  /** Seconds to go fully into or out of aim-down-sights (default `0.2`). */
  adsTime?: number;
}

/** Stance and aim for one tick. */
export interface WeaponStance {
  ads?: boolean;
  crouching?: boolean;
  moving?: boolean;
  airborne?: boolean;
}

/** Serializable handling state. */
export interface WeaponHandlingState {
  aimPitch: number;
  aimYaw: number;
  cameraPitch: number;
  cameraYaw: number;
  bloom: number;
  shotIndex: number;
  sinceShot: number;
  adsProgress: number;
}

/** What one shot did: the cone to sample and the kick it applied. */
export interface WeaponShot {
  /** Half-angle of the cone this shot fires into, rad, with stance multipliers applied. */
  spread: number;
  /** Aim kick applied by this shot, rad. */
  kickPitch: number;
  kickYaw: number;
}

/** Live handling readout: the offsets to add to aim and camera, current spread and ADS blend. */
export interface WeaponHandlingFrame {
  /** Recoil offset to add to the aim direction, rad. */
  aimPitch: number;
  aimYaw: number;
  /** Recoil offset to add to the camera only (view punch), rad. */
  cameraPitch: number;
  cameraYaw: number;
  /** Current half-angle spread with stance multipliers, rad. */
  spread: number;
  /** `0` hip … `1` fully aimed. */
  adsProgress: number;
}

/**
 * The player-to-weapon relationship as state: recoil that climbs and recovers, spread that blooms and
 * settles, and an aim-down-sights blend. Cadence, ammo and hits stay in `weaponFire`/`magazine`; this owns
 * how the weapon feels between them. First-person, third-person and over-the-shoulder presentations read
 * the same frame.
 */
export interface WeaponHandling {
  /** Register one shot (call when the cadence fires) and return its spread and kick. */
  fire(stance?: WeaponStance): WeaponShot;
  /** Advance recovery, bloom decay and ADS by `dt`. */
  tick(dt: number, stance?: WeaponStance): WeaponHandlingFrame;
  frame(): WeaponHandlingFrame;
  retune(next: WeaponHandlingTuning): void;
  snapshot(): WeaponHandlingState;
  restore(state: WeaponHandlingState): void;
  reset(): void;
}

function fresh(tuning: WeaponHandlingTuning): WeaponHandlingState {
  return {
    aimPitch: 0,
    aimYaw: 0,
    cameraPitch: 0,
    cameraYaw: 0,
    bloom: tuning.spread.base,
    shotIndex: 0,
    // Finite so a snapshot survives JSON; anything past every delay behaves the same.
    sinceShot: 1e9,
    adsProgress: 0,
  };
}

function toward(value: number, amount: number): number {
  if (value === 0) return 0;
  return Math.abs(value) <= amount ? 0 : value - Math.sign(value) * amount;
}

/**
 * Creates a {@link WeaponHandling}. Pass `random` (e.g. `ctx.rng` or `seededRng(seed)`) for the random
 * recoil cone; without it the cone is skipped, so the result stays deterministic either way.
 * @capability weapon-handling recoil patterns with camera kick and recovery, spread bloom, stance multipliers and ADS as serializable state
 */
export function createWeaponHandling(
  initial: WeaponHandlingTuning,
  options: { random?: () => number } = {},
): WeaponHandling {
  let tuning = initial;
  const random = options.random;
  const state = fresh(tuning);
  const out: WeaponHandlingFrame = { aimPitch: 0, aimYaw: 0, cameraPitch: 0, cameraYaw: 0, spread: 0, adsProgress: 0 };

  function spreadFor(stance: WeaponStance | undefined): number {
    const spread = tuning.spread;
    const ads = 1 + ((spread.ads ?? 1) - 1) * state.adsProgress;
    const crouch = stance?.crouching === true ? (spread.crouching ?? 1) : 1;
    const moving = stance?.moving === true ? (spread.moving ?? 1) : 1;
    const air = stance?.airborne === true ? (spread.airborne ?? 1) : 1;
    return state.bloom * ads * crouch * moving * air;
  }

  function write(stance: WeaponStance | undefined): WeaponHandlingFrame {
    out.aimPitch = state.aimPitch;
    out.aimYaw = state.aimYaw;
    out.cameraPitch = state.cameraPitch;
    out.cameraYaw = state.cameraYaw;
    out.spread = spreadFor(stance);
    out.adsProgress = state.adsProgress;
    return out;
  }

  return {
    fire(stance) {
      const recoil = tuning.recoil;
      const spread = spreadFor(stance);
      let kickPitch = 0;
      let kickYaw = 0;
      if (recoil !== undefined) {
        const pattern = recoil.pattern;
        const entry = pattern !== undefined && pattern.length > 0 ? pattern[Math.min(state.shotIndex, pattern.length - 1)]! : undefined;
        kickPitch = entry?.[0] ?? recoil.pitch ?? 0;
        kickYaw = entry?.[1] ?? 0;
        const cone = recoil.randomCone ?? 0;
        if (cone > 0 && random !== undefined) {
          kickPitch += (random() * 2 - 1) * cone;
          kickYaw += (random() * 2 - 1) * cone;
        }
        const scale = 1 + ((recoil.adsScale ?? 1) - 1) * state.adsProgress;
        kickPitch *= scale;
        kickYaw *= scale;
        const cameraShare = Math.max(0, Math.min(1, recoil.cameraShare ?? 0));
        state.aimPitch += kickPitch * (1 - cameraShare);
        state.aimYaw += kickYaw * (1 - cameraShare);
        state.cameraPitch += kickPitch * cameraShare;
        state.cameraYaw += kickYaw * cameraShare;
      }
      const perShot = tuning.spread.perShot ?? 0;
      const max = tuning.spread.max ?? tuning.spread.base + perShot * 10;
      state.bloom = Math.min(max, state.bloom + perShot);
      state.shotIndex += 1;
      state.sinceShot = 0;
      return { spread, kickPitch, kickYaw };
    },
    tick(dt, stance) {
      const step = Math.max(0, dt);
      state.sinceShot += step;
      const adsTime = Math.max(1e-3, tuning.adsTime ?? 0.2);
      const adsTarget = stance?.ads === true ? 1 : 0;
      state.adsProgress += Math.max(-step / adsTime, Math.min(step / adsTime, adsTarget - state.adsProgress));
      const recoil = tuning.recoil;
      if (recoil !== undefined && state.sinceShot >= (recoil.recoverDelay ?? 0.1)) {
        const amount = (recoil.recoverRate ?? 0) * step;
        state.aimPitch = toward(state.aimPitch, amount);
        state.aimYaw = toward(state.aimYaw, amount);
        state.cameraPitch = toward(state.cameraPitch, amount);
        state.cameraYaw = toward(state.cameraYaw, amount);
        if (state.aimPitch === 0 && state.aimYaw === 0) state.shotIndex = 0;
      }
      const spread = tuning.spread;
      if (state.sinceShot >= (spread.recoverDelay ?? 0.1)) {
        state.bloom = Math.max(spread.base, state.bloom - (spread.recoverRate ?? 0) * step);
      }
      return write(stance);
    },
    frame: () => write(undefined),
    retune(next) {
      tuning = next;
      state.bloom = Math.max(next.spread.base, state.bloom);
    },
    snapshot: () => ({ ...state }),
    restore(next) {
      Object.assign(state, next);
    },
    reset() {
      Object.assign(state, fresh(tuning));
    },
  };
}

/** Deterministic weapon-feel metrics from {@link measureWeapon}. */
export interface WeaponReport {
  /** Spread of the first shot from rest, rad. */
  firstShotSpread: number;
  /** Spread of the tenth shot of a held burst, rad. */
  tenthShotSpread: number;
  /** Aim climb after a full burst, rad. */
  burstClimb: number;
  /** Seconds after the burst until aim recoil is back within 5% of its peak and bloom within 5% of base. */
  resetSeconds: number;
  /** Seconds to go fully into aim-down-sights. */
  adsSeconds: number;
  /** Time to kill a target with `targetHealth`, s, from `damage` per shot at `interval` (`0` if one shot kills). */
  timeToKill: number;
}

/**
 * Fires a held burst through a fresh handling instance at a fixed interval and reports spread growth,
 * climb, reset time, ADS time and time-to-kill.
 * @capability weapon-metrics measure a weapon's feel as numbers — first and tenth shot spread, climb, reset time, ADS time, time-to-kill
 */
export function measureWeapon(
  create: () => WeaponHandling,
  options: { interval: number; burst?: number; damage?: number; targetHealth?: number; dt?: number },
): WeaponReport {
  const dt = options.dt ?? 1 / 120;
  const burst = options.burst ?? 30;
  const interval = Math.max(dt, options.interval);
  const weapon = create();
  let firstShotSpread = 0;
  let tenthShotSpread = 0;
  for (let shot = 0; shot < burst; shot += 1) {
    const fired = weapon.fire();
    if (shot === 0) firstShotSpread = fired.spread;
    if (shot === 9) tenthShotSpread = fired.spread;
    for (let t = 0; t < interval - 1e-9; t += dt) weapon.tick(dt);
  }
  const peak = weapon.snapshot();
  const burstClimb = peak.aimPitch;
  const base = weapon.frame().spread;
  let resetSeconds = Number.POSITIVE_INFINITY;
  const baseSpread = create().frame().spread;
  for (let i = 1; i <= Math.ceil(10 / dt); i += 1) {
    const frame = weapon.tick(dt);
    const aimSettled = Math.abs(frame.aimPitch) <= Math.abs(peak.aimPitch) * 0.05 + 1e-9;
    const spreadSettled = frame.spread <= baseSpread + (base - baseSpread) * 0.05 + 1e-9;
    if (aimSettled && spreadSettled) {
      resetSeconds = i * dt;
      break;
    }
  }
  const ads = create();
  let adsSeconds = Number.POSITIVE_INFINITY;
  for (let i = 1; i <= Math.ceil(5 / dt); i += 1) {
    if (ads.tick(dt, { ads: true }).adsProgress >= 1) {
      adsSeconds = i * dt;
      break;
    }
  }
  const damage = options.damage ?? 0;
  const health = options.targetHealth ?? 0;
  const shotsToKill = damage > 0 ? Math.max(1, Math.ceil(health / damage)) : 0;
  const timeToKill = shotsToKill > 0 ? (shotsToKill - 1) * interval : 0;
  return { firstShotSpread, tenthShotSpread, burstClimb, resetSeconds, adsSeconds, timeToKill };
}
