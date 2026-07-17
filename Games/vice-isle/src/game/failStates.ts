/** Wasted/Busted money rules — pure so the fee curves are testable. */

/** Clinic cut on death: 8% of cash, at least $150, never more than the player holds. */
export function clinicFee(cash: number): number {
  if (cash <= 0) return 0;
  return Math.min(cash, Math.max(150, Math.round(cash * 0.08)));
}

/** VCPD fine on arrest: $150 per star, capped by what the player holds. */
export function bustedFine(cash: number, stars: number): number {
  if (cash <= 0 || stars <= 0) return 0;
  return Math.min(cash, stars * 150);
}

/** Seconds a cop must stay on top of an on-foot wanted player to make the arrest. */
export const BUSTED_HOLD_SEC = 1.2;

/** How close (m) a cop has to be for the arrest clock to run. */
export const BUSTED_RADIUS = 2.6;

/**
 * Advance the arrest clock: run it while a cop is on top of the player, bleed it twice as fast once
 * the player breaks contact. Returns the new hold time; an arrest fires when it crosses the threshold.
 */
export function advanceBustedHold(hold: number, copInReach: boolean, dt: number): number {
  if (copInReach) return hold + dt;
  return Math.max(0, hold - dt * 2);
}
