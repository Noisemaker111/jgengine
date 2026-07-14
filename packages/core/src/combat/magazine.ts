/** Draws ammo for a `Magazine`'s reload from wherever the reserve pool actually lives. */
export interface MagazineReserve {
  current(): number;
  spend(amount: number): boolean;
  gain?(amount: number): void;
}

/** Tuning for `createMagazine`: mag capacity, reload delay, and where reserve ammo is drawn from. */
export interface MagazineConfig {
  capacity: number;
  reloadMs: number;
  /** Starting loaded count; defaults to `capacity` (a full mag). */
  loaded?: number;
  /**
   * A plain number seeds a self-contained reserve pool; a `MagazineReserve` bridges reload draws
   * into an externally-owned pool (a shared ammo-type stat, another `ResourcePool`); omitted means
   * an infinite reserve (classic arcade shooter, never locked out of reloading).
   */
  reserve?: number | MagazineReserve;
}

/**
 * A per-weapon magazine: discrete loaded rounds, a timed reload that refills from a reserve pool,
 * and the reserve-pool interaction itself — the primitive that replaces hand-rolling mag size,
 * reload delay, and reserve bookkeeping per game (#536.2).
 */
export interface Magazine {
  loaded(): number;
  capacity(): number;
  /** Reserve rounds available to reload from, or `null` when the reserve is infinite. */
  reserve(): number | null;
  isReloading(): boolean;
  /** Reload progress in `[0, 1]`; 0 while idle. */
  reloadFraction(): number;
  isEmpty(): boolean;
  isFull(): boolean;
  canFire(rounds?: number): boolean;
  /** Spend `rounds` (default 1) loaded ammo; returns false without effect when insufficient. */
  fire(rounds?: number): boolean;
  /** True when a reload could start: not already full, not already reloading, reserve has rounds. */
  canReload(): boolean;
  /** Begin the reload timer if `canReload()`; returns whether it started. */
  startReload(): boolean;
  /** Abort an in-progress reload; loaded/reserve are unchanged (only completion moves ammo). */
  cancelReload(): void;
  /** Add `amount` to a self-contained numeric reserve (a pickup); a no-op against an infinite or externally-owned reserve without a `gain`. */
  addReserve(amount: number): void;
  /** Advance the reload timer; completes the reload once `reloadMs` has elapsed. */
  tick(dtSeconds: number): void;
}

function selfManagedReserve(initial: number): MagazineReserve {
  let value = Math.max(0, initial);
  return {
    current: () => value,
    spend(amount) {
      if (amount <= 0) return true;
      if (amount > value) return false;
      value -= amount;
      return true;
    },
    gain(amount) {
      if (amount > 0) value += amount;
    },
  };
}

const INFINITE_RESERVE: MagazineReserve = {
  current: () => Number.POSITIVE_INFINITY,
  spend: () => true,
};

/**
 * Builds a {@link Magazine}: discrete loaded ammo, a timed reload, and reserve-pool interaction.
 *
 * @capability magazine a weapon magazine with capacity, timed reload, and reserve-pool interaction
 */
export function createMagazine(config: MagazineConfig): Magazine {
  const capacity = Math.max(0, config.capacity);
  const reloadMs = Math.max(0, config.reloadMs);
  const isInfiniteReserve = config.reserve === undefined;
  const reserve: MagazineReserve = isInfiniteReserve
    ? INFINITE_RESERVE
    : typeof config.reserve === "number"
      ? selfManagedReserve(config.reserve)
      : config.reserve!;

  function clampLoaded(value: number): number {
    return Math.max(0, Math.min(capacity, value));
  }

  let loaded = clampLoaded(config.loaded ?? capacity);
  let reloadElapsedMs: number | null = null;

  return {
    loaded: () => loaded,
    capacity: () => capacity,
    reserve: () => (isInfiniteReserve ? null : reserve.current()),
    isReloading: () => reloadElapsedMs !== null,
    reloadFraction: () => (reloadElapsedMs === null || reloadMs <= 0 ? 0 : Math.min(1, reloadElapsedMs / reloadMs)),
    isEmpty: () => loaded <= 0,
    isFull: () => loaded >= capacity,
    canFire(rounds = 1) {
      return rounds <= 0 || rounds <= loaded;
    },
    fire(rounds = 1) {
      if (rounds <= 0) return true;
      if (rounds > loaded) return false;
      loaded -= rounds;
      return true;
    },
    canReload() {
      if (reloadElapsedMs !== null) return false;
      if (loaded >= capacity) return false;
      return isInfiniteReserve || reserve.current() > 0;
    },
    startReload() {
      if (!this.canReload()) return false;
      reloadElapsedMs = 0;
      return true;
    },
    cancelReload() {
      reloadElapsedMs = null;
    },
    addReserve(amount) {
      if (amount > 0) reserve.gain?.(amount);
    },
    tick(dtSeconds) {
      if (dtSeconds <= 0 || reloadElapsedMs === null) return;
      reloadElapsedMs += dtSeconds * 1000;
      if (reloadElapsedMs < reloadMs) return;
      const need = capacity - loaded;
      if (need > 0) {
        const take = isInfiniteReserve ? need : Math.min(need, reserve.current());
        if (take > 0 && reserve.spend(take)) loaded = clampLoaded(loaded + take);
      }
      reloadElapsedMs = null;
    },
  };
}
