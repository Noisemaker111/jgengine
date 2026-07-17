import { decayMeters, type DecayMeterConfig } from "@jgengine/core/survival/decayMeter";

import type { AlienBodyPlan } from "../creatures/bodyPlan";

export const NEEDS = ["hunger", "energy", "social", "fun"] as const;
export type NeedId = (typeof NEEDS)[number];

export interface NeedDef {
  id: NeedId;
  label: string;
  icon: string;
  decayPerDay: number;
}

export const NEED_DEFS: Record<NeedId, NeedDef> = {
  hunger: { id: "hunger", label: "Nourish", icon: "🍎", decayPerDay: 118 },
  energy: { id: "energy", label: "Rest", icon: "🛌", decayPerDay: 82 },
  social: { id: "social", label: "Bond", icon: "💬", decayPerDay: 74 },
  fun: { id: "fun", label: "Play", icon: "✨", decayPerDay: 90 },
};

export function emptyNeeds(): Record<NeedId, number> {
  return { hunger: 78, energy: 78, social: 70, fun: 70 };
}

// Cache the per-day-length meter defs so the hot sim loop (every member, every tick) doesn't
// rebuild them; dayLength is a constant in practice.
let cachedDayLength = -1;
let cachedDefs: DecayMeterConfig[] = [];

function needDecayDefs(dayLength: number): DecayMeterConfig[] {
  if (dayLength !== cachedDayLength) {
    cachedDayLength = dayLength;
    cachedDefs = NEEDS.map((need) => ({
      id: need,
      max: 100,
      min: 0,
      rate: NEED_DEFS[need].decayPerDay / dayLength,
    }));
  }
  return cachedDefs;
}

export function decayNeeds(
  needs: Record<NeedId, number>,
  plan: AlienBodyPlan,
  dayLength: number,
  dt: number,
): Record<NeedId, number> {
  // Decay is now the shared `decayMeters` primitive: base rate is decay-per-day over the day
  // length, and metabolism is the scalar rate modifier. Behaviour is identical to the old loop.
  return decayMeters(needs, needDecayDefs(dayLength), dt, plan.metabolism) as Record<NeedId, number>;
}

export function clamp(value: number): number {
  return value < 0 ? 0 : value > 100 ? 100 : value;
}

export function lowestNeed(needs: Record<NeedId, number>): { need: NeedId; value: number } {
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

export type MoodTier = "radiant" | "content" | "fine" | "glum" | "low";

export interface Mood {
  score: number;
  tier: MoodTier;
  face: string;
  label: string;
}

export function moodOf(needs: Record<NeedId, number>): Mood {
  const score =
    needs.hunger * 0.3 + needs.energy * 0.28 + needs.social * 0.21 + needs.fun * 0.21;
  if (score >= 82) return { score, tier: "radiant", face: "◕‿◕", label: "Radiant" };
  if (score >= 64) return { score, tier: "content", face: "◕ᴗ◕", label: "Content" };
  if (score >= 45) return { score, tier: "fine", face: "•_•", label: "Fine" };
  if (score >= 26) return { score, tier: "glum", face: "•︵•", label: "Glum" };
  return { score, tier: "low", face: "×﹏×", label: "Low" };
}
