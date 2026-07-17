import { evalCurve, type Curve } from "../game/progression";

/**
 * Plain, JSON-serializable snapshot of a point pool. `earned` is the lifetime total ever
 * banked; every committed unlock lives in `unlocked` as `id → cost paid`. `spent` and
 * `available` are always derived (`spent = Σ unlocked`, `available = earned − spent`) so the
 * two can never drift out of sync across a serialize/hydrate round-trip.
 */
export interface UnlockPointsState {
  /** Total points ever granted; unaffected by spending, refunds, or respec. */
  earned: number;
  /** Committed unlocks as `unlockId → cost paid`. Sums to the currently spent total. */
  unlocked: Readonly<Record<string, number>>;
}

/** Options for {@link UnlockPoints.spend}. */
export interface SpendOptions {
  /**
   * Injected prerequisite gate, checked before any points are deducted. Return `false` to
   * reject with `"missing-prerequisites"`. Compose with `economy/techTree` without coupling —
   * e.g. `{ requires: () => techTree.canUnlock(userId, id).ok }` — or any game-defined rule.
   */
  requires?: () => boolean;
}

/** Why a {@link UnlockPoints.spend} was refused; the pool is left untouched on any rejection. */
export type SpendRejection =
  | "invalid-cost"
  | "already-unlocked"
  | "missing-prerequisites"
  | "insufficient-points";

/** Result of {@link UnlockPoints.spend}: the new `available` balance on success, else a reason. */
export type SpendResult = { ok: true; available: number } | { ok: false; reason: SpendRejection };

/** Configuration for {@link createUnlockPoints}. */
export interface UnlockPointsConfig {
  /**
   * Points granted for *reaching* a level, evaluated by {@link UnlockPoints.grantForLevel} and
   * summed across gained levels by {@link UnlockPoints.grantOnLevelUp}. Non-uniform curves are
   * fine (front-loaded, milestone `steps`, etc.). Defaults to one point per level.
   */
  perLevel?: Curve;
  /** Points banked before any leveling — a starting unlock budget. Default `0`. */
  start?: number;
  /** Rehydrate from a prior {@link UnlockPoints.snapshot}. */
  state?: UnlockPointsState;
}

/**
 * A spendable unlock-point economy: a pool you earn (per level or by direct grant) and spend to
 * unlock nodes, with per-unlock refunds and a full respec.
 */
export interface UnlockPoints {
  /** Unspent points on hand (`earned − spent`). */
  available(): number;
  /** Lifetime points ever granted; never reduced by spending or respec. */
  earned(): number;
  /** Points currently committed to unlocks (`Σ` of every unlock cost). */
  spent(): number;
  /** Bank an arbitrary point grant (quest reward, difficulty bonus). Non-positive/non-finite is ignored. */
  grant(amount: number): void;
  /** Bank the `perLevel` grant for reaching `level`; returns the amount actually added. */
  grantForLevel(level: number): number;
  /** Bank grants for every level in `(fromLevel, toLevel]`; returns the total added. */
  grantOnLevelUp(fromLevel: number, toLevel: number): number;
  /** True when `available() >= cost`. */
  canAfford(cost: number): boolean;
  /** Deduct `cost` and record `unlockId`, unless rejected (see {@link SpendResult}). */
  spend(unlockId: string, cost: number, opts?: SpendOptions): SpendResult;
  /** True once `unlockId` has been spent on and not refunded. */
  isUnlocked(id: string): boolean;
  /** Points paid for `id`, or `0` if it is not unlocked. */
  costOf(id: string): number;
  /** Every currently unlocked id, in insertion order. */
  unlockedIds(): string[];
  /** Refund a single unlock, returning its cost to `available`. Returns `false` if not unlocked. */
  refund(unlockId: string): boolean;
  /** Mindwipe: refund every unlock and clear the recorded set, keeping `earned`. Returns points refunded. */
  respec(): number;
  /** Plain serializable snapshot; safe to `JSON.stringify` and later {@link hydrate}. */
  snapshot(): UnlockPointsState;
  /** Replace all state from a prior {@link snapshot}, discarding invalid entries. */
  hydrate(state: UnlockPointsState): void;
}

const DEFAULT_PER_LEVEL: Curve = { kind: "const", value: 1 };

function sanitizeAmount(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 0;
}

/**
 * Spendable unlock-point economy — the seam between leveling and a tech tree. Points are earned
 * per level (via a configurable, possibly non-uniform grant curve) or granted directly, then
 * spent to unlock nodes; spending can defer prerequisite checks to an injected predicate so it
 * composes with `economy/techTree` (or any gate) without depending on it. Individual unlocks
 * refund, and `respec` fully refunds a build while preserving lifetime earned points. All state
 * is plain and JSON round-trips.
 *
 * @capability unlock-points spendable point pool earned per level and spent to unlock nodes, with refund and respec
 */
export function createUnlockPoints(config: UnlockPointsConfig = {}): UnlockPoints {
  const perLevel = config.perLevel ?? DEFAULT_PER_LEVEL;
  const unlocked = new Map<string, number>();
  let earned = 0;

  const load = (state: UnlockPointsState): void => {
    unlocked.clear();
    earned = sanitizeAmount(state.earned);
    for (const [id, cost] of Object.entries(state.unlocked)) {
      const paid = Number.isFinite(cost) && cost >= 0 ? cost : 0;
      unlocked.set(id, paid);
    }
  };

  if (config.state !== undefined) {
    load(config.state);
  } else {
    earned = sanitizeAmount(config.start ?? 0);
  }

  const spentTotal = (): number => {
    let total = 0;
    for (const cost of unlocked.values()) total += cost;
    return total;
  };

  const availablePoints = (): number => earned - spentTotal();

  const grantLevel = (level: number): number => {
    const amount = sanitizeAmount(evalCurve(perLevel, level));
    earned += amount;
    return amount;
  };

  return {
    available: availablePoints,
    earned: () => earned,
    spent: spentTotal,
    grant(amount) {
      earned += sanitizeAmount(amount);
    },
    grantForLevel: grantLevel,
    grantOnLevelUp(fromLevel, toLevel) {
      let total = 0;
      for (let level = fromLevel + 1; level <= toLevel; level += 1) total += grantLevel(level);
      return total;
    },
    canAfford(cost) {
      return availablePoints() >= cost;
    },
    spend(unlockId, cost, opts) {
      if (!Number.isFinite(cost) || cost < 0) return { ok: false, reason: "invalid-cost" };
      if (unlocked.has(unlockId)) return { ok: false, reason: "already-unlocked" };
      if (opts?.requires !== undefined && !opts.requires()) {
        return { ok: false, reason: "missing-prerequisites" };
      }
      if (availablePoints() < cost) return { ok: false, reason: "insufficient-points" };
      unlocked.set(unlockId, cost);
      return { ok: true, available: availablePoints() };
    },
    isUnlocked(id) {
      return unlocked.has(id);
    },
    costOf(id) {
      return unlocked.get(id) ?? 0;
    },
    unlockedIds() {
      return [...unlocked.keys()];
    },
    refund(unlockId) {
      return unlocked.delete(unlockId);
    },
    respec() {
      const refunded = spentTotal();
      unlocked.clear();
      return refunded;
    },
    snapshot() {
      const map: Record<string, number> = {};
      for (const [id, cost] of unlocked) map[id] = cost;
      return { earned, unlocked: map };
    },
    hydrate(state) {
      load(state);
    },
  };
}
