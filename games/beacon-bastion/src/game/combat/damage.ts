import { assertDamageTable, resolveTableDamage, typeMultiplier, type DamageTableDef } from "@jgengine/core/combat/damage/damageTable";

/**
 * What a worker's hit is made of. Coffee is hot, a hose is water, a live wire is shock, a jackhammer
 * is blunt, a pitchfork is pierce, a cease-and-desist is legal, and a stern look from someone who
 * remembers rotary phones is analog.
 */
export type DamageType = "hot" | "water" | "shock" | "blunt" | "pierce" | "legal" | "analog";

/**
 * What a piece of technology is, read against the hit. Gadgets short out under hot coffee; heavy
 * hardware shrugs off spray and splits under a jackhammer; wireless kit falls to a pitchfork and a
 * live wire; networks dread paperwork; vehicles crumple to blunt force and legal action.
 */
export type TechClass = "gadget" | "hardware" | "wireless" | "network" | "vehicle";

/**
 * The town's damage chart, run by the engine's damage table: type against class first, then armor.
 * Legal and analog ignore armor (a robot vacuum's bumper does not stop a subpoena). 40 armor halves
 * a physical hit.
 */
export const TOWN_DAMAGE: DamageTableDef = {
  types: [
    { id: "hot", vs: { gadget: 1.4, hardware: 0.8, vehicle: 0.7 } },
    { id: "water", vs: { gadget: 1.1, hardware: 0.6, vehicle: 0.5 } },
    { id: "shock", vs: { wireless: 1.3, network: 1.2, hardware: 0.9, vehicle: 0.8 } },
    { id: "blunt", vs: { hardware: 1.4, vehicle: 1.3, wireless: 0.6 } },
    { id: "pierce", vs: { wireless: 1.3, hardware: 0.6, vehicle: 0.7 } },
    { id: "legal", vs: { network: 1.5, vehicle: 1.4, gadget: 0.5 }, bypassArmor: true },
    { id: "analog", vs: { network: 0.8 }, bypassArmor: true },
  ],
  armor: { halfValue: 40, maxMitigation: 0.75 },
};
assertDamageTable(TOWN_DAMAGE);

/** A live wire into a soaked gadget: shock lands this many times harder on anything Wet. */
export const WET_SHOCK_MULT = 2.5;

export interface TechHit {
  type: DamageType;
  base: number;
  raider: TechClass;
  /** The enemy's armor after any crushing. */
  armor: number;
  /** Armor the hit ignores. */
  pen?: number;
  /** Extra share a soaked-and-shaken enemy takes from every source. */
  brittle?: number;
  /** Whether the enemy is Wet: shock lands {@link WET_SHOCK_MULT} times harder. */
  wet?: boolean;
}

/** What one hit lands, after class, armor, wetness and brittleness. */
export function hitDamage(input: TechHit): number {
  const armor = Math.max(0, input.armor - (input.pen ?? 0));
  const row = resolveTableDamage(TOWN_DAMAGE, { type: input.type, resistance: input.raider, armor, base: input.base });
  const wet = input.wet === true && input.type === "shock" ? WET_SHOCK_MULT : 1;
  return (row.damage ?? 0) * wet * (1 + Math.max(0, input.brittle ?? 0));
}

/** Whether this kind of hit can touch that kind of tech at all. */
export function canHurt(type: DamageType, raider: TechClass): boolean {
  return typeMultiplier(TOWN_DAMAGE, type, raider) > 0;
}
