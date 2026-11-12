import type { Magazine, MagazineReserve } from "./magazine";

/** Where a shot's rounds come from: a loaded magazine, or a reserve pool fired from directly. */
export type WeaponAmmoSource = Magazine | MagazineReserve;

/** One trigger pull, with the weapon's live numbers. Omitted `ammo` is an unlimited weapon. */
export interface WeaponPull {
  /** Who is shooting; cadence is kept per shooter and weapon. */
  shooter: string;
  weapon: string;
  /** The caller's clock, milliseconds. */
  nowMs: number;
  /** Minimum milliseconds between shots, with fire-rate talents and upgrades already applied. */
  intervalMs: number;
  /** Rounds one shot takes (default `1`). `0` fires without ammo. */
  rounds?: number;
  ammo?: WeaponAmmoSource;
  /** A shot that is gated and presented but spends nothing (a refunded or free round). */
  free?: boolean;
}

/** Why a pull resolved as it did, checked in this order: reloading, cooling, empty, fired. */
export type WeaponPullStatus = "fired" | "cooling" | "reloading" | "empty";

/**
 * One shot that left the gun: the presentation seam. Listeners turn it into muzzle feel, sound,
 * camera shake, recoil or an AI noise event, with their own numbers.
 */
export interface WeaponTriggerShot {
  shooter: string;
  weapon: string;
  nowMs: number;
  /** Shot number for this shooter and weapon, starting at `1`. */
  shot: number;
  /** Rounds taken from the ammo source; `0` for a free shot or an unlimited weapon. */
  spent: number;
  free: boolean;
  /** Rounds left in the magazine after the shot, or `null` when the ammo source is not a magazine. */
  loaded: number | null;
  /** Rounds left in the reserve after the shot, or `null` when it is unlimited. */
  reserve: number | null;
}

export interface WeaponPullResult {
  status: WeaponPullStatus;
  /** The shot on `"fired"`, otherwise `null`. */
  shot: WeaponTriggerShot | null;
}

export interface WeaponTriggersConfig {
  /**
   * `"cooldown"` makes a pull that finds no ammo start the interval too, so an empty click repeats at
   * the weapon's cadence instead of every frame. Default `"free"`: only a fired shot starts it.
   */
  dryPull?: "free" | "cooldown";
}

/** Serializable cadence state for every shooter and weapon that has fired. */
export interface WeaponTriggersSnapshot {
  triggers: { shooter: string; weapon: string; readyAtMs: number; shots: number }[];
}

/**
 * Per-shooter, per-weapon trigger gates on the caller's clock: cadence, the ammo spend from a
 * magazine or a reserve pool, and one listener seam that presents each shot. The caller keeps its
 * own delivery (projectiles, raycasts) and damage.
 */
export interface WeaponTriggers {
  /** What {@link WeaponTriggers.pull} would do now, without any effect. */
  check(pull: WeaponPull): WeaponPullStatus;
  /** Fire when the gate, reload and ammo allow it: spend the rounds, start the interval, tell every listener. */
  pull(pull: WeaponPull): WeaponPullResult;
  /** Present every fired shot; returns the unsubscribe. Listeners run in registration order. */
  onShot(listener: (shot: WeaponTriggerShot) => void): () => void;
  /** Clock time the next shot may leave, ms; `-Infinity` before the first. */
  readyAtMs(shooter: string, weapon: string): number;
  /** Forget every gate (a new run). Listeners stay. */
  clear(): void;
  snapshot(): WeaponTriggersSnapshot;
  restore(snapshot: WeaponTriggersSnapshot): void;
}

interface TriggerState {
  shooter: string;
  weapon: string;
  readyAtMs: number;
  shots: number;
}

function isMagazine(source: WeaponAmmoSource): source is Magazine {
  return typeof (source as Magazine).loaded === "function";
}

function keyOf(shooter: string, weapon: string): string {
  return `${shooter}\u0000${weapon}`;
}

/**
 * Build a bank of {@link WeaponTriggers}. Reach for it when a weapon fires from an input or item-use
 * handler on the game clock and delivery stays with the caller; for a weapon that is plain data and
 * ticks its own delivery, use `createWeaponSystem`.
 *
 * @capability weapon-triggers gate shots per shooter and weapon on the game clock, spend ammo from a magazine or reserve pool, and present each shot through one listener seam
 */
export function createWeaponTriggers(config: WeaponTriggersConfig = {}): WeaponTriggers {
  const dryCooldown = config.dryPull === "cooldown";
  const states = new Map<string, TriggerState>();
  const listeners: ((shot: WeaponTriggerShot) => void)[] = [];

  function stateOf(shooter: string, weapon: string): TriggerState {
    const key = keyOf(shooter, weapon);
    let state = states.get(key);
    if (state === undefined) {
      state = { shooter, weapon, readyAtMs: Number.NEGATIVE_INFINITY, shots: 0 };
      states.set(key, state);
    }
    return state;
  }

  function roundsOf(pull: WeaponPull): number {
    return Math.max(0, pull.rounds ?? 1);
  }

  function hasAmmo(pull: WeaponPull): boolean {
    const ammo = pull.ammo;
    const rounds = roundsOf(pull);
    if (ammo === undefined || rounds <= 0) return true;
    return isMagazine(ammo) ? ammo.canFire(rounds) : ammo.current() >= rounds;
  }

  function check(pull: WeaponPull): WeaponPullStatus {
    if (pull.ammo !== undefined && isMagazine(pull.ammo) && pull.ammo.isReloading()) return "reloading";
    const readyAt = states.get(keyOf(pull.shooter, pull.weapon))?.readyAtMs ?? Number.NEGATIVE_INFINITY;
    if (pull.nowMs < readyAt) return "cooling";
    return hasAmmo(pull) ? "fired" : "empty";
  }

  function spend(pull: WeaponPull): number {
    const ammo = pull.ammo;
    const rounds = roundsOf(pull);
    if (ammo === undefined || rounds <= 0 || pull.free === true) return 0;
    const spent = isMagazine(ammo) ? ammo.fire(rounds) : ammo.spend(rounds);
    return spent ? rounds : 0;
  }

  return {
    check,
    pull(pull) {
      const status = check(pull);
      if (status === "empty" && dryCooldown) stateOf(pull.shooter, pull.weapon).readyAtMs = pull.nowMs + pull.intervalMs;
      if (status !== "fired") return { status, shot: null };
      const spent = spend(pull);
      const state = stateOf(pull.shooter, pull.weapon);
      state.readyAtMs = pull.nowMs + pull.intervalMs;
      state.shots += 1;
      const ammo = pull.ammo;
      const reserve = ammo === undefined ? null : isMagazine(ammo) ? ammo.reserve() : ammo.current();
      const shot: WeaponTriggerShot = {
        shooter: pull.shooter,
        weapon: pull.weapon,
        nowMs: pull.nowMs,
        shot: state.shots,
        spent,
        free: pull.free === true,
        loaded: ammo !== undefined && isMagazine(ammo) ? ammo.loaded() : null,
        reserve: reserve === null || !Number.isFinite(reserve) ? null : reserve,
      };
      for (const listener of [...listeners]) listener(shot);
      return { status, shot };
    },
    onShot(listener) {
      listeners.push(listener);
      return () => {
        const index = listeners.indexOf(listener);
        if (index >= 0) listeners.splice(index, 1);
      };
    },
    readyAtMs: (shooter, weapon) => states.get(keyOf(shooter, weapon))?.readyAtMs ?? Number.NEGATIVE_INFINITY,
    clear() {
      states.clear();
    },
    snapshot() {
      return { triggers: [...states.values()].map((state) => ({ ...state })) };
    },
    restore(snapshot) {
      states.clear();
      for (const entry of snapshot.triggers) {
        states.set(keyOf(entry.shooter, entry.weapon), {
          shooter: entry.shooter,
          weapon: entry.weapon,
          readyAtMs: entry.readyAtMs,
          shots: Math.max(0, Math.floor(entry.shots)),
        });
      }
    },
  };
}
