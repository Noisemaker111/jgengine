export const GCD_SEC = 1.5;
export const MELEE_RANGE = 5;
export const INTERACT_RANGE = 5;
export const LEASH_DISTANCE = 45;
export const FALL_SAFE_DISTANCE = 12;
export const SPELL_POWER_PER_INT = 0.5;
export const ATTACK_POWER_PER_STR = 1;
export const CRIT_RATING_PER_PCT = 10;
export const BASE_CRIT_PCT = 5;
export const CAST_COEFFICIENT_DIVISOR = 3.5;
export const HP_PER_STA = 10;
export const MANA_PER_INT = 15;

export function armorReduction(armor: number, attackerLevel: number): number {
  if (armor <= 0) return 0;
  return Math.min(0.75, armor / (armor + 85 * attackerLevel + 400));
}

export function mitigate(amount: number, armor: number, attackerLevel: number): number {
  return Math.max(1, Math.round(amount * (1 - armorReduction(armor, attackerLevel))));
}

export function rollWeaponDamage(
  rng: () => number,
  weapon: { min: number; max: number; speed: number },
  attackPower: number,
): number {
  const base = weapon.min + rng() * (weapon.max - weapon.min);
  return Math.max(1, Math.round(base + (attackPower / 14) * weapon.speed));
}

export function spellAmount(
  base: number,
  perLevel: number,
  level: number,
  spellPower: number,
  coefficient: number | undefined,
  castTime: number,
): number {
  const coeff = coefficient ?? Math.min(1, Math.max(castTime, GCD_SEC) / CAST_COEFFICIENT_DIVISOR);
  return Math.max(1, Math.round(base + perLevel * (level - 1) + spellPower * coeff));
}

export function rollCrit(rng: () => number, critPct: number): boolean {
  return rng() * 100 < critPct;
}

export function fallDamage(maxHp: number, dropDistance: number): number {
  if (dropDistance <= FALL_SAFE_DISTANCE) return 0;
  return Math.round(maxHp * (dropDistance - FALL_SAFE_DISTANCE) * 0.07);
}

export function mobHp(hpBase: number, hpPerLevel: number, level: number): number {
  return Math.round(hpBase + hpPerLevel * level);
}

export function mobDamage(dmgBase: number, dmgPerLevel: number, level: number): number {
  return Math.max(1, Math.round(dmgBase + dmgPerLevel * level));
}
