import type { NeedId } from "./needs/needs";
import type { MemberState } from "./session/types";

/**
 * Each being carries two traits from this book. A trait changes numbers the rest of the household
 * already runs on (how fast a need drains, how much stress a shift costs, how a harvest comes out,
 * how quickly a friendship grows) and opens or shuts choices when a transmission arrives.
 */
export const TRAIT_IDS = [
  "hearty", "nightOwl", "industrious", "greenFingered", "gregarious",
  "loner", "anxious", "serene", "playful", "kind", "handy", "thrifty",
] as const;
export type TraitId = (typeof TRAIT_IDS)[number];

export interface TraitDef {
  id: TraitId;
  label: string;
  /** One line the inspector shows: what the trait does, in numbers. */
  blurb: string;
  /** Multipliers on the per-day drain of each need. */
  decay?: Partial<Record<NeedId, number>>;
  /** Multiplier on stress gained from hunger, exhaustion, shifts and incidents. */
  stressGain?: number;
  /** Multiplier on Yield pay. */
  yieldPay?: number;
  /** Extra rations on every Bloom harvest. */
  harvestBonus?: number;
  /** Multiplier on how fast conversation moves opinion. */
  bondRate?: number;
  /** Stress shed per second while playing, on top of the station's own. */
  playRelief?: number;
  /** Traits that cannot sit together on one being. */
  excludes?: readonly TraitId[];
}

export const TRAITS: Record<TraitId, TraitDef> = {
  hearty: { id: "hearty", label: "Hearty eater", blurb: "Hunger drains 30% faster.", decay: { hunger: 1.3 } },
  nightOwl: { id: "nightOwl", label: "Night owl", blurb: "Rest drains 25% slower; Yield shifts cost 20% more stress.", decay: { energy: 0.75 }, stressGain: 1.2 },
  industrious: { id: "industrious", label: "Industrious", blurb: "Yield pays 15% more; stress builds 25% faster.", yieldPay: 1.15, stressGain: 1.25, excludes: ["playful"] },
  greenFingered: { id: "greenFingered", label: "Green-fingered", blurb: "Every Bloom harvest gives one more ration." , harvestBonus: 1 },
  gregarious: { id: "gregarious", label: "Gregarious", blurb: "Bond drains 30% faster; friendships grow 50% faster.", decay: { social: 1.3 }, bondRate: 1.5, excludes: ["loner"] },
  loner: { id: "loner", label: "Loner", blurb: "Bond drains 40% slower; friendships grow 40% slower.", decay: { social: 0.6 }, bondRate: 0.6, excludes: ["gregarious"] },
  anxious: { id: "anxious", label: "Anxious", blurb: "Stress builds 40% faster.", stressGain: 1.4, excludes: ["serene"] },
  serene: { id: "serene", label: "Serene", blurb: "Stress builds 40% slower.", stressGain: 0.6, excludes: ["anxious"] },
  playful: { id: "playful", label: "Playful", blurb: "Play drains 30% faster; play sheds stress twice as fast.", decay: { fun: 1.3 }, playRelief: 1.25, excludes: ["industrious"] },
  kind: { id: "kind", label: "Kind-hearted", blurb: "Glad when the household helps a stranger; hurt when it refuses." },
  handy: { id: "handy", label: "Handy", blurb: "Can mend a broken furnishing for free, at the cost of rest." },
  thrifty: { id: "thrifty", label: "Thrifty", blurb: "Can haggle a trader down; spots spoilage early." },
};

function hash(text: string): number {
  let a = 2166136261;
  for (let i = 0; i < text.length; i++) a = Math.imul(a ^ text.charCodeAt(i), 16777619) >>> 0;
  return a;
}

/** Two compatible traits for a being, fixed by its seed. */
export function rollTraits(seed: string): TraitId[] {
  const first = TRAIT_IDS[hash(`${seed}:t1`) % TRAIT_IDS.length]!;
  const blocked = new Set<TraitId>([first, ...(TRAITS[first].excludes ?? [])]);
  const rest = TRAIT_IDS.filter((id) => !blocked.has(id) && !(TRAITS[id].excludes ?? []).includes(first));
  return [first, rest[hash(`${seed}:t2`) % rest.length]!];
}

export function traitsOf(member: Pick<MemberState, "traits">): readonly TraitDef[] {
  return (member.traits ?? []).map((id) => TRAITS[id]).filter((def): def is TraitDef => def !== undefined);
}

export function hasTrait(member: Pick<MemberState, "traits">, id: TraitId): boolean {
  return member.traits?.includes(id) ?? false;
}

function product(member: Pick<MemberState, "traits">, read: (def: TraitDef) => number | undefined): number {
  return traitsOf(member).reduce((acc, def) => acc * (read(def) ?? 1), 1);
}

export function decayFactor(member: Pick<MemberState, "traits">, need: NeedId): number {
  return product(member, (def) => def.decay?.[need]);
}

export function stressFactor(member: Pick<MemberState, "traits">): number {
  return product(member, (def) => def.stressGain);
}

export function yieldPayFactor(member: Pick<MemberState, "traits">): number {
  return product(member, (def) => def.yieldPay);
}

export function bondFactor(member: Pick<MemberState, "traits">): number {
  return product(member, (def) => def.bondRate);
}

export function harvestBonus(member: Pick<MemberState, "traits">): number {
  return traitsOf(member).reduce((sum, def) => sum + (def.harvestBonus ?? 0), 0);
}

export function playRelief(member: Pick<MemberState, "traits">): number {
  return traitsOf(member).reduce((sum, def) => sum + (def.playRelief ?? 0), 0);
}
