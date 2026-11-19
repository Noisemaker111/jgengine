import { assertDamageTable, resolveTableDamage, typeMultiplier, type DamageTableDef } from "@jgengine/core/combat/damage/damageTable";

export type DamageType = "pierce" | "blast" | "frost" | "arcane";

export type RaiderClass = "flesh" | "bone" | "warded" | "spirit";

export const BEACON_DAMAGE: DamageTableDef = {
  types: [
    { id: "pierce", vs: { bone: 0.6 } },
    { id: "blast", vs: { bone: 1.4, spirit: 0 } },
    { id: "frost", vs: { warded: 0.6 }, bypassArmor: true },
    { id: "arcane", vs: { warded: 0.4, spirit: 1.3 }, bypassArmor: true },
  ],
  armor: { halfValue: 40, maxMitigation: 0.75 },
};
assertDamageTable(BEACON_DAMAGE);

export interface RaiderHit {
  type: DamageType;
  base: number;
  raider: RaiderClass;
  armor: number;
  pen?: number;
  brittle?: number;
}

export function hitDamage(input: RaiderHit): number {
  const armor = Math.max(0, input.armor - (input.pen ?? 0));
  const row = resolveTableDamage(BEACON_DAMAGE, { type: input.type, resistance: input.raider, armor, base: input.base });
  return (row.damage ?? 0) * (1 + Math.max(0, input.brittle ?? 0));
}

/** Whether this kind of shot can touch that kind of raider at all (a shell and a wraith cannot). */
export function canHurt(type: DamageType, raider: RaiderClass): boolean {
  return typeMultiplier(BEACON_DAMAGE, type, raider) > 0;
}
