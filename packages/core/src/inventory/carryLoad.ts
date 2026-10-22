import {
  resolveEncumbrance,
  totalLoad,
  type EncumbranceConfig,
  type EncumbranceState,
  type LoadEntry,
} from "./encumbrance";
import type { InventoryState } from "./inventoryModel";

/** Per-item mass in the caller's weight unit; an unknown item weighs 0. */
export type WeightLookup = (itemId: string) => number;

/**
 * Every filled stack in the given inventories as load entries, in slot order. Only the inventories
 * the caller passes count, so a stash left out of the list adds no weight.
 *
 * @capability carry-load read carried stacks out of one or more inventories for a weight query
 */
export function carriedEntries(states: readonly InventoryState[]): LoadEntry[] {
  const entries: LoadEntry[] = [];
  for (const state of states) {
    for (const slot of state.slots) {
      if (slot !== null) entries.push({ itemId: slot.itemId, quantity: slot.count });
    }
  }
  return entries;
}

/** Everything a {@link characterLoad} reading takes: carried inventories, worn gear and the capacity they are measured against. */
export interface CharacterLoadInput {
  /** Carried inventories (bag, rig, pockets); a stash left out does not weigh anything. */
  carried?: readonly InventoryState[];
  /** Worn item ids, one unit each — `Equipment.worn()` mapped to `itemId`. */
  worn?: readonly string[];
  weightOf: WeightLookup;
  /** Carrying capacity in the same unit as `weightOf`; the caller adds level and gear bonuses. */
  capacity: number;
  /** Fraction of worn gear weight that counts against capacity (default `1`). */
  wornFactor?: number;
  encumbrance?: EncumbranceConfig;
}

/** A carrier's load: the encumbrance state, how it splits into carried and worn, and capacity left. */
export interface CharacterLoad extends EncumbranceState {
  /** Mass of the carried inventories alone. */
  carriedMass: number;
  /** Mass worn gear adds after `wornFactor`. */
  wornMass: number;
  /** Capacity left before the carrier is immobile; negative when overloaded. */
  remaining: number;
}

/**
 * Weigh a character: carried stacks plus worn gear against a capacity, resolved into the shared
 * encumbrance bands. Movement reads `moveMultiplier`, `canSprint`, `canJump` and `immobile`; pickup
 * gates read `remaining` or {@link canCarry}. The stash is not part of `carried`, so it adds nothing.
 *
 * @capability carry-encumbrance weigh carried inventories plus worn gear against a capacity and hand back movement penalties
 */
export function characterLoad(input: CharacterLoadInput): CharacterLoad {
  const carriedMass = totalLoad(carriedEntries(input.carried ?? []), input.weightOf);
  const factor = input.wornFactor !== undefined && Number.isFinite(input.wornFactor) && input.wornFactor >= 0
    ? input.wornFactor
    : 1;
  const wornEntries: LoadEntry[] = (input.worn ?? []).map((itemId) => ({ itemId, quantity: 1 }));
  const wornMass = totalLoad(wornEntries, input.weightOf) * factor;
  const base = resolveEncumbrance(carriedMass + wornMass, input.capacity, input.encumbrance);
  return { ...base, carriedMass, wornMass, remaining: input.capacity - base.mass };
}

/**
 * Whether `addedMass` more weight still fits under `capacity`. Pure: the caller decides what to do
 * with a refusal, so an overload policy stays with the game.
 *
 * @capability carry-encumbrance gate a pickup against the carrier's remaining capacity
 */
export function canCarry(load: Pick<CharacterLoad, "mass" | "capacity">, addedMass: number): boolean {
  const added = Number.isFinite(addedMass) && addedMass > 0 ? addedMass : 0;
  return load.mass + added <= load.capacity;
}
