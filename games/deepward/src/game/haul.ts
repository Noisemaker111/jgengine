import { createInventorySet, type InventoryState } from "@jgengine/core/inventory/inventoryModel";
import { createRunHaul } from "@jgengine/core/loot/haul";
import { itemMass } from "@jgengine/core/loot/drop";
import type { Item } from "./items";

/** Cache weight in the same unit the rolled items carry. Twelve squares is the grid; this is the load. */
export const CACHE_WEIGHT = 12;
/** Slot counts only bound the shared inventory model; Deepward's grid decides what actually fits. */
const RUN_SLOTS = 16;
const STASH_SLOTS = 2048;

export interface HaulLoad { mass: number; remaining: number; capacity: number }
export type CacheCheck = { ok: true; load: HaulLoad } | { ok: false; reason: "over-capacity" | "no-space"; message: string };

function slotsOf(items: readonly Item[], slots: number): InventoryState {
  const state: (readonly [string, number])[] = items.map(item => [item.id, 1] as const);
  const out: ({ itemId: string; count: number } | null)[] = [];
  for (let index = 0; index < slots; index += 1) {
    const entry = state[index];
    out.push(entry === undefined ? null : { itemId: entry[0], count: entry[1] });
  }
  return { slots: out };
}

/** A run haul restored from the live records, so the weight gate and bank/fail rules are the shared ones. */
function haulOf(cache: readonly Item[], stash: readonly Item[], incoming: readonly Item[] = []) {
  const inventories = createInventorySet({ run: { slots: RUN_SLOTS }, stash: { slots: STASH_SLOTS } }, { stackLimit: () => 1 });
  const masses = new Map<string, number>();
  for (const item of [...cache, ...stash, ...incoming]) masses.set(item.id, itemMass(item));
  const haul = createRunHaul({
    inventories,
    runId: "run",
    stashId: "stash",
    weightOf: id => masses.get(id) ?? 0,
    capacity: CACHE_WEIGHT,
    storage: null,
  });
  if (!haul.restore({ run: slotsOf(cache, RUN_SLOTS), stash: slotsOf(stash, STASH_SLOTS) })) throw new Error("deepward: cache records are not a valid haul");
  return haul;
}

export function loadOf(cache: readonly Item[]): HaulLoad {
  const mass = cache.reduce((sum, item) => sum + itemMass(item), 0);
  return { mass: Math.round(mass * 100) / 100, remaining: Math.round((CACHE_WEIGHT - mass) * 100) / 100, capacity: CACHE_WEIGHT };
}

/**
 * Whether the cache can take one more instance, through the shared weight gate. Over capacity and
 * out of slots read differently, because the player's next move differs: drop something, or nothing
 * about the load is the problem.
 */
export function canCache(cache: readonly Item[], item: Item): CacheCheck {
  const haul = haulOf(cache, [], [item]);
  const outcome = haul.carry(item.id);
  const load = loadOf(cache);
  if (outcome.ok) return { ok: true, load: loadOf([...cache, item]) };
  if (outcome.reason === "over-capacity") {
    const after = Math.round((load.mass + itemMass(item)) * 100) / 100;
    return { ok: false, reason: "over-capacity", message: `${item.name} would put the cache at ${after} of ${CACHE_WEIGHT}. Leave something behind first.` };
  }
  return { ok: false, reason: "no-space", message: `The cache carries no more than ${RUN_SLOTS} instances.` };
}

/** Move what the stash holds out of the carried haul; what it refuses stays carried, i.e. lost with the Life. */
export function bankHaul(cache: readonly Item[], stash: readonly Item[]): { banked: Item[]; refused: Item[] } {
  const haul = haulOf(cache, stash);
  const moved = haul.bank();
  const byId = new Map(cache.map(item => [item.id, item] as const));
  const keep = (stacks: readonly { itemId: string }[]) => stacks.map(stack => byId.get(stack.itemId)).filter((item): item is Item => item !== undefined);
  return { banked: keep(moved.stacks), refused: keep(moved.refused) };
}

/** A failed Life gives up the carried haul; the stash is untouched. */
export function loseHaul(cache: readonly Item[]): Item[] {
  return haulOf(cache, []).fail().stacks.map(stack => cache.find(item => item.id === stack.itemId)).filter((item): item is Item => item !== undefined);
}
