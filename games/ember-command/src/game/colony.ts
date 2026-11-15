import { defineStore } from "@jgengine/core/store/defineStore";
import type { GameContext } from "@jgengine/core/runtime/gameContext";

import type { Faction } from "./tuning";

/**
 * The colony between battles. Every campaign mission won pays royal jelly; the queen spends it on
 * permanent traits (how she lays and what she stores) and caste research (what her soldiers, spitters,
 * beetles and foragers are born with). Traits carry through the whole campaign record and apply to
 * every campaign battle; a free skirmish starts a colony from nothing. Pure data plus small folds, so
 * the battle code asks "how much" and never "which trait".
 */
export type ColonyTraitId =
  | "fertile_queen"
  | "deep_larder"
  | "keen_antennae"
  | "packed_earth"
  | "serrated_mandibles"
  | "acid_glands"
  | "beetle_plating"
  | "swift_foragers";

export interface ColonyTrait {
  id: ColonyTraitId;
  /** Queen traits shape the whole colony; caste research one kind of ant. */
  kind: "queen" | "caste";
  label: string;
  blurb: string;
  /** Royal jelly it costs. */
  cost: number;
}

/** Royal jelly one won mission pays. */
export const JELLY_PER_WIN = 2;
export const FERTILE_HATCH = 1.2;
export const LARDER_SUGAR = 80;
export const LARDER_LEAF = 30;
export const KEEN_SIGHT = 1.15;
export const PACKED_EARTH_TAKEN = 0.7;
export const MANDIBLE_DEALT = 1.2;
export const ACID_DEALT = 1.25;
export const PLATING_TAKEN = 0.75;
export const FORAGER_SPEED = 1.15;

export const COLONY_TRAITS: readonly ColonyTrait[] = [
  { id: "fertile_queen", kind: "queen", label: "Fertile Queen", blurb: "Brood hatches 20% faster.", cost: 2 },
  { id: "deep_larder", kind: "queen", label: "Deep Larder", blurb: `Every battle opens with +${LARDER_SUGAR} sugar, +${LARDER_LEAF} leaf.`, cost: 2 },
  { id: "keen_antennae", kind: "queen", label: "Keen Antennae", blurb: "The colony sees 15% farther.", cost: 2 },
  { id: "packed_earth", kind: "queen", label: "Packed Earth", blurb: "Nest and chambers take 30% less damage.", cost: 2 },
  { id: "serrated_mandibles", kind: "caste", label: "Serrated Mandibles", blurb: "Soldiers bite 20% harder.", cost: 2 },
  { id: "acid_glands", kind: "caste", label: "Acid Glands", blurb: "Spitters spit 25% harder.", cost: 2 },
  { id: "beetle_plating", kind: "caste", label: "Beetle Plating", blurb: "Tank beetles take 25% less damage.", cost: 2 },
  { id: "swift_foragers", kind: "caste", label: "Swift Foragers", blurb: "Workers haul 15% faster.", cost: 2 },
];

const traitById = new Map<string, ColonyTrait>(COLONY_TRAITS.map((trait) => [trait.id, trait]));

export function colonyTrait(id: string): ColonyTrait | undefined {
  return traitById.get(id);
}

export interface ColonyRecord {
  traits: readonly ColonyTraitId[];
}

export const colonyStore = defineStore<ColonyRecord>("lawn.colony", () => ({ traits: [] }));

/** Royal jelly earned by `wins` won missions, less what the bought traits cost. */
export function jellyLeft(wins: number, traits: readonly ColonyTraitId[]): number {
  const spent = traits.reduce((sum, id) => sum + (colonyTrait(id)?.cost ?? 0), 0);
  return wins * JELLY_PER_WIN - spent;
}

/** Why a trait cannot be bought now, or null when it can. */
export function traitBlocked(id: ColonyTraitId, wins: number, traits: readonly ColonyTraitId[]): string | null {
  const trait = colonyTrait(id);
  if (trait === undefined) return "No such trait";
  if (traits.includes(id)) return "Already bred";
  if (jellyLeft(wins, traits) < trait.cost) return `Needs ${trait.cost} royal jelly`;
  return null;
}

/** Buy a trait with the record's jelly; returns whether it was bought. */
export function buyTrait(ctx: GameContext, id: ColonyTraitId, wins: number): boolean {
  const record = colonyStore.read(ctx);
  if (traitBlocked(id, wins, record.traits) !== null) return false;
  colonyStore.write(ctx, { traits: [...record.traits, id] });
  return true;
}

/* -------------------------------------------------------------------------------------------- */
/* Battle folds: the live battle's traits (set when a campaign mission opens; empty in skirmish). */
/* -------------------------------------------------------------------------------------------- */

let live: ReadonlySet<ColonyTraitId> = new Set();

/** Arm the traits for this battle (a campaign mission) or clear them (a free skirmish / restage). */
export function armColony(traits: readonly ColonyTraitId[]): void {
  live = new Set(traits);
}

export function colonyHas(id: ColonyTraitId): boolean {
  return live.has(id);
}

/** Multiplier on the brood clock. */
export function colonyHatchFactor(): number {
  return live.has("fertile_queen") ? FERTILE_HATCH : 1;
}

/** Multiplier on red sight. */
export function colonySightFactor(): number {
  return live.has("keen_antennae") ? KEEN_SIGHT : 1;
}

/** Multiplier on a red worker's walking pace. */
export function colonyWorkerSpeed(): number {
  return live.has("swift_foragers") ? FORAGER_SPEED : 1;
}

const CHAMBERS = new Set(["keep_player", "barracks", "fungus_garden", "nursery", "granary", "acid_mound"]);

/** Scale a finished hit by the colony's traits: what the attacker's caste deals, what the target takes. */
export function colonyDamage(amount: number, attacker: { catalogId: string; faction: Faction }, target: { catalogId: string; faction: Faction }): number {
  if (live.size === 0) return amount;
  let out = amount;
  if (attacker.faction === "player") {
    if (attacker.catalogId === "soldier" && live.has("serrated_mandibles")) out *= MANDIBLE_DEALT;
    if (attacker.catalogId === "spitter" && live.has("acid_glands")) out *= ACID_DEALT;
  }
  if (target.faction === "player") {
    if (target.catalogId === "beetle" && live.has("beetle_plating")) out *= PLATING_TAKEN;
    if (CHAMBERS.has(target.catalogId) && live.has("packed_earth")) out *= PACKED_EARTH_TAKEN;
  }
  return out;
}
