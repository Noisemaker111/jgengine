export type WeaponId = "pulseLance" | "rotorBlades" | "quakePulse";

export const WEAPON_IDS: readonly WeaponId[] = ["pulseLance", "rotorBlades", "quakePulse"];
export const MAX_WEAPON_LEVEL = 8;
export const WEAPON_LABEL: Record<WeaponId, string> = {
  pulseLance: "Pulse Lance",
  rotorBlades: "Rotor Blades",
  quakePulse: "Quake Pulse",
};

interface WeaponTuning {
  baseDamage: number;
  damagePerLevel: number;
  baseCooldownMs: number;
  cooldownFloorMs: number;
  cooldownStepMs: number;
}

const TUNING: Record<WeaponId, WeaponTuning> = {
  pulseLance: { baseDamage: 9, damagePerLevel: 3.2, baseCooldownMs: 900, cooldownFloorMs: 320, cooldownStepMs: 70 },
  rotorBlades: { baseDamage: 5, damagePerLevel: 1.6, baseCooldownMs: 340, cooldownFloorMs: 150, cooldownStepMs: 22 },
  quakePulse: { baseDamage: 16, damagePerLevel: 5.5, baseCooldownMs: 3400, cooldownFloorMs: 1800, cooldownStepMs: 190 },
};

export function weaponDamage(id: WeaponId, level: number): number {
  const tuning = TUNING[id];
  return tuning.baseDamage + tuning.damagePerLevel * (level - 1);
}

export function weaponCooldownMs(id: WeaponId, level: number): number {
  const tuning = TUNING[id];
  return Math.max(tuning.cooldownFloorMs, tuning.baseCooldownMs - tuning.cooldownStepMs * (level - 1));
}

export function rotorBladeCount(level: number): number {
  return Math.min(6, 2 + Math.floor((level - 1) / 2));
}

export function rotorRadius(level: number): number {
  return 2.1 + 0.12 * (level - 1);
}

export function quakeRadius(level: number): number {
  return 4.2 + 0.35 * (level - 1);
}

export const PULSE_LANCE_RANGE = 16;
export const PULSE_LANCE_SPEED = 24;
export const ROTOR_HIT_RADIUS = 1.1;
export const ROTOR_ANGULAR_SPEED = 3.4;
