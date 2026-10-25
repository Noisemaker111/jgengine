import { assertDamageTable, resolveTableDamage, typeMultiplier, type DamageTableDef } from "@jgengine/core/combat/damageTable";

/** What a tower's shot is made of. */
export type DamageType = "pierce" | "blast" | "frost" | "arcane";

/**
 * What a raider is made of, read against the shot. Flesh takes everything plainly; bone shrugs off
 * arrows and shatters under shells; a ward blunts frost and arcane; a wraith is out of a shell's reach.
 */
export type RaiderClass = "flesh" | "bone" | "warded" | "spirit";

/**
 * Beacon's damage chart, run by the engine's damage table: type against class first, then armor,
 * which frost and arcane pass straight through. An armor of 40 halves a physical hit.
 */
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

export interface HitInput {
  type: DamageType;
  base: number;
  raider: RaiderClass;
  /** The raider's armor after any sunder. */
  armor: number;
  /** Armor the shot ignores (a longbow's penetration). */
  pen?: number;
  /** Extra share a chilled-and-brittle raider takes from every source. */
  brittle?: number;
}

/** What one hit lands, after class, armor and brittleness. */
export function hitDamage(input: HitInput): number {
  const armor = Math.max(0, input.armor - (input.pen ?? 0));
  const row = resolveTableDamage(BEACON_DAMAGE, { type: input.type, resistance: input.raider, armor, base: input.base });
  return (row.damage ?? 0) * (1 + Math.max(0, input.brittle ?? 0));
}

/** Whether this kind of shot can touch that kind of raider at all (a shell and a wraith cannot). */
export function canHurt(type: DamageType, raider: RaiderClass): boolean {
  return typeMultiplier(BEACON_DAMAGE, type, raider) > 0;
}
