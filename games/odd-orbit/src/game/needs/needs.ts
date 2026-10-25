export const NEEDS = ["hunger", "energy", "social", "fun"] as const;
export type NeedId = (typeof NEEDS)[number];

export interface NeedDef {
  id: NeedId;
  label: string;
  icon: string;
  decayPerDay: number;
}

export const NEED_DEFS: Record<NeedId, NeedDef> = {
  hunger: { id: "hunger", label: "Nourish", icon: "🍲", decayPerDay: 118 },
  energy: { id: "energy", label: "Rest", icon: "🌙", decayPerDay: 82 },
  social: { id: "social", label: "Bond", icon: "🫧", decayPerDay: 74 },
  fun: { id: "fun", label: "Play", icon: "✨", decayPerDay: 90 },
};

/** The day a being starts with; the shared agent's need set takes these as its start values. */
export function emptyNeeds(): Record<NeedId, number> {
  return { hunger: 78, energy: 78, social: 70, fun: 70 };
}

export function clamp(value: number): number {
  return value < 0 ? 0 : value > 100 ? 100 : value;
}

/** The emptiest need in a plain record; declared order breaks ties. */
export function lowestNeed(needs: Readonly<Record<NeedId, number>>): { need: NeedId; value: number } {
  let need: NeedId = NEEDS[0];
  let value = needs[need];
  for (const candidate of NEEDS) {
    if (needs[candidate] < value) {
      value = needs[candidate];
      need = candidate;
    }
  }
  return { need, value };
}
