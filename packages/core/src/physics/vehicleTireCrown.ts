/**
 * A single-track vehicle's round tyre crowns: as the bike leans the contact rolls round the crown toward the inside of
 * the turn, so the bike has to lean further than the balance lean `atan(ay/g)` of a knife-edge wheel, by
 * `asin(r·sin φ' / (h − r))` (Cossalter, *Motorcycle Dynamics*, 2nd ed., 2006, §1.2). With it the lean shown is the
 * bike's roll, which leads the turn instead of following the lateral acceleration.
 */
export interface VehicleTireCrownEffect {
  /** Multiplier on the effect: `0` off (knife-edge tyres: the lean is the balance lean), `1` the crown as given (default), past `1` rounder crowns (up to half the centre-of-mass height); sane over `0..4`. */
  strength?: number;
  /** Crown radius of the tread, m (default `0.075`: a sport bike's 0.06 m front and 0.09 m rear). */
  radius?: number;
}

function crown(effect: VehicleTireCrownEffect, comHeight: number, strength: number): number {
  return Math.min(0.5 * comHeight, Math.max(0, (effect.radius ?? 0.075) * strength));
}

/** The roll angle a bike needs for balance lean `balance`, rad, same sign. */
export function crownShownLean(effect: VehicleTireCrownEffect, comHeight: number, balance: number, strength: number): number {
  const r = crown(effect, comHeight, strength);
  return balance + Math.asin(Math.min(1, (r * Math.sin(balance)) / Math.max(1e-3, comHeight - r)));
}

/**
 * The balance lean, rad, that a bike rolled to `lean` runs at: the inverse of {@link crownShownLean}.
 * @capability vehicle-tire-crown round motorcycle tyre crowns: the extra lean past balance a wide tyre needs, and a lean that leads the turn
 */
export function crownBalanceLean(effect: VehicleTireCrownEffect, comHeight: number, lean: number, strength: number): number {
  // The shown lean rises monotonically with the balance lean, so bisect on [0, |lean|].
  const target = Math.abs(lean);
  let low = 0;
  let high = target;
  for (let i = 0; i < 40; i += 1) {
    const mid = (low + high) / 2;
    if (crownShownLean(effect, comHeight, mid, strength) < target) low = mid;
    else high = mid;
  }
  return Math.sign(lean) * (low + high) / 2;
}
