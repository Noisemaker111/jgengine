/**
 * Composable pursuit/aggro step: the "I have a target — now chase it, stop at reach, hit it on a
 * cooldown, and break off if led too far from home" loop that melee mobs, RTS units, and stationary
 * turrets all re-implement by hand. This owns exactly that state machine and the per-entity attack
 * cooldown; target *selection* stays separate (see {@link ./targetAcquisition}), and every side
 * effect — move, attack, break off — is performed by the caller in response to the returned action.
 *
 * Deterministic and allocation-free: distances are measured by the caller and passed in as scalars,
 * the only state is one serializable number ({@link PursuitState.attackCooldown}) advanced in place,
 * and the returned {@link PursuitAction} is a string literal. No object is built per entity per step,
 * and nothing here scans the world — feed it a target you already resolved.
 */

/** The action a pursuit step resolves to; the caller performs the matching side effect. */
export type PursuitAction =
  /** Home distance exceeded the leash — abandon the target and return home. */
  | "leash"
  /** Out of range — advance toward the target. */
  | "pursue"
  /** In range and the cooldown is ready — perform the attack, then {@link armPursuit}. */
  | "attack"
  /** In range but the cooldown has not elapsed — hold (face the target, idle, etc.). */
  | "wait"
  /** No engageable target this step (distance was `null`). */
  | "idle";

/**
 * When the attack cooldown ticks down.
 * - `"always"` (default): every step, like a wall-clock weapon timer that keeps counting during the
 *   chase, so the entity can swing the instant it reaches its target.
 * - `"inRange"`: only while within `stopDistance`, so the timer freezes during the chase and the
 *   full interval is paid out after each contact.
 */
export type CooldownMode = "always" | "inRange";

/** Per-entity cooldown state owned by the primitive. One serializable number; no methods. */
export interface PursuitState {
  /** Seconds remaining until the next attack may fire. Advanced toward `0` by {@link advancePursuit}. */
  attackCooldown: number;
}

/** A fresh pursuit state, ready to attack immediately (`attackCooldown` at `0`). */
export function createPursuitState(attackCooldown = 0): PursuitState {
  return { attackCooldown };
}

/** Set the cooldown after an attack fires (clamped at `0`). Call on the step that returned `"attack"`. */
export function armPursuit(state: PursuitState, intervalSeconds: number): void {
  state.attackCooldown = intervalSeconds > 0 ? intervalSeconds : 0;
}

function tickCooldown(state: PursuitState, dt: number): void {
  if (state.attackCooldown > 0) {
    const next = state.attackCooldown - dt;
    state.attackCooldown = next > 0 ? next : 0;
  }
}

/**
 * Advance one pursuit step for a single entity, mutating `state.attackCooldown`, and return the
 * action the caller should perform. All spatial input is scalar and measured this frame:
 *
 * - `targetDistance` — self→target distance, or `null` when there is no engageable target (`"idle"`).
 * - `stopDistance`   — attack once within this distance; pursue while beyond it.
 * - `homeDistance` / `leashRange` — optional leash checked first: when `homeDistance > leashRange`
 *   the step is `"leash"`. Leave at their defaults (`-Infinity` / `+Infinity`) to disable leashing.
 * - `cooldownMode`   — see {@link CooldownMode}.
 *
 * On `"attack"` the caller applies the hit and calls {@link armPursuit} with the next interval.
 *
 * @capability pursuit chase-to-reach cooldown-gated attack with optional leash-to-home; owns the attack cooldown
 */
export function advancePursuit(
  state: PursuitState,
  dt: number,
  targetDistance: number | null,
  stopDistance: number,
  cooldownMode: CooldownMode = "always",
  homeDistance = Number.NEGATIVE_INFINITY,
  leashRange = Number.POSITIVE_INFINITY,
): PursuitAction {
  if (cooldownMode === "always") tickCooldown(state, dt);
  if (homeDistance > leashRange) return "leash";
  if (targetDistance === null) return "idle";
  if (targetDistance > stopDistance) return "pursue";
  if (cooldownMode === "inRange") tickCooldown(state, dt);
  return state.attackCooldown <= 0 ? "attack" : "wait";
}
