/** One carried stack: an item id and how many of it the carrier holds. */
export interface LoadEntry {
  itemId: string;
  quantity: number;
}

/** Resolves the per-unit mass of an item id. Injected so mass tables stay decoupled from this module. */
export type MassResolver = (itemId: string) => number;

/**
 * Tuning for where the encumbrance bands sit and how hard the carrier is slowed.
 * Both fields are load *fractions* / multipliers in `0..1`, never absolute mass.
 */
export interface EncumbranceConfig {
  /**
   * Load fraction at/above which the carrier becomes encumbered (loses sprint & jump and
   * starts slowing). Below it the carrier is unencumbered. Default `0.85`.
   */
  soft?: number;
  /**
   * Move-speed multiplier reached as load approaches full capacity (fraction → 1), the floor
   * the progressive slow curve bottoms out at just before immobility. Default `0.5`.
   */
  floor?: number;
}

/** Coarse carry state: free-moving, slowed, or pinned in place. */
export type EncumbranceTier = "unencumbered" | "encumbered" | "immobile";

/** Serializable snapshot of a carrier's load versus capacity and the movement consequences. */
export interface EncumbranceState {
  /** Total carried mass (never negative). */
  mass: number;
  /** Carrying capacity this load was measured against. */
  capacity: number;
  /** `mass / capacity`, clamped to be finite and non-negative; may exceed 1 when overloaded. */
  fraction: number;
  tier: EncumbranceTier;
  /** Movement speed scalar in `0..1`: 1 when unencumbered, decays toward `floor`, 0 when immobile. */
  moveMultiplier: number;
  canSprint: boolean;
  canJump: boolean;
  immobile: boolean;
}

const DEFAULT_SOFT = 0.85;
const DEFAULT_FLOOR = 0.5;

/**
 * Sum the mass of every carried stack using an injected per-unit mass resolver. Bounded by the
 * number of entries; allocates nothing. Missing or negative unit masses are treated as 0.
 *
 * @param entries carried stacks (`{ itemId, quantity }`, compatible with any inventory listing).
 * @param massOf per-unit mass lookup for an item id.
 * @capability carry-load sum carried mass from item stacks via an injected mass resolver
 */
export function totalLoad(entries: readonly LoadEntry[], massOf: MassResolver): number {
  let total = 0;
  for (const entry of entries) {
    if (entry.quantity <= 0) continue;
    const unit = massOf(entry.itemId);
    if (unit > 0) total += unit * entry.quantity;
  }
  return total;
}

/**
 * Progressive move-speed multiplier for a raw load fraction: 1 while at/below `soft`, a linear
 * decay from 1 down toward `floor` across the `soft..1` band, and 0 once at/over capacity.
 * Pure and side-effect free — the curve `resolveEncumbrance` reads for `moveMultiplier`.
 *
 * @capability encumbrance-move-curve progressive move-speed multiplier from a carry-load fraction
 */
export function encumbranceMoveMultiplier(fraction: number, config?: EncumbranceConfig): number {
  const soft = config?.soft ?? DEFAULT_SOFT;
  const floor = config?.floor ?? DEFAULT_FLOOR;
  if (fraction >= 1) return 0;
  if (fraction <= soft) return 1;
  const span = 1 - soft;
  const t = span > 0 ? (fraction - soft) / span : 1;
  return 1 - (1 - floor) * t;
}

/**
 * Resolve carried mass against carrying capacity into a serializable encumbrance state: load
 * fraction, tier, and the movement consequences (`canSprint`/`canJump`/`immobile` gates plus a
 * progressive `moveMultiplier`). Below `soft` the carrier is unencumbered and unhindered; from
 * `soft` up to capacity it is encumbered — no sprint or jump, and speed decays from 1 toward
 * `floor`; at or above capacity it is immobile (multiplier 0). Deterministic and allocation-light;
 * pair with {@link totalLoad} to derive `mass` from an inventory and a mass table. A capacity of 0
 * or less pins any positive load as immobile (`fraction` 1) so the state stays finite/serializable.
 *
 * @capability carry-encumbrance carried mass vs capacity into movement penalty tiers and a speed multiplier
 */
export function resolveEncumbrance(
  mass: number,
  capacity: number,
  config?: EncumbranceConfig,
): EncumbranceState {
  const soft = config?.soft ?? DEFAULT_SOFT;
  const safeMass = mass > 0 ? mass : 0;
  const fraction = capacity > 0 ? safeMass / capacity : safeMass > 0 ? 1 : 0;

  const immobile = fraction >= 1;
  const tier: EncumbranceTier = immobile ? "immobile" : fraction >= soft ? "encumbered" : "unencumbered";
  const unencumbered = tier === "unencumbered";

  return {
    mass: safeMass,
    capacity,
    fraction,
    tier,
    moveMultiplier: encumbranceMoveMultiplier(fraction, config),
    canSprint: unencumbered,
    canJump: unencumbered,
    immobile,
  };
}
