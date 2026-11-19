import { evalCurve, type Curve } from "../progression/leveling";

/**
 * Plain, JSON-serializable snapshot of a point pool. `earned` is the lifetime total ever
 * banked; every committed unlock lives in `unlocked` as `id → cost paid`. `spent` and
 * `available` are always derived (`spent = Σ unlocked`, `available = earned − spent`) so the
 * two can never drift out of sync across a serialize/hydrate round-trip.
 */
export interface UnlockPointsState {
  earned: number;
  unlocked: Readonly<Record<string, number>>;
}

export interface SpendOptions {
  requires?: () => boolean;
}

/** Why a {@link UnlockPoints.spend} was refused; the pool is left untouched on any rejection. */
export type SpendRejection =
  | "invalid-cost"
  | "already-unlocked"
  | "missing-prerequisites"
  | "insufficient-points";

export type SpendResult = { ok: true; available: number } | { ok: false; reason: SpendRejection };

export interface UnlockPointsConfig {
  /**
   * Points granted for *reaching* a level, evaluated by {@link UnlockPoints.grantForLevel} and
   * summed across gained levels by {@link UnlockPoints.grantOnLevelUp}. Non-uniform curves are
   * fine (front-loaded, milestone `steps`, etc.). Defaults to one point per level.
   */
  perLevel?: Curve;
  start?: number;
  state?: UnlockPointsState;
}

export interface UnlockPoints {
  available(): number;
  /** Lifetime points ever granted; never reduced by spending or respec. */
  earned(): number;
  spent(): number;
  grant(amount: number): void;
  grantForLevel(level: number): number;
  grantOnLevelUp(fromLevel: number, toLevel: number): number;
  canAfford(cost: number): boolean;
  /** Deduct `cost` and record `unlockId`, unless rejected (see {@link SpendResult}). */
  spend(unlockId: string, cost: number, opts?: SpendOptions): SpendResult;
  isUnlocked(id: string): boolean;
  costOf(id: string): number;
  unlockedIds(): string[];
  refund(unlockId: string): boolean;
  respec(): number;
  snapshot(): UnlockPointsState;
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
      if (Number.isFinite(cost) && cost >= 0) unlocked.set(id, cost);
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
      return { earned, unlocked: Object.fromEntries(unlocked) };
    },
    hydrate(state) {
      load(state);
    },
  };
}
