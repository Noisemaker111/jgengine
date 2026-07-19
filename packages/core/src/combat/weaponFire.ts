import { resolveDamageHit, type DamageHitInput, type DamageHitResolution } from "./damageResolution";
import { createMagazine, type Magazine, type MagazineConfig } from "./magazine";

/** Tuning for {@link createFireCadence}: the minimum interval between actions and whether it starts ready. */
export interface FireCadenceConfig {
  /** Minimum milliseconds between successful `fire()` calls. `<= 0` disables the limit (always ready). */
  intervalMs: number;
  /** Start ready to fire (default) or mid-cooldown. */
  ready?: boolean;
}

/**
 * A minimal minimum-interval rate gate for a repeated action — weapon fire, ability
 * spam, any "no faster than N per second" rule. Deterministic and serializable: its
 * whole state is the elapsed time since the last action, exposed via {@link FireCadence.elapsedMs}.
 */
export interface FireCadence {
  /** True when at least `intervalMs` has elapsed since the last successful `fire()`. */
  ready(): boolean;
  /** Progress toward ready in `[0, 1]`; `1` when ready. */
  readyFraction(): number;
  /** Milliseconds until ready; `0` when ready. */
  remainingMs(): number;
  /** Consume the gate: resets the interval and returns `true`, or returns `false` without effect when not `ready()`. */
  fire(): boolean;
  /** Advance the internal clock by `dtSeconds`. */
  tick(dtSeconds: number): void;
  /** Elapsed milliseconds since the last successful `fire()` (capped at `intervalMs`) — the full serializable state. */
  elapsedMs(): number;
  /** Restore a prior {@link FireCadence.elapsedMs} value (e.g. from a save/replay snapshot). */
  restore(elapsedMs: number): void;
}

/**
 * Build a {@link FireCadence} rate gate. Reach for this instead of hand-tracking a
 * `lastFiredAt` timestamp and comparing against a fire interval per game.
 *
 * @capability fire-cadence a serializable minimum-interval rate gate for repeated actions (weapon fire, ability spam)
 */
export function createFireCadence(config: FireCadenceConfig): FireCadence {
  const intervalMs = Math.max(0, config.intervalMs);
  let elapsed = config.ready === false ? 0 : intervalMs;

  const ready = (): boolean => intervalMs <= 0 || elapsed >= intervalMs;

  return {
    ready,
    readyFraction: () => (intervalMs <= 0 ? 1 : Math.min(1, elapsed / intervalMs)),
    remainingMs: () => (ready() ? 0 : intervalMs - elapsed),
    fire() {
      if (!ready()) return false;
      elapsed = 0;
      return true;
    },
    tick(dtSeconds) {
      if (dtSeconds <= 0 || elapsed >= intervalMs) return;
      elapsed = Math.min(intervalMs, elapsed + dtSeconds * 1000);
    },
    elapsedMs: () => elapsed,
    restore(value) {
      elapsed = Math.max(0, Math.min(intervalMs, value));
    },
  };
}

/** Why a {@link WeaponRuntime.fire} attempt resolved the way it did. */
export type WeaponFireStatus = "fired" | "cooling" | "empty" | "reloading";

/**
 * The result of a {@link WeaponRuntime.fire} attempt. On `"fired"`, `hits` is whatever the
 * caller's raycast returned and `resolutions` holds the portable damage provenance for each hit
 * that produced a {@link DamageHitInput}; on any blocked status both are empty and no round was spent.
 */
export interface WeaponFireResult<THit> {
  status: WeaponFireStatus;
  /** The hits the caller's `resolveHits` returned (empty when the shot was blocked). */
  hits: readonly THit[];
  /** One {@link DamageHitResolution} per hit that mapped to a {@link DamageHitInput}. */
  resolutions: readonly DamageHitResolution[];
  /** Loaded rounds remaining after the attempt, or `null` when the weapon has no magazine. */
  loaded: number | null;
}

/**
 * Configuration for {@link createWeaponRuntime}. Everything time/ammo-related is plain data; the
 * two callbacks are where the caller keeps ownership of aiming, its own raycaster/projectile query,
 * and how a hit maps to damage. There is deliberately no default weapon, projectile, or damage
 * table here — those are game content.
 */
export interface WeaponRuntimeConfig<TAim, THit> {
  /** Minimum milliseconds between shots. From a rounds-per-second fire rate, pass `1000 / roundsPerSecond`. */
  cadenceMs: number;
  /** Optional discrete-ammo model; omit for an unlimited-fire weapon. */
  magazine?: MagazineConfig;
  /** Start the cadence ready to fire (default) or mid-cooldown. */
  ready?: boolean;
  /**
   * Caller-owned aim → hits. This is where the game runs its OWN raycaster, projectile sweep, or
   * spatial query and returns whatever hit shape it likes. Called once per fired shot.
   */
  resolveHits: (aim: TAim) => readonly THit[];
  /**
   * Map one resolved hit into a portable {@link DamageHitInput}, or `null` to skip damage for that
   * hit (e.g. a wall). The runtime feeds the result to {@link resolveDamageHit}.
   */
  damageFor: (hit: THit, aim: TAim) => DamageHitInput | null;
  /** Deterministic RNG forwarded to status rolls in {@link resolveDamageHit} when a hit's input omits its own. */
  rng?: () => number;
}

/**
 * A composed weapon fire controller: a {@link FireCadence} gate, an optional {@link Magazine}, the
 * caller's raycast, and portable {@link resolveDamageHit} damage resolution wired together. The
 * caller retains ownership of models, animations, muzzle flash, audio, input, camera, aiming, and
 * the raycaster itself.
 */
export interface WeaponRuntime<TAim, THit> {
  /**
   * Attempt one shot with the given aim. Gates on cadence, reload state, and ammo (in that order);
   * only a `"fired"` result spends a round, resets the cadence, runs `resolveHits`, and resolves damage.
   */
  fire(aim: TAim): WeaponFireResult<THit>;
  /** Whether {@link WeaponRuntime.fire} would fire right now (cadence ready, not reloading, ammo available). */
  canFire(): boolean;
  /** Begin a magazine reload if possible; always `false` for a weapon with no magazine. */
  startReload(): boolean;
  /** Abort an in-progress reload. */
  cancelReload(): void;
  /** Advance the cadence gate and any magazine reload timer by `dtSeconds`. */
  tick(dtSeconds: number): void;
  /** The underlying cadence gate (for HUD readouts and snapshot/restore). */
  readonly cadence: FireCadence;
  /** The magazine, or `null` when the weapon has no ammo model. */
  readonly magazine: Magazine | null;
}

/**
 * Compose a portable weapon fire controller from the existing generic primitives — a
 * {@link FireCadence} gate, an optional {@link Magazine}, a caller-provided raycast, and portable
 * {@link resolveDamageHit} damage resolution. No `GameContext`, entity store, renderer, or default
 * weapon is involved; the caller owns aiming, its raycaster, and all presentation, and the result
 * carries full damage provenance for authority to apply and replicate.
 *
 * @capability weapon-runtime compose cadence, magazine, a caller-owned raycast, and portable damage resolution into a fire controller
 */
export function createWeaponRuntime<TAim, THit>(
  config: WeaponRuntimeConfig<TAim, THit>,
): WeaponRuntime<TAim, THit> {
  const cadence = createFireCadence({
    intervalMs: config.cadenceMs,
    ...(config.ready !== undefined ? { ready: config.ready } : {}),
  });
  const magazine: Magazine | null = config.magazine === undefined ? null : createMagazine(config.magazine);
  const loadedOf = (): number | null => (magazine === null ? null : magazine.loaded());

  const blocked = (status: WeaponFireStatus): WeaponFireResult<THit> => ({
    status,
    hits: [],
    resolutions: [],
    loaded: loadedOf(),
  });

  const canFire = (): boolean => {
    if (magazine !== null && magazine.isReloading()) return false;
    if (!cadence.ready()) return false;
    if (magazine !== null && !magazine.canFire(1)) return false;
    return true;
  };

  return {
    cadence,
    magazine,
    canFire,
    startReload: () => (magazine === null ? false : magazine.startReload()),
    cancelReload: () => magazine?.cancelReload(),
    tick(dtSeconds) {
      cadence.tick(dtSeconds);
      magazine?.tick(dtSeconds);
    },
    fire(aim) {
      if (magazine !== null && magazine.isReloading()) return blocked("reloading");
      if (!cadence.ready()) return blocked("cooling");
      if (magazine !== null && !magazine.canFire(1)) return blocked("empty");

      cadence.fire();
      magazine?.fire(1);

      const hits = config.resolveHits(aim);
      const resolutions: DamageHitResolution[] = [];
      for (const hit of hits) {
        const input = config.damageFor(hit, aim);
        if (input === null) continue;
        const withRng: DamageHitInput =
          config.rng !== undefined && input.rng === undefined ? { ...input, rng: config.rng } : input;
        resolutions.push(resolveDamageHit(withRng));
      }
      return { status: "fired", hits, resolutions, loaded: loadedOf() };
    },
  };
}
